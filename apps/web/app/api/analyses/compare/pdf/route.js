import { getAnalysis, getAnalysisRows, getEnvironment, analysisStatus } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { compareAnalyses } from "@/lib/compare";
import { createComparisonReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";

function filenamePart(value) {
  return String(value || "catalog")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "catalog";
}

function filenameTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-time";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
}

export async function GET(request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const baseId = url.searchParams.get("base");
  const targetId = url.searchParams.get("target");
  if (!baseId || !targetId) {
    return Response.json({ error: "base and target analysis ids are required" }, { status: 400 });
  }
  if (baseId === targetId) {
    return Response.json({ error: "Choose two different analyses to compare" }, { status: 400 });
  }

  const base = getAnalysis(user.id, baseId);
  const target = getAnalysis(user.id, targetId);
  if (!base || !target) return Response.json({ error: "Analysis not found" }, { status: 404 });
  if (analysisStatus(base) !== "done" || analysisStatus(target) !== "done") {
    return Response.json({ error: "Only completed analyses can be exported" }, { status: 400 });
  }
  if (base.environmentId !== target.environmentId) {
    return Response.json({ error: "Analyses must belong to the same environment" }, { status: 400 });
  }

  const baseRows = base.hasRows ? getAnalysisRows(user.id, base.id) : [];
  const targetRows = target.hasRows ? getAnalysisRows(user.id, target.id) : [];
  const comparison = compareAnalyses({ base, target, baseRows, targetRows });
  const environmentName = target.environmentId === "demo"
    ? "Demo catalog"
    : getEnvironment(user.id, target.environmentId)?.name || "Catalog";
  const pdf = await createComparisonReportPdf({ comparison, environmentName });
  const timestamp = filenameTimestamp(target.createdAt);
  const baseRef = filenamePart(base.id).slice(0, 8);
  const targetRef = filenamePart(target.id).slice(0, 8);
  const filename = `catalog-health-comparison-${filenamePart(environmentName)}-${timestamp}-${baseRef}-to-${targetRef}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
