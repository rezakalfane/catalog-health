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
import { getDb } from "./sqlite.js";
import {
  DEFAULT_SCORING_PROFILE_ID,
  SCORING_PROFILES,
  getScoringProfile,
  isScoringProfileId,
} from "@catalog-health/core/profiles";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  hasEncryptionKey,
} from "./crypto.js";

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
    for (const s of conn.prepare("SELECT user_id, key, value FROM settings WHERE key = 'llm'").all()) {
      const llm = JSON.parse(s.value);
      if (llm.apiKey && !isEncrypted(llm.apiKey)) {
        llm.apiKey = encryptSecret(llm.apiKey);
        conn
          .prepare("UPDATE settings SET value = ? WHERE user_id = ? AND key = ?")
          .run(JSON.stringify(llm), s.user_id, s.key);
        changed += 1;
      }
    }
    for (const model of conn.prepare("SELECT id, api_key FROM llm_models").all()) {
      if (model.api_key && !isEncrypted(model.api_key)) {
        conn.prepare("UPDATE llm_models SET api_key = ? WHERE id = ?")
          .run(encryptSecret(model.api_key), model.id);
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

// -- LLM model configurations -----------------------------------------------
// Per user. API keys are encrypted at rest and write-only towards the browser.
// A legacy settings.llm blob is imported into this collection on first access.

/** Env-var API key fallback for a provider (Ollama needs none). */
export function envKeyFor(provider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  if (provider === "openai") return process.env.OPENAI_API_KEY || null;
  return null;
}

const LLM_PROVIDERS = new Set(["anthropic", "openai", "ollama"]);

function toLlmModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key ? decryptSecret(row.api_key) : null,
    baseUrl: row.base_url || "",
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Import the pre-multi-model settings blob once, without exposing its key. */
function importLegacyLlmModel(userId) {
  const db = secureDb();
  if (db.prepare("SELECT 1 FROM llm_models WHERE user_id = ? LIMIT 1").get(userId)) return;
  const row = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'llm'").get(userId);
  if (!row) return;
  const legacy = parse(row.value) || {};
  if (!legacy.model || !LLM_PROVIDERS.has(legacy.provider || "anthropic")) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO llm_models
       (id, user_id, name, provider, model, api_key, base_url, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id(), userId, legacy.name || legacy.model, legacy.provider || "anthropic",
    legacy.model, legacy.apiKey || null, legacy.baseUrl || null, now, now
  );
}

export function listLlmModels(userId) {
  importLegacyLlmModel(userId);
  return secureDb()
    .prepare("SELECT * FROM llm_models WHERE user_id = ? ORDER BY is_default DESC, created_at, name")
    .all(userId)
    .map(toLlmModel);
}

export function getLlmModel(userId, modelId) {
  if (!modelId) return null;
  importLegacyLlmModel(userId);
  return toLlmModel(
    secureDb().prepare("SELECT * FROM llm_models WHERE id = ? AND user_id = ?").get(modelId, userId)
  );
}

export function getDefaultLlmModel(userId) {
  importLegacyLlmModel(userId);
  return toLlmModel(
    secureDb()
      .prepare("SELECT * FROM llm_models WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1")
      .get(userId)
  );
}

function makeDefault(db, userId, modelId) {
  db.prepare("UPDATE llm_models SET is_default = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE llm_models SET is_default = 1 WHERE id = ? AND user_id = ?").run(modelId, userId);
}

export function createLlmModel(userId, input) {
  const db = secureDb();
  importLegacyLlmModel(userId);
  const now = new Date().toISOString();
  const modelId = id();
  const first = !db.prepare("SELECT 1 FROM llm_models WHERE user_id = ? LIMIT 1").get(userId);
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO llm_models
         (id, user_id, name, provider, model, api_key, base_url, is_default, created_at, updated_at)
       VALUES (@id, @userId, @name, @provider, @model, @apiKey, @baseUrl, 0, @createdAt, @updatedAt)`
    ).run({
      id: modelId,
      userId,
      name: input.name,
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
      baseUrl: input.baseUrl || null,
      createdAt: now,
      updatedAt: now,
    });
    if (first || input.isDefault) makeDefault(db, userId, modelId);
  });
  create();
  return getLlmModel(userId, modelId);
}

export function updateLlmModel(userId, modelId, input) {
  const db = secureDb();
  const current = getLlmModel(userId, modelId);
  if (!current) return null;
  const providerChanged = input.provider && input.provider !== current.provider;
  const next = {
    name: input.name ?? current.name,
    provider: input.provider ?? current.provider,
    model: input.model ?? current.model,
    baseUrl: input.baseUrl ?? current.baseUrl,
    apiKey: input.apiKey || (providerChanged ? null : current.apiKey),
    updatedAt: new Date().toISOString(),
  };
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE llm_models SET
         name = @name, provider = @provider, model = @model, api_key = @apiKey,
         base_url = @baseUrl, updated_at = @updatedAt
       WHERE id = @id AND user_id = @userId`
    ).run({
      ...next,
      id: modelId,
      userId,
      apiKey: next.apiKey ? encryptSecret(next.apiKey) : null,
      baseUrl: next.baseUrl || null,
    });
    if (input.isDefault) makeDefault(db, userId, modelId);
  });
  update();
  return getLlmModel(userId, modelId);
}

export function deleteLlmModel(userId, modelId) {
  const db = secureDb();
  const current = getLlmModel(userId, modelId);
  if (!current) return false;
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM llm_models WHERE id = ? AND user_id = ?").run(modelId, userId);
    if (current.isDefault) {
      const fallback = db.prepare("SELECT id FROM llm_models WHERE user_id = ? ORDER BY created_at LIMIT 1").get(userId);
      if (fallback) makeDefault(db, userId, fallback.id);
    }
  });
  remove();
  return true;
}

export function redactLlmModel(model) {
  if (!model) return null;
  const { apiKey, ...safe } = model;
  const envKey = envKeyFor(model.provider);
  const hasKey = Boolean(apiKey || envKey);
  return {
    ...safe,
    hasKey,
    keyFromEnv: Boolean(!apiKey && envKey),
    configured: model.provider === "ollama" ? Boolean(model.model) : Boolean(model.model && hasKey),
  };
}

// -- Scoring profiles -------------------------------------------------------

function toCustomScoringProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    version: `1.0.${Math.max(0, row.revision - 1)}`,
    description: row.description || "",
    dimensionWeights: parse(row.dimension_weights),
    semanticWeight: row.semantic_weight,
    thresholds: parse(row.thresholds),
    builtIn: false,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCustomScoringProfiles(userId) {
  return getDb()
    .prepare("SELECT * FROM scoring_profiles WHERE user_id = ? ORDER BY created_at, label")
    .all(userId)
    .map(toCustomScoringProfile);
}

export function listScoringProfiles(userId) {
  const counts = new Map(
    getDb()
      .prepare("SELECT scoring_profile_id AS id, COUNT(*) AS count FROM environments WHERE user_id = ? GROUP BY scoring_profile_id")
      .all(userId)
      .map((row) => [row.id, row.count])
  );
  return [
    ...SCORING_PROFILES.map((profile) => ({ ...profile, builtIn: true })),
    ...listCustomScoringProfiles(userId),
  ].map((profile) => ({ ...profile, environmentCount: counts.get(profile.id) || 0 }));
}

export function getScoringProfileForUser(userId, profileId = DEFAULT_SCORING_PROFILE_ID) {
  if (isScoringProfileId(profileId)) return { ...getScoringProfile(profileId), builtIn: true };
  return toCustomScoringProfile(
    getDb().prepare("SELECT * FROM scoring_profiles WHERE id = ? AND user_id = ?").get(profileId, userId)
  );
}

export function createCustomScoringProfile(userId, profile) {
  const now = new Date().toISOString();
  const profileId = `custom-${id()}`;
  getDb().prepare(
    `INSERT INTO scoring_profiles
       (id, user_id, label, description, dimension_weights, semantic_weight, thresholds, revision, created_at, updated_at)
     VALUES (@id, @userId, @label, @description, @dimensionWeights, @semanticWeight, @thresholds, 1, @createdAt, @updatedAt)`
  ).run({
    id: profileId,
    userId,
    label: profile.label,
    description: profile.description,
    dimensionWeights: JSON.stringify(profile.dimensionWeights),
    semanticWeight: profile.semanticWeight,
    thresholds: JSON.stringify(profile.thresholds),
    createdAt: now,
    updatedAt: now,
  });
  return getScoringProfileForUser(userId, profileId);
}

export function updateCustomScoringProfile(userId, profileId, profile) {
  const result = getDb().prepare(
    `UPDATE scoring_profiles SET
       label = @label, description = @description, dimension_weights = @dimensionWeights,
       semantic_weight = @semanticWeight, thresholds = @thresholds,
       revision = revision + 1, updated_at = @updatedAt
     WHERE id = @id AND user_id = @userId`
  ).run({
    id: profileId,
    userId,
    label: profile.label,
    description: profile.description,
    dimensionWeights: JSON.stringify(profile.dimensionWeights),
    semanticWeight: profile.semanticWeight,
    thresholds: JSON.stringify(profile.thresholds),
    updatedAt: new Date().toISOString(),
  });
  return result.changes ? getScoringProfileForUser(userId, profileId) : null;
}

export function deleteCustomScoringProfile(userId, profileId) {
  const db = getDb();
  const profile = getScoringProfileForUser(userId, profileId);
  if (!profile || profile.builtIn) return null;
  let reassignedEnvironments = 0;
  db.transaction(() => {
    reassignedEnvironments = db.prepare(
      "UPDATE environments SET scoring_profile_id = ? WHERE user_id = ? AND scoring_profile_id = ?"
    ).run(DEFAULT_SCORING_PROFILE_ID, userId, profileId).changes;
    db.prepare("DELETE FROM scoring_profiles WHERE id = ? AND user_id = ?").run(profileId, userId);
  })();
  return { deleted: true, reassignedEnvironments };
}

// -- Environments -----------------------------------------------------------

function toEnvironment(row, userId) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    storeHash: row.store_hash,
    accessToken: decryptSecret(row.access_token),
    scoringProfileId: row.scoring_profile_id || DEFAULT_SCORING_PROFILE_ID,
    scoringProfile: getScoringProfileForUser(userId, row.scoring_profile_id || DEFAULT_SCORING_PROFILE_ID),
    createdAt: row.created_at,
  };
}

export function listEnvironments(userId) {
  return secureDb()
    .prepare("SELECT * FROM environments WHERE user_id = ? ORDER BY created_at")
    .all(userId)
    .map((row) => toEnvironment(row, userId));
}

/** Fetch an environment, scoped to its owner (null if not found or not owned). */
export function getEnvironment(userId, envId) {
  return toEnvironment(
    secureDb()
      .prepare("SELECT * FROM environments WHERE id = ? AND user_id = ?")
      .get(envId, userId),
    userId
  );
}

export function createEnvironment(userId, {
  name,
  storeHash,
  accessToken,
  scoringProfileId = DEFAULT_SCORING_PROFILE_ID,
}) {
  const env = {
    id: id(),
    name,
    storeHash,
    accessToken,
    scoringProfileId,
    scoringProfile: getScoringProfileForUser(userId, scoringProfileId),
    createdAt: new Date().toISOString(),
  };
  secureDb()
    .prepare(
      `INSERT INTO environments
        (id, user_id, name, store_hash, access_token, scoring_profile_id, created_at)
       VALUES
        (@id, @userId, @name, @storeHash, @accessToken, @scoringProfileId, @createdAt)`
    )
    .run({ ...env, userId, accessToken: encryptSecret(env.accessToken) });
  return env; // plaintext token, for server-side use
}

export function updateEnvironment(userId, envId, patch) {
  const env = getEnvironment(userId, envId);
  if (!env) return null;
  for (const key of ["name", "storeHash", "accessToken", "scoringProfileId"]) {
    if (patch[key] !== undefined && patch[key] !== "") env[key] = patch[key];
  }
  secureDb()
    .prepare(
      `UPDATE environments SET name = @name, store_hash = @storeHash,
        access_token = @accessToken, scoring_profile_id = @scoringProfileId
       WHERE id = @id AND user_id = @userId`
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
  a.error, a.warning, a.duration_ms, a.semantic_ms, a.scoring_metadata,
  a.source_analysis_id,
  EXISTS (SELECT 1 FROM analysis_products p WHERE p.analysis_id = a.id) AS has_rows,
  EXISTS (SELECT 1 FROM analysis_products p WHERE p.analysis_id = a.id)
    AND NOT EXISTS (
      SELECT 1 FROM analysis_products p
      WHERE p.analysis_id = a.id AND p.details IS NULL
    ) AS has_scoring_facts
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
    durationMs: row.duration_ms ?? null,
    semanticMs: row.semantic_ms ?? null,
    scoringMetadata: parse(row.scoring_metadata),
    sourceAnalysisId: row.source_analysis_id ?? null,
    hasRows: Boolean(row.has_rows),
    hasScoringFacts: Boolean(row.has_scoring_facts),
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

/** Delete one completed analysis owned by the user; product rows cascade. */
export function deleteAnalysis(userId, analysisId) {
  const db = getDb();
  const analysis = db
    .prepare("SELECT status FROM analyses WHERE id = ? AND user_id = ?")
    .get(analysisId, userId);
  if (!analysis) return { deleted: false, reason: "not_found" };
  if (analysis.status === "running") return { deleted: false, reason: "running" };
  const result = db
    .prepare("DELETE FROM analyses WHERE id = ? AND user_id = ?")
    .run(analysisId, userId);
  return { deleted: result.changes > 0, reason: null };
}

/** Per-product rows for one analysis, scoped to its owner. */
export function getAnalysisRows(userId, analysisId) {
  return getDb()
    .prepare(
      `SELECT p.*,
        EXISTS (
          SELECT 1 FROM product_ai_analyses ai
          WHERE ai.analysis_id = p.analysis_id AND ai.product_id = p.product_id
        ) AS ai_analyzed
       FROM analysis_products p
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
      aiAnalyzed: Boolean(r.ai_analyzed),
    }));
}

/** One product result, owner-scoped, without loading the full analysis table. */
export function getAnalysisProduct(userId, analysisId, productId) {
  return getAnalysisRows(userId, analysisId).find(
    (row) => String(row.id) === String(productId)
  ) || null;
}

function toProductAiAnalysis(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    modelConfigurationId: row.model_configuration_id || null,
    modelConfigurationName: row.model_configuration_name || null,
    source: row.source,
    imageAnalysis: Boolean(row.image_analysis),
    result: parse(row.result),
    generatedAt: row.generated_at,
  };
}

/** Latest saved AI review for this product, scoped through the analysis owner. */
export function getProductAiAnalysis(userId, analysisId, productId) {
  return toProductAiAnalysis(
    getDb()
      .prepare(
        `SELECT r.* FROM product_ai_analyses r
         JOIN analyses a ON a.id = r.analysis_id
         WHERE r.analysis_id = ? AND r.product_id = ? AND a.user_id = ?`
      )
      .get(analysisId, productId, userId)
  );
}

/** Save (or replace) the review for a product. Ownership is checked first. */
export function saveProductAiAnalysis(userId, analysisId, productId, review) {
  const owned = getDb()
    .prepare("SELECT 1 FROM analyses WHERE id = ? AND user_id = ?")
    .get(analysisId, userId);
  if (!owned) return null;
  getDb()
    .prepare(
      `INSERT INTO product_ai_analyses
         (analysis_id, product_id, provider, model, model_configuration_id,
          model_configuration_name, source, image_analysis, result, generated_at)
       VALUES (@analysisId, @productId, @provider, @model, @modelConfigurationId,
         @modelConfigurationName, @source, @imageAnalysis, @result, @generatedAt)
       ON CONFLICT(analysis_id, product_id) DO UPDATE SET
         provider = excluded.provider,
         model = excluded.model,
         model_configuration_id = excluded.model_configuration_id,
         model_configuration_name = excluded.model_configuration_name,
         source = excluded.source,
         image_analysis = excluded.image_analysis,
         result = excluded.result,
         generated_at = excluded.generated_at`
    )
    .run({
      analysisId,
      productId,
      provider: review.provider,
      model: review.model,
      modelConfigurationId: review.modelConfigurationId || null,
      modelConfigurationName: review.modelConfigurationName || null,
      source: review.source,
      imageAnalysis: review.imageAnalysis ? 1 : 0,
      result: JSON.stringify(review.result),
      generatedAt: review.generatedAt,
    });
  return getProductAiAnalysis(userId, analysisId, productId);
}

export function createAnalysis({
  userId,
  environmentId,
  summary = null,
  status = "done",
  progress = null,
  scoringMetadata = null,
  sourceAnalysisId = null,
}) {
  const analysis = {
    id: id(),
    environmentId,
    createdAt: new Date().toISOString(),
    status,
    progress,
    summary,
    error: null,
    warning: null,
    scoringMetadata,
    sourceAnalysisId,
    hasRows: false,
    hasScoringFacts: false,
  };
  getDb()
    .prepare(
      `INSERT INTO analyses
         (id, user_id, environment_id, created_at, status, progress, summary, scoring_metadata, source_analysis_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      analysis.id,
      userId,
      environmentId,
      analysis.createdAt,
      status,
      progress ? JSON.stringify(progress) : null,
      summary ? JSON.stringify(summary) : null,
      scoringMetadata ? JSON.stringify(scoringMetadata) : null,
      sourceAnalysisId
    );
  return analysis;
}

/**
 * Patch an analysis. JSON fields (progress/summary/catalog/scoringMetadata) are replaced
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
  for (const key of ["progress", "summary", "catalog", "scoringMetadata"]) {
    if (key in patch) {
      const column = key === "scoringMetadata" ? "scoring_metadata" : key;
      sets.push(`${column} = @${key}`);
      args[key] = patch[key] == null ? null : JSON.stringify(patch[key]);
    }
  }
  for (const [key, col] of Object.entries({ durationMs: "duration_ms", semanticMs: "semantic_ms" })) {
    if (key in patch) {
      sets.push(`${col} = @${key}`);
      args[key] = patch[key];
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
