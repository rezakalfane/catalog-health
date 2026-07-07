/**
 * SQLite connection + schema for the app's data store.
 *
 * Structure:
 *   environments       — BigCommerce stores (tokens in plain text, like before)
 *   analyses           — one row per run; summary/progress/catalog as JSON columns
 *   analysis_products  — per-product results, one table row per product per analysis
 *   settings           — key/value JSON (e.g. "llm")
 *
 * Schema evolution: append a statement block to MIGRATIONS — each entry runs
 * once, tracked via PRAGMA user_version. Never edit past entries.
 *
 * On first open, an existing data/db.json (the previous JSON-file store) is
 * imported automatically and renamed to db.json.migrated.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "catalog-health.sqlite");
const LEGACY_JSON = path.join(DATA_DIR, "db.json");

const MIGRATIONS = [
  // 1 — initial schema
  `
  CREATE TABLE environments (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    store_hash   TEXT NOT NULL,
    access_token TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE analyses (
    id             TEXT PRIMARY KEY,
    environment_id TEXT NOT NULL,  -- no FK: "demo" is a pseudo-environment
    created_at     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'done',
    progress       TEXT,           -- JSON { percent, stage, label, detail }
    summary        TEXT,           -- JSON report summary
    catalog        TEXT,           -- JSON { categories, trees, channels } metadata
    error          TEXT,
    warning        TEXT
  );
  CREATE INDEX idx_analyses_env_created ON analyses (environment_id, created_at DESC);
  CREATE INDEX idx_analyses_status ON analyses (status);

  CREATE TABLE analysis_products (
    analysis_id TEXT    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    sku         TEXT NOT NULL DEFAULT '',
    overall     INTEGER NOT NULL,
    grade       TEXT NOT NULL,
    impact      REAL NOT NULL DEFAULT 0,
    view_count  INTEGER NOT NULL DEFAULT 0,
    total_sold  INTEGER NOT NULL DEFAULT 0,
    scores      TEXT NOT NULL,     -- JSON { content, structure, ... }
    issues      TEXT NOT NULL,     -- JSON array of issue codes
    categories  TEXT NOT NULL,     -- JSON array of category ids
    PRIMARY KEY (analysis_id, product_id)
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL             -- JSON
  );
  `,

  // 2 — raw per-product facts the scores were based on (description length,
  // images, identifiers, price/weight/stock…), shown on the drill-down page
  `
  ALTER TABLE analysis_products ADD COLUMN details TEXT; -- JSON
  `,

  // 3 — accounts + per-user ownership. environments/analyses get a nullable
  // user_id (NULL = orphaned pre-auth data, claimed by the first account to
  // sign in). settings becomes per-user: PK (user_id, key); pre-auth rows are
  // parked under user_id '' and likewise claimed.
  `
  CREATE TABLE users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    created_at TEXT NOT NULL
  );

  ALTER TABLE environments ADD COLUMN user_id TEXT REFERENCES users(id);
  ALTER TABLE analyses ADD COLUMN user_id TEXT REFERENCES users(id);
  CREATE INDEX idx_environments_user ON environments (user_id);
  CREATE INDEX idx_analyses_user ON analyses (user_id, created_at DESC);

  CREATE TABLE settings_new (
    user_id TEXT NOT NULL DEFAULT '',
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  INSERT INTO settings_new (user_id, key, value) SELECT '', key, value FROM settings;
  DROP TABLE settings;
  ALTER TABLE settings_new RENAME TO settings;
  `,

  // 4 — per-criterion semantic verdicts + reasons (the LLM judge output),
  // shown in the Semantic section of the product drill-down.
  `
  ALTER TABLE analysis_products ADD COLUMN semantic TEXT; -- JSON
  `,
];

function migrate(db) {
  let version = db.pragma("user_version", { simple: true });
  while (version < MIGRATIONS.length) {
    const apply = db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    });
    apply();
    version += 1;
  }
}

/** One-time import of the previous JSON-file store, then rename it aside. */
function importLegacyJson(db) {
  if (!fs.existsSync(LEGACY_JSON)) return;
  const isEmpty =
    db.prepare("SELECT COUNT(*) AS n FROM environments").get().n === 0 &&
    db.prepare("SELECT COUNT(*) AS n FROM analyses").get().n === 0;
  if (!isEmpty) return;

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf8"));
  } catch {
    return; // unreadable legacy file — leave it alone, start fresh
  }

  const insertEnv = db.prepare(
    `INSERT INTO environments (id, name, store_hash, access_token, created_at)
     VALUES (@id, @name, @storeHash, @accessToken, @createdAt)`
  );
  const insertAnalysis = db.prepare(
    `INSERT INTO analyses (id, environment_id, created_at, status, progress, summary, catalog, error, warning)
     VALUES (@id, @environmentId, @createdAt, @status, @progress, @summary, @catalog, @error, @warning)`
  );
  const insertProduct = db.prepare(
    `INSERT INTO analysis_products
       (analysis_id, product_id, name, sku, overall, grade, impact, view_count, total_sold, scores, issues, categories)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?)"
  );

  const run = db.transaction(() => {
    for (const e of legacy.environments || []) {
      insertEnv.run({
        id: e.id,
        name: e.name || "",
        storeHash: e.storeHash || "",
        accessToken: e.accessToken || "",
        createdAt: e.createdAt || new Date().toISOString(),
      });
    }
    for (const a of legacy.analyses || []) {
      insertAnalysis.run({
        id: a.id,
        environmentId: a.environmentId,
        createdAt: a.createdAt,
        status: a.status || "done",
        progress: a.progress ? JSON.stringify(a.progress) : null,
        summary: a.summary ? JSON.stringify(a.summary) : null,
        catalog: a.catalog ? JSON.stringify(a.catalog) : null,
        error: a.error || null,
        warning: a.warning || null,
      });
      for (const r of a.rows || []) {
        insertProduct.run(
          a.id, r.id, r.name || "", r.sku || "", r.overall, r.grade,
          r.impact ?? 0, r.viewCount ?? 0, r.totalSold ?? 0,
          JSON.stringify(r.scores || {}), JSON.stringify(r.issues || []),
          JSON.stringify(r.categories || [])
        );
      }
    }
    for (const [key, value] of Object.entries(legacy.settings || {})) {
      insertSetting.run(key, JSON.stringify(value));
    }
  });
  run();
  fs.renameSync(LEGACY_JSON, `${LEGACY_JSON}.migrated`);
}

/** Open (or reuse) the process-wide connection. Survives dev hot reload. */
export function getDb() {
  let cached = globalThis.__catalogHealthSqlite;
  // Heal a cache written by an older version of this module, which stored
  // the bare connection instead of { db, migrated }.
  if (cached && !cached.db) {
    cached = { db: cached, migrated: 0 };
    globalThis.__catalogHealthSqlite = cached;
  }
  if (cached) {
    // Dev hot reload keeps the connection alive across code changes — apply
    // any migrations that shipped since it was opened.
    if (cached.migrated < MIGRATIONS.length) {
      migrate(cached.db);
      cached.migrated = MIGRATIONS.length;
    }
    return cached.db;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  importLegacyJson(db);
  globalThis.__catalogHealthSqlite = { db, migrated: MIGRATIONS.length };
  return db;
}
