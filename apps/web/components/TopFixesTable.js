"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ActionIcon from "@/components/ActionIcon";
import GradeLozenge from "@/components/GradeLozenge";
import InfoPopover from "@/components/InfoPopover";
import ProductThumb from "@/components/ProductThumb";
import { issueLabel } from "@/components/issue-info";
import { sectionInfo } from "@/components/section-info";
import { getAnalysisProducts } from "@/lib/api-client";
import { downloadProductCsv } from "@/lib/product-csv";

const GRADES = ["A", "B", "C", "D", "F"];

const COLUMNS = [
  { key: "name", label: "Product", cmp: (a, b) => String(a.name || "").localeCompare(String(b.name || "")), dir: "asc" },
  { key: "sku", label: "SKU", cmp: (a, b) => String(a.sku || "").localeCompare(String(b.sku || "")), dir: "asc" },
  { key: "overall", label: "Score", cmp: (a, b) => a.overall - b.overall, dir: "asc" },
  { key: "grade", label: "Grade", cmp: (a, b) => a.overall - b.overall, dir: "asc" },
  { key: "impact", label: "Impact", cmp: (a, b) => a.impact - b.impact, dir: "desc" },
  { key: "issues", label: "Issues", cmp: (a, b) => a.issues.length - b.issues.length, dir: "desc" },
];

export default function TopFixesTable({
  analysisId,
  createdAt,
  initialRows,
  productCount,
  hasRows,
  displayLimit = 15,
}) {
  const [rows, setRows] = useState(initialRows);
  const [analysisDate, setAnalysisDate] = useState(createdAt);
  const [loaded, setLoaded] = useState(!hasRows);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [sortCol, setSortCol] = useState("impact");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (hasRows) return;
    setRows(initialRows);
    setAnalysisDate(createdAt);
  }, [createdAt, hasRows, initialRows]);

  useEffect(() => {
    if (!hasRows) return;
    let ignore = false;
    getAnalysisProducts(analysisId)
      .then((data) => {
        if (ignore) return;
        setRows(data.rows);
        setAnalysisDate(data.createdAt);
        setLoaded(true);
      })
      .catch((err) => {
        if (ignore) return;
        setLoadError(err.body?.error || "Could not load all products");
      });
    return () => {
      ignore = true;
    };
  }, [analysisId, hasRows]);

  function sortBy(key) {
    if (key === sortCol) {
      setSortDir((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }
    setSortCol(key);
    setSortDir(COLUMNS.find((column) => column.key === key).dir);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const column = COLUMNS.find((candidate) => candidate.key === sortCol);
    const sign = sortDir === "asc" ? 1 : -1;
    return rows
      .filter((row) => {
        if (
          q &&
          !String(row.name || "").toLowerCase().includes(q) &&
          !String(row.sku || "").toLowerCase().includes(q)
        ) {
          return false;
        }
        if (grade && row.grade !== grade) return false;
        return true;
      })
      .sort(
        (a, b) =>
          sign * column.cmp(a, b) ||
          String(a.name || "").localeCompare(String(b.name || ""))
      );
  }, [grade, rows, search, sortCol, sortDir]);

  function exportCsv() {
    if (!loaded || filtered.length === 0) return;
    const date = analysisDate ? analysisDate.slice(0, 10) : "analysis";
    downloadProductCsv(`catalog-health-products-${date}-${analysisId}.csv`, filtered, issueLabel);
  }

  return (
    <>
      <div className="section-action-head">
        <h2>
          Top fixes (traffic &amp; sales weighted)
          <InfoPopover title="Top fixes">{sectionInfo.topFixes}</InfoPopover>
        </h2>
        {hasRows && (
          <button
            type="button"
            className="secondary"
            onClick={exportCsv}
            disabled={!loaded || filtered.length === 0}
            title={loadError || "Export the current filtered and sorted products"}
          >
            <ActionIcon name="download" />
            Export as CSV
          </button>
        )}
      </div>

      {hasRows && (
        <>
          <div className="filters top-fixes-filters">
            <div>
              <label htmlFor={`top-fixes-search-${analysisId}`}>Search</label>
              <input
                id={`top-fixes-search-${analysisId}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or SKU…"
              />
            </div>
            <div>
              <label htmlFor={`top-fixes-grade-${analysisId}`}>Grade</label>
              <select
                id={`top-fixes-grade-${analysisId}`}
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
              >
                <option value="">All grades</option>
                {GRADES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>
          <p className="muted">
            {filtered.length} of {loaded ? rows.length : productCount} products
            {filtered.length > displayLimit ? ` · showing the first ${displayLimit}` : ""}
          </p>
        </>
      )}

      <table>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={hasRows ? "sortable" : undefined}
                onClick={hasRows ? () => sortBy(column.key) : undefined}
                aria-sort={
                  hasRows && sortCol === column.key
                    ? sortDir === "asc" ? "ascending" : "descending"
                    : undefined
                }
              >
                {column.label}
                {hasRows && (
                  <span className="sort-arrow">
                    {sortCol === column.key ? sortDir === "asc" ? "▲" : "▼" : ""}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, displayLimit).map((row) => (
            <tr key={row.id}>
              <td>
                <span className="prod-cell">
                  <ProductThumb src={row.details?.thumbnailUrl} alt="" />
                  {hasRows ? (
                    <Link href={`/analyses/${analysisId}/products/${row.id}`}>{row.name}</Link>
                  ) : (
                    row.name
                  )}
                </span>
              </td>
              <td>{row.sku}</td>
              <td>{row.overall}</td>
              <td><GradeLozenge grade={row.grade} small /></td>
              <td>{row.impact}</td>
              <td className="muted">
                {row.issues.slice(0, 3).join(", ")}{row.issues.length > 3 ? "…" : ""}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="muted">No products match these filters.</td></tr>
          )}
        </tbody>
      </table>

      {hasRows && (
        <p style={{ marginBottom: 0 }}>
          <Link href={`/analyses/${analysisId}/products`}>
            Browse all {productCount} products with filters →
          </Link>
        </p>
      )}
    </>
  );
}
