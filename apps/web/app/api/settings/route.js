import { NextResponse } from "next/server";
import { createLlmModel, listLlmModels, redactLlmModel } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { normalizeLlmModelInput } from "@/lib/llm-model-config";

function settingsResponse(userId) {
  const models = listLlmModels(userId).map(redactLlmModel);
  const defaultModel = models.find((model) => model.isDefault) || models[0] || null;
  return { models, defaultModelId: defaultModel?.id || null, llm: defaultModel };
}

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(settingsResponse(user.id));
}

/** POST a reusable provider/model connection. The first model becomes default. */
export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = normalizeLlmModelInput(await request.json());
    if (!redactLlmModel(input).configured) {
      return NextResponse.json({ error: "Add an API key before saving this model." }, { status: 400 });
    }
    createLlmModel(user.id, input);
    return NextResponse.json(settingsResponse(user.id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid model configuration" }, { status: 400 });
  }
}
