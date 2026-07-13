import { getAnalysis, getEnvironment } from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { createReportPdf } from "@/lib/report-pdf";

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

export async function GET(request, { params }) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const analysis = getAnalysis(user.id, id);
  if (!analysis) return Response.json({ error: "Not found" }, { status: 404 });
  if ((analysis.status || "done") !== "done" || !analysis.summary) {
    return Response.json({ error: "The report is not ready to export" }, { status: 409 });
  }

  const environmentName = analysis.environmentId === "demo"
    ? "Demo catalog"
    : getEnvironment(user.id, analysis.environmentId)?.name || "Catalog";
  const pdf = await createReportPdf({ analysis, environmentName });
  const timestamp = filenameTimestamp(analysis.createdAt);
  const analysisRef = filenamePart(analysis.id).slice(0, 8);
  const filename = `catalog-health-${filenamePart(environmentName)}-${timestamp}-${analysisRef}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
