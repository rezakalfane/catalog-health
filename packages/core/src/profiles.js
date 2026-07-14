const freezeProfile = (profile) => Object.freeze({
  ...profile,
  dimensionWeights: Object.freeze({ ...profile.dimensionWeights }),
  thresholds: Object.freeze({ ...profile.thresholds }),
});

export const DEFAULT_SCORING_PROFILE_ID = "catalog-health-default";

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

const defaultProfile = getScoringProfile();
export const DIMENSION_WEIGHTS = defaultProfile.dimensionWeights;
export const SEMANTIC_WEIGHT = defaultProfile.semanticWeight;
export const THRESHOLDS = defaultProfile.thresholds;
