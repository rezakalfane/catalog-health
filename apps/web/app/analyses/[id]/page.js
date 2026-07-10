"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AnalysisLiveReport from "@/components/AnalysisLiveReport";
import { formatDuration } from "@/lib/format";
import { getEnvironment, listAnalyses, skipSemantic } from "@/lib/api-client";
import SemanticBadge from "@/components/SemanticBadge";
import ActionIcon from "@/components/ActionIcon";

export default function AnalysisPage() {
  const { id } = useParams();
  // Fed by AnalysisLiveReport's polling — this page only renders the header.
  const [analysis, setAnalysis] = useState(null);
  const [envName, setEnvName] = useState("");
  const [previousAnalysisId, setPreviousAnalysisId] = useState(null);
  const [cancellingSemantic, setCancellingSemantic] = useState(false);

  async function cancelSemantic() {
    setCancellingSemantic(true);
    // The runner aborts between judge chunks; the next polls show the jump
    // to the summarize stage and the "cancelled" note on the report.
    await skipSemantic(id).catch(() => {});
  }

  const environmentId = analysis?.environmentId;
  const status = analysis ? analysis.status || "done" : "loading";
  const progress = analysis?.progress;
  const isDemo = environmentId === "demo";
  const envHref = isDemo ? "/" : `/environments/${environmentId}`;

  useEffect(() => {
    if (!environmentId) return;
    if (environmentId === "demo") {
      setEnvName("Demo catalog");
      return;
    }
    getEnvironment(environmentId).then((env) => env && setEnvName(env.name));
  }, [environmentId]);

  useEffect(() => {
    if (!analysis || status !== "done") return;
    listAnalyses({ environmentId: analysis.environmentId, status: "done" })
      .then((analyses) => {
        const currentIndex = analyses.findIndex((a) => a.id === analysis.id);
        setPreviousAnalysisId(currentIndex >= 0 ? analyses[currentIndex + 1]?.id || null : null);
      })
      .catch(() => setPreviousAnalysisId(null));
  }, [analysis, status]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {status === "running" ? "Analysis in progress" : "Analysis"}
            {status === "done" && <SemanticBadge analysis={analysis} />}
          </h1>
          <p className="muted">
            {envName || "…"}
            {analysis && <> · started {new Date(analysis.createdAt).toLocaleString()}</>}
            {status === "done" && analysis?.durationMs != null && (
              <>
                {" "}
                · completed in {formatDuration(analysis.durationMs)}
                {analysis.semanticMs != null && (
                  <> (semantic {formatDuration(analysis.semanticMs)})</>
                )}
              </>
            )}
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
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {previousAnalysisId && (
              <Link
                className="btn secondary"
                href={`/analyses/compare?base=${previousAnalysisId}&target=${id}`}
              >
                <ActionIcon name="compare" />
                Compare with previous
              </Link>
            )}
            {analysis.hasRows && (
              <Link className="btn secondary" href={`/analyses/${id}/products`}>
                <ActionIcon name="table" />
                All products
              </Link>
            )}
            <Link className="btn" href={envHref}>
              <ActionIcon name={isDemo ? "arrowLeft" : "store"} />
              {isDemo ? "Back to dashboard" : "View environment"}
            </Link>
          </div>
        )}
      </div>

      <AnalysisLiveReport analysisId={id} onAnalysis={setAnalysis} />
    </>
  );
}
