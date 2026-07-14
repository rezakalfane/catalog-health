import { NextResponse } from "next/server";
import {
  isScoringProfileId,
  normalizeScoringProfileInput,
} from "@catalog-health/core/profiles";
import { getApiUser } from "@/lib/auth-helpers";
import {
  deleteCustomScoringProfile,
  getScoringProfileForUser,
  updateCustomScoringProfile,
} from "@/lib/db";

export async function GET(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const profile = getScoringProfileForUser(user.id, id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PUT(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (isScoringProfileId(id)) {
    return NextResponse.json({ error: "Built-in scoring profiles are read-only" }, { status: 403 });
  }
  try {
    const input = normalizeScoringProfileInput(await request.json());
    const profile = updateCustomScoringProfile(user.id, id, input);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid scoring profile" }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (isScoringProfileId(id)) {
    return NextResponse.json({ error: "Built-in scoring profiles cannot be removed" }, { status: 403 });
  }
  const result = deleteCustomScoringProfile(user.id, id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
