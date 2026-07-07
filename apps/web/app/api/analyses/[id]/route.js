import { NextResponse } from "next/server";
import { getAnalysis, redactAnalysis } from "@/lib/db";
import { reconcileInterruptedAnalyses } from "@/lib/analysis-runner";

export async function GET(request, { params }) {
  reconcileInterruptedAnalyses();
  const { id } = await params;
  const analysis = getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactAnalysis(analysis));
}
