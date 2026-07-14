import { NextResponse } from "next/server";
import { deleteAnalysis, getAnalysis, redactAnalysis } from "@/lib/db";
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

export async function DELETE(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = deleteAnalysis(user.id, id);
  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.reason === "running") {
    return NextResponse.json(
      { error: "An analysis in progress cannot be deleted" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
