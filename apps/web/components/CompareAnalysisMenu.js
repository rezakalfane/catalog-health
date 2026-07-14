"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ActionIcon from "@/components/ActionIcon";
import GradeLozenge from "@/components/GradeLozenge";
import SemanticBadge from "@/components/SemanticBadge";
import { formatDuration } from "@/lib/format";

export default function CompareAnalysisMenu({ analysisId, analyses }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (analyses.length === 0) return null;

  return (
    <div className="compare-menu" ref={menuRef}>
      <button
        type="button"
        className="btn secondary compare-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ActionIcon name="compare" />
        Compare to previous
        <ActionIcon name="chevronDown" />
      </button>
      {open && (
        <div className="compare-menu-popover" role="menu" aria-label="Choose an analysis to compare">
          {analyses.map((candidate) => (
            <Link
              key={candidate.id}
              className="compare-menu-item"
              role="menuitem"
              href={`/analyses/compare?base=${candidate.id}&target=${analysisId}`}
              onClick={() => setOpen(false)}
            >
              <span className="compare-menu-date">
                {new Date(candidate.createdAt).toLocaleString()}
                <SemanticBadge analysis={candidate} />
              </span>
              <span className="compare-menu-details">
                <span>{candidate.summary.productCount} products</span>
                <span>{candidate.summary.overall} / 100</span>
                <GradeLozenge grade={candidate.summary.grade} small />
                <span>{formatDuration(candidate.durationMs)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
