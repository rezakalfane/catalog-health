/**
 * Central client for the app's internal JSON API. Every browser-side call to an
 * /api/* route lives here, so pages and components invoke named functions
 * instead of hand-rolling URLs, methods, and response handling.
 *
 * Convention: functions resolve with the parsed JSON body on success and throw
 * an ApiError (carrying the HTTP status and parsed body) on a non-2xx response.
 * Callers that want to stay silent on failure catch and fall back.
 */

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error || `Request failed (${res.status})`, {
      status: res.status,
      body,
    });
  }
  return body;
}

function jsonRequest(url, method, data) {
  return request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/* ---- Settings ---------------------------------------------------------- */

/** Current redacted model configurations and the selected default. */
export function getSettings() {
  return request("/api/settings");
}

/** Create (no id) or update a reusable model configuration. */
export function saveLlmModel(id, form) {
  return id
    ? jsonRequest(`/api/settings/${id}`, "PUT", form)
    : jsonRequest("/api/settings", "POST", form);
}

export function deleteLlmModel(id) {
  return request(`/api/settings/${id}`, { method: "DELETE" });
}

export function setDefaultLlmModel(id) {
  return jsonRequest(`/api/settings/${id}`, "PUT", { isDefault: true });
}

/** Probe a provider connection; resolves with `{ models }`. */
export function testSettingsConnection({ id, provider, apiKey, baseUrl }) {
  return jsonRequest("/api/settings/test", "POST", {
    id: id || undefined,
    provider,
    apiKey: apiKey || undefined,
    baseUrl: baseUrl || undefined,
  });
}

/* ---- Scoring profiles -------------------------------------------------- */

export function listScoringProfiles() {
  return request("/api/profiles");
}

export function saveScoringProfile(id, profile) {
  return id
    ? jsonRequest(`/api/profiles/${id}`, "PUT", profile)
    : jsonRequest("/api/profiles", "POST", profile);
}

export function deleteScoringProfile(id) {
  return request(`/api/profiles/${id}`, { method: "DELETE" });
}

/* ---- Environments ------------------------------------------------------ */

/** All configured environments for the current user. */
export function listEnvironments() {
  return request("/api/environments");
}

/** A single environment, or null when it can't be loaded. */
export async function getEnvironment(id) {
  try {
    return await request(`/api/environments/${id}`);
  } catch {
    return null;
  }
}

/** Create (no id) or update (with id) an environment. */
export function saveEnvironment(id, form) {
  return id
    ? jsonRequest(`/api/environments/${id}`, "PUT", form)
    : jsonRequest("/api/environments", "POST", form);
}

/** Delete an environment and its analysis history. */
export function deleteEnvironment(id) {
  return request(`/api/environments/${id}`, { method: "DELETE" });
}

/* ---- Analyses ---------------------------------------------------------- */

/** List analyses, optionally filtered by environment and/or status. */
export function listAnalyses({ environmentId, status } = {}) {
  const params = new URLSearchParams();
  if (environmentId) params.set("environmentId", environmentId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return request(`/api/analyses${qs ? `?${qs}` : ""}`);
}

/** A single analysis (summary + progress). */
export function getAnalysis(id) {
  return request(`/api/analyses/${id}`);
}

/** Permanently delete one completed analysis and its product rows. */
export function deleteAnalysis(id) {
  return request(`/api/analyses/${id}`, { method: "DELETE" });
}

/** The per-product rows and lookup tables for an analysis. */
export function getAnalysisProducts(id) {
  return request(`/api/analyses/${id}/products`);
}

/** Load the saved AI product review and current provider readiness. */
export function getProductAiAnalysis(analysisId, productId) {
  return request(`/api/analyses/${analysisId}/products/${productId}/ai-analysis`);
}

/** Push one saved AI suggestion to the source BigCommerce product. */
export function pushProductAiChange(analysisId, productId, changeId, options = {}) {
  return jsonRequest(
    `/api/analyses/${analysisId}/products/${productId}/ai-analysis`,
    "PATCH",
    { changeId, ...options }
  );
}

/** Generate or regenerate a rich AI product review with the selected LLM. */
export async function runProductAiAnalysis(analysisId, productId, modelConfigurationId, onProgress) {
  const response = await fetch(
    `/api/analyses/${analysisId}/products/${productId}/ai-analysis`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelConfigurationId }),
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed (${response.status})`, {
      status: response.status,
      body,
    });
  }
  if (!response.body) throw new ApiError("AI Analysis returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let completed = null;

  function consume(line) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") onProgress?.({ step: event.step, detail: event.detail });
    if (event.type === "result") completed = event;
    if (event.type === "error") {
      throw new ApiError(event.error || "AI Analysis failed.", {
        status: 502,
        body: { error: event.error || "AI Analysis failed." },
      });
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() || "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffered.trim()) consume(buffered);
  if (!completed) throw new ApiError("AI Analysis ended before returning a result.");
  return {
    review: completed.review,
    pushState: completed.pushState || {},
    models: completed.models || [],
    defaultModelId: completed.defaultModelId || null,
  };
}

/** Compare two completed analyses from the same environment. */
export function compareAnalyses(base, target) {
  const params = new URLSearchParams({ base, target });
  return request(`/api/analyses/compare?${params}`);
}

/** Start a new analysis; resolves with the created `{ id }`. */
export function createAnalysis(payload) {
  return jsonRequest("/api/analyses", "POST", payload);
}

/** Recalculate a completed analysis from its stored facts under another profile. */
export function recalculateAnalysis(id, profileId) {
  return jsonRequest(`/api/analyses/${id}/recalculate`, "POST", { profileId });
}

/** Ask the runner to skip the semantic-scoring stage of a running analysis. */
export function skipSemantic(id) {
  return request(`/api/analyses/${id}/skip-semantic`, { method: "POST" });
}
