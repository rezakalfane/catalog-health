/**
 * Semantic scoring pass: an LLM judges whether each product description
 * answers three questions — what is it, who's it for, what's it made of.
 *
 * Provider-pluggable: Anthropic (Claude, recommended) or Ollama (local,
 * free). Everything downstream consumes the same verdict shape:
 *   { id, what_it_is, who_its_for, made_of }  with values yes|partial|no
 */
import Anthropic from "@anthropic-ai/sdk";
import { stripHtml } from "./scoring.js";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

const CHUNK_SIZE = 10;
const CONCURRENCY = 4;
const MAX_DESC_CHARS = 2000;
const MIN_JUDGEABLE_CHARS = 20;

const VERDICT_VALUES = ["yes", "partial", "no"];

const JUDGE_SYSTEM = `You are a product-content auditor for an e-commerce catalog.
For each product you receive (name + description), judge whether the description
answers three questions for a shopper who has never seen the product:

1. what_it_is — is it clear what the product actually is and does?
2. who_its_for — is it clear who the product is for or when to use it
   (audience, use case, occasion)?
3. made_of — does it say what the product is made of or its concrete
   specs (materials, ingredients, dimensions, technical specs)?

Grade each question independently with a "verdict": "yes" (clearly answered),
"partial" (hinted at but vague), or "no" (not addressed). For each, also give
a "reason": one concise sentence justifying the verdict, referencing what the
description does or doesn't say. Judge only the text given — do not give
credit for what the product name implies. Marketing fluff ("high-performance",
"premium quality") does not answer any question.
Return a JSON object with this EXACT shape and no other fields:
{"verdicts":[{"id":<product id>,"what_it_is":{"verdict":"yes|partial|no","reason":"..."},"who_its_for":{"verdict":"yes|partial|no","reason":"..."},"made_of":{"verdict":"yes|partial|no","reason":"..."}}]}
Include one entry per product, keyed by its id. Each "verdict" must be exactly
one of "yes", "partial", or "no". Do not add any other fields (no category,
material, strengths, etc.). Respond with raw JSON only — no markdown, no code
fences, no commentary before or after.`;

const CRITERION_SCHEMA = {
  type: "object",
  properties: {
    verdict: { enum: VERDICT_VALUES },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
  additionalProperties: false,
};

const VERDICTS_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          what_it_is: CRITERION_SCHEMA,
          who_its_for: CRITERION_SCHEMA,
          made_of: CRITERION_SCHEMA,
        },
        required: ["id", "what_it_is", "who_its_for", "made_of"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

const CRITERIA = ["what_it_is", "who_its_for", "made_of"];

// A verdict is usable as long as it's yes/partial/no. A missing/blank reason
// (some smaller models omit it) must NOT discard an otherwise-valid verdict.
function validCriterion(c) {
  return c && VERDICT_VALUES.includes(c.verdict);
}

function normalizeCriterion(c) {
  return { verdict: c.verdict, reason: typeof c.reason === "string" ? c.reason.trim() : "" };
}

/**
 * Parse JSON from a model response that may be wrapped in a ```json fence or
 * padded with prose (common with smaller/code models, even under structured
 * output). Falls back to extracting the outermost { ... } object.
 */
function parseJsonLoose(text) {
  const s = (text || "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const unfenced = s
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      return JSON.parse(unfenced);
    } catch {
      const start = unfenced.indexOf("{");
      const end = unfenced.lastIndexOf("}");
      if (start !== -1 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
      throw new Error("No parseable JSON object in the judge response");
    }
  }
}

function chunkPayload(products) {
  return JSON.stringify(
    products.map((p) => ({
      id: p.id,
      name: p.name || "",
      description: stripHtml(p.description).slice(0, MAX_DESC_CHARS),
    }))
  );
}

function sanitizeVerdicts(raw, expectedIds) {
  const out = [];
  for (const v of raw?.verdicts || []) {
    if (!expectedIds.has(v?.id)) continue;
    if (!CRITERIA.every((k) => validCriterion(v[k]))) continue;
    out.push({
      id: v.id,
      what_it_is: normalizeCriterion(v.what_it_is),
      who_its_for: normalizeCriterion(v.who_its_for),
      made_of: normalizeCriterion(v.made_of),
    });
  }
  return out;
}

// -- Judges -------------------------------------------------------------------

function anthropicJudge({ apiKey, model }) {
  const client = new Anthropic({ apiKey });
  return async function judgeChunk(products) {
    const response = await client.messages.create({
      model,
      max_tokens: 8000, // reasons add output on top of the verdicts
      system: JUDGE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: VERDICTS_SCHEMA } },
      messages: [{ role: "user", content: chunkPayload(products) }],
    });
    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to judge this batch");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Judge response was truncated (max_tokens)");
    }
    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    return sanitizeVerdicts(parseJsonLoose(text), new Set(products.map((p) => p.id)));
  };
}

function openaiJudge({ apiKey, model }) {
  return async function judgeChunk(products) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        // Generous: on reasoning models (o-series, gpt-5) this cap includes
        // the invisible reasoning tokens, not just the JSON verdicts.
        max_completion_tokens: 8000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "verdicts", strict: true, schema: VERDICTS_SCHEMA },
        },
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: chunkPayload(products) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || `OpenAI returned ${res.status}`);
    }
    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new Error("The model declined to judge this batch");
    if (data.choices?.[0]?.finish_reason === "length") {
      throw new Error("Judge response was truncated (max tokens)");
    }
    return sanitizeVerdicts(parseJsonLoose(message?.content || "{}"), new Set(products.map((p) => p.id)));
  };
}

function ollamaJudge({ baseUrl, model }) {
  const base = (baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  return async function judgeChunk(products) {
    let res;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: VERDICTS_SCHEMA, // Ollama structured outputs
          // Verdicts + reasons for a chunk can be long; the default output cap
          // truncates the JSON and breaks parsing. Give it room.
          options: { num_predict: 8192 },
          messages: [
            { role: "system", content: JUDGE_SYSTEM },
            { role: "user", content: chunkPayload(products) },
          ],
        }),
      });
    } catch {
      // fetch threw → couldn't connect at all
      throw new Error(`Could not reach Ollama at ${base} — is it running?`);
    }
    if (!res.ok) {
      // Surface Ollama's own message (e.g. cloud-model subscription/auth
      // errors) instead of a misleading "is it running?".
      const detail = await res.json().catch(() => null);
      throw new Error(
        detail?.error ? `Ollama (${model}): ${detail.error}` : `Ollama returned HTTP ${res.status}`
      );
    }
    const data = await res.json();
    return sanitizeVerdicts(parseJsonLoose(data.message?.content || "{}"), new Set(products.map((p) => p.id)));
  };
}

/**
 * Deterministic pseudo-judge for demo analyses: free, instant, no API.
 * Derives plausible verdicts from the synthetic descriptions.
 */
function demoJudge() {
  const pick = (seed, cutYes, cutPartial) => {
    const r = ((seed * 2654435761) >>> 0) % 100;
    return r < cutYes ? "yes" : r < cutPartial ? "partial" : "no";
  };
  const REASONS = {
    what_it_is: {
      yes: "The description clearly states what the product is and does.",
      partial: "The description gestures at what it is but stays vague.",
      no: "The description never plainly says what the product is.",
    },
    who_its_for: {
      yes: "It names a clear audience or use case for the product.",
      partial: "An audience is only loosely implied.",
      no: "It never says who the product is for or when to use it.",
    },
    made_of: {
      yes: "Materials or concrete specs are stated.",
      partial: "Some specs are hinted at but incomplete.",
      no: "No materials, ingredients, or specs are given.",
    },
  };
  const crit = (key, seed, cutYes, cutPartial) => {
    const verdict = pick(seed, cutYes, cutPartial);
    return { verdict, reason: `${REASONS[key][verdict]} (simulated demo judge)` };
  };
  return async function judgeChunk(products) {
    return products.map((p) => {
      const len = stripHtml(p.description).length;
      const richness = Math.min(len / 600, 1); // longer demo descriptions grade better
      return {
        id: p.id,
        what_it_is: crit("what_it_is", p.id * 3 + 1, 30 + richness * 50, 75),
        who_its_for: crit("who_its_for", p.id * 7 + 2, 10 + richness * 40, 60),
        made_of: crit("made_of", p.id * 11 + 3, richness * 30, 45),
      };
    });
  };
}

/**
 * Build a judge from LLM settings: { provider, model, apiKey, baseUrl }.
 * provider "demo" needs no configuration.
 */
export function createJudge(settings = {}) {
  const provider = settings.provider || "anthropic";
  if (provider === "demo") {
    return { judgeChunk: demoJudge(), label: "simulated judge (demo)" };
  }
  if (provider === "ollama") {
    if (!settings.model) throw new Error("No Ollama model configured");
    return {
      judgeChunk: ollamaJudge(settings),
      label: `${settings.model} (Ollama, local)`,
    };
  }
  if (provider === "openai") {
    const apiKey = settings.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OpenAI API key configured");
    if (!settings.model) throw new Error("No OpenAI model configured");
    return {
      judgeChunk: openaiJudge({ apiKey, model: settings.model }),
      label: `${settings.model} (OpenAI)`,
    };
  }
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No Anthropic API key configured");
  const model = settings.model || DEFAULT_ANTHROPIC_MODEL;
  return { judgeChunk: anthropicJudge({ apiKey, model }), label: model };
}

// -- Catalog pass -------------------------------------------------------------

/**
 * Judge every product with a real description. Returns Map<id, verdict>.
 * Products with no/near-empty descriptions are skipped (they score 0
 * without spending tokens). onProgress({ judged, total }) fires per chunk.
 * A truthy shouldAbort() stops the pass between chunks with a
 * `semantic_cancelled` error.
 */
export async function judgeCatalog(products, { judgeChunk, onProgress, shouldAbort } = {}) {
  const judgeable = products.filter(
    (p) => stripHtml(p.description).length >= MIN_JUDGEABLE_CHARS
  );
  const chunks = [];
  for (let i = 0; i < judgeable.length; i += CHUNK_SIZE) {
    chunks.push(judgeable.slice(i, i + CHUNK_SIZE));
  }

  const abort = () => {
    if (shouldAbort?.()) {
      throw Object.assign(new Error("cancelled by user"), { code: "semantic_cancelled" });
    }
  };

  const verdicts = new Map();
  let judged = 0;
  let nextChunk = 0;
  let failures = 0;

  async function worker() {
    while (nextChunk < chunks.length) {
      abort();
      const chunk = chunks[nextChunk++];
      try {
        for (const v of await judgeChunk(chunk)) verdicts.set(v.id, v);
      } catch (err) {
        // Tolerate a few bad chunks (their products get retried below, and
        // otherwise score as unjudged), but fail the pass on systemic errors.
        failures += 1;
        if (failures > Math.max(2, chunks.length * 0.2)) throw err;
      }
      judged += chunk.length;
      onProgress?.({ judged, total: judgeable.length });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
  );

  // Retry pass: models (especially smaller/local ones) sometimes omit some
  // products from a batch response. Re-judge anything still missing, one at a
  // time — a single-product request is small and reliable. Best-effort.
  const missing = judgeable.filter((p) => !verdicts.has(p.id));
  if (missing.length) {
    let nextRetry = 0;
    async function retryWorker() {
      while (nextRetry < missing.length) {
        abort();
        const p = missing[nextRetry++];
        try {
          for (const v of await judgeChunk([p])) verdicts.set(v.id, v);
        } catch {
          // leave unjudged — the product shows an honest "no result" note
        }
        onProgress?.({ judged, total: judgeable.length, retrying: true });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, missing.length) }, retryWorker)
    );
  }

  return verdicts;
}
