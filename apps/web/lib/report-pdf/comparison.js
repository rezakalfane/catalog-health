import PDFDocument from "pdfkit";
import {
  COLORS,
  CONTENT_WIDTH,
  PAGE,
  clean,
  comparisonScoringMetadataEntries,
  createRenderer,
  drawStat,
  formatDate,
  signed,
  titleCase,
} from "./common.js";

/** Build an analysis-comparison report and resolve with its PDF bytes. */
export function createComparisonReportPdf({ comparison, environmentName }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const generatedAt = new Date();
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: `Catalog Health comparison - ${clean(environmentName)}`,
        Author: "Catalog Health",
        Subject: "Catalog quality analysis comparison report",
      },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const renderer = createRenderer(doc, { environmentName, generatedAt });
    const changedProducts = (comparison.products || [])
      .filter((product) => product.status === "changed")
      .sort((a, b) => b.scoreDelta - a.scoreDelta || String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 15);

    renderer.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(25)
      .fillColor(COLORS.ink)
      .text("Catalog health comparison", PAGE.margin, doc.y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.soft)
      .text(clean(environmentName), PAGE.margin, doc.y + 5)
      .text(`Previous analysis: ${formatDate(comparison.base.createdAt)} UTC`, PAGE.margin, doc.y + 3)
      .text(`Current analysis: ${formatDate(comparison.target.createdAt)} UTC`, PAGE.margin, doc.y + 3);
    doc.y += 20;

    const statGap = 10;
    const statWidth = (CONTENT_WIDTH - statGap * 2) / 3;
    const statY = doc.y;
    drawStat(
      doc,
      PAGE.margin,
      statY,
      statWidth,
      `Overall score (${signed(comparison.summary.score.delta)})`,
      `${comparison.summary.score.base} -> ${comparison.summary.score.target}`,
      comparison.summary.score.delta >= 0 ? COLORS.grades.A : COLORS.grades.F
    );
    drawStat(
      doc,
      PAGE.margin + statWidth + statGap,
      statY,
      statWidth,
      "Grade change",
      `${comparison.summary.grade.base} -> ${comparison.summary.grade.target}`,
      COLORS.grades[comparison.summary.grade.target] || COLORS.signal
    );
    drawStat(
      doc,
      PAGE.margin + (statWidth + statGap) * 2,
      statY,
      statWidth,
      `Products (${signed(comparison.summary.products.delta)})`,
      `${comparison.summary.products.base} -> ${comparison.summary.products.target}`
    );
    doc.y = statY + 78;

    if (!comparison.summary.scoring.comparable) {
      renderer.ensureSpace(58);
      const noteY = doc.y;
      doc.roundedRect(PAGE.margin, noteY, CONTENT_WIDTH, 43, 4).fill(COLORS.signalSoft);
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(COLORS.signal)
        .text("SCORING NOTE", PAGE.margin + 12, noteY + 9);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.ink)
        .text(
          comparison.summary.scoring.known
            ? `These analyses use different scoring configurations (${comparison.summary.scoring.differences.join(", ")}). Score changes may also reflect formula differences.`
            : "Scoring metadata is unavailable for one or both legacy analyses, so formula compatibility cannot be verified.",
          PAGE.margin + 12,
          noteY + 22,
          { width: CONTENT_WIDTH - 24 }
        );
      doc.y = noteY + 60;
    }

    renderer.sectionTitle(
      "Scoring metadata",
      "Previous and current scoring configurations. Changed values are shaded."
    );
    if (comparison.base.scoringMetadata && comparison.target.scoringMetadata) {
      renderer.table({
        minRowHeight: 21,
        rowFill: (row) => row.changed ? COLORS.changedSoft : null,
        columns: [
          { key: "group", label: "Group", width: 95, bold: true, fontSize: 7 },
          { key: "setting", label: "Setting", width: 122, fontSize: 7.2 },
          { key: "base", label: "Previous", width: 105, fontSize: 7.2 },
          { key: "target", label: "Current", width: 120, fontSize: 7.2 },
          {
            key: "status",
            label: "Status",
            width: 65,
            bold: true,
            fontSize: 6.8,
            color: (row) => row.changed ? COLORS.changedInk : COLORS.soft,
          },
        ],
        rows: comparisonScoringMetadataEntries(
          comparison.base.scoringMetadata,
          comparison.target.scoringMetadata
        ),
      });
    } else {
      renderer.table({
        columns: [{ key: "message", label: "Status", width: CONTENT_WIDTH }],
        rows: [{
          message: "Metadata is unavailable for one or both legacy analyses, so their scoring configurations cannot be compared.",
        }],
      });
    }

    renderer.sectionTitle("Dimension changes", "Average dimension scores across the two analyses.");
    renderer.table({
      columns: [
        { key: "dimension", label: "Dimension", width: 267, bold: true },
        { key: "base", label: "Previous", width: 80, align: "right" },
        { key: "target", label: "Current", width: 80, align: "right" },
        { key: "delta", label: "Change", width: 80, align: "right", bold: true },
      ],
      rows: (comparison.dimensions || []).map((row) => ({
        dimension: titleCase(row.dimension),
        base: row.base ?? "-",
        target: row.target ?? "-",
        delta: signed(row.delta),
      })),
    });

    renderer.sectionTitle("Issue changes", "The twenty issue types with the largest changes.");
    renderer.table({
      columns: [
        { key: "issue", label: "Issue", width: 267, bold: true },
        { key: "base", label: "Previous", width: 80, align: "right" },
        { key: "target", label: "Current", width: 80, align: "right" },
        { key: "delta", label: "Change", width: 80, align: "right", bold: true },
      ],
      rows: (comparison.issues || []).slice(0, 20).map((row) => ({
        issue: titleCase(row.issue),
        base: row.base,
        target: row.target,
        delta: signed(row.delta),
      })),
    });

    renderer.sectionTitle("Category changes", "The fifteen categories with the largest score changes.");
    renderer.table({
      columns: [
        { key: "category", label: "Category", width: 220, bold: true },
        { key: "score", label: "Score", width: 105, align: "right" },
        { key: "delta", label: "Change", width: 75, align: "right", bold: true },
        { key: "products", label: "Products", width: 107, align: "right" },
      ],
      rows: (comparison.categories || []).slice(0, 15).map((row) => ({
        category: row.categoryName,
        score: `${row.baseScore ?? "-"} -> ${row.targetScore ?? "-"}`,
        delta: signed(row.scoreDelta),
        products: `${row.baseProducts} -> ${row.targetProducts} (${signed(row.productDelta)})`,
      })),
    });

    renderer.sectionTitle(
      "Top product changes",
      "Changed products ordered by score change, highest first. Up to fifteen products."
    );
    renderer.table({
      minRowHeight: 28,
      columns: [
        { key: "product", label: "Product", width: 150, bold: true, fontSize: 7.2 },
        { key: "sku", label: "SKU", width: 58, fontSize: 7 },
        { key: "score", label: "Score", width: 84, align: "right", fontSize: 7.2 },
        { key: "grade", label: "Grade", width: 60, align: "center", bold: true, fontSize: 7.2, color: (row) => COLORS.grades[row.targetGrade] || COLORS.ink },
        { key: "issues", label: "Issues", width: 75, align: "right", fontSize: 7.2 },
        { key: "resolved", label: "Fixed", width: 40, align: "right", fontSize: 7.2 },
        { key: "added", label: "New", width: 40, align: "right", fontSize: 7.2 },
      ],
      rows: changedProducts.map((row) => ({
        product: row.name || `#${row.id}`,
        sku: row.sku,
        score: `${row.baseScore ?? "-"} -> ${row.targetScore ?? "-"} (${signed(row.scoreDelta)})`,
        grade: `${row.baseGrade ?? "-"} -> ${row.targetGrade ?? "-"}`,
        targetGrade: row.targetGrade,
        issues: `${row.baseIssues} -> ${row.targetIssues} (${signed(row.issueDelta)})`,
        resolved: (row.resolvedIssues || []).length,
        added: (row.addedIssues || []).length,
      })),
    });

    renderer.finishFooters();
    doc.end();
  });
}
