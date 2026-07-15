import { requireUser } from "@/lib/auth-helpers";
import { loadAccountStatistics } from "@/lib/account-statistics";
import { createStatisticsReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";

function timestampPart(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function GET() {
  const user = await requireUser();
  const { stats } = loadAccountStatistics(user.id);
  const pdf = await createStatisticsReportPdf({ stats });
  const filename = `catalog-health-statistics-${timestampPart()}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
    },
  });
}
