"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listScoringProfiles, recalculateAnalysis } from "@/lib/api-client";
import ActionIcon from "@/components/ActionIcon";

export default function RecalculateProfileMenu({ analysisId, currentProfileId, currentProfileVersion }) {
  const router = useRouter();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [pendingProfileId, setPendingProfileId] = useState("");
  const [error, setError] = useState("");
  const profiles = availableProfiles.filter(
    (profile) => profile.id !== currentProfileId || profile.version !== currentProfileVersion
  );

  useEffect(() => {
    listScoringProfiles()
      .then((data) => setAvailableProfiles(data.profiles || []))
      .catch(() => setAvailableProfiles([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function chooseProfile(profileId) {
    setPendingProfileId(profileId);
    setError("");
    try {
      const analysis = await recalculateAnalysis(analysisId, profileId);
      router.push(`/analyses/${analysis.id}`);
    } catch (requestError) {
      setPendingProfileId("");
      setError(requestError.body?.error || "Could not recalculate this analysis");
    }
  }

  if (!profiles.length) return null;

  return (
    <div className="compare-menu" ref={menuRef}>
      <button
        type="button"
        className="btn secondary compare-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={Boolean(pendingProfileId)}
        onClick={() => setOpen((value) => !value)}
      >
        <ActionIcon name="refresh" />
        {pendingProfileId ? "Recalculating…" : "Recalculate"}
        <ActionIcon name="chevronDown" />
      </button>
      {open && (
        <div className="compare-menu-popover" role="menu" aria-label="Choose a scoring profile">
          <p className="recalculate-menu-note">
            Uses this analysis&apos;s stored catalog facts and semantic verdicts. No store or model calls.
          </p>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="compare-menu-item recalculate-menu-item"
              role="menuitem"
              disabled={Boolean(pendingProfileId)}
              onClick={() => chooseProfile(profile.id)}
            >
              <span className="compare-menu-date">{profile.label}</span>
              <span className="compare-menu-details">
                {profile.description} · v{profile.version} · {profile.builtIn ? "built-in" : "custom"}
              </span>
            </button>
          ))}
          {error && <p className="error recalculate-menu-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
