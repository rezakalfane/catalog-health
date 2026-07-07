/**
 * Minimal JSON-file data store. Zero dependencies, easy to swap for
 * SQLite/Postgres later — every consumer goes through these functions.
 *
 * Data lives in <repo>/data/db.json (gitignored — it contains API tokens).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { environments: [], analyses: [] };
  }
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const id = () => crypto.randomUUID();

// -- Environments -----------------------------------------------------------

export function listEnvironments() {
  return load().environments;
}

export function getEnvironment(envId) {
  return load().environments.find((e) => e.id === envId) || null;
}

export function createEnvironment({ name, storeHash, accessToken }) {
  const db = load();
  const env = {
    id: id(),
    name,
    storeHash,
    accessToken,
    createdAt: new Date().toISOString(),
  };
  db.environments.push(env);
  save(db);
  return env;
}

export function updateEnvironment(envId, patch) {
  const db = load();
  const env = db.environments.find((e) => e.id === envId);
  if (!env) return null;
  for (const key of ["name", "storeHash", "accessToken"]) {
    if (patch[key] !== undefined && patch[key] !== "") env[key] = patch[key];
  }
  save(db);
  return env;
}

export function deleteEnvironment(envId) {
  const db = load();
  db.environments = db.environments.filter((e) => e.id !== envId);
  db.analyses = db.analyses.filter((a) => a.environmentId !== envId);
  save(db);
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
//   status:   "running" | "done" | "failed"  (records predating async = done)
//   progress: { percent, stage, label, detail } while running
//   summary:  filled in progressively by the runner, complete once done

/** Records created before async runs have no status — treat them as done. */
export function analysisStatus(analysis) {
  return analysis.status || "done";
}

export function listAnalyses(environmentId) {
  const all = load().analyses;
  const filtered = environmentId
    ? all.filter((a) => a.environmentId === environmentId)
    : all;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Only successfully completed analyses — what dashboards should read. */
export function listCompletedAnalyses(environmentId) {
  return listAnalyses(environmentId).filter((a) => analysisStatus(a) === "done");
}

export function findRunningAnalysis(environmentId) {
  return (
    load().analyses.find(
      (a) =>
        a.status === "running" &&
        (!environmentId || a.environmentId === environmentId)
    ) || null
  );
}

export function getAnalysis(analysisId) {
  return load().analyses.find((a) => a.id === analysisId) || null;
}

export function createAnalysis({ environmentId, summary = null, status = "done", progress = null }) {
  const db = load();
  const analysis = {
    id: id(),
    environmentId,
    createdAt: new Date().toISOString(),
    status,
    progress,
    summary,
  };
  db.analyses.push(analysis);
  save(db);
  return analysis;
}

export function updateAnalysis(analysisId, patch) {
  const db = load();
  const analysis = db.analyses.find((a) => a.id === analysisId);
  if (!analysis) return null;
  Object.assign(analysis, patch);
  save(db);
  return analysis;
}
