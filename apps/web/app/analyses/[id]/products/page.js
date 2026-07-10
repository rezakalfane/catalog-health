"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GradeLozenge from "@/components/GradeLozenge";
import ProductThumb from "@/components/ProductThumb";
import { issueLabel } from "@/components/issue-info";
import { getAnalysisProducts } from "@/lib/api-client";
import ActionIcon from "@/components/ActionIcon";

const PAGE_SIZE = 50;
const GRADES = ["A", "B", "C", "D", "F"];

// Sortable columns: `dir` is the direction applied on first click.
const COLUMNS = [
  { key: "name", label: "Product", cmp: (a, b) => a.name.localeCompare(b.name), dir: "asc" },
  { key: "sku", label: "SKU", cmp: (a, b) => a.sku.localeCompare(b.sku), dir: "asc" },
  { key: "overall", label: "Score", cmp: (a, b) => a.overall - b.overall, dir: "asc" },
  { key: "grade", label: "Grade", cmp: (a, b) => a.overall - b.overall, dir: "asc" },
  { key: "impact", label: "Impact", cmp: (a, b) => a.impact - b.impact, dir: "desc" },
  { key: "viewCount", label: "Views", cmp: (a, b) => a.viewCount - b.viewCount, dir: "desc" },
  { key: "totalSold", label: "Sold", cmp: (a, b) => a.totalSold - b.totalSold, dir: "desc" },
  { key: "issues", label: "Issues", cmp: (a, b) => a.issues.length - b.issues.length, dir: "desc" },
];

const CSV_HEADERS = [
  "Product ID",
  "Product",
  "SKU",
  "Score",
  "Grade",
  "Impact",
  "Views",
  "Sold",
  "Issue count",
  "Issues",
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvRows(rows) {
  return [
    CSV_HEADERS.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.name || `#${r.id}`,
        r.sku,
        r.overall,
        r.grade,
        r.impact,
        r.viewCount,
        r.totalSold,
        r.issues.length,
        r.issues.map(issueLabel).join("; "),
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n");
}

function downloadCsv(filename, rows) {
  const blob = new Blob([`\uFEFF${csvRows(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ProductTablePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [issue, setIssue] = useState("");
  const [category, setCategory] = useState("");
  const [sortCol, setSortCol] = useState("impact");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  function sortBy(key) {
    if (key === sortCol) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(key);
      setSortDir(COLUMNS.find((c) => c.key === key).dir);
    }
    setPage(0);
  }

  useEffect(() => {
    getAnalysisProducts(id)
      .then(setData)
      .catch((err) => setError(err.body?.error || "Could not load products"));
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
    const col = COLUMNS.find((c) => c.key === sortCol);
    const sign = sortDir === "asc" ? 1 : -1;
    return data.rows
      .filter((r) => {
        if (q && !r.name.toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false;
        if (grade && r.grade !== grade) return false;
        if (issue && !r.issues.includes(issue)) return false;
        if (category && !r.categories.map(String).includes(category)) return false;
        return true;
      })
      .sort((a, b) => sign * col.cmp(a, b));
  }, [data, search, grade, issue, category, sortCol, sortDir]);

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

  function exportCsv() {
    if (!data) return;
    const date = data.createdAt ? data.createdAt.slice(0, 10) : "analysis";
    downloadCsv(`catalog-health-products-${date}-${id}.csv`, filtered);
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
        <button type="button" className="secondary" onClick={exportCsv} disabled={!data}>
          <ActionIcon name="download" />
          Export as CSV
        </button>
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
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="sortable"
                  onClick={() => sortBy(c.key)}
                  aria-sort={
                    sortCol === c.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.label}
                  <span className="sort-arrow">
                    {sortCol === c.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="prod-cell">
                    <ProductThumb src={r.details?.thumbnailUrl} alt="" />
                    <Link href={`/analyses/${id}/products/${r.id}`}>{r.name || `#${r.id}`}</Link>
                  </span>
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
