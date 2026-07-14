"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AnalysisLiveReport from "@/components/AnalysisLiveReport";
import { formatDuration } from "@/lib/format";
import { getEnvironment, listAnalyses, skipSemantic } from "@/lib/api-client";
import SemanticBadge from "@/components/SemanticBadge";
import ActionIcon from "@/components/ActionIcon";
import CompareAnalysisMenu from "@/components/CompareAnalysisMenu";
import ScoringMetadataLine from "@/components/ScoringMetadataLine";
import ScoringMetadataPanel from "@/components/ScoringMetadataPanel";
import ScoringProfileSubtitle from "@/components/ScoringProfileSubtitle";
import RecalculateProfileMenu from "@/components/RecalculateProfileMenu";
import DeleteAnalysisButton from "@/components/DeleteAnalysisButton";
import { DEFAULT_SCORING_PROFILE_ID } from "@catalog-health/core/profiles";

export default function AnalysisPage() {
  const { id } = useParams();
  // Fed by AnalysisLiveReport's polling — this page only renders the header.
  const [analysis, setAnalysis] = useState(null);
  const [envName, setEnvName] = useState("");
  const [envProfileId, setEnvProfileId] = useState("");
  const [comparisonAnalyses, setComparisonAnalyses] = useState([]);
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
  const analysisProfileId = analysis?.scoringMetadata?.profile?.id || envProfileId;

  useEffect(() => {
    if (!environmentId) return;
    if (environmentId === "demo") {
      setEnvName("Demo catalog");
      setEnvProfileId(DEFAULT_SCORING_PROFILE_ID);
      return;
    }
    getEnvironment(environmentId).then((env) => {
      if (!env) return;
      setEnvName(env.name);
      setEnvProfileId(env.scoringProfileId || DEFAULT_SCORING_PROFILE_ID);
    });
  }, [environmentId]);

  useEffect(() => {
    if (!analysis || status !== "done") return;
    let ignore = false;

    listAnalyses({ environmentId: analysis.environmentId, status: "done" })
      .then((analyses) => {
        const currentIndex = analyses.findIndex((a) => a.id === analysis.id);
        if (!ignore) {
          setComparisonAnalyses(
            currentIndex >= 0 ? analyses.slice(currentIndex + 1, currentIndex + 11) : []
          );
        }
      })
      .catch(() => !ignore && setComparisonAnalyses([]));

    return () => {
      ignore = true;
    };
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
            <span>
              {envName || "…"}
              {analysis && <> · started {new Date(analysis.createdAt).toLocaleString()}</>}
            </span>
            {analysisProfileId && (
              <ScoringProfileSubtitle as="span" profileId={analysisProfileId} />
            )}
            {status === "done" && analysis?.durationMs != null && (
              <span className="analysis-meta-line">
                completed in {formatDuration(analysis.durationMs)}
                {analysis.semanticMs != null && (
                  <> (semantic {formatDuration(analysis.semanticMs)})</>
                )}
              </span>
            )}
            {status === "done" && (
              <ScoringMetadataLine metadata={analysis?.scoringMetadata} />
            )}
            {status === "done" && analysis?.sourceAnalysisId && (
              <span className="analysis-meta-line">
                Recalculated from the stored facts of the{" "}
                <Link href={`/analyses/${analysis.sourceAnalysisId}`}>source analysis</Link>.
              </span>
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
            <a className="btn secondary" href={`/api/analyses/${id}/pdf`}>
              <ActionIcon name="download" />
              Export as PDF
            </a>
            {analysis.hasScoringFacts && (
              <RecalculateProfileMenu
                analysisId={id}
                currentProfileId={
                  analysis.scoringMetadata?.profile?.id || DEFAULT_SCORING_PROFILE_ID
                }
              />
            )}
            {analysis.sourceAnalysisId && (
              <Link
                className="btn secondary"
                href={`/analyses/compare?base=${analysis.sourceAnalysisId}&target=${id}`}
              >
                <ActionIcon name="compare" />
                Compare with source
              </Link>
            )}
            <CompareAnalysisMenu analysisId={id} analyses={comparisonAnalyses} />
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
            <DeleteAnalysisButton analysisId={id} redirectHref={envHref} />
          </div>
        )}
      </div>

      <AnalysisLiveReport analysisId={id} onAnalysis={setAnalysis} />

      {status === "done" && analysis && (
        <ScoringMetadataPanel metadata={analysis.scoringMetadata} />
      )}
    </>
  );
}
