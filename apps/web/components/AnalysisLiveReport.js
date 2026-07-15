"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import InfoPopover from "@/components/InfoPopover";
import { sectionInfo } from "@/components/section-info";
import { getAnalysis } from "@/lib/api-client";
import TopFixesTable from "@/components/TopFixesTable";

function Skeleton({ width = "100%", height = "0.9rem", style }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

function SkeletonLines({ count = 4 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={`${100 - ((i * 17) % 40)}%`} />
      ))}
    </>
  );
}

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

function GradeDistributionChart({ distribution }) {
  const max = Math.max(1, ...GRADE_ORDER.map((grade) => distribution[grade] || 0));

  return (
    <div className="grade-distribution-chart" aria-label="Product grade distribution">
      {GRADE_ORDER.map((grade) => {
        const count = distribution[grade] || 0;
        const height = Math.max(4, Math.round((count / max) * 100));
        return (
          <div className="grade-distribution-column" key={grade}>
            <span className="grade-distribution-count">{count}</span>
            <div className="grade-distribution-bar-track" aria-hidden="true">
              <span
                className={`grade-distribution-bar ${grade}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className={`grade-distribution-label ${grade}`}>{grade}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Polls an analysis and renders its report sections, showing skeletons that
 * fill in as the run progresses. Used by the analysis page and embedded on
 * the environment page while a run is in progress. `onAnalysis` reports each
 * poll result up to the parent (e.g. for a header progress bar).
 */
export default function AnalysisLiveReport({ analysisId, onAnalysis }) {
  const [analysis, setAnalysis] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let timer;
    let cancelled = false;
    async function poll() {
      let a;
      try {
        a = await getAnalysis(analysisId);
      } catch {
        if (!cancelled) setMissing(true);
        return;
      }
      if (cancelled) return;
      setAnalysis(a);
      onAnalysis?.(a);
      if ((a.status || "done") === "running") timer = setTimeout(poll, 1000);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  if (missing) {
    return (
      <div className="card">
        <h2>Analysis not found</h2>
        <p className="muted">
          This analysis doesn&apos;t exist (anymore). <Link href="/analyses/new">Run a new one?</Link>
        </p>
      </div>
    );
  }

  const status = analysis ? analysis.status || "done" : "loading";
  const summary = analysis?.summary || {};
  const isDemo = analysis?.environmentId === "demo";

  if (status === "failed") {
    return (
      <div className="card">
        <h2>Analysis failed</h2>
        <p className="error">{analysis.error || "Unknown error"}</p>
        <Link
          className="btn"
          href={isDemo ? "/analyses/new" : `/analyses/new?env=${analysis.environmentId}`}
        >
          Try again
        </Link>
      </div>
    );
  }

  return (
    <>
      {analysis?.warning && (
        <div className="card" style={{ borderLeft: "4px solid var(--grade-c)" }}>
          <p className="muted" style={{ margin: 0 }}>
            ⚠ {analysis.warning}
          </p>
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h2>
            Health score
            <InfoPopover title="Health score">{sectionInfo.healthScore}</InfoPopover>
          </h2>
          {summary.overall !== undefined ? (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <GradeLozenge grade={summary.grade} />
              <div>
                <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-display)" }}>
                  {summary.overall} / 100
                </div>
                <div className="muted">{summary.productCount} products</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <Skeleton width="3rem" height="3rem" style={{ borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height="1.4rem" />
                <Skeleton width="40%" />
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            Grade distribution
            <InfoPopover title="Grade distribution">{sectionInfo.gradeDistribution}</InfoPopover>
          </h2>
          {summary.gradeDist ? (
            <GradeDistributionChart distribution={summary.gradeDist} />
          ) : (
            <SkeletonLines count={2} />
          )}
        </div>

        <div className="card">
          <h2>
            Dimensions
            <InfoPopover title="Dimensions">{sectionInfo.dimensions}</InfoPopover>
          </h2>
          {summary.dimensionAverages ? (
            <DimensionBars averages={summary.dimensionAverages} />
          ) : (
            <SkeletonLines count={5} />
          )}
        </div>
      </div>

      <div className="card">
        <h2>
          Most common issues
          <InfoPopover title="Most common issues">{sectionInfo.commonIssues}</InfoPopover>
        </h2>
        {summary.issueFrequency ? (
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Products affected</th>
              </tr>
            </thead>
            <tbody>
              {summary.issueFrequency.slice(0, 10).map(({ issue, count }) => (
                <tr key={issue}>
                  <td>{issue.replaceAll("_", " ")}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SkeletonLines count={6} />
        )}
      </div>

      <div className="card">
        <h2>
          Weakest categories
          <InfoPopover title="Weakest categories">{sectionInfo.weakestCategories}</InfoPopover>
        </h2>
        {summary.categoryRollup ? (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Products</th>
                <th>Avg score</th>
                <th>Grade</th>
                <th>% below C</th>
              </tr>
            </thead>
            <tbody>
              {summary.categoryRollup.slice(0, 8).map((c) => (
                <tr key={String(c.categoryId)}>
                  <td>{c.categoryName}</td>
                  <td>{c.products}</td>
                  <td>{c.avgScore}</td>
                  <td>
                    <GradeLozenge grade={c.grade} small />
                  </td>
                  <td>{c.pctFailing}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SkeletonLines count={5} />
        )}
      </div>

      <div className="card">
        {summary.topFixes ? (
          <TopFixesTable
            analysisId={analysisId}
            createdAt={analysis?.createdAt}
            initialRows={summary.topFixes}
            productCount={summary.productCount}
            hasRows={Boolean(analysis?.hasRows)}
            displayLimit={100}
          />
        ) : (
          <>
            <h2>
              Top fixes (traffic &amp; sales weighted)
              <InfoPopover title="Top fixes">{sectionInfo.topFixes}</InfoPopover>
            </h2>
            <SkeletonLines count={8} />
          </>
        )}
      </div>
    </>
  );
}
