"use client";

import { useEffect, useState } from "react";
import { listEnvironments, listScoringProfiles, saveEnvironment, deleteEnvironment } from "@/lib/api-client";
import { DEFAULT_SCORING_PROFILE_ID } from "@catalog-health/core/profiles";
import ActionIcon from "@/components/ActionIcon";
import ScoringProfileSelect from "@/components/ScoringProfileSelect";
import ScoringProfileSubtitle from "@/components/ScoringProfileSubtitle";

const EMPTY = {
  name: "",
  storeHash: "",
  accessToken: "",
  scoringProfileId: DEFAULT_SCORING_PROFILE_ID,
};

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setEnvironments(await listEnvironments());
  }
  useEffect(() => {
    Promise.all([listEnvironments(), listScoringProfiles()]).then(([envs, data]) => {
      setEnvironments(envs);
      setProfiles(data.profiles || []);
    });
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  }

  function startEdit(env) {
    setEditingId(env.id);
    setForm({
      name: env.name,
      storeHash: env.storeHash,
      accessToken: "",
      scoringProfileId: env.scoringProfileId || DEFAULT_SCORING_PROFILE_ID,
    });
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
    setShowForm(false);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveEnvironment(editingId, form);
    } catch (err) {
      setBusy(false);
      setError(err.body?.error || "Save failed");
      return;
    }
    setBusy(false);
    closeForm();
    refresh();
  }

  async function remove(env) {
    if (!confirm(`Remove "${env.name}" and its analysis history?`)) return;
    await deleteEnvironment(env.id).catch(() => {});
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Environments</h1>
          <p className="muted">Connect BigCommerce stores, assign scoring profiles, and manage catalog analysis sources.</p>
        </div>
        <button type="button" onClick={startCreate}>
          Add environment
        </button>
      </div>

      {showForm && (
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
            <ScoringProfileSelect
              value={form.scoringProfileId}
              onChange={(scoringProfileId) => setForm({ ...form, scoringProfileId })}
              profiles={profiles}
            />
            {error && <p className="error">{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" disabled={busy}>
                {editingId ? "Save changes" : "Add environment"}
              </button>
              <button type="button" className="secondary" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Configured stores</h2>
        {environments.length === 0 ? (
          <p className="muted">
            No environments yet. Add a store to start analyzing its catalog.
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
                    <ScoringProfileSubtitle profileId={env.scoringProfileId} profile={env.scoringProfile} />
                  </td>
                  <td>{env.storeHash}</td>
                  <td>{env.hasToken ? "set" : "missing"}</td>
                  <td>{new Date(env.createdAt).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="settings-edit-button"
                      onClick={() => startEdit(env)}
                      aria-label={`Edit environment ${env.name}`}
                      title="Edit environment"
                    >
                      <ActionIcon name="edit" />
                    </button>{" "}
                    <button
                      type="button"
                      className="delete-analysis-button icon-only"
                      onClick={() => remove(env)}
                      aria-label={`Delete environment ${env.name}`}
                      title="Delete environment"
                    >
                      <ActionIcon name="trash" />
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
