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

Grade each question independently: "yes" (clearly answered), "partial"
(hinted at but vague), or "no" (not addressed). Judge only the text given —
do not give credit for what the product name implies. Marketing fluff
("high-performance", "premium quality") does not answer any question.
Return one verdict per product, keyed by the product's id.`;

const VERDICTS_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          what_it_is: { enum: VERDICT_VALUES },
          who_its_for: { enum: VERDICT_VALUES },
          made_of: { enum: VERDICT_VALUES },
        },
        required: ["id", "what_it_is", "who_its_for", "made_of"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

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
    if (![v.what_it_is, v.who_its_for, v.made_of].every((x) => VERDICT_VALUES.includes(x))) continue;
    out.push({ id: v.id, what_it_is: v.what_it_is, who_its_for: v.who_its_for, made_of: v.made_of });
  }
  return out;
}

// -- Judges -------------------------------------------------------------------

function anthropicJudge({ apiKey, model }) {
  const client = new Anthropic({ apiKey });
  return async function judgeChunk(products) {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
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
    return sanitizeVerdicts(JSON.parse(text), new Set(products.map((p) => p.id)));
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
    return sanitizeVerdicts(JSON.parse(message?.content || "{}"), new Set(products.map((p) => p.id)));
  };
}

function ollamaJudge({ baseUrl, model }) {
  const base = (baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  return async function judgeChunk(products) {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: VERDICTS_SCHEMA, // Ollama structured outputs
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: chunkPayload(products) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status} — is it running at ${base}?`);
    const data = await res.json();
    return sanitizeVerdicts(JSON.parse(data.message?.content || "{}"), new Set(products.map((p) => p.id)));
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
  return async function judgeChunk(products) {
    return products.map((p) => {
      const len = stripHtml(p.description).length;
      const richness = Math.min(len / 600, 1); // longer demo descriptions grade better
      return {
        id: p.id,
        what_it_is: pick(p.id * 3 + 1, 30 + richness * 50, 75),
        who_its_for: pick(p.id * 7 + 2, 10 + richness * 40, 60),
        made_of: pick(p.id * 11 + 3, richness * 30, 45),
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

  const verdicts = new Map();
  let judged = 0;
  let nextChunk = 0;
  let failures = 0;

  async function worker() {
    while (nextChunk < chunks.length) {
      if (shouldAbort?.()) {
        throw Object.assign(new Error("cancelled by user"), { code: "semantic_cancelled" });
      }
      const chunk = chunks[nextChunk++];
      try {
        for (const v of await judgeChunk(chunk)) verdicts.set(v.id, v);
      } catch (err) {
        // Tolerate a few bad chunks (their products score as unjudged),
        // but a systemic failure should fail the pass with the real error.
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
  return verdicts;
}
