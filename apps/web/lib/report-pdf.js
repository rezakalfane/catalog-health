import PDFDocument from "pdfkit";

const COLORS = {
  ink: "#131c30",
  soft: "#46506a",
  paper: "#fafbfd",
  line: "#e3e7f0",
  signal: "#3b5eea",
  signalSoft: "#eaeefd",
  changedSoft: "#fff8e8",
  changedInk: "#72510a",
  white: "#ffffff",
  grades: {
    A: "#158a5c",
    B: "#4d9e3f",
    C: "#d9930d",
    D: "#d96a1e",
    F: "#cc3e55",
  },
};

const PAGE = { width: 595.28, height: 841.89, margin: 44 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

function clean(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e]/g, "?");
}

function titleCase(value) {
  const text = clean(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(ms) {
  if (ms == null) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function createRenderer(doc, meta) {
  function addPage() {
    doc.addPage({ size: "A4", margins: { top: 60, right: 44, bottom: 48, left: 44 } });
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.white);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLORS.ink)
      .text("CATALOG HEALTH", PAGE.margin, 28, { characterSpacing: 0.7 });
    doc
      .font("Helvetica")
      .fillColor(COLORS.soft)
      .text(clean(meta.environmentName), PAGE.margin + 190, 28, {
        width: CONTENT_WIDTH - 190,
        align: "right",
      });
    doc
      .moveTo(PAGE.margin, 44)
      .lineTo(PAGE.width - PAGE.margin, 44)
      .strokeColor(COLORS.line)
      .lineWidth(0.7)
      .stroke();
    doc.y = 60;
  }

  function ensureSpace(height) {
    if (doc.y + height > PAGE.height - 54) addPage();
  }

  function sectionTitle(title, subtitle) {
    ensureSpace(subtitle ? 43 : 29);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(COLORS.ink)
      .text(clean(title), PAGE.margin, doc.y);
    if (subtitle) {
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLORS.soft)
        .text(clean(subtitle), PAGE.margin, doc.y + 3);
    }
    doc.y += 10;
  }

  function table({ columns, rows, minRowHeight = 22, rowFill }) {
    const x = PAGE.margin;
    const headerHeight = 23;

    function header() {
      const headerY = doc.y;
      doc.rect(x, headerY, CONTENT_WIDTH, headerHeight).fill(COLORS.paper);
      let cellX = x;
      for (const column of columns) {
        doc
          .font("Helvetica-Bold")
          .fontSize(7.3)
          .fillColor(COLORS.soft)
          .text(clean(column.label).toUpperCase(), cellX + 6, headerY + 8, {
            width: column.width - 12,
            align: column.align || "left",
            lineBreak: false,
          });
        cellX += column.width;
      }
      doc.y = headerY + headerHeight;
    }

    ensureSpace(headerHeight + minRowHeight);
    header();
    for (const row of rows) {
      const heights = columns.map((column) =>
        doc
          .font(column.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(column.fontSize || 8)
          .heightOfString(clean(row[column.key]), { width: column.width - 12, lineGap: 1 })
      );
      const rowHeight = Math.max(minRowHeight, Math.max(...heights) + 12);
      if (doc.y + rowHeight > PAGE.height - 54) {
        addPage();
        header();
      }
      const rowY = doc.y;
      const fill = rowFill?.(row);
      if (fill) doc.rect(x, rowY, CONTENT_WIDTH, rowHeight).fill(fill);
      let cellX = x;
      for (const column of columns) {
        const value = clean(row[column.key]);
        doc
          .font(column.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(column.fontSize || 8)
          .fillColor(column.color?.(row) || COLORS.ink)
          .text(value, cellX + 6, rowY + 6, {
            width: column.width - 12,
            align: column.align || "left",
            lineGap: 1,
          });
        cellX += column.width;
      }
      doc
        .moveTo(x, rowY + rowHeight)
        .lineTo(x + CONTENT_WIDTH, rowY + rowHeight)
        .strokeColor(COLORS.line)
        .lineWidth(0.5)
        .stroke();
      doc.y = rowY + rowHeight;
    }
    doc.y += 18;
  }

  function finishFooters() {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.soft)
        .text(`Generated ${formatDate(meta.generatedAt)} UTC`, PAGE.margin, PAGE.height - 32, {
          width: CONTENT_WIDTH / 2,
          lineBreak: false,
        })
        .text(`Page ${i + 1} of ${range.count}`, PAGE.margin + CONTENT_WIDTH / 2, PAGE.height - 32, {
          width: CONTENT_WIDTH / 2,
          align: "right",
          lineBreak: false,
        });
      doc.page.margins.bottom = bottomMargin;
    }
  }

  return { addPage, ensureSpace, sectionTitle, table, finishFooters };
}

function percent(value) {
  return value == null ? "-" : `${Math.round(Number(value) * 100)}%`;
}

function yesNo(value) {
  return value == null ? "-" : value ? "Yes" : "No";
}

function metadataLabel(value) {
  return titleCase(String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

function scoringMetadataEntries(metadata) {
  if (!metadata) return [];
  const profile = metadata.profile || {};
  const semantic = metadata.semantic || {};
  const entries = [
    ["Versions", "Metadata schema", metadata.schemaVersion],
    ["Versions", "Scoring engine", metadata.engineVersion],
    ["Versions", "Scoring profile", profile.id],
    ["Versions", "Profile version", profile.version],
    ...Object.entries(profile.dimensionWeights || {}).map(([name, value]) => [
      "Dimension weights",
      metadataLabel(name),
      percent(value),
    ]),
    ...Object.entries(profile.thresholds || {}).map(([name, value]) => [
      "Scoring thresholds",
      metadataLabel(name),
      value,
    ]),
    ["Semantic scoring", "Requested", yesNo(semantic.requested)],
    ["Semantic scoring", "Applied", yesNo(semantic.applied)],
    ["Semantic scoring", "Score weight", percent(profile.semanticWeight)],
    ["Semantic scoring", "Prompt version", semantic.promptVersion],
    ["Semantic scoring", "Provider", semantic.provider],
    ["Semantic scoring", "Model", semantic.model],
    ["Semantic scoring", "Judge", semantic.judgeLabel],
  ];

  return entries.map(([group, setting, value]) => ({
    group,
    setting,
    value: value ?? "-",
  }));
}

function comparisonScoringMetadataEntries(base, target) {
  const baseEntries = scoringMetadataEntries(base);
  const targetEntries = scoringMetadataEntries(target);
  const baseByKey = new Map(baseEntries.map((entry) => [`${entry.group}:${entry.setting}`, entry]));
  const targetByKey = new Map(targetEntries.map((entry) => [`${entry.group}:${entry.setting}`, entry]));
  const keys = [...new Set([...baseByKey.keys(), ...targetByKey.keys()])];

  return keys.map((key) => {
    const previous = baseByKey.get(key);
    const current = targetByKey.get(key);
    const baseValue = previous?.value ?? "-";
    const targetValue = current?.value ?? "-";
    return {
      group: current?.group || previous?.group,
      setting: current?.setting || previous?.setting,
      base: baseValue,
      target: targetValue,
      status: baseValue === targetValue ? "" : "Changed",
      changed: baseValue !== targetValue,
    };
  });
}

function drawStat(doc, x, y, width, label, value, accent = COLORS.signal) {
  doc.roundedRect(x, y, width, 57, 4).fillAndStroke(COLORS.white, COLORS.line);
  doc.rect(x, y, 4, 57).fill(accent);
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(COLORS.ink)
    .text(clean(value), x + 13, y + 11, { width: width - 20, height: 21 });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.soft)
    .text(clean(label).toUpperCase(), x + 13, y + 37, {
      width: width - 20,
      characterSpacing: 0.3,
      lineBreak: false,
    });
}

function drawGradeChart(doc, summary, x, y, width, height) {
  const distribution = summary.gradeDist || {};
  const grades = ["A", "B", "C", "D", "F"];
  const max = Math.max(1, ...grades.map((grade) => distribution[grade] || 0));
  const plotTop = y + 29;
  const plotHeight = height - 55;
  const gap = 12;
  const barWidth = (width - gap * 6) / 5;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text("Grade distribution", x, y);
  grades.forEach((grade, index) => {
    const count = distribution[grade] || 0;
    const barHeight = (count / max) * (plotHeight - 15);
    const barX = x + gap + index * (barWidth + gap);
    const barY = plotTop + plotHeight - barHeight;
    doc.roundedRect(barX, barY, barWidth, barHeight || 1, 2).fill(COLORS.grades[grade]);
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLORS.ink)
      .text(String(count), barX, Math.max(plotTop, barY - 12), { width: barWidth, align: "center" });
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.grades[grade])
      .text(grade, barX, plotTop + plotHeight + 7, { width: barWidth, align: "center" });
  });
}

function drawDimensionChart(doc, summary, x, y, width) {
  const dimensions = Object.entries(summary.dimensionAverages || {});
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text("Dimension averages", x, y);
  dimensions.forEach(([name, score], index) => {
    const rowY = y + 27 + index * 20;
    const trackX = x + 78;
    const trackWidth = width - 110;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.soft)
      .text(titleCase(name), x, rowY - 1, { width: 72, lineBreak: false });
    doc.roundedRect(trackX, rowY, trackWidth, 7, 3).fill(COLORS.line);
    doc
      .roundedRect(trackX, rowY, Math.max(1, trackWidth * (Math.min(100, Number(score) || 0) / 100)), 7, 3)
      .fill(COLORS.signal);
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLORS.ink)
      .text(String(score), trackX + trackWidth + 5, rowY - 1, { width: 27, align: "right" });
  });
}

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

function signed(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number}`;
}

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
