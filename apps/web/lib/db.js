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
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  hasEncryptionKey,
} from "@/lib/crypto";

const id = () => crypto.randomUUID();
const parse = (s) => (s == null ? null : JSON.parse(s));

// -- Encryption at rest ------------------------------------------------------
//
// Secrets (store access tokens, LLM API keys) are encrypted in the DB when
// APP_ENCRYPTION_KEY is set. On first access we sweep any legacy plaintext
// rows into ciphertext, then reclaim freed pages so the old plaintext doesn't
// linger in the file/WAL. Idempotent: already-encrypted values are skipped.

let secretsSwept = false;

function secureDb() {
  const conn = getDb();
  if (secretsSwept || !hasEncryptionKey()) return conn;

  let changed = 0;
  const sweep = conn.transaction(() => {
    for (const e of conn.prepare("SELECT id, access_token FROM environments").all()) {
      if (e.access_token && !isEncrypted(e.access_token)) {
        conn
          .prepare("UPDATE environments SET access_token = ? WHERE id = ?")
          .run(encryptSecret(e.access_token), e.id);
        changed += 1;
      }
    }
    const s = conn.prepare("SELECT value FROM settings WHERE key = 'llm'").get();
    if (s) {
      const llm = JSON.parse(s.value);
      if (llm.apiKey && !isEncrypted(llm.apiKey)) {
        llm.apiKey = encryptSecret(llm.apiKey);
        conn.prepare("UPDATE settings SET value = ? WHERE key = 'llm'").run(JSON.stringify(llm));
        changed += 1;
      }
    }
  });
  sweep();

  if (changed > 0) {
    // Purge old plaintext bytes from freed pages and the WAL.
    conn.pragma("wal_checkpoint(TRUNCATE)");
    conn.exec("VACUUM");
  }
  secretsSwept = true;
  return conn;
}

// -- Users -------------------------------------------------------------------

function toUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

/**
 * Look up a user by email, creating one on first sign-in. The very first user
 * created also claims all orphaned pre-auth data (environments/analyses with
 * no owner, and the global settings row), so existing data isn't stranded.
 */
export function getOrCreateUser({ email, name }) {
  const conn = getDb();
  const key = String(email).trim().toLowerCase();
  const existing = conn.prepare("SELECT * FROM users WHERE email = ?").get(key);
  if (existing) return toUser(existing);

  const isFirst = conn.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0;
  const user = {
    id: id(),
    email: key,
    name: name || key,
    createdAt: new Date().toISOString(),
  };
  const create = conn.transaction(() => {
    conn
      .prepare("INSERT INTO users (id, email, name, created_at) VALUES (@id, @email, @name, @createdAt)")
      .run(user);
    if (isFirst) {
      conn.prepare("UPDATE environments SET user_id = ? WHERE user_id IS NULL").run(user.id);
      conn.prepare("UPDATE analyses SET user_id = ? WHERE user_id IS NULL").run(user.id);
      conn.prepare("UPDATE settings SET user_id = ? WHERE user_id = ''").run(user.id);
    }
  });
  create();
  return toUser(user);
}

// -- Settings ----------------------------------------------------------------
//
// settings.llm = { provider: "anthropic" | "openai" | "ollama", model, apiKey, baseUrl }
// Per user. The API key is write-only towards the browser, like store tokens.

export function getSettings(userId) {
  const rows = secureDb()
    .prepare("SELECT key, value FROM settings WHERE user_id = ?")
    .all(userId);
  const out = Object.fromEntries(rows.map((r) => [r.key, parse(r.value)]));
  if (out.llm?.apiKey) out.llm.apiKey = decryptSecret(out.llm.apiKey);
  return out;
}

/** Env-var API key fallback for a provider (Ollama needs none). */
export function envKeyFor(provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  if (provider === "openai") return process.env.OPENAI_API_KEY || null;
  return null;
}

/** Merge an LLM settings patch. An empty/absent apiKey keeps the stored one. */
export function updateLlmSettings(userId, patch) {
  const db = secureDb();
  const llm = getSettings(userId).llm || {}; // apiKey decrypted (if any)
  // A key saved for one provider must never be sent to another.
  if (patch.provider && patch.provider !== llm.provider) delete llm.apiKey;
  for (const key of ["provider", "model", "baseUrl"]) {
    if (patch[key] !== undefined) llm[key] = patch[key];
  }
  if (patch.apiKey) llm.apiKey = patch.apiKey;
  // Encrypt only the apiKey field; provider/model stay queryable/redactable.
  const stored = { ...llm };
  if (stored.apiKey) stored.apiKey = encryptSecret(stored.apiKey);
  db.prepare(
    `INSERT INTO settings (user_id, key, value) VALUES (?, 'llm', ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
  ).run(userId, JSON.stringify(stored));
  return llm; // decrypted, for server-side use
}

/** LLM settings safe to send to the client. Pass the user's getSettings(). */
export function redactLlmSettings(settings) {
  const { apiKey, ...rest } = settings?.llm || {};
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
    accessToken: decryptSecret(row.access_token),
    createdAt: row.created_at,
  };
}

export function listEnvironments(userId) {
  return secureDb()
    .prepare("SELECT * FROM environments WHERE user_id = ? ORDER BY created_at")
    .all(userId)
    .map(toEnvironment);
}

/** Fetch an environment, scoped to its owner (null if not found or not owned). */
export function getEnvironment(userId, envId) {
  return toEnvironment(
    secureDb()
      .prepare("SELECT * FROM environments WHERE id = ? AND user_id = ?")
      .get(envId, userId)
  );
}

export function createEnvironment(userId, { name, storeHash, accessToken }) {
  const env = {
    id: id(),
    name,
    storeHash,
    accessToken,
    createdAt: new Date().toISOString(),
  };
  secureDb()
    .prepare(
      `INSERT INTO environments (id, user_id, name, store_hash, access_token, created_at)
       VALUES (@id, @userId, @name, @storeHash, @accessToken, @createdAt)`
    )
    .run({ ...env, userId, accessToken: encryptSecret(env.accessToken) });
  return env; // plaintext token, for server-side use
}

export function updateEnvironment(userId, envId, patch) {
  const env = getEnvironment(userId, envId);
  if (!env) return null;
  for (const key of ["name", "storeHash", "accessToken"]) {
    if (patch[key] !== undefined && patch[key] !== "") env[key] = patch[key];
  }
  secureDb()
    .prepare(
      `UPDATE environments SET name = @name, store_hash = @storeHash,
        access_token = @accessToken WHERE id = @id AND user_id = @userId`
    )
    .run({ ...env, userId, accessToken: encryptSecret(env.accessToken) });
  return env; // plaintext token, for server-side use
}

export function deleteEnvironment(userId, envId) {
  const db = getDb();
  const run = db.transaction(() => {
    // Only touch rows owned by this user. analysis_products cascade from
    // analyses; analyses have no FK ("demo" is a pseudo-environment).
    db.prepare(
      `DELETE FROM analysis_products WHERE analysis_id IN
         (SELECT id FROM analyses WHERE environment_id = ? AND user_id = ?)`
    ).run(envId, userId);
    db.prepare("DELETE FROM analyses WHERE environment_id = ? AND user_id = ?").run(envId, userId);
    db.prepare("DELETE FROM environments WHERE id = ? AND user_id = ?").run(envId, userId);
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

export function listAnalyses(userId, environmentId) {
  const db = getDb();
  const rows = environmentId
    ? db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.user_id = ? AND a.environment_id = ? ORDER BY a.created_at DESC`
        )
        .all(userId, environmentId)
    : db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.user_id = ? ORDER BY a.created_at DESC`
        )
        .all(userId);
  return rows.map((r) => toAnalysis(r));
}

/** Only successfully completed analyses — what dashboards should read. */
export function listCompletedAnalyses(userId, environmentId) {
  return listAnalyses(userId, environmentId).filter((a) => analysisStatus(a) === "done");
}

export function findRunningAnalysis(userId, environmentId) {
  const db = getDb();
  const row = environmentId
    ? db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.status = 'running' AND a.user_id = ? AND a.environment_id = ? LIMIT 1`
        )
        .get(userId, environmentId)
    : db
        .prepare(
          `SELECT ${ANALYSIS_COLS} FROM analyses a
           WHERE a.status = 'running' AND a.user_id = ? LIMIT 1`
        )
        .get(userId);
  return toAnalysis(row);
}

/** All running analyses regardless of owner — for startup reconciliation. */
export function listRunningAnalysesAllUsers() {
  return getDb()
    .prepare(`SELECT ${ANALYSIS_COLS} FROM analyses a WHERE a.status = 'running'`)
    .all()
    .map((r) => toAnalysis(r));
}

/** Fetch one analysis scoped to its owner (null if not found or not owned). */
export function getAnalysis(userId, analysisId) {
  const row = getDb()
    .prepare(`SELECT ${ANALYSIS_COLS}, a.catalog FROM analyses a WHERE a.id = ? AND a.user_id = ?`)
    .get(analysisId, userId);
  return toAnalysis(row, { withCatalog: true });
}

/** Per-product rows for one analysis, scoped to its owner. */
export function getAnalysisRows(userId, analysisId) {
  return getDb()
    .prepare(
      `SELECT p.* FROM analysis_products p
       JOIN analyses a ON a.id = p.analysis_id
       WHERE p.analysis_id = ? AND a.user_id = ? ORDER BY p.impact DESC`
    )
    .all(analysisId, userId)
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
      semantic: parse(r.semantic),
    }));
}

export function createAnalysis({ userId, environmentId, summary = null, status = "done", progress = null }) {
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
      `INSERT INTO analyses (id, user_id, environment_id, created_at, status, progress, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      analysis.id,
      userId,
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
       (analysis_id, product_id, name, sku, overall, grade, impact, view_count, total_sold, scores, issues, categories, details, semantic)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          r.details ? JSON.stringify(r.details) : null,
          r.semantic ? JSON.stringify(r.semantic) : null
        );
      }
    }
  });
  run();
  // Internal (runner-owned) — return the record by id, not user-scoped.
  const row = db
    .prepare(`SELECT ${ANALYSIS_COLS}, a.catalog FROM analyses a WHERE a.id = ?`)
    .get(analysisId);
  return toAnalysis(row, { withCatalog: true });
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
