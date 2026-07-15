export const COLORS = {
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

export const PAGE = { width: 595.28, height: 841.89, margin: 44 };
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export function normalizePdfText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replaceAll("_", " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}

export const clean = normalizePdfText;

export function titleCase(value) {
  const text = clean(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

export function formatDate(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDuration(ms) {
  if (ms == null) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function createRenderer(doc, meta) {
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

export function percent(value) {
  return value == null ? "-" : `${Math.round(Number(value) * 100)}%`;
}

export function yesNo(value) {
  return value == null ? "-" : value ? "Yes" : "No";
}

export function metadataLabel(value) {
  return titleCase(String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

export function scoringMetadataEntries(metadata) {
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

export function comparisonScoringMetadataEntries(base, target) {
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

export function drawStat(doc, x, y, width, label, value, accent = COLORS.signal) {
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

export function drawGradeChart(doc, summary, x, y, width, height) {
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

export function drawDimensionChart(doc, summary, x, y, width) {
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

export function gradeForScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function num(value, decimals = 0) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function statPercent(value, total) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

export function statDelta(delta) {
  if (delta == null) return "No previous run";
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${num(delta, 1)} pts`;
}

export function signed(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number}`;
}
