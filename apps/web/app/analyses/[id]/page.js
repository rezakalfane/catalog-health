"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import InfoPopover from "@/components/InfoPopover";
import { sectionInfo } from "@/components/section-info";

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

export default function AnalysisPage() {
  const { id } = useParams();
  const [analysis, setAnalysis] = useState(null);
  const [missing, setMissing] = useState(false);
  const [envName, setEnvName] = useState("");

  // Poll the analysis while it runs; the run itself lives on the server,
  // so leaving this page and coming back just resumes polling.
  useEffect(() => {
    let timer;
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/analyses/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        setMissing(true);
        return;
      }
      const a = await res.json();
      setAnalysis(a);
      if ((a.status || "done") === "running") timer = setTimeout(poll, 1000);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

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
          </div>
        )}
        {status === "done" && analysis && (
          <Link className="btn" href={envHref}>
            {isDemo ? "Back to dashboard" : "View environment"}
          </Link>
        )}
      </div>

      {status === "failed" && (
        <div className="card">
          <h2>Analysis failed</h2>
          <p className="error">{analysis.error || "Unknown error"}</p>
          <Link className="btn" href={isDemo ? "/analyses/new" : `/analyses/new?env=${environmentId}`}>
            Try again
          </Link>
        </div>
      )}

      {status !== "failed" && (
        <>
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
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {Object.entries(summary.gradeDist).map(([g, count]) => (
                    <div key={g} style={{ textAlign: "center" }}>
                      <GradeLozenge grade={g} small />
                      <div className="muted" style={{ marginTop: "0.2rem" }}>{count}</div>
                    </div>
                  ))}
                </div>
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
            <h2>
              Top fixes (traffic &amp; sales weighted)
              <InfoPopover title="Top fixes">{sectionInfo.topFixes}</InfoPopover>
            </h2>
            {summary.topFixes ? (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Score</th>
                    <th>Grade</th>
                    <th>Impact</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topFixes.slice(0, 15).map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.sku}</td>
                      <td>{r.overall}</td>
                      <td>
                        <GradeLozenge grade={r.grade} small />
                      </td>
                      <td>{r.impact}</td>
                      <td className="muted">
                        {r.issues.slice(0, 3).join(", ")}
                        {r.issues.length > 3 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <SkeletonLines count={8} />
            )}
          </div>
        </>
      )}
    </>
  );
}
