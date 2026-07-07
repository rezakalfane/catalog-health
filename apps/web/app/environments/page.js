"use client";

import { useEffect, useState } from "react";

const EMPTY = { name: "", storeHash: "", accessToken: "" };

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/environments");
    setEnvironments(await res.json());
  }
  useEffect(() => {
    refresh();
  }, []);

  function startEdit(env) {
    setEditingId(env.id);
    setForm({ name: env.name, storeHash: env.storeHash, accessToken: "" });
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const url = editingId ? `/api/environments/${editingId}` : "/api/environments";
    const res = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
      return;
    }
    cancelEdit();
    refresh();
  }

  async function remove(env) {
    if (!confirm(`Remove "${env.name}" and its analysis history?`)) return;
    await fetch(`/api/environments/${env.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <h1>Environments</h1>
      </div>

      <div className="card">
        <h2>{editingId ? "Edit environment" : "Add environment"}</h2>
        <form onSubmit={submit}>
          <label htmlFor="env-name">Name</label>
          <input
            id="env-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Outdoor — production"
            required
          />
          <label htmlFor="env-hash">Store hash</label>
          <input
            id="env-hash"
            value={form.storeHash}
            onChange={(e) => setForm({ ...form, storeHash: e.target.value })}
            placeholder="abc123xyz"
            required
          />
          <label htmlFor="env-token">
            Access token {editingId && "(leave blank to keep current token)"}
          </label>
          <input
            id="env-token"
            type="password"
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            placeholder="Products: read-only scope is enough"
            required={!editingId}
          />
          {error && <p className="error">{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" disabled={busy}>
              {editingId ? "Save changes" : "Add environment"}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Configured stores</h2>
        {environments.length === 0 ? (
          <p className="muted">
            No environments yet. Add a store above to start analyzing its catalog.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Store hash</th>
                <th>Token</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env) => (
                <tr key={env.id}>
                  <td>
                    <a href={`/environments/${env.id}`}>{env.name}</a>
                  </td>
                  <td>{env.storeHash}</td>
                  <td>{env.hasToken ? "set" : "missing"}</td>
                  <td>{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="secondary" onClick={() => startEdit(env)}>
                      Edit
                    </button>{" "}
                    <button className="danger" onClick={() => remove(env)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
