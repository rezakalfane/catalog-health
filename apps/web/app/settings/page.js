"use client";

import { useEffect, useState } from "react";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local, free)" },
];

const ENV_VARS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };

export default function SettingsPage() {
  const [llm, setLlm] = useState(null); // redacted settings from the server
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { kind: "ok"|"error", text }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ llm }) => {
        setLlm(llm);
        setProvider(llm.provider || "anthropic");
        setBaseUrl(llm.baseUrl || "");
        setModel(llm.model || "");
        if (llm.model) setModels([llm.model]);
      });
  }, []);

  async function testConnection() {
    setTesting(true);
    setStatus(null);
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setStatus({ kind: "error", text: body.error || "Connection failed" });
      return;
    }
    setModels(body.models);
    if (!body.models.includes(model)) setModel(body.models[0]);
    setStatus({ kind: "ok", text: `Connected — ${body.models.length} models available` });
  }

  async function saveSettings() {
    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm: { provider, model, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setStatus({ kind: "error", text: "Could not save settings" });
      return;
    }
    setLlm(body.llm);
    setApiKey("");
    setStatus({
      kind: "ok",
      text: body.llm.configured
        ? "Saved — semantic scoring is available on new analyses"
        : "Saved, but not fully configured yet",
    });
  }

  if (!llm) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="card">
        <h2>Semantic scoring (LLM judge)</h2>
        <p className="muted">
          An LLM judges whether each product description answers: what is it,
          who&apos;s it for, what&apos;s it made of. Pick a provider, connect it, and
          choose a model. Only product names and descriptions are sent — with
          Ollama, nothing leaves this machine.
        </p>

        <label htmlFor="llm-provider">Provider</label>
        <select
          id="llm-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModels([]);
            setModel("");
            setStatus(null);
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {provider !== "ollama" ? (
          <>
            <label htmlFor="llm-key">API key</label>
            <input
              id="llm-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === llm.provider && llm.hasKey
                  ? llm.keyFromEnv
                    ? `Using ${ENV_VARS[provider]} from the environment`
                    : "•••••••• (saved — leave blank to keep)"
                  : provider === "openai"
                    ? "sk-…"
                    : "sk-ant-…"
              }
            />
          </>
        ) : (
          <>
            <label htmlFor="llm-base">Ollama URL</label>
            <input
              id="llm-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <p className="muted">
              Free, runs locally. Install from ollama.com, then e.g.{" "}
              <code>ollama pull llama3.1</code>.
            </p>
          </>
        )}

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.85rem" }}>
          <button className="secondary" onClick={testConnection} disabled={testing}>
            {testing ? "Connecting…" : "Connect & list models"}
          </button>
        </div>

        <label htmlFor="llm-model">Model</label>
        <select
          id="llm-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!models.length}
        >
          {!models.length && <option value="">Connect to list models…</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button onClick={saveSettings} disabled={saving || !model}>
          {saving ? "Saving…" : "Save settings"}
        </button>

        {status && (
          <p className={status.kind === "error" ? "error" : "muted"} style={{ marginTop: "0.6rem" }}>
            {status.text}
          </p>
        )}
      </div>
    </>
  );
}
