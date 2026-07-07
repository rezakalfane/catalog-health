import { NextResponse } from "next/server";
import { getAnalysis } from "@/lib/db";

export async function GET(request, { params }) {
  const { id } = await params;
  const analysis = getAnalysis(id);
  if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(analysis);
}
