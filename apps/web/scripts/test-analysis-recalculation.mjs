import assert from "node:assert/strict";
import {
  analyzeCatalog,
  createScoringMetadata,
  demoCatalog,
  summarize,
} from "@catalog-health/core";
import { recalculateAnalysis } from "../lib/analysis-recalculator.js";
import {
  createAnalysis,
  deleteAnalysis,
  getAnalysis,
  getAnalysisRows,
  updateAnalysis,
} from "../lib/db.js";
import { getDb } from "../lib/sqlite.js";

const db = getDb();
const fixtureId = `recalculation-test-${Date.now()}`;
class RollbackFixture extends Error {}

try {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)"
    ).run(fixtureId, `${fixtureId}@example.test`, "Recalculation test", new Date().toISOString());

    const demo = demoCatalog();
    const rows = analyzeCatalog(demo.products, demo.categories);
    const catalog = {
      categories: demo.categories.map((category) => ({
        id: category.category_id ?? category.id,
        name: category.name || "?",
        treeId: category.tree_id ?? null,
      })),
      trees: [],
      channels: [],
      semanticJudge: null,
    };
    const source = createAnalysis({
      userId: fixtureId,
      environmentId: "demo",
      status: "done",
      summary: summarize(rows, demo.categories),
      scoringMetadata: createScoringMetadata(),
    });
    updateAnalysis(source.id, { rows, catalog });

    const derived = recalculateAnalysis({
      userId: fixtureId,
      sourceAnalysisId: source.id,
      profileId: "content-quality",
    });
    const persistedSource = getAnalysis(fixtureId, source.id);
    const persistedDerived = getAnalysis(fixtureId, derived.id);
    const derivedRows = getAnalysisRows(fixtureId, derived.id);

    assert.equal(persistedDerived.status, "done");
    assert.equal(persistedDerived.sourceAnalysisId, source.id);
    assert.equal(persistedDerived.scoringMetadata.profile.id, "content-quality");
    assert.equal(persistedDerived.summary.productCount, rows.length);
    assert.equal(derivedRows.length, rows.length);
    assert.equal(persistedDerived.hasScoringFacts, true);
    assert.notEqual(persistedDerived.summary.overall, persistedSource.summary.overall);
    assert.equal(persistedSource.sourceAnalysisId, null);
    assert.equal(persistedSource.scoringMetadata.profile.id, "catalog-health-default");

    const deletion = deleteAnalysis(fixtureId, source.id);
    const derivedAfterSourceDeletion = getAnalysis(fixtureId, derived.id);
    assert.equal(deletion.deleted, true);
    assert.equal(getAnalysis(fixtureId, source.id), null);
    assert.equal(getAnalysisRows(fixtureId, source.id).length, 0);
    assert.equal(derivedAfterSourceDeletion.sourceAnalysisId, null);
    assert.equal(derivedAfterSourceDeletion.summary.productCount, rows.length);

    const running = createAnalysis({
      userId: fixtureId,
      environmentId: "demo",
      status: "running",
    });
    assert.deepEqual(deleteAnalysis(fixtureId, running.id), {
      deleted: false,
      reason: "running",
    });
    assert.equal(getAnalysis(fixtureId, running.id).status, "running");

    throw new RollbackFixture();
  })();
} catch (error) {
  if (!(error instanceof RollbackFixture)) throw error;
}

assert.equal(db.prepare("SELECT 1 FROM users WHERE id = ?").get(fixtureId), undefined);
assert.equal(
  db.prepare("SELECT 1 FROM analyses WHERE user_id = ?").get(fixtureId),
  undefined
);

console.log("Analysis recalculation integration test passed");
