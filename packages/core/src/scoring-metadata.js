import { getScoringProfile } from "./profiles.js";
import { SEMANTIC_PROMPT_VERSION } from "./semantic.js";

// These versions describe scoring behavior, independently of the app package version.
// Bump the engine version for scoring-code changes and the profile version for changes
// to the default weights or thresholds.
export const SCORING_METADATA_SCHEMA_VERSION = 1;
export const SCORING_ENGINE_VERSION = "1.0.0";

/** Create an immutable snapshot of every setting that can affect analysis scores. */
export function createScoringMetadata({
  semanticRequested = false,
  semanticApplied = false,
  semanticJudge = null,
  profile: profileOrId,
} = {}) {
  const profile = getScoringProfile(profileOrId);
  return {
    schemaVersion: SCORING_METADATA_SCHEMA_VERSION,
    engineVersion: SCORING_ENGINE_VERSION,
    profile: {
      id: profile.id,
      label: profile.label,
      version: profile.version,
      dimensionWeights: { ...profile.dimensionWeights },
      thresholds: { ...profile.thresholds },
      semanticWeight: profile.semanticWeight,
    },
    semantic: {
      requested: Boolean(semanticRequested),
      applied: Boolean(semanticApplied),
      promptVersion: SEMANTIC_PROMPT_VERSION,
      provider: semanticJudge?.provider || null,
      model: semanticJudge?.model || null,
      judgeLabel: semanticJudge?.label || null,
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/**
 * Compare only metadata that can change the resulting scores. Operational
 * context such as `semantic.requested` is retained in the snapshot but does
 * not affect compatibility when semantic scoring was not applied.
 */
export function compareScoringMetadata(base, target) {
  if (!base || !target) {
    return {
      known: false,
      comparable: false,
      differences: ["Scoring metadata is unavailable for one or both legacy analyses."],
    };
  }

  const differences = [];
  if (base.schemaVersion !== target.schemaVersion) differences.push("metadata schema version");
  if (base.engineVersion !== target.engineVersion) differences.push("scoring engine version");
  if (base.profile?.id !== target.profile?.id) differences.push("scoring profile");
  if (base.profile?.version !== target.profile?.version) differences.push("scoring profile version");
  if (!same(base.profile?.dimensionWeights, target.profile?.dimensionWeights)) {
    differences.push("dimension weights");
  }
  if (!same(base.profile?.thresholds, target.profile?.thresholds)) {
    differences.push("scoring thresholds");
  }

  const baseSemantic = Boolean(base.semantic?.applied);
  const targetSemantic = Boolean(target.semantic?.applied);
  if (baseSemantic !== targetSemantic) {
    differences.push("semantic scoring inclusion");
  } else if (baseSemantic && targetSemantic) {
    if (base.profile?.semanticWeight !== target.profile?.semanticWeight) {
      differences.push("semantic weight");
    }
    if (base.semantic?.promptVersion !== target.semantic?.promptVersion) {
      differences.push("semantic prompt version");
    }
    if (base.semantic?.provider !== target.semantic?.provider) {
      differences.push("semantic provider");
    }
    if (base.semantic?.model !== target.semantic?.model) {
      differences.push("semantic model");
    }
  }

  return { known: true, comparable: differences.length === 0, differences };
}
