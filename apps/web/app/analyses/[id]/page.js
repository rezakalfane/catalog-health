"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AnalysisLiveReport from "@/components/AnalysisLiveReport";

export default function AnalysisPage() {
  const { id } = useParams();
  // Fed by AnalysisLiveReport's polling — this page only renders the header.
  const [analysis, setAnalysis] = useState(null);
  const [envName, setEnvName] = useState("");
  const [cancellingSemantic, setCancellingSemantic] = useState(false);

  async function cancelSemantic() {
    setCancellingSemantic(true);
    // The runner aborts between judge chunks; the next polls show the jump
    // to the summarize stage and the "cancelled" note on the report.
    await fetch(`/api/analyses/${id}/skip-semantic`, { method: "POST" }).catch(() => {});
  }

  const environmentId = analysis?.environmentId;
  useEffect(() => {
    if (!environmentId) return;
    if (environmentId === "demo") {
      setEnvName("Demo catalog");
      return;
    }
    fetch(`/api/environments/${environmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((env) => env && setEnvName(env.name));
  }, [environmentId]);

  const status = analysis ? analysis.status || "done" : "loading";
  const progress = analysis?.progress;
  const isDemo = environmentId === "demo";
  const envHref = isDemo ? "/" : `/environments/${environmentId}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{status === "running" ? "Analysis in progress" : "Analysis"}</h1>
          <p className="muted">
            {envName || "…"}
            {analysis && <> · started {new Date(analysis.createdAt).toLocaleString()}</>}
          </p>
        </div>
        {status === "running" && progress && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progress.label}
          >
            <div className="progress-top">
              <span>{progress.label}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            {progress.detail && <div className="progress-detail">{progress.detail}</div>}
            {progress.stage === "semantic" && (
              <button
                type="button"
                className="link-btn"
                onClick={cancelSemantic}
                disabled={cancellingSemantic}
              >
                {cancellingSemantic
                  ? "Cancelling semantic scoring…"
                  : "Cancel semantic scoring (keep the rest)"}
              </button>
            )}
          </div>
        )}
        {status === "done" && analysis && (
          <Link className="btn" href={envHref}>
            {isDemo ? "Back to dashboard" : "View environment"}
          </Link>
        )}
      </div>

      <AnalysisLiveReport analysisId={id} onAnalysis={setAnalysis} />
    </>
  );
}
