import PDFDocument from "pdfkit";
import { ISSUE_INFO, issueLabel } from "../components/issue-info.js";

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

export function normalizePdfText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replaceAll("_", " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}

const clean = normalizePdfText;

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

  function paragraph(value, {
    fontSize = 9,
    bold = false,
    color = COLORS.ink,
    gap = 8,
    indent = 0,
    lineGap = 2,
  } = {}) {
    const words = clean(value).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const width = CONTENT_WIDTH - indent;
    let offset = 0;
    while (offset < words.length) {
      ensureSpace(fontSize * 1.7);
      const available = PAGE.height - 54 - doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      let low = 1;
      let high = words.length - offset;
      let fit = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = words.slice(offset, offset + middle).join(" ");
        const height = doc.heightOfString(candidate, { width, lineGap });
        if (height <= available) {
          fit = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      const chunk = words.slice(offset, offset + fit).join(" ");
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize)
        .fillColor(color)
        .text(chunk, PAGE.margin + indent, doc.y, { width, lineGap });
      offset += fit;
      if (offset < words.length) addPage();
      else doc.y += gap;
    }
  }

  function bullets(items, options = {}) {
    for (const item of items || []) paragraph(`- ${item}`, { ...options, indent: 10, gap: 5 });
    if ((items || []).length) doc.y += 5;
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

  return { addPage, ensureSpace, sectionTitle, table, paragraph, bullets, finishFooters };
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
    ["Versions", "Profile name", profile.label],
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
    ["Semantic scoring", "Model configuration", semantic.configurationName],
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

const PDF_IMAGE_HOST = /(^|\.)bigcommerce\.(com|net)$/i;
const PDF_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

async function loadPdfImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !PDF_IMAGE_HOST.test(parsed.hostname)) return null;
  try {
    const response = await fetch(parsed, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const mediaType = (response.headers.get("content-type") || "").split(";")[0];
    if (!new Set(["image/jpeg", "image/png"]).has(mediaType)) return null;
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > PDF_IMAGE_MAX_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= PDF_IMAGE_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

function productDetailRows(product) {
  const details = product.details || {};
  return [
    { setting: "Product ID", value: product.id },
    { setting: "SKU", value: product.sku || "-" },
    { setting: "Title", value: `${product.name || "-"} (${(product.name || "").length} characters)` },
    { setting: "Description", value: details.descriptionChars ? `${details.descriptionChars} characters` : "Missing" },
    { setting: "Images", value: details.imageCount ? `${details.imageCount} (${details.imagesWithAlt || 0} with alt text)` : "None" },
    { setting: "Brand", value: details.hasBrand ? "Assigned" : "Not assigned" },
    { setting: "Custom fields", value: `${details.customFieldCount || 0}${details.peerMedianCustomFields ? ` (peer median ${details.peerMedianCustomFields})` : ""}` },
    { setting: "GTIN", value: details.gtin || "-" },
    { setting: "UPC", value: details.upc || "-" },
    { setting: "MPN", value: details.mpn || "-" },
    { setting: "Options / variants", value: details.optionCount ? `${details.optionCount} options, ${details.variantCount || 0} variants, ${details.incompleteVariants || 0} incomplete` : "None" },
    { setting: "Price", value: details.price > 0 ? `$${details.price}${details.salePrice ? ` (sale $${details.salePrice})` : ""}` : "0" },
    { setting: "Weight", value: details.weight > 0 ? details.weight : "Not set" },
    { setting: "Visibility / stock", value: `${details.isVisible ? "Visible" : "Hidden"}; tracking ${details.inventoryTracking || "unknown"}; level ${details.inventoryLevel ?? "-"}` },
  ];
}

function aiMetaRows(aiReview) {
  return [
    { setting: "Provider", value: aiReview.provider },
    {
      setting: "Model",
      value: aiReview.modelConfigurationName
        ? `${aiReview.modelConfigurationName} - ${aiReview.model}`
        : aiReview.model,
    },
    { setting: "Product source", value: aiReview.source },
    { setting: "Generated", value: `${formatDate(aiReview.generatedAt)} UTC` },
    { setting: "Visual analysis", value: aiReview.imageAnalysis ? "Applied" : "Not applied" },
    { setting: "Overall confidence", value: aiReview.result?.overallConfidence || "-" },
  ];
}

function drawAiImageCard(doc, renderer, image, imageBuffer) {
  const observations = (image.observations || []).map(clean).join("; ");
  const text = [
    image.role ? `Role: ${image.role}` : "",
    observations ? `Observations: ${observations}` : "",
    image.suggestedAltText ? `Suggested alt text: ${image.suggestedAltText}` : "",
  ].filter(Boolean).join(" | ");
  doc.font("Helvetica").fontSize(8);
  const textWidth = imageBuffer ? CONTENT_WIDTH - 126 : CONTENT_WIDTH - 20;
  const textHeight = doc.heightOfString(clean(text), { width: textWidth, lineGap: 2 });
  const height = Math.max(imageBuffer ? 108 : 54, textHeight + 38);
  renderer.ensureSpace(height + 8);
  const y = doc.y;
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, height, 4).fillAndStroke(COLORS.white, COLORS.line);
  let textX = PAGE.margin + 10;
  if (imageBuffer) {
    try {
      doc.image(imageBuffer, PAGE.margin + 9, y + 9, { fit: [90, 90], align: "center", valign: "center" });
      textX = PAGE.margin + 111;
    } catch {
      textX = PAGE.margin + 10;
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(`Image ${image.imageIndex} - ${image.qualityScore}/100`, textX, y + 10, {
      width: PAGE.margin + CONTENT_WIDTH - textX - 10,
    });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.soft)
    .text(clean(text), textX, doc.y + 5, {
      width: PAGE.margin + CONTENT_WIDTH - textX - 10,
      lineGap: 2,
    });
  doc.y = y + height + 8;
}

function drawAiProductRecommendation(doc, renderer, recommendation, imageBuffer) {
  const categories = (recommendation.categoryNames || []).join(" / ") || "Uncategorized";
  const hasSalePrice = Number(recommendation.salePrice) > 0;
  const price = Number(recommendation.price) > 0 ? `$${recommendation.price}` : "Price unavailable";
  const commercial = `${hasSalePrice ? `${price} -> $${recommendation.salePrice}` : price} | SKU ${recommendation.sku || "-"} | Product ${recommendation.productId}`;
  const textXOffset = imageBuffer ? 102 : 10;
  const textWidth = CONTENT_WIDTH - textXOffset - 10;
  doc.font("Helvetica-Bold").fontSize(9);
  const titleHeight = doc.heightOfString(clean(recommendation.title || `Product ${recommendation.productId}`), { width: textWidth });
  doc.font("Helvetica").fontSize(7.5);
  const metaHeight = doc.heightOfString(clean(`${categories}\n${commercial}`), { width: textWidth, lineGap: 1 });
  doc.font("Helvetica").fontSize(8);
  const reasonHeight = doc.heightOfString(clean(recommendation.reason || ""), { width: textWidth, lineGap: 2 });
  const height = Math.max(imageBuffer ? 98 : 68, titleHeight + metaHeight + reasonHeight + 34);
  renderer.ensureSpace(height + 8);
  const y = doc.y;
  doc.roundedRect(PAGE.margin, y, CONTENT_WIDTH, height, 4).fillAndStroke(COLORS.white, COLORS.line);
  let textX = PAGE.margin + 10;
  if (imageBuffer) {
    try {
      doc.image(imageBuffer, PAGE.margin + 9, y + 9, { fit: [80, 80], align: "center", valign: "center" });
      textX = PAGE.margin + 102;
    } catch {
      textX = PAGE.margin + 10;
    }
  }
  const width = PAGE.margin + CONTENT_WIDTH - textX - 10;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink)
    .text(clean(recommendation.title || `Product ${recommendation.productId}`), textX, y + 10, { width });
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.soft)
    .text(clean(categories), textX, doc.y + 3, { width })
    .text(clean(commercial), textX, doc.y + 2, { width });
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.ink)
    .text(clean(recommendation.reason || ""), textX, doc.y + 6, { width, lineGap: 2 });
  doc.y = y + height + 8;
}

/** Build a comprehensive single-product report, including a saved AI review. */
export async function createProductReportPdf({
  analysis,
  product,
  environmentName,
  categories = [],
  aiReview = null,
}) {
  const imageUrls = [
    product.details?.thumbnailUrl,
    ...(aiReview?.result?.imageReview?.images || []).map((image) => image.thumbnailUrl),
    ...(aiReview?.result?.productRecommendations || []).map((item) => item.thumbnailUrl),
  ].filter(Boolean);
  const loaded = await Promise.all([...new Set(imageUrls)].map(async (url) => [url, await loadPdfImage(url)]));
  const imageBuffers = new Map(loaded.filter(([, bytes]) => bytes));

  return new Promise((resolve, reject) => {
    const chunks = [];
    const generatedAt = new Date();
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: `Product health report - ${clean(product.name || product.id)}`,
        Author: "Catalog Health",
        Subject: "Product catalog quality and AI recommendations",
      },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const renderer = createRenderer(doc, { environmentName, generatedAt });
    renderer.addPage();
    const thumbnail = imageBuffers.get(product.details?.thumbnailUrl);
    if (thumbnail) {
      try {
        doc.image(thumbnail, PAGE.width - PAGE.margin - 82, 63, { fit: [82, 82], align: "center", valign: "center" });
      } catch {
        // The report remains complete when an image format is unreadable.
      }
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(23)
      .fillColor(COLORS.ink)
      .text("Product health report", PAGE.margin, doc.y, { width: thumbnail ? CONTENT_WIDTH - 100 : CONTENT_WIDTH });
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(COLORS.signal)
      .text(clean(product.name || `Product ${product.id}`), PAGE.margin, doc.y + 7, {
        width: thumbnail ? CONTENT_WIDTH - 100 : CONTENT_WIDTH,
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.soft)
      .text(`SKU ${clean(product.sku || "-")} | Product ${clean(product.id)}`, PAGE.margin, doc.y + 5)
      .text(`Analysis ${formatDate(analysis.createdAt)} UTC | ${clean(environmentName)}`, PAGE.margin, doc.y + 3)
      .text(aiReview ? `Includes AI Analysis generated ${formatDate(aiReview.generatedAt)} UTC` : "No saved AI Analysis was available at export time.", PAGE.margin, doc.y + 3);
    doc.y = Math.max(doc.y + 18, thumbnail ? 160 : doc.y + 18);

    const statGap = 9;
    const statWidth = (CONTENT_WIDTH - statGap * 3) / 4;
    const statY = doc.y;
    drawStat(doc, PAGE.margin, statY, statWidth, "Health score", `${product.overall} / 100`, COLORS.grades[product.grade] || COLORS.signal);
    drawStat(doc, PAGE.margin + (statWidth + statGap), statY, statWidth, "Grade", product.grade, COLORS.grades[product.grade] || COLORS.signal);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 2, statY, statWidth, "Impact", product.impact ?? 0);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 3, statY, statWidth, "Views / sold", `${product.viewCount || 0} / ${product.totalSold || 0}`);
    doc.y = statY + 78;

    renderer.sectionTitle("Dimension scores", "The product score captured by this analysis.");
    renderer.table({
      columns: [
        { key: "dimension", label: "Dimension", width: 330, bold: true },
        { key: "score", label: "Score", width: 177, align: "right", bold: true },
      ],
      rows: Object.entries(product.scores || {}).map(([dimension, score]) => ({
        dimension: titleCase(dimension),
        score: `${score} / 100`,
      })),
    });

    renderer.sectionTitle("Product details", "Stored product facts used for scoring.");
    renderer.table({
      columns: [
        { key: "setting", label: "Field", width: 160, bold: true },
        { key: "value", label: "Value", width: 347 },
      ],
      rows: productDetailRows(product),
    });
    if (product.details?.descriptionExcerpt) {
      renderer.paragraph(`Description excerpt: ${product.details.descriptionExcerpt}`);
    }

    renderer.sectionTitle("Categories", "Category assignments captured by the analysis.");
    renderer.table({
      columns: [
        { key: "id", label: "ID", width: 90 },
        { key: "name", label: "Category", width: 417, bold: true },
      ],
      rows: categories.length ? categories : [{ id: "-", name: "Not assigned to any category" }],
    });

    renderer.sectionTitle("Issues", `${(product.issues || []).length} scoring issue(s) found for this product.`);
    renderer.table({
      minRowHeight: 30,
      columns: [
        { key: "issue", label: "Issue", width: 135, bold: true, fontSize: 7.5 },
        { key: "dimension", label: "Dimension", width: 70, fontSize: 7.2 },
        { key: "fix", label: "Recommended fix", width: 302, fontSize: 7.5 },
      ],
      rows: (product.issues || []).length
        ? product.issues.map((code) => ({
            issue: issueLabel(code),
            dimension: titleCase(ISSUE_INFO[code]?.dimension || "-"),
            fix: ISSUE_INFO[code]?.fix || "Review this product field.",
          }))
        : [{ issue: "No issues", dimension: "-", fix: "This product passes every scoring check." }],
    });

    if (product.semantic) {
      renderer.sectionTitle("Semantic review", "Description judgments captured during the analysis.");
      const criteria = [
        ["what_it_is", "What is it?"],
        ["who_its_for", "Who is it for?"],
        ["made_of", "What is it made of?"],
      ];
      renderer.table({
        minRowHeight: 28,
        columns: [
          { key: "question", label: "Question", width: 125, bold: true },
          { key: "verdict", label: "Verdict", width: 65, bold: true },
          { key: "reason", label: "Reason", width: 317 },
        ],
        rows: product.semantic.unevaluated
          ? [{ question: "Status", verdict: "Not evaluated", reason: product.semantic.what_it_is?.reason || "No semantic result." }]
          : criteria.map(([key, question]) => ({
              question,
              verdict: titleCase(product.semantic[key]?.verdict || "-"),
              reason: product.semantic[key]?.reason || "-",
            })),
      });
    }

    renderer.ensureSpace(150);
    renderer.sectionTitle("AI Analysis", aiReview
      ? "Saved merchant recommendations generated for this product. Verify facts and claims before publishing."
      : "No saved AI Analysis was available when this PDF was generated.");
    if (!aiReview?.result) {
      renderer.paragraph("Run AI Analysis from the product detail page, then export again to include the generated recommendations.");
      renderer.finishFooters();
      doc.end();
      return;
    }

    const ai = aiReview.result;
    renderer.table({
      columns: [
        { key: "setting", label: "AI metadata", width: 160, bold: true },
        { key: "value", label: "Value", width: 347 },
      ],
      rows: aiMetaRows(aiReview),
    });
    renderer.paragraph("Executive summary", { bold: true, fontSize: 11, color: COLORS.signal, gap: 5 });
    renderer.paragraph(ai.executiveSummary);

    renderer.sectionTitle("Priority actions", "Recommendations ordered by expected merchant value.");
    renderer.table({
      minRowHeight: 36,
      columns: [
        { key: "priority", label: "Priority", width: 54, bold: true, fontSize: 7 },
        { key: "action", label: "Action", width: 113, bold: true, fontSize: 7.2 },
        { key: "recommendation", label: "Recommendation", width: 205, fontSize: 7.2 },
        { key: "evidence", label: "Evidence / effort", width: 135, fontSize: 7 },
      ],
      rows: (ai.priorityActions || []).map((action) => ({
        priority: titleCase(action.priority),
        action: action.title,
        recommendation: action.recommendation,
        evidence: `${action.evidence} | impact ${action.impact}; effort ${action.effort}${action.needsVerification ? "; verify" : ""}`,
      })),
    });

    renderer.sectionTitle("Title recommendations");
    renderer.paragraph(`Assessment: ${ai.title?.assessment || "-"}`);
    renderer.paragraph(`Suggested title: ${ai.title?.suggestedTitle || "-"}`, { bold: true });
    renderer.bullets((ai.title?.alternatives || []).map((value) => `Alternative: ${value}`));
    renderer.paragraph(`Rationale: ${ai.title?.rationale || "-"}`);

    renderer.sectionTitle("Description recommendations");
    renderer.paragraph(`Assessment: ${ai.description?.assessment || "-"}`);
    renderer.paragraph("Suggested short description", { bold: true, color: COLORS.signal, gap: 4 });
    renderer.paragraph(ai.description?.shortDescription || "-");
    renderer.paragraph("Rewritten product description", { bold: true, color: COLORS.signal, gap: 4 });
    renderer.paragraph(ai.description?.rewrittenDescription || "-");
    renderer.paragraph("Selling points", { bold: true, gap: 3 });
    renderer.bullets(ai.description?.sellingPoints || []);
    renderer.paragraph("Information still needed", { bold: true, gap: 3 });
    renderer.bullets(ai.description?.missingInformation || []);

    renderer.sectionTitle("Suggested fields", "Evidence-backed core, custom, and feed fields.");
    renderer.table({
      minRowHeight: 30,
      columns: [
        { key: "field", label: "Field", width: 95, bold: true, fontSize: 7.2 },
        { key: "value", label: "Value", width: 130, fontSize: 7.2 },
        { key: "type", label: "Type", width: 55, fontSize: 7 },
        { key: "confidence", label: "Confidence", width: 65, fontSize: 7 },
        { key: "evidence", label: "Evidence", width: 162, fontSize: 7 },
      ],
      rows: (ai.derivedFields || []).map((field) => ({
        field: field.field,
        value: `${field.value}${field.needsVerification ? " (verify)" : ""}`,
        type: field.fieldType,
        confidence: field.confidence,
        evidence: field.evidence,
      })),
    });

    renderer.sectionTitle("Placement and merchandising");
    renderer.table({
      minRowHeight: 28,
      columns: [
        { key: "category", label: "Suggested category", width: 190, bold: true },
        { key: "id", label: "ID", width: 55, align: "right" },
        { key: "rationale", label: "Rationale", width: 262 },
      ],
      rows: (ai.placement?.suggestedCategories || []).map((category) => ({
        category: `${category.name}${category.isNewCategory ? " (new)" : ""}`,
        id: category.categoryId ?? "-",
        rationale: category.rationale,
      })),
    });
    renderer.paragraph("Suggested collections", { bold: true, gap: 3 });
    renderer.bullets(ai.placement?.merchandisingCollections || []);
    renderer.paragraph("Cross-sell ideas", { bold: true, gap: 3 });
    renderer.bullets(ai.placement?.crossSellIdeas || []);

    renderer.sectionTitle("Product recommendations", "Catalog-grounded complementary, substitute, and adjacent products.");
    if ((ai.productRecommendations || []).length) {
      for (const recommendation of ai.productRecommendations) {
        drawAiProductRecommendation(doc, renderer, recommendation, imageBuffers.get(recommendation.thumbnailUrl));
      }
    } else {
      renderer.paragraph("No sufficiently relevant catalog products were identified.");
    }

    renderer.sectionTitle("Feed, SEO and discovery");
    renderer.table({
      columns: [
        { key: "setting", label: "Field", width: 145, bold: true },
        { key: "value", label: "Suggested value", width: 362 },
      ],
      rows: [
        { setting: "Google product category", value: ai.feedAndDiscovery?.googleProductCategory || "-" },
        { setting: "Product type", value: ai.feedAndDiscovery?.productType || "-" },
        { setting: "SEO title", value: ai.feedAndDiscovery?.seoTitle || "-" },
        { setting: "SEO description", value: ai.feedAndDiscovery?.seoDescription || "-" },
        { setting: "Search terms", value: (ai.feedAndDiscovery?.searchTerms || []).join(", ") || "-" },
      ],
    });
    renderer.table({
      minRowHeight: 28,
      columns: [
        { key: "name", label: "Feed attribute", width: 100, bold: true, fontSize: 7.2 },
        { key: "value", label: "Value", width: 145, fontSize: 7.2 },
        { key: "confidence", label: "Confidence", width: 70, fontSize: 7 },
        { key: "evidence", label: "Evidence", width: 192, fontSize: 7 },
      ],
      rows: (ai.feedAndDiscovery?.attributes || []).map((attribute) => ({
        name: attribute.name,
        value: `${attribute.value}${attribute.needsVerification ? " (verify)" : ""}`,
        confidence: attribute.confidence,
        evidence: attribute.evidence,
      })),
    });
    renderer.paragraph("Identifier warnings", { bold: true, gap: 3 });
    renderer.bullets(ai.feedAndDiscovery?.identifierWarnings || []);

    renderer.sectionTitle("Image review", ai.imageReview?.performed
      ? "Visual quality, content, accessibility, and merchandising review."
      : "The selected model did not visually inspect product images.");
    renderer.paragraph(ai.imageReview?.summary || "No image review summary.");
    if (ai.imageReview?.heroImageIndex != null) {
      renderer.paragraph(`Recommended hero image: ${ai.imageReview.heroImageIndex}`, { bold: true });
    }
    for (const image of ai.imageReview?.images || []) {
      drawAiImageCard(doc, renderer, image, imageBuffers.get(image.thumbnailUrl));
    }
    renderer.paragraph("Missing shots", { bold: true, gap: 3 });
    renderer.bullets(ai.imageReview?.missingShots || []);
    renderer.paragraph("Image limitations", { bold: true, gap: 3 });
    renderer.bullets(ai.imageReview?.limitations || []);

    renderer.sectionTitle("Conversion opportunities");
    renderer.table({
      minRowHeight: 28,
      columns: [
        { key: "opportunity", label: "Opportunity", width: 180, bold: true },
        { key: "rationale", label: "Rationale", width: 327 },
      ],
      rows: ai.conversionOpportunities || [],
    });

    renderer.sectionTitle("Data-quality risks");
    renderer.table({
      minRowHeight: 30,
      columns: [
        { key: "risk", label: "Risk", width: 130, bold: true, fontSize: 7.5 },
        { key: "evidence", label: "Evidence", width: 180, fontSize: 7.5 },
        { key: "recommendedCheck", label: "Recommended check", width: 197, fontSize: 7.5 },
      ],
      rows: ai.dataQualityRisks || [],
    });
    renderer.paragraph("Questions for the merchant", { bold: true, color: COLORS.signal, gap: 3 });
    renderer.bullets(ai.merchantQuestions || []);
    renderer.paragraph("Checks and limitations", { bold: true, color: COLORS.changedInk, gap: 3 });
    renderer.bullets(ai.limitations || []);

    renderer.finishFooters();
    doc.end();
  });
}
