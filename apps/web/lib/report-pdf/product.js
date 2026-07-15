import PDFDocument from "pdfkit";
import { ISSUE_INFO, issueLabel } from "../../components/issue-info.js";
import {
  COLORS,
  CONTENT_WIDTH,
  PAGE,
  clean,
  createRenderer,
  drawStat,
  formatDate,
  titleCase,
} from "./common.js";

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
