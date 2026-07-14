"use client";

import {
  getScoringProfile,
  SCORING_PROFILES,
} from "@catalog-health/core/profiles";

export default function ScoringProfileSelect({ value, onChange, profiles = SCORING_PROFILES }) {
  const selected = profiles.find((profile) => profile.id === value) || getScoringProfile(value);
  const builtInProfiles = profiles.filter((profile) => profile.builtIn !== false);
  const customProfiles = profiles.filter((profile) => profile.builtIn === false);

  return (
    <div className="profile-select-field">
      <label htmlFor="env-scoring-profile">Scoring profile</label>
      <select
        id="env-scoring-profile"
        value={selected.id}
        onChange={(event) => onChange(event.target.value)}
      >
        <optgroup label="Built-in profiles">
          {builtInProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
        </optgroup>
        {customProfiles.length > 0 && (
          <optgroup label="Custom profiles">
            {customProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="profile-select-description">{selected.description}</p>
    </div>
  );
}
