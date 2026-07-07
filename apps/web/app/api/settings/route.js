import { NextResponse } from "next/server";
import { getSettings, updateLlmSettings, redactLlmSettings } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ llm: redactLlmSettings() });
}

/** PUT { llm: { provider, model, apiKey?, baseUrl? } } — empty apiKey keeps the stored one. */
export async function PUT(request) {
  const body = await request.json();
  if (body?.llm) updateLlmSettings(body.llm);
  return NextResponse.json({ llm: redactLlmSettings(getSettings()) });
}
