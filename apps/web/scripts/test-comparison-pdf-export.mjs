import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createComparisonReportPdf } from "../lib/report-pdf.js";
import { createScoringMetadata } from "@catalog-health/core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../../../tmp/pdfs");
const outputPath = path.join(outputDir, "catalog-health-comparison-test.pdf");

const issues = Array.from({ length: 20 }, (_, index) => ({
  issue: `representative_issue_${index + 1}`,
  base: 48 - index,
  target: 31 + index,
  delta: -17 + index * 2,
}));

const categories = Array.from({ length: 15 }, (_, index) => ({
  categoryId: index + 1,
  categoryName: index === 0
    ? "Oksemørbrad St. América Grass"
    : `Representative catalog category with a descriptive name ${index + 1}`,
  baseScore: 52 + index,
  targetScore: 70 + index,
  scoreDelta: 18,
  baseProducts: 10 + index,
  targetProducts: 11 + index,
  productDelta: 1,
}));

const products = Array.from({ length: 18 }, (_, index) => ({
  id: index + 1,
  name: `Representative changed product with a longer display name ${index + 1}`,
  sku: `CMP-${1000 + index}`,
  status: index === 17 ? "unchanged" : "changed",
  baseScore: 48 + index,
  targetScore: 78 + index,
  scoreDelta: 30,
  baseGrade: "D",
  targetGrade: "B",
  baseIssues: 5,
  targetIssues: 2,
  issueDelta: -3,
  resolvedIssues: ["missing_brand", "short_description", "single_image"],
  addedIssues: index % 3 === 0 ? ["missing_search_keywords"] : [],
}));

const baseScoringMetadata = createScoringMetadata();
const targetScoringMetadata = createScoringMetadata({
  profile: "marketplace-readiness",
  semanticRequested: true,
  semanticApplied: true,
  semanticJudge: {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "gpt-4o-mini (OpenAI)",
    configurationId: "marketplace-judge",
    configurationName: "Marketplace judge",
  },
});

const comparison = {
  base: {
    id: "base-analysis",
    createdAt: "2026-07-01T08:30:00Z",
    scoringMetadata: baseScoringMetadata,
  },
  target: {
    id: "target-analysis",
    createdAt: "2026-07-14T10:45:00Z",
    scoringMetadata: targetScoringMetadata,
  },
  summary: {
    score: { base: 61.4, target: 78.2, delta: 16.8 },
    grade: { base: "D", target: "B", changed: true },
    products: { base: 120, target: 126, delta: 6 },
    semanticComparable: false,
    scoring: {
      known: true,
      comparable: false,
      differences: [
        "scoring profile",
        "dimension weights",
        "scoring thresholds",
        "semantic scoring inclusion",
      ],
    },
  },
  dimensions: ["content", "structure", "media", "commerce", "discoverability", "semantic"]
    .map((dimension, index) => ({
      dimension,
      base: 55 + index * 2,
      target: 72 + index * 2,
      delta: 17,
    })),
  issues,
  categories,
  products,
};

const pdf = await createComparisonReportPdf({
  comparison,
  environmentName: "Comparison PDF export test catalog",
});

const source = pdf.toString("latin1");
const pageCount = source.match(/\/Type \/Page\b/g)?.length || 0;

assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", "output must have a PDF signature");
assert.match(source.slice(-32), /%%EOF/, "output must have a PDF end marker");
assert.ok(pdf.length > 8_000, "output must contain a non-trivial comparison report");
assert.ok(pageCount >= 3, "representative comparison should span multiple pages");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, pdf);

console.log(`Comparison PDF export smoke test passed: ${pageCount} pages, ${pdf.length} bytes`);
console.log(`Artifact: ${outputPath}`);
