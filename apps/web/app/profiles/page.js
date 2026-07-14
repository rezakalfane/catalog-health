"use client";

import { useEffect, useState } from "react";
import { getScoringProfile } from "@catalog-health/core/profiles";
import {
  deleteScoringProfile,
  listScoringProfiles,
  saveScoringProfile,
} from "@/lib/api-client";

const DIMENSIONS = [
  ["content", "Content"],
  ["structure", "Structure"],
  ["taxonomy", "Taxonomy"],
  ["hygiene", "Commerce hygiene"],
  ["feed", "Feed readiness"],
];

const THRESHOLDS = [
  ["minDescriptionChars", "Minimum description length"],
  ["goodDescriptionChars", "Good description length"],
  ["minImages", "Minimum images"],
  ["maxSaneCategories", "Maximum categories per channel tree"],
  ["titleMin", "Minimum title length"],
  ["titleMax", "Maximum title length"],
];

function formFromProfile(profile) {
  const source = profile || getScoringProfile();
  return {
    label: profile?.label || "",
    description: profile?.description || "",
    dimensionWeights: Object.fromEntries(
      DIMENSIONS.map(([key]) => [key, Number((source.dimensionWeights[key] * 100).toFixed(2))])
    ),
    semanticWeight: Number((source.semanticWeight * 100).toFixed(2)),
    thresholds: { ...source.thresholds },
  };
}

function payloadFromForm(form) {
  return {
    label: form.label,
    description: form.description,
    dimensionWeights: Object.fromEntries(
      DIMENSIONS.map(([key]) => [key, Number(form.dimensionWeights[key]) / 100])
    ),
    semanticWeight: Number(form.semanticWeight) / 100,
    thresholds: Object.fromEntries(
      THRESHOLDS.map(([key]) => [key, Number(form.thresholds[key])])
    ),
  };
}

function ProfileEditor({ profile, form, setForm, busy, error, onSubmit, onCopy, onCancel }) {
  const readOnly = Boolean(profile?.builtIn);
  const total = Object.values(form.dimensionWeights).reduce((sum, value) => sum + Number(value || 0), 0);
  const validTotal = Math.abs(total - 100) < 0.001;
  const updateWeight = (key, value) => setForm({
    ...form,
    dimensionWeights: { ...form.dimensionWeights, [key]: value },
  });
  const updateThreshold = (key, value) => setForm({
    ...form,
    thresholds: { ...form.thresholds, [key]: value },
  });

  return (
    <section className="card profile-editor">
      <div className="section-action-head">
        <div>
          <h2>{readOnly ? `${profile.label} profile` : profile ? "Edit custom profile" : "Add custom profile"}</h2>
          <p className="muted">
            {readOnly
              ? "Built-in profiles can be inspected but their scoring values cannot be changed."
              : "Weights affect the five heuristic dimensions. Semantic weight applies when semantic scoring is enabled."}
          </p>
        </div>
        {profile && <span className={readOnly ? "profile-kind-badge" : "profile-kind-badge custom"}>{readOnly ? "Built-in · read only" : `Custom · v${profile.version}`}</span>}
      </div>
      <form onSubmit={onSubmit}>
        <div className="profile-editor-grid">
          <div>
            <label htmlFor="profile-name">Profile name</label>
            <input id="profile-name" value={form.label} disabled={readOnly} maxLength={80} required onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </div>
          <div className="profile-description-field">
            <label htmlFor="profile-description">Description</label>
            <textarea id="profile-description" value={form.description} disabled={readOnly} maxLength={400} rows={3} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
        </div>

        <fieldset disabled={readOnly}>
          <legend>Dimension weights</legend>
          <div className="profile-value-grid">
            {DIMENSIONS.map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`weight-${key}`}>{label} (%)</label>
                <input id={`weight-${key}`} type="number" min="0" max="100" step="0.1" value={form.dimensionWeights[key]} onChange={(event) => updateWeight(key, event.target.value)} required />
              </div>
            ))}
          </div>
          <p className={validTotal ? "profile-total valid" : "profile-total invalid"}>Dimension total: {Number(total.toFixed(2))}% {validTotal ? "✓" : "— must equal 100%"}</p>
        </fieldset>

        <fieldset disabled={readOnly}>
          <legend>Semantic scoring</legend>
          <div className="profile-value-grid">
            <div>
              <label htmlFor="semantic-weight">Semantic weight (%)</label>
              <input id="semantic-weight" type="number" min="0" max="100" step="0.1" value={form.semanticWeight} onChange={(event) => setForm({ ...form, semanticWeight: event.target.value })} required />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={readOnly}>
          <legend>Scoring thresholds</legend>
          <div className="profile-value-grid">
            {THRESHOLDS.map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`threshold-${key}`}>{label}</label>
                <input id={`threshold-${key}`} type="number" min="0" step="1" value={form.thresholds[key]} onChange={(event) => updateThreshold(key, event.target.value)} required />
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {!readOnly && <button type="submit" disabled={busy || !validTotal}>{busy ? "Saving…" : profile ? "Save changes" : "Add profile"}</button>}
          {profile && <button type="button" className="secondary" disabled={busy} onClick={onCopy}>Copy profile</button>}
          <button type="button" className="secondary" onClick={onCancel}>{readOnly ? "Close" : "Cancel"}</button>
        </div>
      </form>
    </section>
  );
}

function ProfileTable({ profiles, empty, onEdit, onRemove }) {
  if (!profiles.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Name</th><th>Description</th><th>Version</th><th>Environments</th><th>Actions</th></tr></thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id}>
              <td><strong>{profile.label}</strong><div className="muted profile-id">{profile.id}</div></td>
              <td>{profile.description}</td>
              <td>{profile.version}</td>
              <td>{profile.environmentCount}</td>
              <td className="profile-table-actions">
                <button type="button" className="secondary" onClick={() => onEdit(profile)}>{profile.builtIn ? "View / edit" : "Edit"}</button>
                {!profile.builtIn && <button type="button" className="danger" onClick={() => onRemove(profile)}>Remove</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(() => formFromProfile());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const data = await listScoringProfiles();
    setProfiles(data.profiles || []);
  }

  useEffect(() => { refresh().catch(() => setProfiles([])); }, []);

  function startCreate() {
    setEditing(null);
    setForm(formFromProfile());
    setError("");
  }

  function startEdit(profile) {
    setEditing(profile);
    setForm(formFromProfile(profile));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyProfile(profile) {
    const suffix = " copy";
    setEditing(null);
    setForm({
      ...formFromProfile(profile),
      label: `${profile.label.slice(0, 80 - suffix.length)}${suffix}`,
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveScoringProfile(editing?.id, payloadFromForm(form));
      await refresh();
      setEditing(undefined);
    } catch (requestError) {
      setError(requestError.body?.error || "Could not save the scoring profile");
    } finally {
      setBusy(false);
    }
  }

  async function remove(profile) {
    const usage = profile.environmentCount
      ? ` ${profile.environmentCount} environment${profile.environmentCount === 1 ? "" : "s"} will be reassigned to Balanced.`
      : "";
    if (!confirm(`Remove “${profile.label}”?${usage} Existing analyses will keep their saved profile snapshot.`)) return;
    setError("");
    try {
      await deleteScoringProfile(profile.id);
      await refresh();
      if (editing?.id === profile.id) setEditing(undefined);
    } catch (requestError) {
      setError(requestError.body?.error || "Could not remove the scoring profile");
    }
  }

  if (profiles == null) return <p className="muted">Loading profiles…</p>;
  const builtIn = profiles.filter((profile) => profile.builtIn);
  const custom = profiles.filter((profile) => !profile.builtIn);

  return (
    <>
      <div className="page-head">
        <div><h1>Profiles</h1><p className="muted">Control scoring priorities and thresholds for environments, analyses, and recalculations.</p></div>
        <button type="button" onClick={startCreate}>Add custom profile</button>
      </div>

      {error && editing === undefined && <p className="error">{error}</p>}

      {editing !== undefined && (
        <ProfileEditor
          profile={editing}
          form={form}
          setForm={setForm}
          busy={busy}
          error={error}
          onSubmit={submit}
          onCopy={editing ? () => copyProfile(editing) : undefined}
          onCancel={() => { setEditing(undefined); setError(""); }}
        />
      )}

      <section className="card">
        <h2>Built-in profiles</h2>
        <p className="muted">The four Catalog Health profiles are always available. Open one to inspect its protected values.</p>
        <ProfileTable profiles={builtIn} onEdit={startEdit} onRemove={remove} />
      </section>

      <section className="card">
        <h2>Custom profiles</h2>
        <p className="muted">Custom profiles are private to your account and can be used anywhere a scoring profile is selected.</p>
        <ProfileTable profiles={custom} empty="No custom profiles yet." onEdit={startEdit} onRemove={remove} />
      </section>
    </>
  );
}
