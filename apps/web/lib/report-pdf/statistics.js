import PDFDocument from "pdfkit";
import { issueLabel } from "../../components/issue-info.js";
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
  gradeForScore,
  num,
  statDelta,
  statPercent,
} from "./common.js";

/** Build an account-wide statistics report and resolve with its PDF bytes. */
export function createStatisticsReportPdf({ stats }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const generatedAt = new Date();
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: "Catalog Health account statistics",
        Author: "Catalog Health",
        Subject: "Account-wide catalog health statistics",
      },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const renderer = createRenderer(doc, { environmentName: "Account statistics", generatedAt });
    const accountGrade = gradeForScore(stats.currentScore || 0);
    const chartSummary = {
      gradeDist: stats.gradeDist || {},
      dimensionAverages: stats.dimensionAverages || {},
    };

    renderer.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(25)
      .fillColor(COLORS.ink)
      .text("Account statistics", PAGE.margin, doc.y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.soft)
      .text(`Generated ${formatDate(generatedAt)} UTC`, PAGE.margin, doc.y + 5)
      .text("Latest live-catalog analysis per environment; profile recalculations are counted separately.", PAGE.margin, doc.y + 3);
    doc.y += 20;

    const statGap = 8;
    const statWidth = (CONTENT_WIDTH - statGap * 3) / 4;
    const statY = doc.y;
    drawStat(doc, PAGE.margin, statY, statWidth, "Account score", `${num(stats.currentScore || 0, 1)} / 100`, COLORS.grades[accountGrade] || COLORS.signal);
    drawStat(doc, PAGE.margin + (statWidth + statGap), statY, statWidth, "Products", stats.productCount || 0);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 2, statY, statWidth, "Below C", stats.productsBelowC || 0, COLORS.grades.F);
    drawStat(doc, PAGE.margin + (statWidth + statGap) * 3, statY, statWidth, "AI analyzed", `${statPercent(stats.aiAnalyzedCount || 0, stats.productCount || 0)}`, COLORS.signal);
    doc.y = statY + 78;

    const chartGap = 24;
    const chartWidth = (CONTENT_WIDTH - chartGap) / 2;
    const dimensionCount = Object.keys(stats.dimensionAverages || {}).length;
    const chartHeight = Math.max(135, 45 + dimensionCount * 20);
    renderer.ensureSpace(chartHeight + 25);
    const chartY = doc.y;
    drawGradeChart(doc, chartSummary, PAGE.margin, chartY, chartWidth, chartHeight);
    drawDimensionChart(doc, chartSummary, PAGE.margin + chartWidth + chartGap, chartY, chartWidth);
    doc.y = chartY + chartHeight + 23;

    renderer.sectionTitle("Activity and coverage");
    renderer.table({
      columns: [
        { key: "metric", label: "Metric", width: 230, bold: true },
        { key: "value", label: "Value", width: 277 },
      ],
      rows: [
        { metric: "Analyses", value: `${num(stats.totalAnalyses || 0)} total; ${num(stats.completedCount || 0)} completed; ${num(stats.statusCounts?.running || 0)} running; ${num(stats.statusCounts?.failed || 0)} failed` },
        { metric: "Account score change", value: statDelta(stats.accountDelta) },
        { metric: "Semantic analyses", value: `${num(stats.semanticAnalyses || 0)} of ${num(stats.completedCount || 0)} completed analyses` },
        { metric: "AI analyzed products", value: `${num(stats.aiAnalyzedCount || 0)} of ${num(stats.productCount || 0)} latest products` },
        { metric: "Profile recalculations", value: num(stats.derivedCount || 0) },
        { metric: "Average analysis duration", value: formatDuration(stats.avgDurationMs) || "n/a" },
        { metric: "Views on D/F products", value: num(stats.impactedViews || 0) },
        { metric: "Units sold on D/F products", value: num(stats.impactedUnits || 0) },
      ],
      minRowHeight: 20,
    });

    renderer.sectionTitle("Environment leaderboard");
    renderer.table({
      columns: [
        { key: "environment", label: "Environment", width: 148, bold: true },
        { key: "score", label: "Score", width: 55, align: "right" },
        { key: "grade", label: "Grade", width: 45, align: "center", bold: true, color: (row) => COLORS.grades[row.grade] || COLORS.ink },
        { key: "change", label: "Change", width: 75 },
        { key: "products", label: "Products", width: 65, align: "right" },
        { key: "analyses", label: "Runs", width: 45, align: "right" },
        { key: "lastRun", label: "Last run", width: 74 },
      ],
      rows: [...(stats.envSummaries || [])]
        .sort((a, b) => Number(b.latest?.summary?.overall || -1) - Number(a.latest?.summary?.overall || -1))
        .map(({ env, latest, delta, analysisCount, daysSinceRun }) => ({
          environment: env.name,
          score: latest ? num(latest.summary.overall, 1) : "n/a",
          grade: latest?.summary.grade || "-",
          change: statDelta(delta),
          products: latest ? num(latest.summary.productCount) : "n/a",
          analyses: num(analysisCount || 0),
          lastRun: latest ? (daysSinceRun === 0 ? "today" : `${daysSinceRun}d ago`) : "never",
        })),
      minRowHeight: 22,
    });

    renderer.sectionTitle("Top issues");
    renderer.table({
      columns: [
        { key: "issue", label: "Issue", width: 295, bold: true },
        { key: "count", label: "Products", width: 95, align: "right" },
        { key: "impact", label: "Impact", width: 117, align: "right" },
      ],
      rows: (stats.topIssueCounts || []).map(({ key, value }) => {
        const impact = (stats.topIssueImpact || []).find((item) => item.key === key)?.value || 0;
        return { issue: issueLabel(key), count: num(value), impact: num(impact, 1) };
      }),
      minRowHeight: 22,
    });

    renderer.sectionTitle("Highest-impact products");
    renderer.table({
      columns: [
        { key: "product", label: "Product", width: 205, bold: true },
        { key: "environment", label: "Environment", width: 105 },
        { key: "score", label: "Score", width: 52, align: "right" },
        { key: "grade", label: "Grade", width: 45, align: "center", bold: true, color: (row) => COLORS.grades[row.grade] || COLORS.ink },
        { key: "views", label: "Views", width: 55, align: "right" },
        { key: "impact", label: "Impact", width: 45, align: "right" },
      ],
      rows: (stats.topProducts || []).map((product) => ({
        product: product.name || product.sku || product.id,
        environment: product.environmentName,
        score: num(product.overall, 1),
        grade: product.grade,
        views: num(product.viewCount || 0),
        impact: num(product.impact || 0, 1),
      })),
      minRowHeight: 22,
    });

    renderer.sectionTitle("Weakest categories");
    renderer.table({
      columns: [
        { key: "category", label: "Category", width: 190, bold: true },
        { key: "environment", label: "Environment", width: 130 },
        { key: "products", label: "Products", width: 70, align: "right" },
        { key: "score", label: "Avg score", width: 70, align: "right" },
        { key: "grade", label: "Grade", width: 47, align: "center", bold: true, color: (row) => COLORS.grades[row.grade] || COLORS.ink },
      ],
      rows: (stats.categories || []).map((category) => ({
        category: category.categoryName,
        environment: category.environmentName,
        products: num(category.products || 0),
        score: num(category.avgScore || 0, 1),
        grade: category.grade,
      })),
      minRowHeight: 22,
    });

    renderer.sectionTitle("Scoring profiles in use");
    renderer.table({
      columns: [
        { key: "profile", label: "Profile", width: 350, bold: true },
        { key: "environments", label: "Latest environments", width: 157, align: "right" },
      ],
      rows: (stats.profileCounts || []).map(({ key, value }) => ({
        profile: key,
        environments: num(value),
      })),
      minRowHeight: 22,
    });

    doc.end();
  });
}
