import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEnvironment,
  listCompletedAnalyses,
  findRunningAnalysis,
  redactEnvironment,
} from "@/lib/db";
import { reconcileInterruptedAnalyses } from "@/lib/analysis-runner";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import Sparkline from "@/components/Sparkline";
import RunAnalysisAction from "@/components/RunAnalysisAction";
import AnalysisLiveReport from "@/components/AnalysisLiveReport";
import InfoPopover from "@/components/InfoPopover";
import { sectionInfo } from "@/components/section-info";

export const dynamic = "force-dynamic";

export default async function EnvironmentDetail({ params }) {
  const { id } = await params;
  const env = redactEnvironment(getEnvironment(id));
  if (!env) notFound();

  reconcileInterruptedAnalyses();
  const runningAnalysis = findRunningAnalysis(id);
  const analyses = listCompletedAnalyses(id); // newest first
  const latest = analyses[0];
  const history = [...analyses]
    .reverse()
    .map((a) => ({ createdAt: a.createdAt, overall: a.summary.overall }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{env.name}</h1>
          <p className="muted">Store hash: {env.storeHash}</p>
        </div>
        <RunAnalysisAction environmentId={env.id} />
      </div>

      {runningAnalysis ? (
        // A run is in progress: show it live (skeletons filling in) instead
        // of the stale latest report. RunAnalysisAction refreshes the page
        // when the run finishes.
        <AnalysisLiveReport analysisId={runningAnalysis.id} />
      ) : !latest ? (
        <div className="card">
          <h2>No analyses yet</h2>
          <p className="muted">
            Run the first analysis to see this store&apos;s catalog health.
          </p>
        </div>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <h2>
                Latest health
                <InfoPopover title="Latest health">{sectionInfo.latestHealth}</InfoPopover>
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <GradeLozenge grade={latest.summary.grade} />
                <div>
                  <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-display)" }}>
                    {latest.summary.overall} / 100
                  </div>
                  <div className="muted">
                    {latest.summary.productCount} products ·{" "}
                    {new Date(latest.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <h2>
                Score history
                <InfoPopover title="Score history">{sectionInfo.scoreHistory}</InfoPopover>
              </h2>
              <Sparkline points={history} width={280} height={64} />
              <p className="muted">{analyses.length} analysis run{analyses.length === 1 ? "" : "s"}</p>
            </div>
            <div className="card">
              <h2>
                Dimensions
                <InfoPopover title="Dimensions">{sectionInfo.dimensions}</InfoPopover>
              </h2>
              <DimensionBars averages={latest.summary.dimensionAverages} />
            </div>
          </div>

          <div className="card">
            <h2>
              Most common issues
              <InfoPopover title="Most common issues">{sectionInfo.commonIssues}</InfoPopover>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Products affected</th>
                </tr>
              </thead>
              <tbody>
                {latest.summary.issueFrequency.slice(0, 10).map(({ issue, count }) => (
                  <tr key={issue}>
                    <td>{issue.replaceAll("_", " ")}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>
              Weakest categories
              <InfoPopover title="Weakest categories">{sectionInfo.weakestCategories}</InfoPopover>
            </h2>
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
                {latest.summary.categoryRollup.slice(0, 8).map((c) => (
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
          </div>

          <div className="card">
            <h2>
              Top fixes (traffic &amp; sales weighted)
              <InfoPopover title="Top fixes">{sectionInfo.topFixes}</InfoPopover>
            </h2>
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
                {latest.summary.topFixes.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td>
                      {latest.rows?.length ? (
                        <Link href={`/analyses/${latest.id}/products/${r.id}`}>{r.name}</Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td>{r.sku}</td>
                    <td>{r.overall}</td>
                    <td>
                      <GradeLozenge grade={r.grade} small />
                    </td>
                    <td>{r.impact}</td>
                    <td className="muted">{r.issues.slice(0, 3).join(", ")}{r.issues.length > 3 ? "…" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {latest.rows?.length > 0 && (
              <p style={{ marginBottom: 0 }}>
                <Link href={`/analyses/${latest.id}/products`}>
                  Browse all {latest.summary.productCount} products with filters →
                </Link>
              </p>
            )}
          </div>

        </>
      )}

      {(analyses.length > 0 || runningAnalysis) && (
        <div className="card">
          <h2>
            Analysis history
            <InfoPopover title="Analysis history">{sectionInfo.analysisHistory}</InfoPopover>
          </h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Products</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {runningAnalysis && (
                <tr key={runningAnalysis.id}>
                  <td>
                    <Link href={`/analyses/${runningAnalysis.id}`}>
                      {new Date(runningAnalysis.createdAt).toLocaleString()}
                    </Link>{" "}
                    <span className="muted">· in progress</span>
                  </td>
                  <td className="muted">—</td>
                  <td className="muted">—</td>
                  <td className="muted">—</td>
                </tr>
              )}
              {analyses.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/analyses/${a.id}`}>
                      {new Date(a.createdAt).toLocaleString()}
                    </Link>
                  </td>
                  <td>{a.summary.productCount}</td>
                  <td>{a.summary.overall}</td>
                  <td>
                    <GradeLozenge grade={a.summary.grade} small />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
