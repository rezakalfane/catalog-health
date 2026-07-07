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
  summarize,
} from "@catalog-health/core";
import {
  createAnalysis,
  updateAnalysis,
  listAnalyses,
} from "@/lib/db";

// Survives dev-mode module re-evaluation; scoped to this process by design.
const activeRuns = (globalThis.__catalogHealthActiveRuns ??= new Set());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mark "running" analyses with no live runner in this process as failed. */
export function reconcileInterruptedAnalyses() {
  for (const a of listAnalyses()) {
    if (a.status === "running" && !activeRuns.has(a.id)) {
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
export function startAnalysisRun({ environment, demo }) {
  const analysis = createAnalysis({
    environmentId: environment ? environment.id : "demo",
    status: "running",
    summary: null,
    progress: { percent: 0, stage: "fetch", label: "Starting…", detail: null },
  });
  activeRuns.add(analysis.id);
  execute(analysis.id, { environment, demo })
    .catch((err) => {
      updateAnalysis(analysis.id, {
        status: "failed",
        error: err.message || "Analysis failed",
        progress: null,
      });
    })
    .finally(() => activeRuns.delete(analysis.id));
  return analysis;
}

async function execute(analysisId, { environment, demo }) {
  const setProgress = (percent, stage, label, detail = null, extra = {}) =>
    updateAnalysis(analysisId, {
      progress: { percent: Math.min(99, Math.round(percent)), stage, label, detail },
      ...extra,
    });

  // -- Stage 1: fetch (0 -> ~58) -------------------------------------------
  let products, categories;
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
    ({ products, categories } = await fetchCatalog({
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

  // -- Stage 2: score (~60 -> ~75) -------------------------------------------
  setProgress(60, "score", `Scoring ${products.length} products…`, "5 dimensions per product");
  await sleep(demo ? 600 : 0);
  // Let the progress write land before the sync scoring pass blocks the loop.
  await new Promise((r) => setImmediate(r));
  const rows = analyzeCatalog(products, categories);
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

  updateAnalysis(analysisId, {
    status: "done",
    summary,
    error: null,
    progress: { percent: 100, stage: "done", label: "Analysis complete", detail: null },
  });
}
