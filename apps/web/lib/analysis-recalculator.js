import {
  createScoringMetadata,
  getScoringProfile,
  rescoreCatalogRows,
  summarize,
} from "@catalog-health/core";
import {
  analysisStatus,
  createAnalysis,
  getAnalysis,
  getAnalysisRows,
  updateAnalysis,
} from "./db.js";

/**
 * Create a completed analysis by replaying a source analysis's immutable
 * scoring facts under another profile. No store or model calls are made.
 */
export function recalculateAnalysis({ userId, sourceAnalysisId, profileId }) {
  const source = getAnalysis(userId, sourceAnalysisId);
  if (!source) {
    const error = new Error("Analysis not found");
    error.status = 404;
    throw error;
  }
  if (analysisStatus(source) !== "done" || !source.hasRows) {
    const error = new Error("Only completed analyses with product details can be recalculated");
    error.status = 409;
    throw error;
  }

  const sourceProfileId = source.scoringMetadata?.profile?.id;
  if (sourceProfileId === profileId) {
    const error = new Error("Choose a different scoring profile");
    error.status = 400;
    throw error;
  }

  const profile = getScoringProfile(profileId);
  const sourceRows = getAnalysisRows(userId, sourceAnalysisId);
  if (!sourceRows.length || sourceRows.some((row) => !row.details)) {
    const error = new Error(
      "This analysis predates stored scoring facts and cannot be recalculated"
    );
    error.status = 409;
    throw error;
  }

  const startedAt = Date.now();
  const semanticApplied = sourceRows.some((row) => row.scores?.semantic != null);
  const sourceSemantic = source.scoringMetadata?.semantic;
  const scoringMetadata = createScoringMetadata({
    semanticRequested: sourceSemantic?.requested || semanticApplied,
    semanticApplied,
    semanticJudge: semanticApplied
      ? {
          provider: sourceSemantic?.provider || null,
          model: sourceSemantic?.model || null,
          label: sourceSemantic?.judgeLabel || source.catalog?.semanticJudge || null,
        }
      : null,
    profile,
  });

  const derived = createAnalysis({
    userId,
    environmentId: source.environmentId,
    status: "running",
    progress: {
      percent: 50,
      stage: "score",
      label: `Recalculating with ${profile.label}…`,
      detail: `${sourceRows.length} stored products`,
    },
    scoringMetadata,
    sourceAnalysisId: source.id,
  });

  try {
    const categories = source.catalog?.categories || [];
    const rows = rescoreCatalogRows(sourceRows, categories, profile);
    const summary = summarize(rows, categories);
    return updateAnalysis(derived.id, {
      status: "done",
      progress: { percent: 100, stage: "done", label: "Recalculation complete", detail: null },
      summary,
      rows,
      catalog: source.catalog,
      scoringMetadata,
      durationMs: Date.now() - startedAt,
      semanticMs: null,
      error: null,
    });
  } catch (error) {
    updateAnalysis(derived.id, {
      status: "failed",
      progress: null,
      error: error.message || "Recalculation failed",
    });
    throw error;
  }
}
