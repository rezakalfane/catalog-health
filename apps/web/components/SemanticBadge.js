/**
 * Small badge marking an analysis that included the semantic (LLM) scoring
 * pass. An analysis "has semantic" when its summary carries the semantic
 * dimension average (present even in list responses).
 */

export function hasSemantic(analysis) {
  return analysis?.summary?.dimensionAverages?.semantic != null;
}

export default function SemanticBadge({ analysis }) {
  if (!hasSemantic(analysis)) return null;
  return (
    <span className="semantic-badge" title="Includes semantic (LLM) scoring">
      ✦ semantic
    </span>
  );
}
