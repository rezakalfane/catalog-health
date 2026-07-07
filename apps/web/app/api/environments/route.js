import { NextResponse } from "next/server";
import {
  listEnvironments,
  createEnvironment,
  redactEnvironment,
} from "@/lib/db";

export async function GET() {
  return NextResponse.json(listEnvironments().map(redactEnvironment));
}

export async function POST(request) {
  const body = await request.json();
  const { name, storeHash, accessToken } = body || {};
  if (!name || !storeHash || !accessToken) {
    return NextResponse.json(
      { error: "name, storeHash and accessToken are required" },
      { status: 400 }
    );
  }
  const env = createEnvironment({ name, storeHash, accessToken });
  return NextResponse.json(redactEnvironment(env), { status: 201 });
}
