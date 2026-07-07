import { NextResponse } from "next/server";
import { getAnalysis, redactAnalysis } from "@/lib/db";
import { reconcileInterruptedAnalyses } from "@/lib/analysis-runner";
import { getApiUser } from "@/lib/auth-helpers";

export async function GET(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  reconcileInterruptedAnalyses();
  const { id } = await params;
  const analysis = getAnalysis(user.id, id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactAnalysis(analysis));
}
