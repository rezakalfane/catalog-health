import { NextResponse } from "next/server";
import {
  deleteLlmModel,
  getLlmModel,
  listLlmModels,
  redactLlmModel,
  updateLlmModel,
} from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { normalizeLlmModelInput } from "@/lib/llm-model-config";

function settingsResponse(userId) {
  const models = listLlmModels(userId).map(redactLlmModel);
  const defaultModel = models.find((model) => model.isDefault) || models[0] || null;
  return { models, defaultModelId: defaultModel?.id || null, llm: defaultModel };
}

export async function PUT(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = getLlmModel(user.id, id);
  if (!current) return NextResponse.json({ error: "Model configuration not found" }, { status: 404 });
  try {
    const patch = await request.json();
    const providerChanged = patch.provider && patch.provider !== current.provider;
    const input = normalizeLlmModelInput({
      ...current,
      ...patch,
      apiKey: patch.apiKey || (providerChanged ? "" : current.apiKey),
    });
    if (!redactLlmModel({ ...input, apiKey: input.apiKey || (providerChanged ? null : current.apiKey) }).configured) {
      return NextResponse.json({ error: "Add an API key before saving this model." }, { status: 400 });
    }
    updateLlmModel(user.id, id, input);
    return NextResponse.json(settingsResponse(user.id));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid model configuration" }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!deleteLlmModel(user.id, id)) {
    return NextResponse.json({ error: "Model configuration not found" }, { status: 404 });
  }
  return NextResponse.json(settingsResponse(user.id));
}
