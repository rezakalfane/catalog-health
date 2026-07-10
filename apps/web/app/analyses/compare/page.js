"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import ProductThumb from "@/components/ProductThumb";
import { issueLabel } from "@/components/issue-info";
import { compareAnalyses } from "@/lib/api-client";
import ActionIcon from "@/components/ActionIcon";

function Delta({ value, lowerIsBetter = false }) {
  const n = Number(value || 0);
  const good = lowerIsBetter ? n < 0 : n > 0;
  const bad = lowerIsBetter ? n > 0 : n < 0;
  const color = good ? "var(--grade-a)" : bad ? "var(--grade-f)" : "var(--ink-soft)";
  const sign = n > 0 ? "+" : "";
  return <span style={{ color, fontWeight: 700 }}>{sign}{n}</span>;
}

function MetricCard({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const baseId = searchParams.get("base");
  const targetId = searchParams.get("target");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [productStatus, setProductStatus] = useState("changed");
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (!baseId || !targetId) {
      setError("Choose two analyses to compare.");
      return;
    }
    compareAnalyses(baseId, targetId)
      .then(setData)
      .catch((err) => setError(err.body?.error || "Could not compare analyses"));
  }, [baseId, targetId]);

  const productRows = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (data?.products || []).filter((p) => {
      if (productStatus !== "all" && p.status !== productStatus) return false;
      if (q && !String(p.name || "").toLowerCase().includes(q) && !String(p.sku || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, productSearch, productStatus]);

  if (error) {
    return (
      <>
        <div className="page-head">
          <h1>Compare analyses</h1>
        </div>
        <div className="card">
          <p className="error">{error}</p>
          <Link className="btn" href="/">
            <ActionIcon name="arrowLeft" />
            Back to dashboard
          </Link>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="page-head">
          <h1>Compare analyses</h1>
        </div>
        <p className="muted">Loading comparison…</p>
      </>
    );
  }

  const baseDate = new Date(data.base.createdAt).toLocaleString();
  const targetDate = new Date(data.target.createdAt).toLocaleString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Compare analyses</h1>
          <p className="muted">
            Previous <Link href={`/analyses/${data.base.id}`}>{baseDate}</Link> · Current{" "}
            <Link href={`/analyses/${data.target.id}`}>{targetDate}</Link>
          </p>
        </div>
        <Link className="btn" href={`/analyses/${data.target.id}`}>
          <ActionIcon name="arrowLeft" />
          Back to current analysis
        </Link>
      </div>

      {!data.summary.semanticComparable && (
        <div className="card" style={{ borderLeft: "4px solid var(--grade-c)" }}>
          <p className="muted" style={{ margin: 0 }}>
            These analyses use different scoring formulas because semantic scoring is present in only one run.
          </p>
        </div>
      )}

      <div className="grid">
        <MetricCard title="Overall score">
          <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
            <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-display)" }}>
              {data.summary.score.base} → {data.summary.score.target}
            </div>
            <Delta value={data.summary.score.delta} />
          </div>
        </MetricCard>
        <MetricCard title="Grade">
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
            <GradeLozenge grade={data.summary.grade.base} small />
            <span className="muted">→</span>
            <GradeLozenge grade={data.summary.grade.target} small />
          </div>
        </MetricCard>
        <MetricCard title="Products">
          <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
            <div style={{ fontSize: "1.6rem", fontFamily: "var(--font-display)" }}>
              {data.summary.products.base} → {data.summary.products.target}
            </div>
            <Delta value={data.summary.products.delta} />
          </div>
        </MetricCard>
      </div>

      <div className="card">
        <h2>Dimension changes</h2>
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Previous</th>
              <th>Current</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {data.dimensions.map((d) => (
              <tr key={d.dimension}>
                <td style={{ textTransform: "capitalize" }}>{d.dimension}</td>
                <td>{d.base ?? "—"}</td>
                <td>{d.target ?? "—"}</td>
                <td><Delta value={d.delta} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Issue changes</h2>
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Previous</th>
              <th>Current</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {data.issues.slice(0, 20).map((i) => (
              <tr key={i.issue}>
                <td>{issueLabel(i.issue)}</td>
                <td>{i.base}</td>
                <td>{i.target}</td>
                <td><Delta value={i.delta} lowerIsBetter /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Category changes</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Score</th>
              <th>Delta</th>
              <th>Products</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.slice(0, 15).map((c) => (
              <tr key={String(c.categoryId)}>
                <td>{c.categoryName}</td>
                <td>{c.baseScore ?? "—"} → {c.targetScore ?? "—"}</td>
                <td><Delta value={c.scoreDelta} /></td>
                <td>
                  {c.baseProducts} → {c.targetProducts}{" "}
                  <Delta value={c.productDelta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Product changes</h2>
        {data.products.length === 0 ? (
          <p className="muted">
            Product-level comparison is unavailable because one of these analyses predates per-product storage.
          </p>
        ) : (
          <>
            <div className="filters">
              <div>
                <label htmlFor="cmp-product-search">Search</label>
                <input
                  id="cmp-product-search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Name or SKU…"
                />
              </div>
              <div>
                <label htmlFor="cmp-product-status">Status</label>
                <select
                  id="cmp-product-status"
                  value={productStatus}
                  onChange={(e) => setProductStatus(e.target.value)}
                >
                  <option value="changed">Changed</option>
                  <option value="added">Added</option>
                  <option value="removed">Removed</option>
                  <option value="unchanged">Unchanged</option>
                  <option value="all">All products</option>
                </select>
              </div>
            </div>
            <p className="muted">
              {productRows.length} of {data.products.length} products
            </p>
            <table className="compare-products">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Issues</th>
                  <th>Resolved</th>
                  <th>New issues</th>
                </tr>
              </thead>
              <tbody>
                {productRows.slice(0, 100).map((p) => {
                  const analysisId = p.status === "removed" ? data.base.id : data.target.id;
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="prod-cell">
                          <ProductThumb src={p.thumbnailUrl} alt="" />
                          <span>
                            <Link href={`/analyses/${analysisId}/products/${p.id}`}>
                              {p.name || `#${p.id}`}
                            </Link>
                            {p.sku && <div className="muted">{p.sku}</div>}
                          </span>
                        </span>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{p.status}</td>
                      <td>
                        {p.baseScore ?? "—"} → {p.targetScore ?? "—"}{" "}
                        <Delta value={p.scoreDelta} />
                      </td>
                      <td>
                        <span className="grade-change">
                          {p.baseGrade ? <GradeLozenge grade={p.baseGrade} small /> : "—"}
                          <span className="muted">→</span>
                          {p.targetGrade ? <GradeLozenge grade={p.targetGrade} small /> : "—"}
                        </span>
                      </td>
                      <td>
                        {p.baseIssues} → {p.targetIssues}{" "}
                        <Delta value={p.issueDelta} lowerIsBetter />
                      </td>
                      <td className="muted">
                        {p.resolvedIssues.length
                          ? p.resolvedIssues.map(issueLabel).join("; ")
                          : "—"}
                      </td>
                      <td className="muted">
                        {p.addedIssues.length ? p.addedIssues.map(issueLabel).join("; ") : "—"}
                      </td>
                    </tr>
                  );
                })}
                {productRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No products match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {productRows.length > 100 && (
              <p className="muted">Showing the first 100 matches. Narrow the filters to inspect more specific changes.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}
