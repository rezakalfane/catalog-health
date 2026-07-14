const freezeProfile = (profile) => Object.freeze({
  ...profile,
  dimensionWeights: Object.freeze({ ...profile.dimensionWeights }),
  thresholds: Object.freeze({ ...profile.thresholds }),
});

export const DEFAULT_SCORING_PROFILE_ID = "catalog-health-default";
export const SCORING_DIMENSIONS = Object.freeze(["content", "structure", "taxonomy", "hygiene", "feed"]);
export const SCORING_THRESHOLD_KEYS = Object.freeze([
  "minDescriptionChars",
  "goodDescriptionChars",
  "minImages",
  "maxSaneCategories",
  "titleMin",
  "titleMax",
]);

export const SCORING_PROFILES = Object.freeze([
  freezeProfile({
    id: DEFAULT_SCORING_PROFILE_ID,
    label: "Balanced",
    version: "1.0.0",
    description: "An even view of content, structure, taxonomy, commerce hygiene, and feed readiness.",
    dimensionWeights: {
      content: 0.25,
      structure: 0.25,
      taxonomy: 0.15,
      hygiene: 0.2,
      feed: 0.15,
    },
    semanticWeight: 0.15,
    thresholds: {
      minDescriptionChars: 200,
      goodDescriptionChars: 500,
      minImages: 2,
      maxSaneCategories: 5,
      titleMin: 10,
      titleMax: 150,
    },
  }),
  freezeProfile({
    id: "content-quality",
    label: "Content Quality",
    version: "1.0.0",
    description: "Prioritizes rich descriptions, stronger titles, and deeper image coverage.",
    dimensionWeights: {
      content: 0.4,
      structure: 0.2,
      taxonomy: 0.1,
      hygiene: 0.1,
      feed: 0.2,
    },
    semanticWeight: 0.15,
    thresholds: {
      minDescriptionChars: 300,
      goodDescriptionChars: 700,
      minImages: 3,
      maxSaneCategories: 4,
      titleMin: 15,
      titleMax: 120,
    },
  }),
  freezeProfile({
    id: "marketplace-readiness",
    label: "Marketplace Readiness",
    version: "1.0.0",
    description: "Emphasizes complete attributes and dependable product-feed data for external channels.",
    dimensionWeights: {
      content: 0.2,
      structure: 0.25,
      taxonomy: 0.1,
      hygiene: 0.15,
      feed: 0.3,
    },
    semanticWeight: 0.15,
    thresholds: {
      minDescriptionChars: 250,
      goodDescriptionChars: 600,
      minImages: 3,
      maxSaneCategories: 5,
      titleMin: 12,
      titleMax: 150,
    },
  }),
  freezeProfile({
    id: "catalog-governance",
    label: "Catalog Governance",
    version: "1.0.0",
    description: "Weights consistent attributes and disciplined taxonomy most heavily.",
    dimensionWeights: {
      content: 0.15,
      structure: 0.3,
      taxonomy: 0.3,
      hygiene: 0.15,
      feed: 0.1,
    },
    semanticWeight: 0.15,
    thresholds: {
      minDescriptionChars: 200,
      goodDescriptionChars: 500,
      minImages: 2,
      maxSaneCategories: 3,
      titleMin: 10,
      titleMax: 120,
    },
  }),
]);

const PROFILES_BY_ID = new Map(SCORING_PROFILES.map((profile) => [profile.id, profile]));

export function isScoringProfileId(profileId) {
  return PROFILES_BY_ID.has(profileId);
}

export function getScoringProfile(profileOrId = DEFAULT_SCORING_PROFILE_ID) {
  if (profileOrId && typeof profileOrId === "object") return profileOrId;
  return PROFILES_BY_ID.get(profileOrId) || PROFILES_BY_ID.get(DEFAULT_SCORING_PROFILE_ID);
}

/** Validate and normalize merchant-authored profile settings. */
export function normalizeScoringProfileInput(input = {}) {
  const label = String(input.label || "").trim();
  const description = String(input.description || "").trim();
  if (!label || label.length > 80) throw new Error("Profile name must be between 1 and 80 characters");
  if (description.length > 400) throw new Error("Profile description must be 400 characters or fewer");

  const dimensionWeights = Object.fromEntries(
    SCORING_DIMENSIONS.map((key) => [key, Number(input.dimensionWeights?.[key])])
  );
  if (Object.values(dimensionWeights).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Every dimension weight must be between 0 and 100%");
  }
  const total = Object.values(dimensionWeights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 0.000001) throw new Error("Dimension weights must total 100%");

  const semanticWeight = Number(input.semanticWeight);
  if (!Number.isFinite(semanticWeight) || semanticWeight < 0 || semanticWeight > 1) {
    throw new Error("Semantic weight must be between 0 and 100%");
  }
  const thresholds = Object.fromEntries(
    SCORING_THRESHOLD_KEYS.map((key) => [key, Number(input.thresholds?.[key])])
  );
  if (Object.values(thresholds).some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Every scoring threshold must be a positive whole number or zero");
  }
  if (thresholds.goodDescriptionChars < thresholds.minDescriptionChars) {
    throw new Error("Good description length must be at least the minimum description length");
  }
  if (thresholds.titleMax < thresholds.titleMin) {
    throw new Error("Maximum title length must be at least the minimum title length");
  }
  if (thresholds.minImages > 50 || thresholds.maxSaneCategories > 100 || thresholds.titleMax > 1000 || thresholds.goodDescriptionChars > 50000) {
    throw new Error("One or more scoring thresholds are outside the supported range");
  }
  return { label, description, dimensionWeights, semanticWeight, thresholds };
}

const defaultProfile = getScoringProfile();
export const DIMENSION_WEIGHTS = defaultProfile.dimensionWeights;
export const SEMANTIC_WEIGHT = defaultProfile.semanticWeight;
export const THRESHOLDS = defaultProfile.thresholds;
