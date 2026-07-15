import {
  getAnalysisRows,
  listAnalyses,
  listCompletedAnalyses,
  listEnvironments,
  redactEnvironment,
} from "@/lib/db";

export const STAT_GRADES = ["A", "B", "C", "D", "F"];

export function statisticGrade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function statisticPct(value, total) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

export function statisticNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function statisticDeltaLabel(delta) {
  if (delta == null) return "No previous run";
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${statisticNumber(delta, 1)} pts`;
}

export function statisticDeltaClass(delta) {
  if (delta == null || delta === 0) return "";
  return delta > 0 ? "good" : "bad";
}

function scoreDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return Math.round((current - previous) * 10) / 10;
}

function weightedAverage(items, valueKey, weightKey = "productCount") {
  const totalWeight = items.reduce((sum, item) => sum + Number(item[weightKey] || 0), 0);
  if (!totalWeight) return 0;
  return items.reduce((sum, item) => sum + Number(item[valueKey] || 0) * Number(item[weightKey] || 0), 0) / totalWeight;
}

function addCount(map, key, count = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + count);
}

function topFromMap(map, limit = 10) {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function isUncategorized(category) {
  return [category.categoryId, category.categoryName]
    .some((value) => String(value || "").trim().toLowerCase() === "(uncategorized)");
}

export function buildAccountStatistics({ environments, analyses, completedAnalyses, latestRowsByAnalysis }) {
  const envById = new Map(environments.map((env) => [env.id, env]));
  const catalogAnalyses = completedAnalyses.filter((analysis) => !analysis.sourceAnalysisId);
  const historyByEnv = new Map();

  for (const analysis of [...catalogAnalyses].reverse()) {
    if (!historyByEnv.has(analysis.environmentId)) historyByEnv.set(analysis.environmentId, []);
    historyByEnv.get(analysis.environmentId).push(analysis);
  }

  const envSummaries = environments.map((env) => {
    const history = historyByEnv.get(env.id) || [];
    const latest = history.at(-1) || null;
    const previous = history.at(-2) || null;
    const delta = latest && previous ? scoreDelta(latest.summary?.overall, previous.summary?.overall) : null;
    return {
      env,
      latest,
      previous,
      delta,
      analysisCount: history.length,
      daysSinceRun: latest
        ? Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 86400000)
        : null,
    };
  });

  const latestAnalyses = envSummaries.map((item) => item.latest).filter(Boolean);
  const latestSummaryItems = latestAnalyses.map((analysis) => ({
    score: Number(analysis.summary?.overall || 0),
    productCount: Number(analysis.summary?.productCount || 0),
  }));
  const productCount = latestSummaryItems.reduce((sum, item) => sum + item.productCount, 0);
  const currentScore = weightedAverage(latestSummaryItems, "score");
  const comparableSummaryItems = envSummaries.filter((item) => item.latest && item.previous);
  const comparableCurrentScore = weightedAverage(
    comparableSummaryItems.map((item) => ({
      score: Number(item.latest.summary?.overall || 0),
      productCount: Number(item.latest.summary?.productCount || 0),
    })),
    "score"
  );
  const comparablePreviousScore = weightedAverage(
    comparableSummaryItems.map((item) => ({
      score: Number(item.previous.summary?.overall || 0),
      productCount: Number(item.previous.summary?.productCount || 0),
    })),
    "score"
  );
  const accountDelta = comparableSummaryItems.length ? scoreDelta(comparableCurrentScore, comparablePreviousScore) : null;

  const gradeDist = Object.fromEntries(STAT_GRADES.map((g) => [g, 0]));
  const issueCounts = new Map();
  const issueImpact = new Map();
  const profileCounts = new Map();
  const dimensionWeighted = new Map();
  const categories = [];
  const products = [];
  let aiAnalyzedCount = 0;
  let productsBelowC = 0;
  let impactedViews = 0;
  let impactedUnits = 0;

  for (const analysis of latestAnalyses) {
    const summary = analysis.summary || {};
    const count = Number(summary.productCount || 0);
    for (const g of STAT_GRADES) gradeDist[g] += Number(summary.gradeDist?.[g] || 0);
    const profileLabel = analysis.scoringMetadata?.profile?.label || analysis.scoringMetadata?.profile?.id || "Unknown profile";
    addCount(profileCounts, profileLabel);
    for (const [dimension, value] of Object.entries(summary.dimensionAverages || {})) {
      const current = dimensionWeighted.get(dimension) || { score: 0, products: 0 };
      current.score += Number(value || 0) * count;
      current.products += count;
      dimensionWeighted.set(dimension, current);
    }
    for (const item of summary.issueFrequency || []) addCount(issueCounts, item.issue, Number(item.count || 0));
    for (const category of summary.categoryRollup || []) {
      categories.push({
        ...category,
        environmentName: envById.get(analysis.environmentId)?.name || analysis.environmentId,
      });
    }
    const rows = latestRowsByAnalysis.get(analysis.id) || [];
    for (const row of rows) {
      if (["D", "F"].includes(row.grade)) productsBelowC += 1;
      if (row.aiAnalyzed) aiAnalyzedCount += 1;
      if (row.overall < 70) {
        impactedViews += Number(row.viewCount || 0);
        impactedUnits += Number(row.totalSold || 0);
      }
      for (const issue of row.issues || []) addCount(issueImpact, issue, Number(row.impact || 0));
      products.push({
        ...row,
        analysisId: analysis.id,
        environmentName: envById.get(analysis.environmentId)?.name || analysis.environmentId,
      });
    }
  }

  const dimensionAverages = Object.fromEntries(
    [...dimensionWeighted.entries()].map(([dimension, value]) => [
      dimension,
      value.products ? Math.round((value.score / value.products) * 10) / 10 : 0,
    ])
  );
  const semanticAnalyses = completedAnalyses.filter(
    (analysis) => analysis.summary?.dimensionAverages?.semantic != null
  ).length;
  const statusCounts = analyses.reduce((counts, analysis) => {
    const status = analysis.status || "done";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const durations = completedAnalyses
    .map((analysis) => Number(analysis.durationMs))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    aiAnalyzedCount,
    accountDelta,
    currentScore,
    categories: categories
      .filter((category) => !isUncategorized(category))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 10),
    completedCount: completedAnalyses.length,
    derivedCount: completedAnalyses.filter((analysis) => analysis.sourceAnalysisId).length,
    dimensionAverages,
    envSummaries,
    gradeDist,
    impactedUnits,
    impactedViews,
    latestAnalyses,
    productsBelowC,
    productCount,
    profileCounts: topFromMap(profileCounts, 8),
    semanticAnalyses,
    statusCounts,
    totalAnalyses: analyses.length,
    avgDurationMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
    topIssueCounts: topFromMap(issueCounts, 10),
    topIssueImpact: topFromMap(issueImpact, 10),
    topProducts: products.sort((a, b) => Number(b.impact || 0) - Number(a.impact || 0)).slice(0, 10),
  };
}

export function loadAccountStatistics(userId) {
  const environments = listEnvironments(userId).map(redactEnvironment);
  const analyses = listAnalyses(userId);
  const completedAnalyses = listCompletedAnalyses(userId);
  const latestCatalogAnalysisIds = new Set();

  for (const env of environments) {
    const latest = completedAnalyses.find(
      (analysis) => analysis.environmentId === env.id && !analysis.sourceAnalysisId
    );
    if (latest) latestCatalogAnalysisIds.add(latest.id);
  }

  const latestRowsByAnalysis = new Map(
    [...latestCatalogAnalysisIds].map((analysisId) => [
      analysisId,
      getAnalysisRows(userId, analysisId),
    ])
  );

  return {
    environments,
    analyses,
    completedAnalyses,
    stats: buildAccountStatistics({ environments, analyses, completedAnalyses, latestRowsByAnalysis }),
  };
}
