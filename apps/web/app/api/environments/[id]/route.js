import { NextResponse } from "next/server";
import {
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
  redactEnvironment,
} from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";

export async function GET(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const env = getEnvironment(user.id, id);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactEnvironment(env));
}

export async function PUT(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const patch = await request.json();
  const env = updateEnvironment(user.id, id, patch);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactEnvironment(env));
}

export async function DELETE(request, { params }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  deleteEnvironment(user.id, id);
  return NextResponse.json({ ok: true });
}
