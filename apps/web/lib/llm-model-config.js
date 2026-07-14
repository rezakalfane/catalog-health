import { normalizeOllamaBaseUrl } from "@catalog-health/core";

export const LLM_PROVIDERS = new Set(["anthropic", "openai", "ollama"]);

export function normalizeLlmModelInput(input = {}) {
  const provider = String(input.provider || "").trim();
  const name = String(input.name || "").trim();
  const model = String(input.model || "").trim();
  if (!LLM_PROVIDERS.has(provider)) throw new Error("Choose a supported provider.");
  if (!name) throw new Error("Give this model configuration a name.");
  if (name.length > 80) throw new Error("The configuration name must be 80 characters or fewer.");
  if (!model) throw new Error("Choose a model.");
  return {
    name,
    provider,
    model,
    apiKey: String(input.apiKey || "").trim() || undefined,
    baseUrl: provider === "ollama" ? normalizeOllamaBaseUrl(input.baseUrl) : "",
    isDefault: Boolean(input.isDefault),
  };
}
