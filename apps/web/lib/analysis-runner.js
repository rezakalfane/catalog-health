/**
 * Async analysis runner. An analysis record doubles as the job: the runner
 * updates its progress/summary in the db as it goes, so any page can poll
 * GET /api/analyses/:id and the run survives navigation.
 *
 * The run itself lives in this server process. If the process restarts,
 * a "running" record has no runner behind it anymore — reconcile marks it
 * failed instead of leaving it stuck at N% forever.
 */
import {
  fetchCatalog,
  demoCatalog,
  analyzeCatalog,
  applySemanticVerdicts,
  createJudge,
  judgeCatalog,
  summarize,
  createScoringMetadata,
} from "@catalog-health/core";
import {
  createAnalysis,
  updateAnalysis,
  listRunningAnalysesAllUsers,
  getSettings,
} from "@/lib/db";

// Survives dev-mode module re-evaluation; scoped to this process by design.
const activeRuns = (globalThis.__catalogHealthActiveRuns ??= new Set());
// Analysis ids whose semantic pass should be skipped (user clicked cancel).
const skipSemanticRequests = (globalThis.__catalogHealthSkipSemantic ??= new Set());

/**
 * Ask a running analysis to abandon its semantic pass and finish with the
 * heuristic dimensions only. Returns false when no such run is active here.
 */
export function requestSkipSemantic(analysisId) {
  if (!activeRuns.has(analysisId)) return false;
  skipSemanticRequests.add(analysisId);
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mark "running" analyses with no live runner in this process as failed. */
export function reconcileInterruptedAnalyses() {
  for (const a of listRunningAnalysesAllUsers()) {
    if (!activeRuns.has(a.id)) {
      updateAnalysis(a.id, {
        status: "failed",
        error: "Interrupted — the server restarted while this analysis was running.",
        progress: null,
      });
    }
  }
}

/**
 * Create the analysis record and kick off the run in the background.
 * Returns immediately with the (running) record.
 */
export function startAnalysisRun({ userId, environment, demo, semantic }) {
  const analysis = createAnalysis({
    userId,
    environmentId: environment ? environment.id : "demo",
    status: "running",
    summary: null,
    progress: { percent: 0, stage: "fetch", label: "Starting…", detail: null },
    scoringMetadata: createScoringMetadata({ semanticRequested: semantic }),
  });
  activeRuns.add(analysis.id);
  execute(analysis.id, { userId, environment, demo, semantic })
    .catch((err) => {
      updateAnalysis(analysis.id, {
        status: "failed",
        error: err.message || "Analysis failed",
        progress: null,
      });
    })
    .finally(() => {
      activeRuns.delete(analysis.id);
      skipSemanticRequests.delete(analysis.id);
    });
  return analysis;
}

async function execute(analysisId, { userId, environment, demo, semantic }) {
  const startedAt = Date.now();
  let semanticMs = null;
  const setProgress = (percent, stage, label, detail = null, extra = {}) =>
    updateAnalysis(analysisId, {
      progress: { percent: Math.min(99, Math.round(percent)), stage, label, detail },
      ...extra,
    });

  // -- Stage 1: fetch (0 -> ~58) -------------------------------------------
  let products, categories;
  let trees = [];
  let channels = [];
  if (demo) {
    // Simulate the fetch in a few beats so the demo shows the async UX.
    setProgress(5, "fetch", "Generating demo catalog…");
    await sleep(500);
    ({ products, categories } = demoCatalog());
    setProgress(30, "fetch", "Generating demo catalog…", `${products.length} products`);
    await sleep(500);
    setProgress(55, "fetch", "Generating demo catalog…", `${categories.length} categories`);
    await sleep(400);
  } else {
    setProgress(2, "fetch", "Connecting to store…");
    ({ products, categories, trees = [], channels = [] } = await fetchCatalog({
      storeHash: environment.storeHash,
      token: environment.accessToken,
      onProgress: ({ path, page, totalPages, count }) => {
        if (path.includes("/products")) {
          setProgress(
            5 + 48 * (page / totalPages),
            "fetch",
            "Fetching catalog…",
            `${count} products (page ${page}/${totalPages})`
          );
        } else {
          setProgress(56, "fetch", "Fetching categories…", `${count} categories`);
        }
      },
    }));
  }

  if (!products.length) throw new Error("No products found in this catalog");

  // -- Stage 2: score (~60 -> ~64) -------------------------------------------
  setProgress(60, "score", `Scoring ${products.length} products…`, "5 dimensions per product");
  await sleep(demo ? 600 : 0);
  // Let the progress write land before the sync scoring pass blocks the loop.
  await new Promise((r) => setImmediate(r));
  let rows = analyzeCatalog(products, categories);

  // -- Stage 2b (optional): semantic pass (~64 -> ~78) -------------------------
  let semanticJudge = null; // label of the model that judged, for the report
  let semanticJudgeMetadata = null;
  let semanticApplied = false;
  if (semantic) {
    const semStart = Date.now();
    try {
      const judge = createJudge(demo ? { provider: "demo" } : getSettings(userId).llm);
      semanticJudge = judge.label;
      semanticJudgeMetadata = {
        provider: judge.provider,
        model: judge.model,
        label: judge.label,
      };
      setProgress(64, "semantic", "Judging descriptions…", judge.label);
      const verdicts = await judgeCatalog(products, {
        judgeChunk: judge.judgeChunk,
        concurrency: judge.concurrency,
        minDelayMs: judge.minDelayMs,
        shouldAbort: () => skipSemanticRequests.has(analysisId),
        onProgress: ({ judged, total }) =>
          setProgress(
            64 + 14 * (total ? judged / total : 1),
            "semantic",
            "Judging descriptions…",
            `${judged}/${total} descriptions · ${judge.label}`
          ),
      });
      if (demo) await sleep(600);
      rows = applySemanticVerdicts(rows, verdicts);
      semanticApplied = true;
    } catch (err) {
      // Degrade to the 5-dimension report rather than failing the run.
      updateAnalysis(analysisId, {
        warning:
          err.code === "semantic_cancelled"
            ? "Semantic scoring was cancelled — this report shows the 5 heuristic dimensions only."
            : `Semantic scoring skipped: ${err.message}`,
      });
    }
    semanticMs = Date.now() - semStart;
  }

  const summary = summarize(rows, categories);

  // -- Stage 3: aggregate (~78 -> 100) ----------------------------------------
  // Reveal the summary in slices so the report sections fill in as we go.
  const { issueFrequency, categoryRollup, topFixes, ...headline } = summary;
  let partial = headline; // productCount, overall, grade, gradeDist, dimensionAverages
  setProgress(80, "summarize", "Aggregating results…", "Health score & dimensions ready", {
    summary: partial,
  });
  await sleep(400);

  partial = { ...partial, issueFrequency };
  setProgress(87, "summarize", "Aggregating results…", "Issue frequency ready", {
    summary: partial,
  });
  await sleep(400);

  partial = { ...partial, categoryRollup };
  setProgress(93, "summarize", "Aggregating results…", "Category rollup ready", {
    summary: partial,
  });
  await sleep(400);

  // Light catalog metadata so the UI can name categories and group them by
  // channel tree (multi-storefront) without re-fetching the store.
  const catalog = {
    categories: categories.map((c) => ({
      id: c.category_id ?? c.id,
      name: c.name || "?",
      treeId: c.tree_id ?? null,
    })),
    trees: trees.map((t) => ({
      id: t.id,
      name: t.name || `Tree ${t.id}`,
      channelIds: t.channels || [],
    })),
    channels: channels.map((c) => ({ id: c.id, name: c.name || `Channel ${c.id}` })),
    semanticJudge, // label of the model that produced the semantic verdicts
  };

  updateAnalysis(analysisId, {
    status: "done",
    summary,
    rows, // full per-product results — served via /api/analyses/[id]/products
    catalog,
    error: null,
    durationMs: Date.now() - startedAt,
    semanticMs,
    scoringMetadata: createScoringMetadata({
      semanticRequested: semantic,
      semanticApplied,
      semanticJudge: semanticJudgeMetadata,
    }),
    progress: { percent: 100, stage: "done", label: "Analysis complete", detail: null },
  });
}
