"use client";

import { useEffect, useState } from "react";
import {
  deleteLlmModel,
  getSettings,
  saveLlmModel,
  setDefaultLlmModel,
  testSettingsConnection,
} from "@/lib/api-client";
import ActionIcon from "@/components/ActionIcon";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local, free)" },
];
const PROVIDER_LABEL = Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider.label]));
const ENV_VARS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };
const EMPTY = {
  name: "",
  provider: "anthropic",
  apiKey: "",
  baseUrl: "",
  model: "",
  isDefault: false,
};

export default function SettingsPage() {
  const [models, setModels] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [availableModels, setAvailableModels] = useState([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSettings()
      .then((data) => setModels(data.models || []))
      .catch(() => setStatus({ kind: "error", text: "Could not load model configurations." }));
  }, []);

  function applyResponse(data) {
    setModels(data.models || []);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
    setAvailableModels([]);
    setStatus(null);
    setShowForm(false);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setAvailableModels([]);
    setStatus(null);
    setShowForm(true);
  }

  function startEdit(configuration) {
    setEditingId(configuration.id);
    setForm({
      name: configuration.name,
      provider: configuration.provider,
      apiKey: "",
      baseUrl: configuration.baseUrl || "",
      model: configuration.model,
      isDefault: configuration.isDefault,
    });
    setAvailableModels([configuration.model]);
    setStatus(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function testConnection() {
    setTesting(true);
    setStatus(null);
    try {
      const body = await testSettingsConnection({ id: editingId, ...form });
      setAvailableModels(body.models);
      setForm((current) => ({
        ...current,
        model: body.models.includes(current.model) ? current.model : body.models[0],
      }));
      setStatus({ kind: "ok", text: `Connected — ${body.models.length} models available` });
    } catch (error) {
      setStatus({ kind: "error", text: error.body?.error || "Connection failed" });
    } finally {
      setTesting(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const body = await saveLlmModel(editingId, form);
      applyResponse(body);
      resetForm();
    } catch (error) {
      setStatus({ kind: "error", text: error.body?.error || "Could not save the model configuration." });
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(configuration) {
    try {
      applyResponse(await setDefaultLlmModel(configuration.id));
    } catch (error) {
      setStatus({ kind: "error", text: error.body?.error || "Could not change the default model." });
    }
  }

  async function remove(configuration) {
    if (!confirm(`Remove model configuration "${configuration.name}"? Historical analyses will keep the model name they used.`)) return;
    try {
      applyResponse(await deleteLlmModel(configuration.id));
      if (editingId === configuration.id) resetForm();
    } catch (error) {
      setStatus({ kind: "error", text: error.body?.error || "Could not remove the model configuration." });
    }
  }

  if (models == null) return <p className="muted">Loading…</p>;

  const editing = models.find((configuration) => configuration.id === editingId);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Models</h1>
          <p className="muted">Configure LLM providers for semantic scoring, product AI analysis, and generated recommendations.</p>
        </div>
        <button type="button" onClick={startCreate}>
          Add model
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2>{editingId ? "Edit model configuration" : "Add model configuration"}</h2>
          <p className="muted">
            Save multiple engines and models, then choose one per semantic analysis or product AI Analysis.
            The default is preselected whenever you start a new AI task.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="llm-name">Configuration name</label>
            <input
              id="llm-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Claude Sonnet — catalog review"
              maxLength={80}
              required
            />

            <label htmlFor="llm-provider">Provider</label>
            <select
              id="llm-provider"
              value={form.provider}
              onChange={(event) => {
                setForm({ ...form, provider: event.target.value, apiKey: "", baseUrl: "", model: "" });
                setAvailableModels([]);
                setStatus(null);
              }}
            >
              {PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
            </select>

            {form.provider !== "ollama" ? (
              <>
                <label htmlFor="llm-key">API key {editingId && "(leave blank to keep the saved key)"}</label>
                <input
                  id="llm-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={
                    editing?.provider === form.provider && editing.hasKey
                      ? editing.keyFromEnv
                        ? `Using ${ENV_VARS[form.provider]} from the environment`
                        : "•••••••• (saved — leave blank to keep)"
                      : form.provider === "openai" ? "sk-…" : "sk-ant-…"
                  }
                />
              </>
            ) : (
              <>
                <label htmlFor="llm-base">Ollama URL</label>
                <input
                  id="llm-base"
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder="http://localhost:11434"
                />
                <p className="muted">Free and local. Install a model in Ollama before connecting.</p>
              </>
            )}

            <button type="button" className="secondary" onClick={testConnection} disabled={testing}>
              {testing ? "Connecting…" : "Connect & list models"}
            </button>

            <label htmlFor="llm-model" style={{ marginTop: "0.85rem" }}>Model</label>
            <select
              id="llm-model"
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
              disabled={!availableModels.length}
              required
            >
              {!availableModels.length && <option value="">Connect to list models…</option>}
              {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>

            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                disabled={Boolean(editing?.isDefault)}
              />
              {editing?.isDefault
                ? "This is the default model; choose another default from the list below to change it"
                : "Use as the default model"}
            </label>

            {status && <p className={status.kind === "error" ? "error" : "muted"}>{status.text}</p>}
            <div className="form-actions">
              <button type="submit" disabled={saving || !form.model}>{saving ? "Saving…" : editingId ? "Save changes" : "Add model"}</button>
              <button type="button" className="secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Configured models</h2>
        {models.length === 0 ? (
          <p className="muted">No models configured yet. Add one to enable semantic and product AI analysis.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Provider</th><th>Model</th><th>Status</th><th>Default</th><th></th></tr></thead>
              <tbody>
                {models.map((configuration) => (
                  <tr key={configuration.id}>
                    <td><strong>{configuration.name}</strong></td>
                    <td>{PROVIDER_LABEL[configuration.provider]}</td>
                    <td><code>{configuration.model}</code></td>
                    <td>{configuration.configured ? "Ready" : configuration.provider === "ollama" ? "Model required" : "API key required"}</td>
                    <td>
                      {configuration.isDefault ? <span className="model-default-badge">Default</span> : (
                        <button
                          type="button"
                          className="secondary compact-button"
                          onClick={() => makeDefault(configuration)}
                          disabled={!configuration.configured}
                          title={configuration.configured ? undefined : "Complete this configuration before making it default"}
                        >
                          Set default
                        </button>
                      )}
                    </td>
                    <td className="model-actions">
                      <button
                        type="button"
                        className="settings-edit-button"
                        onClick={() => startEdit(configuration)}
                        aria-label={`Edit model ${configuration.name}`}
                        title="Edit model"
                      >
                        <ActionIcon name="edit" />
                      </button>
                      <button
                        type="button"
                        className="delete-analysis-button icon-only"
                        onClick={() => remove(configuration)}
                        aria-label={`Delete model ${configuration.name}`}
                        title="Delete model"
                      >
                        <ActionIcon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
