function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function ScoringMetadataLine({ metadata }) {
  if (!metadata) return null;

  const profile = metadata.profile || {};
  const semantic = metadata.semantic || {};
  const weights = Object.entries(profile.dimensionWeights || {})
    .map(([name, weight]) => `${name} ${percent(weight)}`)
    .join(", ");
  const title = [
    weights ? `Heuristic weights: ${weights}` : null,
    profile.semanticWeight != null ? `Semantic weight: ${percent(profile.semanticWeight)}` : null,
    semantic.applied ? `Semantic prompt: ${semantic.promptVersion || "unknown"}` : null,
  ].filter(Boolean).join(". ");

  return (
    <span className="analysis-meta-line" title={title || undefined}>
      <span className="scoring-meta-part">
        scoring engine {metadata.engineVersion || "unknown"}
      </span>
      {profile.id && (
        <span className="scoring-meta-part">
          {profile.id} {profile.version || ""}
        </span>
      )}
      {semantic.applied && (
        <span className="scoring-meta-part">
          semantic {semantic.judgeLabel || semantic.model || "judge"}
        </span>
      )}
    </span>
  );
}
