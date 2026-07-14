import assert from "node:assert/strict";
import {
  createLlmModel,
  deleteLlmModel,
  getDefaultLlmModel,
  getLlmModel,
  listLlmModels,
  redactLlmModel,
  updateLlmModel,
} from "../lib/db.js";
import { normalizeLlmModelInput } from "../lib/llm-model-config.js";
import { getDb } from "../lib/sqlite.js";

const db = getDb();
const suffix = Date.now();
const userId = `llm-model-test-${suffix}`;
const legacyUserId = `llm-model-legacy-test-${suffix}`;
const now = new Date().toISOString();

for (const id of [userId, legacyUserId]) {
  db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
    .run(id, `${id}@example.test`, "LLM model test", now);
}

try {
  const first = createLlmModel(userId, {
    name: "OpenAI catalog review", provider: "openai", model: "gpt-test-a", apiKey: "secret-a",
  });
  assert.equal(first.isDefault, true, "the first configuration becomes default");
  assert.equal(redactLlmModel(first).configured, true);
  assert.equal("apiKey" in redactLlmModel(first), false, "redacted models never expose keys");

  const second = createLlmModel(userId, {
    name: "Local product review", provider: "ollama", model: "local-test",
    baseUrl: "http://localhost:11434", isDefault: true,
  });
  assert.equal(getDefaultLlmModel(userId).id, second.id);
  assert.equal(listLlmModels(userId).filter((model) => model.isDefault).length, 1);
  assert.equal(getLlmModel("another-user", first.id), null, "model lookup is owner-scoped");

  const updated = updateLlmModel(userId, first.id, {
    name: "Primary semantic judge", provider: "openai", model: "gpt-test-b", isDefault: true,
  });
  assert.equal(updated.name, "Primary semantic judge");
  assert.equal(updated.apiKey, "secret-a", "blank edits retain the saved provider key");
  assert.equal(getDefaultLlmModel(userId).id, first.id);
  const providerChanged = updateLlmModel(userId, first.id, {
    name: updated.name, provider: "anthropic", model: "claude-test", isDefault: true,
  });
  assert.equal(providerChanged.apiKey, null, "keys never carry across providers");

  assert.equal(deleteLlmModel(userId, first.id), true);
  assert.equal(getDefaultLlmModel(userId).id, second.id, "deleting the default promotes a fallback");

  db.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, 'llm', ?)")
    .run(legacyUserId, JSON.stringify({
      provider: "anthropic", model: "legacy-claude-test", apiKey: "legacy-secret",
    }));
  const imported = listLlmModels(legacyUserId);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].model, "legacy-claude-test");
  assert.equal(imported[0].isDefault, true);

  assert.deepEqual(
    normalizeLlmModelInput({
      name: " Local ", provider: "ollama", model: " llama-test ", baseUrl: "http://localhost:11434/",
    }),
    {
      name: "Local", provider: "ollama", model: "llama-test", apiKey: undefined,
      baseUrl: "http://localhost:11434", isDefault: false,
    }
  );
  assert.throws(
    () => normalizeLlmModelInput({ name: "Unsafe", provider: "ollama", model: "x", baseUrl: "https://example.com" }),
    /http|localhost/
  );
} finally {
  db.prepare("DELETE FROM llm_models WHERE user_id IN (?, ?)").run(userId, legacyUserId);
  db.prepare("DELETE FROM settings WHERE user_id IN (?, ?)").run(userId, legacyUserId);
  db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userId, legacyUserId);
}

console.log("LLM model configuration integration test passed");
