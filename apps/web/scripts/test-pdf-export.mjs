import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReportPdf, normalizePdfText } from "../lib/report-pdf.js";
import { createScoringMetadata } from "@catalog-health/core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../../../tmp/pdfs");
const outputPath = path.join(outputDir, "catalog-health-test.pdf");
const unicodeCatalogName = "Oksemørbrad St. América Grass";

assert.equal(
  normalizePdfText(unicodeCatalogName),
  unicodeCatalogName,
  "PDF text normalization must preserve Western-European characters"
);

const issueNames = [
  "missing_brand",
  "short_description",
  "missing_gtin",
  "single_image",
  "missing_weight",
  "poor_category_assignment",
  "missing_mpn",
  "low_stock_visibility",
  "weak_semantic_title",
  "missing_search_keywords",
];

const categoryNames = [
  "Clearance and seasonal accessories",
  "Home office furniture",
  "Outdoor living",
  "Kitchen appliances",
  "Womens footwear",
  "Consumer electronics",
  "Lighting",
  "Health and beauty",
];

const productNames = [
  "Premium weather-resistant outdoor chair",
  "Ultra lightweight running shoe",
  "Smart connected countertop appliance",
];

const summary = {
  productCount: 120,
  overall: 71.6,
  grade: "C",
  gradeDist: { A: 18, B: 31, C: 39, D: 22, F: 10 },
  dimensionAverages: {
    content: 74.3,
    structure: 68.7,
    media: 81.2,
    commerce: 76.4,
    discoverability: 64.1,
    semantic: 70.8,
  },
  issueFrequency: issueNames.map((issue, index) => ({
    issue,
    count: 67 - index * 5,
  })),
  categoryRollup: categoryNames.map((categoryName, index) => ({
    categoryId: index,
    categoryName,
    products: 11 + index * 3,
    avgScore: 58 + index * 3.2,
    grade: index < 2 ? "F" : index < 4 ? "D" : "C",
    pctFailing: 68 - index * 6,
  })),
  topFixes: Array.from({ length: 15 }, (_, index) => ({
    id: index,
    name: `${productNames[index % productNames.length]} ${index + 1}`,
    sku: `SKU-${1000 + index}`,
    overall: 42 + index,
    grade: index < 3 ? "F" : index < 9 ? "D" : "C",
    impact: (984 - index * 37).toFixed(1),
    issues: [
      issueNames[index % issueNames.length],
      issueNames[(index + 1) % issueNames.length],
      issueNames[(index + 2) % issueNames.length],
    ],
  })),
};

const pdf = await createReportPdf({
  analysis: {
    createdAt: "2026-07-13T08:42:00Z",
    durationMs: 185_000,
    scoringMetadata: createScoringMetadata({
      profile: "content-quality",
      semanticRequested: true,
      semanticApplied: true,
      semanticJudge: {
        provider: "anthropic",
        model: "claude-test-model",
        label: "claude-test-model",
      },
    }),
    summary,
    warning: "Semantic scoring covered 116 of 120 products; four products used deterministic scores only.",
  },
  environmentName: `${unicodeCatalogName} - PDF export test catalog`,
});

const source = pdf.toString("latin1");
const pageCount = source.match(/\/Type \/Page\b/g)?.length || 0;

assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", "output must have a PDF signature");
assert.match(source.slice(-32), /%%EOF/, "output must have a PDF end marker");
assert.ok(pdf.length > 5_000, "output must contain a non-trivial report");
assert.ok(pageCount >= 3, "representative report with scoring metadata should span at least three pages");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, pdf);

console.log(`PDF export smoke test passed: ${pageCount} pages, ${pdf.length} bytes`);
console.log(`Artifact: ${outputPath}`);
