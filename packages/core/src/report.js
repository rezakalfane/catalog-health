/**
 * Aggregation + reporting over analyzed rows.
 */
import { grade } from "./scoring.js";
import { DIMENSION_WEIGHTS } from "./profiles.js";

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export function categoryRollup(rows, categories) {
  const names = new Map(categories.map((c) => [c.category_id ?? c.id, c.name || "?"]));
  const byCat = new Map();
  for (const r of rows) {
    const cats = r.categories.length ? r.categories : ["(uncategorized)"];
    for (const c of cats) {
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(r);
    }
  }
  return [...byCat.entries()]
    .map(([cat, items]) => {
      const avg = mean(items.map((r) => r.overall));
      return {
        categoryId: cat,
        categoryName: typeof cat === "number" ? names.get(cat) || "?" : String(cat),
        products: items.length,
        avgScore: Math.round(avg * 10) / 10,
        grade: grade(avg),
        pctFailing: Math.round(
          (100 * items.filter((r) => r.overall < 70).length) / items.length
        ),
      };
    })
    .sort((a, b) => a.avgScore - b.avgScore);
}

export function issueFrequency(rows) {
  const freq = new Map();
  for (const r of rows)
    for (const i of r.issues) freq.set(i, (freq.get(i) || 0) + 1);
  return [...freq.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);
}

export function summarize(rows, categories) {
  const overall = mean(rows.map((r) => r.overall));
  const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of rows) gradeDist[r.grade] += 1;
  // Derive dimensions from the rows so the optional semantic pass shows up.
  const dimensions = Object.keys(rows[0]?.scores || DIMENSION_WEIGHTS);
  const dimensionAverages = Object.fromEntries(
    dimensions.map((d) => [
      d,
      Math.round(mean(rows.map((r) => r.scores[d] ?? 0)) * 10) / 10,
    ])
  );
  return {
    productCount: rows.length,
    overall: Math.round(overall * 10) / 10,
    grade: grade(overall),
    gradeDist,
    dimensionAverages,
    issueFrequency: issueFrequency(rows),
    categoryRollup: categoryRollup(rows, categories),
    topFixes: [...rows].sort((a, b) => b.impact - a.impact).slice(0, 50),
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const flat = rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    categories: r.categories.join(";"),
    overall: r.overall,
    grade: r.grade,
    ...Object.fromEntries(
      Object.entries(r.scores).map(([d, s]) => [`score_${d}`, s])
    ),
    view_count: r.viewCount,
    total_sold: r.totalSold,
    impact: r.impact,
    issues: r.issues.join(";"),
    issue_count: r.issues.length,
  }));
  const headers = Object.keys(flat[0]);
  return [
    headers.join(","),
    ...flat.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
}

export function objectsToCsv(objects) {
  if (!objects.length) return "";
  const headers = Object.keys(objects[0]);
  return [
    headers.join(","),
    ...objects.map((o) => headers.map((h) => csvEscape(o[h])).join(",")),
  ].join("\n");
}
