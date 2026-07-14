import assert from "node:assert/strict";
import {
  analyzeCatalog,
  createScoringMetadata,
  demoCatalog,
  normalizeScoringProfileInput,
  summarize,
} from "@catalog-health/core";
import { recalculateAnalysis } from "../lib/analysis-recalculator.js";
import {
  createAnalysis,
  createCustomScoringProfile,
  createEnvironment,
  deleteCustomScoringProfile,
  getAnalysis,
  getEnvironment,
  getScoringProfileForUser,
  listScoringProfiles,
  updateAnalysis,
  updateCustomScoringProfile,
} from "../lib/db.js";
import { getDb } from "../lib/sqlite.js";

const db = getDb();
const fixtureId = `profile-test-${Date.now()}`;
const otherUserId = `${fixtureId}-other`;
class RollbackFixture extends Error {}

const input = normalizeScoringProfileInput({
  label: "High-value content",
  description: "Prioritize content while retaining feed and taxonomy coverage.",
  dimensionWeights: { content: 0.4, structure: 0.2, taxonomy: 0.1, hygiene: 0.1, feed: 0.2 },
  semanticWeight: 0.2,
  thresholds: {
    minDescriptionChars: 350,
    goodDescriptionChars: 800,
    minImages: 4,
    maxSaneCategories: 4,
    titleMin: 12,
    titleMax: 140,
  },
});

assert.throws(
  () => normalizeScoringProfileInput({ ...input, dimensionWeights: { ...input.dimensionWeights, content: 0.5 } }),
  /total 100%/
);
assert.throws(
  () => normalizeScoringProfileInput({ ...input, thresholds: { ...input.thresholds, goodDescriptionChars: 100 } }),
  /at least the minimum/
);

try {
  db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .run(fixtureId, `${fixtureId}@example.test`, "Profile test", now);
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)")
      .run(otherUserId, `${otherUserId}@example.test`, "Other user", now);

    const created = createCustomScoringProfile(fixtureId, input);
    assert.equal(created.builtIn, false);
    assert.equal(created.version, "1.0.0");
    assert.equal(listScoringProfiles(fixtureId).length, 5);
    assert.equal(listScoringProfiles(otherUserId).length, 4);
    assert.equal(getScoringProfileForUser(otherUserId, created.id), null);

    const environment = createEnvironment(fixtureId, {
      name: "Custom profile store",
      storeHash: "profile-store",
      accessToken: "secret",
      scoringProfileId: created.id,
    });
    assert.equal(getEnvironment(fixtureId, environment.id).scoringProfile.label, input.label);
    assert.equal(listScoringProfiles(fixtureId).find((profile) => profile.id === created.id).environmentCount, 1);

    const demo = demoCatalog();
    const rows = analyzeCatalog(demo.products, demo.categories);
    const source = createAnalysis({
      userId: fixtureId,
      environmentId: environment.id,
      status: "done",
      summary: summarize(rows, demo.categories),
      scoringMetadata: createScoringMetadata(),
    });
    updateAnalysis(source.id, {
      rows,
      catalog: { categories: demo.categories, trees: [], channels: [], semanticJudge: null },
    });

    const customAnalysis = recalculateAnalysis({
      userId: fixtureId,
      sourceAnalysisId: source.id,
      profileId: created.id,
    });
    assert.equal(customAnalysis.scoringMetadata.profile.id, created.id);
    assert.equal(customAnalysis.scoringMetadata.profile.version, "1.0.0");

    const updated = updateCustomScoringProfile(fixtureId, created.id, normalizeScoringProfileInput({
      ...input,
      label: "High-value content v2",
      dimensionWeights: { content: 0.35, structure: 0.2, taxonomy: 0.15, hygiene: 0.1, feed: 0.2 },
    }));
    assert.equal(updated.version, "1.0.1");
    const revisedAnalysis = recalculateAnalysis({
      userId: fixtureId,
      sourceAnalysisId: customAnalysis.id,
      profileId: created.id,
    });
    assert.equal(revisedAnalysis.scoringMetadata.profile.version, "1.0.1");
    assert.equal(getAnalysis(fixtureId, customAnalysis.id).scoringMetadata.profile.label, input.label);

    assert.equal(deleteCustomScoringProfile(fixtureId, "catalog-health-default"), null);
    assert.deepEqual(deleteCustomScoringProfile(fixtureId, created.id), {
      deleted: true,
      reassignedEnvironments: 1,
    });
    assert.equal(getScoringProfileForUser(fixtureId, created.id), null);
    assert.equal(getEnvironment(fixtureId, environment.id).scoringProfileId, "catalog-health-default");
    assert.equal(getAnalysis(fixtureId, revisedAnalysis.id).scoringMetadata.profile.label, "High-value content v2");

    throw new RollbackFixture();
  })();
} catch (error) {
  if (!(error instanceof RollbackFixture)) throw error;
}

assert.equal(db.prepare("SELECT 1 FROM users WHERE id = ?").get(fixtureId), undefined);
assert.equal(db.prepare("SELECT 1 FROM scoring_profiles WHERE user_id = ?").get(fixtureId), undefined);
console.log("Custom scoring profiles integration test passed");
