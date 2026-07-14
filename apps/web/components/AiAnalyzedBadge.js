import ActionIcon from "@/components/ActionIcon";

export default function AiAnalyzedBadge({ analyzed, title = "AI analyzed" }) {
  if (!analyzed) return null;
  return (
    <span className="ai-analyzed-badge" title={title} role="img" aria-label={title}>
      <ActionIcon name="sparkle" />
    </span>
  );
}
