/**
 * Data access layer, backed by SQLite (lib/sqlite.js owns the connection,
 * schema, and migrations). The function surface is the stable contract —
 * every consumer goes through here, so the storage engine can keep evolving
 * without touching pages or API routes.
 *
 * Analyses are returned WITHOUT their per-product rows (use
 * getAnalysisRows) but WITH a cheap `hasRows` flag.
 */
import crypto from "node:crypto";
import { getDb } from "@/lib/sqlite";

const id = () => crypto.randomUUID();
const parse = (s) => (s == null ? null : JSON.parse(s));

// -- Settings ----------------------------------------------------------------
//
// settings.llm = { provider: "anthropic" | "openai" | "ollama", model, apiKey, baseUrl }
// The API key is write-only towards the browser, like store tokens.

export function getSettings() {
  const rows = getDb().prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, parse(r.value)]));
}

/** Env-var API key fallback for a provider (Ollama needs none). */
export function envKeyFor(provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  if (provider === "openai") return process.env.OPENAI_API_KEY || null;
  return null;
}

/** Merge an LLM settings patch. An empty/absent apiKey keeps the stored one. */
export function updateLlmSettings(patch) {
  const db = getDb();
  const llm = getSettings().llm || {};
  // A key saved for one provider must never be sent to another.
  if (patch.provider && patch.provider !== llm.provider) delete llm.apiKey;
  for (const key of ["provider", "model", "baseUrl"]) {
    if (patch[key] !== undefined) llm[key] = patch[key];
  }
  if (patch.apiKey) llm.apiKey = patch.apiKey;
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('llm', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(llm));
  return llm;
}

/** LLM settings safe to send to the client. */
export function redactLlmSettings(settings = getSettings()) {
  const { apiKey, ...rest } = settings.llm || {};
  const provider = rest.provider || "anthropic";
  const envKey = envKeyFor(provider);
  const hasKey = Boolean(apiKey || envKey);
  const configured =
    provider === "ollama" ? Boolean(rest.model) : Boolean(rest.model && hasKey);
  return {
    ...rest,
    provider,
    hasKey,
    keyFromEnv: Boolean(!apiKey && envKey),
    configured,
  };
}

// -- Environments -----------------------------------------------------------

function toEnvironment(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    storeHash: row.store_hash,
    accessToken: row.access_token,
    createdAt: row.created_at,
  };
}

export function listEnvironments() {
  return getDb()
    .prepare("SELECT * FROM environments ORDER BY created_at")
    .all()
    .map(toEnvironment);
}

export function getEnvironment(envId) {
  return toEnvironment(
    getDb().prepare("SELECT * FROM environments WHERE id = ?").get(envId)
  );
}

export function createEnvironment({ name, storeHash, accessToken }) {
  const env = {
    id: id(),
    name,
    storeHash,
    accessToken,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO environments (id, name, store_hash, access_token, created_at)
       VALUES (@id, @name, @storeHash, @accessToken, @createdAt)`
    )
    .run(env);
  return env;
}

export function updateEnvironment(envId, patch) {
  const env = getEnvironment(envId);
  if (!env) return null;
  for (const key of ["name", "storeHash", "accessToken"]) {
    if (patch[key] !== undefined && patch[key] !== "") env[key] = patch[key];
  }
  getDb()
    .prepare(
      `UPDATE environments SET name = @name, store_hash = @storeHash,
        access_token = @accessToken WHERE id = @id`
    )
    .run(env);
  return env;
}

export function deleteEnvironment(envId) {
  const db = getDb();
  const run = db.transaction(() => {
    // analysis_products cascade from analyses; analyses have no FK ("demo").
    db.prepare(
      `DELETE FROM analysis_products WHERE analysis_id IN
         (SELECT id FROM analyses WHERE environment_id = ?)`
    ).run(envId);
    db.prepare("DELETE FROM analyses WHERE environment_id = ?").run(envId);
    db.prepare("DELETE FROM environments WHERE id = ?").run(envId);
  });
  run();
}

/** Strip the access token before sending an environment to the client. */
export function redactEnvironment(env) {
  if (!env) return null;
  const { accessToken, ...rest } = env;
  return { ...rest, hasToken: Boolean(accessToken) };
}

// -- Analyses ---------------------------------------------------------------
//
// An analysis is also the job record for an async run:
//   status:   "running" | "done" | "failed"
//   progress: { percent, stage, label, detail } while running
//   summary:  filled in progressively by the runner, complete once done

const ANALYSIS_COLS = `
  a.id, a.environment_id, a.created_at, a.status, a.progress, a.summary,
  a.error, a.warning,
  EXISTS (SELECT 1 FROM analysis_products p WHERE p.analysis_id = a.id) AS has_rows
`;

function toAnalysis(row, { withCatalog = false } = {}) {
  if (!row) return null;
  const analysis = {
    id: row.id,
    environmentId: row.environment_id,
    createdAt: row.created_at,
    status: row.status,
    progress: parse(row.progress),
    summary: parse(row.summary),
    error: row.error ?? null,
    warning: row.warning ?? null,
    hasRows: Boolean(row.has_rows),
  };
  if (withCatalog) analysis.catalog = parse(row.catalog);
  return analysis;
}

export function analysisStatus(analysis) {
  return analysis.status || "done";
}

export function listAnalyses(environmentId) {
  const db = getDb();
  const rows = environmentId
    ? db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.environment_id = ? ORDER BY a.created_at DESC`
        )
        .all(environmentId)
    : db
        .prepare(`SELECT ${ANALYSIS_COLS} FROM analyses a ORDER BY a.created_at DESC`)
        .all();
  return rows.map((r) => toAnalysis(r));
}

/** Only successfully completed analyses — what dashboards should read. */
export function listCompletedAnalyses(environmentId) {
  return listAnalyses(environmentId).filter((a) => analysisStatus(a) === "done");
}

export function findRunningAnalysis(environmentId) {
  const db = getDb();
  const row = environmentId
    ? db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.status = 'running' AND a.environment_id = ? LIMIT 1`
        )
        .get(environmentId)
    : db
        .prepare(`SELECT ${ANALYSIS_COLS} FROM analyses a WHERE a.status = 'running' LIMIT 1`)
        .get();
  return toAnalysis(row);
}

export function getAnalysis(analysisId) {
  const row = getDb()
    .prepare(`SELECT ${ANALYSIS_COLS}, a.catalog FROM analyses a WHERE a.id = ?`)
    .get(analysisId);
  return toAnalysis(row, { withCatalog: true });
}

/** Per-product rows for one analysis (the app-shaped objects). */
export function getAnalysisRows(analysisId) {
  return getDb()
    .prepare(
      `SELECT * FROM analysis_products WHERE analysis_id = ? ORDER BY impact DESC`
    )
    .all(analysisId)
    .map((r) => ({
      id: r.product_id,
      sku: r.sku,
      name: r.name,
      categories: parse(r.categories),
      overall: r.overall,
      grade: r.grade,
      scores: parse(r.scores),
      viewCount: r.view_count,
      totalSold: r.total_sold,
      impact: r.impact,
      issues: parse(r.issues),
      details: parse(r.details),
    }));
}

export function createAnalysis({ environmentId, summary = null, status = "done", progress = null }) {
  const analysis = {
    id: id(),
    environmentId,
    createdAt: new Date().toISOString(),
    status,
    progress,
    summary,
    error: null,
    warning: null,
    hasRows: false,
  };
  getDb()
    .prepare(
      `INSERT INTO analyses (id, environment_id, created_at, status, progress, summary)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      analysis.id,
      environmentId,
      analysis.createdAt,
      status,
      progress ? JSON.stringify(progress) : null,
      summary ? JSON.stringify(summary) : null
    );
  return analysis;
}

/**
 * Patch an analysis. JSON fields (progress/summary/catalog) are replaced
 * wholesale; a `rows` array replaces the per-product results.
 */
export function updateAnalysis(analysisId, patch) {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM analyses WHERE id = ?").get(analysisId)) return null;

  const sets = [];
  const args = { id: analysisId };
  for (const key of ["status", "error", "warning"]) {
    if (key in patch) {
      sets.push(`${key} = @${key}`);
      args[key] = patch[key];
    }
  }
  for (const key of ["progress", "summary", "catalog"]) {
    if (key in patch) {
      sets.push(`${key} = @${key}`);
      args[key] = patch[key] == null ? null : JSON.stringify(patch[key]);
    }
  }

  const insertProduct = db.prepare(
    `INSERT INTO analysis_products
       (analysis_id, product_id, name, sku, overall, grade, impact, view_count, total_sold, scores, issues, categories, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const run = db.transaction(() => {
    if (sets.length) {
      db.prepare(`UPDATE analyses SET ${sets.join(", ")} WHERE id = @id`).run(args);
    }
    if (Array.isArray(patch.rows)) {
      db.prepare("DELETE FROM analysis_products WHERE analysis_id = ?").run(analysisId);
      for (const r of patch.rows) {
        insertProduct.run(
          analysisId, r.id, r.name || "", r.sku || "", r.overall, r.grade,
          r.impact ?? 0, r.viewCount ?? 0, r.totalSold ?? 0,
          JSON.stringify(r.scores || {}), JSON.stringify(r.issues || []),
          JSON.stringify(r.categories || []),
          r.details ? JSON.stringify(r.details) : null
        );
      }
    }
  });
  run();
  return getAnalysis(analysisId);
}

/**
 * Shape an analysis for API responses: drops the bulky catalog metadata
 * (rows are never attached in the first place; `hasRows` says they exist
 * and /api/analyses/[id]/products serves them).
 */
export function redactAnalysis(analysis) {
  if (!analysis) return null;
  const { catalog, ...rest } = analysis;
  return rest;
}
