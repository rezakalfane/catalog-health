/**
 * Score-over-time sparkline (0–100 scale), pure SVG, no dependencies.
 * points: [{ createdAt, overall }] oldest -> newest
 */
export default function Sparkline({ points, width = 220, height = 48 }) {
  if (!points?.length) return <span className="muted">No history yet</span>;
  const pad = 4;
  const xs = points.map(
    (_, i) => pad + (i * (width - pad * 2)) / Math.max(points.length - 1, 1)
  );
  const ys = points.map(
    (p) => height - pad - ((p.overall / 100) * (height - pad * 2))
  );
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Health score history, latest ${last.overall}`}
    >
      <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 3.5 : 2} fill="var(--signal)" />
      ))}
    </svg>
  );
}
