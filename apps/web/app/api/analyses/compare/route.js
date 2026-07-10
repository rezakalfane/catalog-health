import { NextResponse } from "next/server";
import { getAnalysis, getAnalysisRows, analysisStatus } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { compareAnalyses } from "@/lib/compare";

export async function GET(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const baseId = url.searchParams.get("base");
  const targetId = url.searchParams.get("target");
  if (!baseId || !targetId) {
    return NextResponse.json({ error: "base and target analysis ids are required" }, { status: 400 });
  }
  if (baseId === targetId) {
    return NextResponse.json({ error: "Choose two different analyses to compare" }, { status: 400 });
  }

  const base = getAnalysis(user.id, baseId);
  const target = getAnalysis(user.id, targetId);
  if (!base || !target) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  if (analysisStatus(base) !== "done" || analysisStatus(target) !== "done") {
    return NextResponse.json({ error: "Only completed analyses can be compared" }, { status: 400 });
  }
  if (base.environmentId !== target.environmentId) {
    return NextResponse.json(
      { error: "Analyses must belong to the same environment" },
      { status: 400 }
    );
  }

  const baseRows = base.hasRows ? getAnalysisRows(user.id, base.id) : [];
  const targetRows = target.hasRows ? getAnalysisRows(user.id, target.id) : [];
  return NextResponse.json(compareAnalyses({ base, target, baseRows, targetRows }));
}
