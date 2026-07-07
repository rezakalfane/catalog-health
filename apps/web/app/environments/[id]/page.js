import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvironment, listAnalyses, redactEnvironment } from "@/lib/db";
import GradeLozenge from "@/components/GradeLozenge";
import DimensionBars from "@/components/DimensionBars";
import Sparkline from "@/components/Sparkline";

export const dynamic = "force-dynamic";

export default async function EnvironmentDetail({ params }) {
  const { id } = await params;
  const env = redactEnvironment(getEnvironment(id));
  if (!env) notFound();

  const analyses = listAnalyses(id); // newest first
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
        <Link className="btn" href="/analyses/new">
          Run new analysis
        </Link>
      </div>

      {!latest ? (
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
              <h2>Latest health</h2>
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
              <h2>Score history</h2>
              <Sparkline points={history} width={280} height={64} />
              <p className="muted">{analyses.length} analysis run{analyses.length === 1 ? "" : "s"}</p>
            </div>
            <div className="card">
              <h2>Dimensions</h2>
              <DimensionBars averages={latest.summary.dimensionAverages} />
            </div>
          </div>

          <div className="card">
            <h2>Most common issues</h2>
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
            <h2>Weakest categories</h2>
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
            <h2>Top fixes (traffic &amp; sales weighted)</h2>
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
                    <td>{r.name}</td>
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
          </div>

          <div className="card">
            <h2>Analysis history</h2>
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
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
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
        </>
      )}
    </>
  );
}
