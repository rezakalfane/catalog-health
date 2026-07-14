import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth-helpers";
import { recalculateAnalysis } from "@/lib/analysis-recalculator";
import { getScoringProfileForUser, redactAnalysis } from "@/lib/db";

export async function POST(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!getScoringProfileForUser(user.id, body.profileId)) {
    return NextResponse.json({ error: "Unknown scoring profile" }, { status: 400 });
  }

  try {
    const analysis = recalculateAnalysis({
      userId: user.id,
      sourceAnalysisId: id,
      profileId: body.profileId,
    });
    return NextResponse.json(redactAnalysis(analysis), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Could not recalculate analysis" },
      { status: error.status || 500 }
    );
  }
}
