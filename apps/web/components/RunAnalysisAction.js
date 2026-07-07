"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * "Run new analysis" button that turns into a live progress bar (linking to
 * the analysis page) whenever a run is in progress for this environment.
 */
export default function RunAnalysisAction({ environmentId }) {
  const router = useRouter();
  const [run, setRun] = useState(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    let timer;
    let cancelled = false;
    async function poll() {
      let current = null;
      try {
        const res = await fetch(
          `/api/analyses?environmentId=${environmentId}&status=running`
        );
        if (res.ok) current = (await res.json())[0] || null;
      } catch {
        // transient network error — keep polling
      }
      if (cancelled) return;
      // Run just finished: refresh the server-rendered page data behind us.
      if (wasRunning.current && !current) router.refresh();
      wasRunning.current = Boolean(current);
      setRun(current);
      timer = setTimeout(poll, current ? 1500 : 5000);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [environmentId, router]);

  if (run) {
    const percent = run.progress?.percent ?? 0;
    return (
      <Link
        href={`/analyses/${run.id}`}
        className="progress progress-link"
        title="View analysis in progress"
      >
        <div className="progress-top">
          <span>{run.progress?.label || "Analysis running…"}</span>
          <span>{percent}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </Link>
    );
  }

  return (
    <Link className="btn" href={`/analyses/new?env=${environmentId}`}>
      Run new analysis
    </Link>
  );
}
