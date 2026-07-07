import { NextResponse } from "next/server";
import { getAnalysis, getAnalysisRows } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";

/**
 * Full per-product results for one analysis, plus a category id -> name map
 * (derived from the summary rollup). Filtering/sorting happens client-side.
 */
export async function GET(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const analysis = getAnalysis(user.id, id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!analysis.hasRows) {
    return NextResponse.json(
      { error: "This analysis has no per-product data (it predates per-product storage). Run a new analysis." },
      { status: 404 }
    );
  }
  // Prefer the analysis's stored catalog metadata (has channel trees);
  // fall back to the summary rollup for analyses that predate it.
  const categoryNames = analysis.catalog
    ? Object.fromEntries(analysis.catalog.categories.map((c) => [String(c.id), c.name]))
    : Object.fromEntries(
        (analysis.summary?.categoryRollup || []).map((c) => [String(c.categoryId), c.categoryName])
      );
  const categoryTrees = analysis.catalog
    ? Object.fromEntries(analysis.catalog.categories.map((c) => [String(c.id), c.treeId]))
    : {};
  const treeNames = Object.fromEntries(
    (analysis.catalog?.trees || []).map((t) => [String(t.id), t.name])
  );
  const treeChannels = Object.fromEntries(
    (analysis.catalog?.trees || []).map((t) => [String(t.id), t.channelIds || []])
  );
  const channelNames = Object.fromEntries(
    (analysis.catalog?.channels || []).map((c) => [String(c.id), c.name])
  );
  return NextResponse.json({
    analysisId: analysis.id,
    environmentId: analysis.environmentId,
    createdAt: analysis.createdAt,
    categoryNames,
    categoryTrees,
    treeNames,
    treeChannels,
    channelNames,
    semanticJudge: analysis.catalog?.semanticJudge || null,
    rows: getAnalysisRows(user.id, id),
  });
}
