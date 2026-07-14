import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeOllamaBaseUrl } from "@catalog-health/core";
import { envKeyFor, getDefaultLlmModel, getLlmModel } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";

// OpenAI's /v1/models mixes chat models with embeddings/audio/image/etc.
const OPENAI_NON_CHAT =
  /embed|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|codex|search|davinci|babbage/i;

/**
 * POST { provider, apiKey?, baseUrl? } -> validates the connection and
 * returns the models available from that provider. Falls back to the stored
 * key / env var when no key is supplied, so "Test" works after a reload.
 */
export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const stored = (body.id ? getLlmModel(user.id, body.id) : getDefaultLlmModel(user.id)) || {};
  const provider = body.provider || stored.provider || "anthropic";

  try {
    if (provider === "ollama") {
      const base = normalizeOllamaBaseUrl(body.baseUrl || stored.baseUrl);
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      if (!models.length) {
        return NextResponse.json(
          { error: "Connected, but no models installed — run e.g. `ollama pull llama3.1`" },
          { status: 422 }
        );
      }
      return NextResponse.json({ ok: true, models });
    }

    // Only reuse the stored key when it belongs to the provider being tested.
    const storedKey = stored.provider === provider ? stored.apiKey : undefined;
    const apiKey = body.apiKey || storedKey || envKeyFor(provider);
    if (!apiKey) {
      return NextResponse.json({ error: "No API key provided" }, { status: 400 });
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401) throw Object.assign(new Error("Invalid API key"), { status: 401 });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
      const data = await res.json();
      const models = (data.data || [])
        .map((m) => m.id)
        .filter((id) => /^(gpt-|o\d)/.test(id) && !OPENAI_NON_CHAT.test(id))
        .sort();
      return NextResponse.json({ ok: true, models });
    }

    const client = new Anthropic({ apiKey });
    const models = [];
    for await (const m of client.models.list()) models.push(m.id);
    return NextResponse.json({ ok: true, models });
  } catch (err) {
    let message = err.message || "Connection failed";
    if (provider === "ollama" && (err.name === "TimeoutError" || err.cause)) {
      message = "Could not reach Ollama — is it running?";
    } else if (err.status === 401) {
      message = "Invalid API key";
    }
    const status = provider === "ollama" && message.startsWith("Ollama URL") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
