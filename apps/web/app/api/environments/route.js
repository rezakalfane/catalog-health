import { NextResponse } from "next/server";
import {
  listEnvironments,
  createEnvironment,
  getScoringProfileForUser,
  redactEnvironment,
} from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import {
  DEFAULT_SCORING_PROFILE_ID,
} from "@catalog-health/core/profiles";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listEnvironments(user.id).map(redactEnvironment));
}

export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const {
    name,
    storeHash,
    accessToken,
    scoringProfileId = DEFAULT_SCORING_PROFILE_ID,
  } = body || {};
  if (!name || !storeHash || !accessToken) {
    return NextResponse.json(
      { error: "name, storeHash and accessToken are required" },
      { status: 400 }
    );
  }
  if (!getScoringProfileForUser(user.id, scoringProfileId)) {
    return NextResponse.json({ error: "Unknown scoring profile" }, { status: 400 });
  }
  const env = createEnvironment(user.id, {
    name,
    storeHash,
    accessToken,
    scoringProfileId,
  });
  return NextResponse.json(redactEnvironment(env), { status: 201 });
}
