import assert from "node:assert/strict";
import {
  createScoringMetadata,
  compareScoringMetadata,
  SCORING_ENGINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
  SCORING_PROFILES,
  DEFAULT_SCORING_PROFILE_ID,
  getScoringProfile,
  isScoringProfileId,
  analyzeCatalog,
  demoCatalog,
} from "@catalog-health/core";

assert.equal(SCORING_PROFILES.length, 4);
assert.equal(getScoringProfile().id, DEFAULT_SCORING_PROFILE_ID);
assert.equal(getScoringProfile("missing-profile").id, DEFAULT_SCORING_PROFILE_ID);
assert.equal(isScoringProfileId("content-quality"), true);
assert.equal(isScoringProfileId("missing-profile"), false);
assert.equal(new Set(SCORING_PROFILES.map((profile) => profile.id)).size, SCORING_PROFILES.length);
for (const profile of SCORING_PROFILES) {
  const totalWeight = Object.values(profile.dimensionWeights).reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(totalWeight - 1) < 0.000001, `${profile.id} weights must total 100%`);
}

const demo = demoCatalog();
const profileAverages = SCORING_PROFILES.map((profile) => {
  const rows = analyzeCatalog(demo.products, demo.categories, profile);
  return rows.reduce((sum, row) => sum + row.overall, 0) / rows.length;
});
assert.ok(
  new Set(profileAverages).size > 1,
  "static profiles must produce meaningfully different scores"
);

const heuristic = createScoringMetadata();
assert.equal(heuristic.engineVersion, SCORING_ENGINE_VERSION);
assert.equal(heuristic.semantic.promptVersion, SEMANTIC_PROMPT_VERSION);
assert.equal(heuristic.semantic.applied, false);
assert.equal(heuristic.profile.label, "Balanced");
assert.deepEqual(compareScoringMetadata(heuristic, structuredClone(heuristic)), {
  known: true,
  comparable: true,
  differences: [],
});
const reordered = structuredClone(heuristic);
reordered.profile.dimensionWeights = Object.fromEntries(
  Object.entries(reordered.profile.dimensionWeights).reverse()
);
assert.equal(
  compareScoringMetadata(heuristic, reordered).comparable,
  true,
  "JSON key order must not affect compatibility"
);

const requestedButSkipped = createScoringMetadata({ semanticRequested: true });
assert.equal(
  compareScoringMetadata(heuristic, requestedButSkipped).comparable,
  true,
  "a skipped semantic pass must not change formula compatibility"
);

const semanticOpenAi = createScoringMetadata({
  semanticRequested: true,
  semanticApplied: true,
  semanticJudge: { provider: "openai", model: "model-a", label: "model-a (OpenAI)" },
});
const semanticAnthropic = createScoringMetadata({
  semanticRequested: true,
  semanticApplied: true,
  semanticJudge: { provider: "anthropic", model: "model-b", label: "model-b" },
});
const modelComparison = compareScoringMetadata(semanticOpenAi, semanticAnthropic);
assert.equal(modelComparison.comparable, false);
assert.ok(modelComparison.differences.includes("semantic provider"));
assert.ok(modelComparison.differences.includes("semantic model"));

const changedThreshold = structuredClone(heuristic);
changedThreshold.profile.thresholds.minImages += 1;
assert.deepEqual(compareScoringMetadata(heuristic, changedThreshold).differences, [
  "scoring thresholds",
]);

assert.deepEqual(compareScoringMetadata(null, heuristic), {
  known: false,
  comparable: false,
  differences: ["Scoring metadata is unavailable for one or both legacy analyses."],
});

const contentProfile = createScoringMetadata({ profile: "content-quality" });
const profileComparison = compareScoringMetadata(heuristic, contentProfile);
assert.equal(profileComparison.comparable, false);
assert.ok(profileComparison.differences.includes("scoring profile"));
assert.ok(profileComparison.differences.includes("dimension weights"));
assert.ok(profileComparison.differences.includes("scoring thresholds"));

console.log("Scoring metadata compatibility tests passed");
