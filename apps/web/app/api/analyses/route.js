import { NextResponse } from "next/server";
import {
  getEnvironment,
  listAnalyses,
  analysisStatus,
  findRunningAnalysis,
  redactAnalysis,
  getDefaultLlmModel,
  getLlmModel,
  redactLlmModel,
} from "@/lib/db";
import {
  startAnalysisRun,
  reconcileInterruptedAnalyses,
} from "@/lib/analysis-runner";
import { getApiUser } from "@/lib/auth-helpers";

export async function GET(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  reconcileInterruptedAnalyses();
  const url = new URL(request.url);
  const environmentId = url.searchParams.get("environmentId") || undefined;
  const status = url.searchParams.get("status");
  let analyses = listAnalyses(user.id, environmentId);
  if (status) analyses = analyses.filter((a) => analysisStatus(a) === status);
  return NextResponse.json(analyses.map(redactAnalysis));
}

/**
 * POST { environmentId } -> starts an async analysis against that store.
 * POST { demo: true }    -> starts one against a synthetic catalog.
 * Returns 202 with the running analysis record; poll GET /api/analyses/:id.
 */
export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  reconcileInterruptedAnalyses();
  const body = await request.json();

  let environment = null;
  if (!body?.demo) {
    environment = getEnvironment(user.id, body?.environmentId);
    if (!environment) {
      return NextResponse.json({ error: "Unknown environment" }, { status: 400 });
    }
  }

  let semanticModel = null;
  if (body?.semantic && !body?.demo) {
    semanticModel = body.semanticModelId
      ? getLlmModel(user.id, body.semanticModelId)
      : getDefaultLlmModel(user.id);
    if (!semanticModel) {
      return NextResponse.json({ error: "Choose a configured semantic model." }, { status: 400 });
    }
    if (!redactLlmModel(semanticModel).configured) {
      return NextResponse.json({ error: `Model configuration “${semanticModel.name}” is not ready.` }, { status: 400 });
    }
  }

  // One run at a time per environment — point the client at the existing one.
  const existing = findRunningAnalysis(user.id, environment ? environment.id : "demo");
  if (existing) {
    return NextResponse.json(
      { error: "An analysis is already running for this environment", analysisId: existing.id },
      { status: 409 }
    );
  }

  const analysis = startAnalysisRun({
    userId: user.id,
    environment,
    demo: Boolean(body?.demo),
    semantic: Boolean(body?.semantic),
    semanticModel,
  });
  return NextResponse.json(analysis, { status: 202 });
}
