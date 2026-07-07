import { NextResponse } from "next/server";
import {
  getEnvironment,
  listAnalyses,
  analysisStatus,
  findRunningAnalysis,
} from "@/lib/db";
import {
  startAnalysisRun,
  reconcileInterruptedAnalyses,
} from "@/lib/analysis-runner";

export async function GET(request) {
  reconcileInterruptedAnalyses();
  const url = new URL(request.url);
  const environmentId = url.searchParams.get("environmentId") || undefined;
  const status = url.searchParams.get("status");
  let analyses = listAnalyses(environmentId);
  if (status) analyses = analyses.filter((a) => analysisStatus(a) === status);
  return NextResponse.json(analyses);
}

/**
 * POST { environmentId } -> starts an async analysis against that store.
 * POST { demo: true }    -> starts one against a synthetic catalog.
 * Returns 202 with the running analysis record; poll GET /api/analyses/:id.
 */
export async function POST(request) {
  reconcileInterruptedAnalyses();
  const body = await request.json();

  let environment = null;
  if (!body?.demo) {
    environment = getEnvironment(body?.environmentId);
    if (!environment) {
      return NextResponse.json({ error: "Unknown environment" }, { status: 400 });
    }
  }

  // One run at a time per environment — point the client at the existing one.
  const existing = findRunningAnalysis(environment ? environment.id : "demo");
  if (existing) {
    return NextResponse.json(
      { error: "An analysis is already running for this environment", analysisId: existing.id },
      { status: 409 }
    );
  }

  const analysis = startAnalysisRun({
    environment,
    demo: Boolean(body?.demo),
    semantic: Boolean(body?.semantic),
  });
  return NextResponse.json(analysis, { status: 202 });
}
