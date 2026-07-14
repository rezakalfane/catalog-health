import { NextResponse } from "next/server";
import { normalizeScoringProfileInput } from "@catalog-health/core/profiles";
import { getApiUser } from "@/lib/auth-helpers";
import { createCustomScoringProfile, listScoringProfiles } from "@/lib/db";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profiles: listScoringProfiles(user.id) });
}

export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const profile = normalizeScoringProfileInput(await request.json());
    return NextResponse.json(createCustomScoringProfile(user.id, profile), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid scoring profile" }, { status: 400 });
  }
}
