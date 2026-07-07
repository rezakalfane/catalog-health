import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/db";
import { requestSkipSemantic } from "@/lib/analysis-runner";
import { getApiUser } from "@/lib/auth-helpers";

/** POST -> abandon the running analysis's semantic pass (heuristics only). */
export async function POST(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const analysis = getAnalysis(user.id, id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!requestSkipSemantic(id)) {
    return NextResponse.json({ error: "This analysis is not running" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
