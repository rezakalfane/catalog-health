import assert from "node:assert/strict";
import {
  createScoringMetadata,
  compareScoringMetadata,
  SCORING_ENGINE_VERSION,
  SEMANTIC_PROMPT_VERSION,
} from "@catalog-health/core";

const heuristic = createScoringMetadata();
assert.equal(heuristic.engineVersion, SCORING_ENGINE_VERSION);
assert.equal(heuristic.semantic.promptVersion, SEMANTIC_PROMPT_VERSION);
assert.equal(heuristic.semantic.applied, false);
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

console.log("Scoring metadata compatibility tests passed");
