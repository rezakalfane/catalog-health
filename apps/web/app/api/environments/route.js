import { NextResponse } from "next/server";
import {
  listEnvironments,
  createEnvironment,
  redactEnvironment,
} from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listEnvironments(user.id).map(redactEnvironment));
}

export async function POST(request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { name, storeHash, accessToken } = body || {};
  if (!name || !storeHash || !accessToken) {
    return NextResponse.json(
      { error: "name, storeHash and accessToken are required" },
      { status: 400 }
    );
  }
  const env = createEnvironment(user.id, { name, storeHash, accessToken });
  return NextResponse.json(redactEnvironment(env), { status: 201 });
}
