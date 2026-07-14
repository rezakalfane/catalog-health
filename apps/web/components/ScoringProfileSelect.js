"use client";

import {
  getScoringProfile,
  SCORING_PROFILES,
} from "@catalog-health/core/profiles";

export default function ScoringProfileSelect({ value, onChange }) {
  const selected = getScoringProfile(value);

  return (
    <div className="profile-select-field">
      <label htmlFor="env-scoring-profile">Scoring profile</label>
      <select
        id="env-scoring-profile"
        value={selected.id}
        onChange={(event) => onChange(event.target.value)}
      >
        {SCORING_PROFILES.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
      <p className="profile-select-description">{selected.description}</p>
    </div>
  );
}
