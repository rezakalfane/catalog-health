import assert from "node:assert/strict";
import { fetchProduct } from "@catalog-health/core";
import {
  attachAnalyzedImageThumbnails,
  productAiAnalysisSchema,
} from "../lib/product-ai-analysis.js";
import { runProductAiAnalysis } from "../lib/api-client.js";
import { compareProducts } from "../lib/compare.js";
import {
  createAnalysis,
  getAnalysisRows,
  getProductAiAnalysis,
  saveProductAiAnalysis,
  updateAnalysis,
} from "../lib/db.js";
import { getDb } from "../lib/sqlite.js";

const db = getDb();
const fixtureId = `product-ai-test-${Date.now()}`;
class RollbackFixture extends Error {}

const validResult = {
  executiveSummary: "Improve specificity and complete the feed data.",
  overallConfidence: "medium",
  priorityActions: [{ title: "Clarify the title", priority: "high", impact: "high", effort: "low", recommendation: "Add the product type.", evidence: "The title is SKU-only.", needsVerification: false }],
  title: { assessment: "Too vague.", suggestedTitle: "Trail Running Jacket", alternatives: ["Lightweight Trail Jacket"], rationale: "Names the product type." },
  description: { assessment: "Short.", shortDescription: "A lightweight trail jacket.", rewrittenDescription: "A lightweight jacket for trail use.", sellingPoints: ["Lightweight"], missingInformation: ["Material"] },
  derivedFields: [{ field: "Use case", value: "Trail", fieldType: "custom", confidence: "medium", evidence: "Product name", needsVerification: true }],
  placement: { suggestedCategories: [{ categoryId: 2, name: "Outerwear", rationale: "Matches product type.", isNewCategory: false }], merchandisingCollections: ["Trail essentials"], crossSellIdeas: ["Running vest"] },
  feedAndDiscovery: { googleProductCategory: "Apparel & Accessories > Clothing > Outerwear", productType: "Outerwear > Trail Jackets", seoTitle: "Trail Running Jacket", seoDescription: "Explore a lightweight trail running jacket.", searchTerms: ["trail jacket"], attributes: [], identifierWarnings: ["GTIN is missing."] },
  imageReview: { performed: false, summary: "Images were not available.", heroImageIndex: null, images: [], missingShots: ["Front view"], limitations: ["No image input."] },
  conversionOpportunities: [{ opportunity: "Add use cases", rationale: "Helps shoppers self-select." }],
  dataQualityRisks: [{ risk: "Missing material", evidence: "Not in description.", recommendedCheck: "Confirm with supplier." }],
  merchantQuestions: ["What is the shell material?"],
  limitations: ["Material cannot be inferred."],
};

assert.deepEqual(productAiAnalysisSchema.parse(validResult), validResult);
assert.throws(
  () => productAiAnalysisSchema.parse({ ...validResult, overallConfidence: "certain" }),
  /Invalid option/
);

const thumbnailResult = structuredClone(validResult);
thumbnailResult.imageReview = {
  ...thumbnailResult.imageReview,
  performed: true,
  images: [{ imageIndex: 2, qualityScore: 82, role: "Detail", observations: [], suggestedAltText: "Blue jacket detail" }],
};
attachAnalyzedImageThumbnails(thumbnailResult, [
  { _index: 2, _thumbnailUrl: "https://cdn11.bigcommerce.com/product-2.jpg" },
]);
assert.equal(
  thumbnailResult.imageReview.images[0].thumbnailUrl,
  "https://cdn11.bigcommerce.com/product-2.jpg"
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /\/v3\/catalog\/products\/42\?include=variants%2Cimages%2Ccustom_fields%2Coptions$/);
  assert.equal(options.headers["X-Auth-Token"], "secret");
  return new Response(JSON.stringify({ data: { id: 42, name: "Current product" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
try {
  const product = await fetchProduct({ storeHash: "abc", token: "secret", productId: 42 });
  assert.equal(product.name, "Current product");
} finally {
  globalThis.fetch = originalFetch;
}

const progressEvents = [];
const streamedReview = {
  provider: "openai",
  model: "gpt-test",
  modelConfigurationId: "model-config-1",
  modelConfigurationName: "Catalog reviewer",
  result: validResult,
};
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /\/api\/analyses\/analysis-1\/products\/42\/ai-analysis$/);
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { modelConfigurationId: "model-config-1" });
  const payload = [
    JSON.stringify({ type: "progress", step: "Loading product data", detail: "Loading." }),
    JSON.stringify({ type: "progress", step: "Generating recommendations", detail: "Generating." }),
    JSON.stringify({
      type: "result",
      review: streamedReview,
      models: [{ id: "model-config-1", configured: true }],
      defaultModelId: "model-config-1",
    }),
    "",
  ].join("\n");
  const splitAt = payload.indexOf("Generating") + 4;
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload.slice(0, splitAt)));
      controller.enqueue(new TextEncoder().encode(payload.slice(splitAt)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
};
try {
  const streamed = await runProductAiAnalysis(
    "analysis-1",
    42,
    "model-config-1",
    (progress) => progressEvents.push(progress)
  );
  assert.deepEqual(progressEvents.map((item) => item.step), [
    "Loading product data",
    "Generating recommendations",
  ]);
  assert.deepEqual(streamed.review, streamedReview);
  assert.equal(streamed.models[0].configured, true);
  assert.equal(streamed.defaultModelId, "model-config-1");
} finally {
  globalThis.fetch = originalFetch;
}

try {
  db.transaction(() => {
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .run(fixtureId, `${fixtureId}@example.test`, "Product AI test", new Date().toISOString());
    const analysis = createAnalysis({ userId: fixtureId, environmentId: "demo", status: "done" });
    updateAnalysis(analysis.id, { rows: [{ id: 42, name: "Product", sku: "SKU-42", overall: 60, grade: "C", impact: 10, scores: {}, issues: [], categories: [] }] });
    assert.equal(getAnalysisRows(fixtureId, analysis.id)[0].aiAnalyzed, false);

    const saved = saveProductAiAnalysis(fixtureId, analysis.id, 42, {
      provider: "openai", model: "gpt-test", source: "analysis snapshot",
      modelConfigurationId: "model-config-1", modelConfigurationName: "Catalog reviewer",
      imageAnalysis: false, result: validResult, generatedAt: "2026-07-14T10:00:00.000Z",
    });
    assert.equal(saved.model, "gpt-test");
    assert.equal(saved.modelConfigurationName, "Catalog reviewer");
    assert.deepEqual(getProductAiAnalysis(fixtureId, analysis.id, 42).result, validResult);
    const analyzedRow = getAnalysisRows(fixtureId, analysis.id)[0];
    assert.equal(analyzedRow.aiAnalyzed, true);
    assert.equal(getProductAiAnalysis("another-user", analysis.id, 42), null);

    const compared = compareProducts(
      [{ ...analyzedRow, aiAnalyzed: false }],
      [analyzedRow]
    )[0];
    assert.equal(compared.aiAnalyzed, true);
    assert.equal(compared.baseAiAnalyzed, false);
    assert.equal(compared.targetAiAnalyzed, true);

    db.prepare("DELETE FROM analyses WHERE id = ?").run(analysis.id);
    assert.equal(db.prepare("SELECT 1 FROM product_ai_analyses WHERE analysis_id = ?").get(analysis.id), undefined);
    throw new RollbackFixture();
  })();
} catch (error) {
  if (!(error instanceof RollbackFixture)) throw error;
}

assert.equal(db.prepare("SELECT 1 FROM users WHERE id = ?").get(fixtureId), undefined);
console.log("Product AI analysis integration test passed");
