import PDFDocument from "pdfkit";
import {
  COLORS,
  CONTENT_WIDTH,
  PAGE,
  clean,
  createRenderer,
  drawDimensionChart,
  drawGradeChart,
  drawStat,
  formatDate,
  formatDuration,
  scoringMetadataEntries,
  titleCase,
} from "./common.js";

/** Build a complete analysis report and resolve with its PDF bytes. */
export function createReportPdf({ analysis, environmentName }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const generatedAt = new Date();
    const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, info: {
      Title: `Catalog Health report - ${clean(environmentName)}`,
      Author: "Catalog Health",
      Subject: "Catalog quality analysis report",
    } });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const summary = analysis.summary || {};
    const renderer = createRenderer(doc, { environmentName, generatedAt });
    const distribution = summary.gradeDist || {};
    const passing = (distribution.A || 0) + (distribution.B || 0) + (distribution.C || 0);
    const belowC = (distribution.D || 0) + (distribution.F || 0);
    const productCount = summary.productCount || 0;
    const passRate = productCount ? Math.round((passing / productCount) * 100) : 0;

    renderer.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(25)
      .fillColor(COLORS.ink)
      .text("Catalog health report", PAGE.margin, doc.y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.soft)
      .text(clean(environmentName), PAGE.margin, doc.y + 5)
      .text(`Analysis started ${formatDate(analysis.createdAt)} UTC`, PAGE.margin, doc.y + 3);
    const duration = formatDuration(analysis.durationMs);
    if (duration) doc.text(`Completed in ${duration}`, PAGE.margin, doc.y + 3);
    if (analysis.scoringMetadata) {
      const metadata = analysis.scoringMetadata;
      const profile = metadata.profile || {};
      const semantic = metadata.semantic || {};
      const semanticText = semantic.applied
        ? ` | semantic ${semantic.judgeLabel || semantic.model || "judge"} | prompt ${semantic.promptVersion}`
        : "";
      doc.text(
        `Scoring engine ${metadata.engineVersion} | ${profile.id || "profile"} ${profile.version || ""}${semanticText}`,
        PAGE.margin,
        doc.y + 3
      );
    }
    doc.y += 20;

    const statGap = 8;
    const statWidth = (CONTENT_WIDTH - statGap * 3) / 4;
    const statY = doc.y;
    drawStat(doc, PAGE.margin, statY, statWidth, "Health score", `${summary.overall ?? 0} / 100`, COLORS.grades[summary.grade] || COLORS.signal);
    drawStat(doc, PAGE.margin + (statWidth + statGap), statY, statWidth, "Products", productCount);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 2, statY, statWidth, "At C or better", `${passRate}%`, COLORS.grades.A);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 3, statY, statWidth, "Below C", belowC, COLORS.grades.F);
    doc.y = statY + 78;

    const chartGap = 24;
    const chartWidth = (CONTENT_WIDTH - chartGap) / 2;
    const dimensionCount = Object.keys(summary.dimensionAverages || {}).length;
    const chartHeight = Math.max(135, 45 + dimensionCount * 20);
    renderer.ensureSpace(chartHeight + 25);
    const chartY = doc.y;
    drawGradeChart(doc, summary, PAGE.margin, chartY, chartWidth, chartHeight);
    drawDimensionChart(doc, summary, PAGE.margin + chartWidth + chartGap, chartY, chartWidth);
    doc.y = chartY + chartHeight + 23;

    renderer.sectionTitle(
      "Scoring metadata",
      "The exact scoring configuration captured when this analysis ran."
    );
    if (analysis.scoringMetadata) {
      renderer.table({
        columns: [
          { key: "group", label: "Group", width: 125, bold: true, fontSize: 7.5 },
          { key: "setting", label: "Setting", width: 202, fontSize: 7.5 },
          { key: "value", label: "Value", width: 180, fontSize: 7.5 },
        ],
        rows: scoringMetadataEntries(analysis.scoringMetadata),
      });
    } else {
      renderer.table({
        columns: [{ key: "message", label: "Status", width: CONTENT_WIDTH }],
        rows: [{ message: "This legacy analysis predates scoring metadata snapshots." }],
      });
    }

    renderer.ensureSpace(100);
    renderer.sectionTitle("Most common issues", "The ten issue types affecting the most products.");
    renderer.table({
      columns: [
        { key: "issue", label: "Issue", width: 355, bold: true },
        { key: "count", label: "Products affected", width: 152, align: "right" },
      ],
      rows: (summary.issueFrequency || []).slice(0, 10).map(({ issue, count }) => ({
        issue: titleCase(issue),
        count: `${count} (${productCount ? Math.round((count / productCount) * 100) : 0}%)`,
      })),
    });

    renderer.ensureSpace(100);
    renderer.sectionTitle("Weakest categories", "Categories ordered by average health score.");
    renderer.table({
      columns: [
        { key: "categoryName", label: "Category", width: 235, bold: true },
        { key: "products", label: "Products", width: 67, align: "right" },
        { key: "avgScore", label: "Avg score", width: 72, align: "right" },
        { key: "grade", label: "Grade", width: 55, align: "center", bold: true, color: (row) => COLORS.grades[row.grade] },
        { key: "pctFailing", label: "Below C", width: 78, align: "right" },
      ],
      rows: (summary.categoryRollup || []).slice(0, 8).map((row) => ({
        ...row,
        pctFailing: `${row.pctFailing}%`,
      })),
    });

    renderer.ensureSpace(100);
    renderer.sectionTitle(
      "Top fixes",
      "Ten highest-priority products based on issue severity, traffic, and sales impact."
    );
    renderer.table({
      minRowHeight: 28,
      columns: [
        { key: "name", label: "Product", width: 142, bold: true, fontSize: 7.5 },
        { key: "sku", label: "SKU", width: 65, fontSize: 7.5 },
        { key: "overall", label: "Score", width: 42, align: "right" },
        { key: "grade", label: "Grade", width: 43, align: "center", bold: true, color: (row) => COLORS.grades[row.grade] },
        { key: "impact", label: "Impact", width: 55, align: "right" },
        { key: "issues", label: "Leading issues", width: 160, fontSize: 7.2 },
      ],
      rows: (summary.topFixes || []).slice(0, 10).map((row) => ({
        ...row,
        issues: (row.issues || []).slice(0, 3).map(titleCase).join(", "),
      })),
    });

    if (analysis.warning) {
      renderer.ensureSpace(55);
      doc.roundedRect(PAGE.margin, doc.y, CONTENT_WIDTH, 42, 4).fill(COLORS.signalSoft);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(COLORS.signal)
        .text("ANALYSIS NOTE", PAGE.margin + 12, doc.y + 9);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.ink)
        .text(clean(analysis.warning), PAGE.margin + 12, doc.y + 4, { width: CONTENT_WIDTH - 24 });
    }

    renderer.finishFooters();
    doc.end();
  });
}
