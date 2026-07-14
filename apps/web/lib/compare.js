const round1 = (n) => Math.round(n * 10) / 10;
const delta = (from = 0, to = 0) => round1((to || 0) - (from || 0));
const byKey = (rows, key) => new Map((rows || []).map((r) => [String(r[key]), r]));

function countMap(items = [], key = "issue") {
  return new Map(items.map((item) => [String(item[key]), item.count || 0]));
}

function issueSet(row) {
  return new Set(row?.issues || []);
}

function diffIssues(baseIssues, targetIssues) {
  const base = issueSet({ issues: baseIssues });
  const target = issueSet({ issues: targetIssues });
  return {
    resolved: [...base].filter((issue) => !target.has(issue)).sort(),
    added: [...target].filter((issue) => !base.has(issue)).sort(),
  };
}

function hasSemantic(summary) {
  return Boolean(summary?.dimensionAverages?.semantic);
}

export function compareSummaries(base, target) {
  const baseSummary = base.summary || {};
  const targetSummary = target.summary || {};
  return {
    score: {
      base: baseSummary.overall ?? null,
      target: targetSummary.overall ?? null,
      delta: delta(baseSummary.overall, targetSummary.overall),
    },
    grade: {
      base: baseSummary.grade ?? null,
      target: targetSummary.grade ?? null,
      changed: baseSummary.grade !== targetSummary.grade,
    },
    products: {
      base: baseSummary.productCount ?? 0,
      target: targetSummary.productCount ?? 0,
      delta: delta(baseSummary.productCount, targetSummary.productCount),
    },
    semanticComparable: hasSemantic(baseSummary) === hasSemantic(targetSummary),
    scoring: compareScoringMetadata(base.scoringMetadata, target.scoringMetadata),
  };
}

export function compareDimensions(baseSummary = {}, targetSummary = {}) {
  const baseDims = baseSummary.dimensionAverages || {};
  const targetDims = targetSummary.dimensionAverages || {};
  const names = [...new Set([...Object.keys(baseDims), ...Object.keys(targetDims)])];
  return names.map((dimension) => ({
    dimension,
    base: baseDims[dimension] ?? null,
    target: targetDims[dimension] ?? null,
    delta: delta(baseDims[dimension], targetDims[dimension]),
  }));
}

export function compareIssues(baseSummary = {}, targetSummary = {}) {
  const baseCounts = countMap(baseSummary.issueFrequency);
  const targetCounts = countMap(targetSummary.issueFrequency);
  const issues = [...new Set([...baseCounts.keys(), ...targetCounts.keys()])];
  return issues
    .map((issue) => {
      const base = baseCounts.get(issue) || 0;
      const target = targetCounts.get(issue) || 0;
      return { issue, base, target, delta: target - base };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.target - a.target);
}

export function compareCategories(baseSummary = {}, targetSummary = {}) {
  const baseCats = byKey(baseSummary.categoryRollup, "categoryId");
  const targetCats = byKey(targetSummary.categoryRollup, "categoryId");
  const ids = [...new Set([...baseCats.keys(), ...targetCats.keys()])];
  return ids
    .map((categoryId) => {
      const base = baseCats.get(categoryId);
      const target = targetCats.get(categoryId);
      return {
        categoryId,
        categoryName: target?.categoryName || base?.categoryName || `#${categoryId}`,
        baseScore: base?.avgScore ?? null,
        targetScore: target?.avgScore ?? null,
        scoreDelta: delta(base?.avgScore, target?.avgScore),
        baseProducts: base?.products ?? 0,
        targetProducts: target?.products ?? 0,
        productDelta: (target?.products ?? 0) - (base?.products ?? 0),
        baseGrade: base?.grade ?? null,
        targetGrade: target?.grade ?? null,
      };
    })
    .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));
}

export function compareProducts(baseRows = [], targetRows = []) {
  const baseById = new Map(baseRows.map((row) => [String(row.id), row]));
  const targetById = new Map(targetRows.map((row) => [String(row.id), row]));
  const ids = [...new Set([...baseById.keys(), ...targetById.keys()])];
  return ids
    .map((id) => {
      const base = baseById.get(id);
      const target = targetById.get(id);
      const product = target || base;
      const issues = diffIssues(base?.issues || [], target?.issues || []);
      const status = base && target
        ? base.overall !== target.overall ||
          base.grade !== target.grade ||
          issues.resolved.length > 0 ||
          issues.added.length > 0
          ? "changed"
          : "unchanged"
        : target
          ? "added"
          : "removed";
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        status,
        baseScore: base?.overall ?? null,
        targetScore: target?.overall ?? null,
        scoreDelta: delta(base?.overall, target?.overall),
        baseGrade: base?.grade ?? null,
        targetGrade: target?.grade ?? null,
        baseIssues: base?.issues?.length ?? 0,
        targetIssues: target?.issues?.length ?? 0,
        issueDelta: (target?.issues?.length ?? 0) - (base?.issues?.length ?? 0),
        resolvedIssues: issues.resolved,
        addedIssues: issues.added,
        baseImpact: base?.impact ?? null,
        targetImpact: target?.impact ?? null,
        impactDelta: delta(base?.impact, target?.impact),
        thumbnailUrl: product.details?.thumbnailUrl || "",
        baseAiAnalyzed: Boolean(base?.aiAnalyzed),
        targetAiAnalyzed: Boolean(target?.aiAnalyzed),
        aiAnalyzed: Boolean(base?.aiAnalyzed || target?.aiAnalyzed),
      };
    })
    .sort((a, b) => {
      const statusRank = { changed: 0, added: 1, removed: 2, unchanged: 3 };
      return (
        statusRank[a.status] - statusRank[b.status] ||
        Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta) ||
        Math.abs(b.issueDelta) - Math.abs(a.issueDelta)
      );
    });
}

export function compareAnalyses({ base, target, baseRows = [], targetRows = [] }) {
  return {
    base: {
      id: base.id,
      environmentId: base.environmentId,
      createdAt: base.createdAt,
      grade: base.summary?.grade ?? null,
      overall: base.summary?.overall ?? null,
      productCount: base.summary?.productCount ?? 0,
      hasRows: base.hasRows,
      scoringMetadata: base.scoringMetadata || null,
    },
    target: {
      id: target.id,
      environmentId: target.environmentId,
      createdAt: target.createdAt,
      grade: target.summary?.grade ?? null,
      overall: target.summary?.overall ?? null,
      productCount: target.summary?.productCount ?? 0,
      hasRows: target.hasRows,
      scoringMetadata: target.scoringMetadata || null,
    },
    summary: compareSummaries(base, target),
    dimensions: compareDimensions(base.summary, target.summary),
    issues: compareIssues(base.summary, target.summary),
    categories: compareCategories(base.summary, target.summary),
    products: base.hasRows && target.hasRows ? compareProducts(baseRows, targetRows) : [],
  };
}
import { compareScoringMetadata } from "@catalog-health/core";
