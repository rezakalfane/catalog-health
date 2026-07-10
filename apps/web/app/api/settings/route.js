import { NextResponse } from "next/server";
import { normalizeOllamaBaseUrl } from "@catalog-health/core";
import { getSettings, updateLlmSettings, redactLlmSettings } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ llm: redactLlmSettings(getSettings(user.id)) });
}

/** PUT { llm: { provider, model, apiKey?, baseUrl? } } — empty apiKey keeps the stored one. */
export async function PUT(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (body?.llm) {
    if (body.llm.provider === "ollama" || body.llm.baseUrl) {
      try {
        body.llm.baseUrl = normalizeOllamaBaseUrl(body.llm.baseUrl);
      } catch (err) {
        return NextResponse.json({ error: err.message || "Invalid Ollama URL" }, { status: 400 });
      }
    }
    updateLlmSettings(user.id, body.llm);
  }
  return NextResponse.json({ llm: redactLlmSettings(getSettings(user.id)) });
}
