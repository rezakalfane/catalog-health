"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import { issueLabel } from "@/components/issue-info";

const PAGE_SIZE = 50;
const GRADES = ["A", "B", "C", "D", "F"];
const SORTS = {
  impact: { label: "Impact (highest first)", fn: (a, b) => b.impact - a.impact },
  worst: { label: "Score (worst first)", fn: (a, b) => a.overall - b.overall },
  best: { label: "Score (best first)", fn: (a, b) => b.overall - a.overall },
  views: { label: "Views (highest first)", fn: (a, b) => b.viewCount - a.viewCount },
  sold: { label: "Units sold (highest first)", fn: (a, b) => b.totalSold - a.totalSold },
  name: { label: "Name (A→Z)", fn: (a, b) => a.name.localeCompare(b.name) },
};

export default function ProductTablePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [issue, setIssue] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("impact");
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch(`/api/analyses/${id}/products`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Could not load products");
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // Distinct issues and categories present in this analysis, for the dropdowns.
  const { issueOptions, categoryOptions } = useMemo(() => {
    if (!data) return { issueOptions: [], categoryOptions: [] };
    const issueCounts = new Map();
    const cats = new Set();
    for (const r of data.rows) {
      for (const i of r.issues) issueCounts.set(i, (issueCounts.get(i) || 0) + 1);
      for (const c of r.categories) cats.add(String(c));
    }
    return {
      issueOptions: [...issueCounts.entries()].sort((a, b) => b[1] - a[1]),
      categoryOptions: [...cats]
        .map((c) => [c, data.categoryNames[c] || `#${c}`])
        .sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows
      .filter((r) => {
        if (q && !r.name.toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false;
        if (grade && r.grade !== grade) return false;
        if (issue && !r.issues.includes(issue)) return false;
        if (category && !r.categories.map(String).includes(category)) return false;
        return true;
      })
      .sort(SORTS[sort].fn);
  }, [data, search, grade, issue, category, sort]);

  // Clamp the page when filters shrink the result set.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(0);
    };
  }

  if (error) {
    return (
      <>
        <div className="page-head">
          <h1>Products</h1>
        </div>
        <div className="card">
          <p className="muted">{error}</p>
          <Link className="btn" href={`/analyses/${id}`}>
            Back to analysis
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">
            {data ? (
              <>
                Analysis of {new Date(data.createdAt).toLocaleString()} ·{" "}
                <Link href={`/analyses/${id}`}>report</Link>
                {data.environmentId !== "demo" && (
                  <>
                    {" "}
                    · <Link href={`/environments/${data.environmentId}`}>environment</Link>
                  </>
                )}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div>
            <label htmlFor="f-search">Search</label>
            <input
              id="f-search"
              value={search}
              onChange={(e) => updateFilter(setSearch)(e.target.value)}
              placeholder="Name or SKU…"
            />
          </div>
          <div>
            <label htmlFor="f-grade">Grade</label>
            <select id="f-grade" value={grade} onChange={(e) => updateFilter(setGrade)(e.target.value)}>
              <option value="">All grades</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-issue">Issue</label>
            <select id="f-issue" value={issue} onChange={(e) => updateFilter(setIssue)(e.target.value)}>
              <option value="">All issues</option>
              {issueOptions.map(([code, count]) => (
                <option key={code} value={code}>
                  {issueLabel(code)} ({count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-category">Category</label>
            <select
              id="f-category"
              value={category}
              onChange={(e) => updateFilter(setCategory)(e.target.value)}
            >
              <option value="">All categories</option>
              {categoryOptions.map(([cid, name]) => (
                <option key={cid} value={cid}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort">Sort by</label>
            <select id="f-sort" value={sort} onChange={(e) => updateFilter(setSort)(e.target.value)}>
              {Object.entries(SORTS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="muted">
          {data ? (
            <>
              {filtered.length} of {data.rows.length} products
              {filtered.length > PAGE_SIZE && (
                <>
                  {" "}
                  · page {safePage + 1}/{pageCount}
                </>
              )}
            </>
          ) : (
            "Loading products…"
          )}
        </p>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Score</th>
              <th>Grade</th>
              <th>Impact</th>
              <th>Views</th>
              <th>Sold</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/analyses/${id}/products/${r.id}`}>{r.name || `#${r.id}`}</Link>
                </td>
                <td className="muted">{r.sku}</td>
                <td>{r.overall}</td>
                <td>
                  <GradeLozenge grade={r.grade} small />
                </td>
                <td>{r.impact}</td>
                <td>{r.viewCount}</td>
                <td>{r.totalSold}</td>
                <td className="muted" title={r.issues.map(issueLabel).join("\n")}>
                  {r.issues.length}
                </td>
              </tr>
            ))}
            {data && pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No products match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.85rem" }}>
            <button
              className="secondary"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
            >
              ← Previous
            </button>
            <span className="muted">
              page {safePage + 1} / {pageCount}
            </span>
            <button
              className="secondary"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
