import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/db";
import { requestSkipSemantic } from "@/lib/analysis-runner";

/** POST -> abandon the running analysis's semantic pass (heuristics only). */
export async function POST(request, { params }) {
  const { id } = await params;
  const analysis = getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!requestSkipSemantic(id)) {
    return NextResponse.json({ error: "This analysis is not running" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
