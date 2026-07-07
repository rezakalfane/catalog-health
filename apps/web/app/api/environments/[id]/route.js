import { NextResponse } from "next/server";
import {
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
  redactEnvironment,
} from "@/lib/db";

export async function GET(request, { params }) {
  const { id } = await params;
  const env = getEnvironment(id);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactEnvironment(env));
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const patch = await request.json();
  const env = updateEnvironment(id, patch);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactEnvironment(env));
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  deleteEnvironment(id);
  return NextResponse.json({ ok: true });
}
