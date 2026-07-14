import {
  getAnalysis,
  getAnalysisProduct,
  getEnvironment,
  getProductAiAnalysis,
} from "@/lib/db";
import { getApiUser } from "@/lib/auth-helpers";
import { createProductReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";

function filenamePart(value) {
  return String(value || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "product";
}

function filenameTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-time";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
}

export async function GET(_request, { params }) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, productId } = await params;
  const analysis = getAnalysis(user.id, id);
  if (!analysis) return Response.json({ error: "Analysis not found" }, { status: 404 });
  if ((analysis.status || "done") !== "done" || !analysis.hasRows) {
    return Response.json({ error: "The product report is not ready to export" }, { status: 409 });
  }
  const product = getAnalysisProduct(user.id, id, productId);
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });

  const environmentName = analysis.environmentId === "demo"
    ? "Demo catalog"
    : getEnvironment(user.id, analysis.environmentId)?.name || "Catalog";
  const categoryNames = new Map(
    (analysis.catalog?.categories || []).map((category) => [String(category.id), category.name])
  );
  const categories = (product.categories || []).map((categoryId) => ({
    id: categoryId,
    name: categoryNames.get(String(categoryId)) || `Category ${categoryId}`,
  }));
  const aiReview = getProductAiAnalysis(user.id, id, productId);
  const pdf = await createProductReportPdf({
    analysis,
    product,
    environmentName,
    categories,
    aiReview,
  });
  const filename = [
    "catalog-health-product",
    filenamePart(product.sku || product.name || product.id),
    filenameTimestamp(analysis.createdAt),
    filenamePart(analysis.id).slice(0, 8),
  ].join("-") + ".pdf";

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
