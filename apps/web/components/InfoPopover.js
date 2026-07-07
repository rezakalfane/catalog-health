"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small "i" icon next to a section title; clicking it opens a popover with
 * rich-text help (pass JSX as children). Closes on outside click or Escape.
 */
export default function InfoPopover({ title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="info" ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-label={`About “${title}”`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span className="info-pop" role="note" aria-label={`About ${title}`}>
          {children}
        </span>
      )}
    </span>
  );
}
