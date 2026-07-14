import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProductReportPdf } from "../lib/report-pdf.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../../../tmp/pdfs");
const outputPath = path.join(outputDir, "catalog-health-product-test.pdf");
const thumbnailUrl = "https://cdn11.bigcommerce.com/product-test.png";
const png = fs.readFileSync(path.resolve(scriptDir, "../../../docs/images/catalog-health-00-v2.png"));

const product = {
  id: 42,
  sku: "TRAIL-JACKET-42",
  name: "Oksemørbrad St. América Grass",
  categories: [2, 7],
  overall: 58,
  grade: "D",
  scores: { content: 46, structure: 63, taxonomy: 81, hygiene: 70, feed: 30, semantic: 49 },
  viewCount: 1820,
  totalSold: 94,
  impact: 741.5,
  issues: [
    "thin_description",
    "single_image",
    "missing_alt_text",
    "no_custom_fields",
    "missing_identifiers",
    "feed_missing_identifier",
  ],
  details: {
    descriptionChars: 184,
    descriptionExcerpt: "A lightweight jacket designed for changing trail conditions and active outdoor use.",
    thumbnailUrl,
    imageCount: 2,
    imagesWithAlt: 0,
    hasBrand: true,
    customFieldCount: 0,
    peerMedianCustomFields: 5,
    gtin: "",
    upc: "",
    mpn: "",
    optionCount: 2,
    variantCount: 8,
    incompleteVariants: 1,
    price: 149.95,
    salePrice: 129.95,
    weight: 0.72,
    isVisible: true,
    inventoryTracking: "product",
    inventoryLevel: 38,
  },
  semantic: {
    what_it_is: { verdict: "yes", reason: "The description identifies a lightweight outdoor jacket." },
    who_its_for: { verdict: "partial", reason: "Trail use is mentioned, but the intended shopper is vague." },
    made_of: { verdict: "no", reason: "No shell, lining, or membrane material is stated." },
  },
};

const aiResult = {
  executiveSummary: "The product has credible trail positioning but needs evidence-backed technical details, stronger structured attributes, richer imagery, and feed identifiers before it is ready for broad discovery and conversion.",
  overallConfidence: "medium",
  priorityActions: Array.from({ length: 6 }, (_, index) => ({
    title: `Priority improvement ${index + 1}`,
    priority: index < 2 ? "high" : "medium",
    impact: index < 3 ? "high" : "medium",
    effort: index % 2 ? "medium" : "low",
    recommendation: "Add concrete, verified shopper-facing information and map it into the appropriate structured catalog field.",
    evidence: "The stored product facts and description do not contain enough specific technical detail.",
    needsVerification: index % 2 === 0,
  })),
  title: {
    assessment: "Clear product type, but the title does not communicate a verified differentiator.",
    suggestedTitle: "Alpine Trail Weatherproof Jacket",
    alternatives: ["Alpine Lightweight Trail Jacket", "Alpine All-Weather Trail Jacket"],
    rationale: "Keeps the established product and use-case terms without introducing an unsupported material claim.",
  },
  description: {
    assessment: "The description is short and lacks materials, construction details, fit guidance, care information, and concrete weather-protection evidence.",
    shortDescription: "A lightweight trail jacket designed for active outdoor use in changing conditions. Confirm materials, waterproof rating, fit, and care details before publishing.",
    rewrittenDescription: ("Built for active days on the trail, the Alpine Trail Weatherproof Jacket provides lightweight coverage in changing conditions. Its streamlined design is intended for movement and easy layering. Merchant verification is still required for shell material, lining, membrane technology, seam construction, waterproof rating, breathability, fit, pocket configuration, hood details, care instructions, and country of origin. ").repeat(4),
    sellingPoints: ["Lightweight trail-focused design", "Suitable for changing outdoor conditions", "Designed for active movement", "Layer-friendly positioning"],
    missingInformation: ["Shell and lining materials", "Waterproof and breathability ratings", "Fit and size guidance", "Pocket and hood construction", "Care instructions", "Country of origin"],
  },
  derivedFields: Array.from({ length: 10 }, (_, index) => ({
    field: `Suggested field ${index + 1}`,
    value: index % 2 ? "Trail use" : "Needs merchant confirmation",
    fieldType: index % 3 === 0 ? "feed" : "custom",
    confidence: index % 2 ? "medium" : "low",
    evidence: "Derived from the title and short description; no technical source data was supplied.",
    needsVerification: index % 2 === 0,
  })),
  placement: {
    suggestedCategories: [
      { categoryId: 2, name: "Outerwear", rationale: "The product is explicitly a jacket.", isNewCategory: false },
      { categoryId: 7, name: "Trail apparel", rationale: "The title and description establish trail use.", isNewCategory: false },
    ],
    merchandisingCollections: ["Trail essentials", "Lightweight layering", "Changing-weather gear"],
    crossSellIdeas: ["Trail trousers", "Moisture-wicking base layer", "Packable rain cover", "Trail running vest"],
  },
  feedAndDiscovery: {
    googleProductCategory: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
    productType: "Outerwear > Trail Jackets",
    seoTitle: "Alpine Trail Weatherproof Jacket",
    seoDescription: "Explore a lightweight trail jacket for active outdoor use in changing conditions. Verify technical weather-protection details before publishing.",
    searchTerms: ["trail jacket", "lightweight outdoor jacket", "weatherproof jacket", "trail outerwear", "layering jacket"],
    attributes: Array.from({ length: 8 }, (_, index) => ({
      name: `Feed attribute ${index + 1}`,
      value: index % 2 ? "Trail" : "Pending verification",
      confidence: index % 2 ? "medium" : "low",
      evidence: "The catalog copy supports the use case but not a detailed technical value.",
      needsVerification: index % 2 === 0,
    })),
    identifierWarnings: ["GTIN, UPC, and MPN are all missing.", "Do not invent a product identifier; obtain it from the brand or supplier."],
  },
  imageReview: {
    performed: true,
    summary: "The available image has a clean product focus but the set is too limited to establish fit, construction, scale, and real-world trail use.",
    heroImageIndex: 1,
    images: [{
      imageIndex: 1,
      qualityScore: 78,
      role: "Primary product image",
      observations: ["Product is centered", "Background is consistent", "Construction details are not visible", "No on-model fit context"],
      suggestedAltText: "Alpine trail jacket shown from the front on a plain background",
      thumbnailUrl,
    }],
    missingShots: ["Back view", "On-model fit", "Pocket and zipper details", "Hood detail", "Trail lifestyle image", "Packability or layering view"],
    limitations: ["Only one safely retrievable image was supplied to the model."],
  },
  conversionOpportunities: Array.from({ length: 6 }, (_, index) => ({
    opportunity: `Conversion opportunity ${index + 1}`,
    rationale: "Specific verified details would reduce shopper uncertainty and improve product comparison.",
  })),
  dataQualityRisks: Array.from({ length: 6 }, (_, index) => ({
    risk: `Data-quality risk ${index + 1}`,
    evidence: "The relevant fact is absent from the stored product snapshot.",
    recommendedCheck: "Confirm against supplier documentation before publishing.",
  })),
  merchantQuestions: ["What are the shell and lining materials?", "What waterproof and breathability ratings are certified?", "How does the jacket fit?", "What are the care instructions?", "Is the hood removable or adjustable?"],
  limitations: ["No supplier specification sheet was provided.", "Weather-protection claims require merchant verification.", "The saved analysis contains a short description excerpt rather than full historic copy."],
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(png, {
  status: 200,
  headers: { "Content-Type": "image/png", "Content-Length": String(png.length) },
});

let pdf;
let withoutAi;
try {
  pdf = await createProductReportPdf({
    analysis: { id: "analysis-product-pdf", createdAt: "2026-07-14T13:45:00Z" },
    product,
    environmentName: "Product PDF export test catalog",
    categories: [{ id: 2, name: "Outerwear" }, { id: 7, name: "Trail apparel" }],
    aiReview: {
      provider: "openai",
      model: "gpt-4o-mini",
      modelConfigurationId: "catalog-reviewer",
      modelConfigurationName: "Catalog reviewer",
      source: "current BigCommerce product",
      imageAnalysis: true,
      generatedAt: "2026-07-14T14:05:00Z",
      result: aiResult,
    },
  });
  withoutAi = await createProductReportPdf({
    analysis: { id: "analysis-product-pdf", createdAt: "2026-07-14T13:45:00Z" },
    product,
    environmentName: "Product PDF export test catalog",
    categories: [{ id: 2, name: "Outerwear" }],
  });
} finally {
  globalThis.fetch = originalFetch;
}

const source = pdf.toString("latin1");
const pageCount = source.match(/\/Type \/Page\b/g)?.length || 0;
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
assert.match(source.slice(-32), /%%EOF/);
assert.ok(pdf.length > 15_000, "AI product report must contain substantial content");
assert.ok(pageCount >= 6, `comprehensive AI product report should span at least six pages (got ${pageCount})`);
assert.equal(withoutAi.subarray(0, 5).toString(), "%PDF-");
assert.ok(withoutAi.length < pdf.length, "report without AI Analysis should be smaller");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, pdf);
console.log(`Product PDF export smoke test passed: ${pageCount} pages, ${pdf.length} bytes`);
console.log(`Artifact: ${outputPath}`);
