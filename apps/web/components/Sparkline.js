"use client";

/**
 * Score-over-time sparkline (0–100 scale), pure SVG, no dependencies.
 * points: [{ createdAt, overall, id?, grade?, productCount? }] oldest -> newest
 * When points carry an `id`, they are clickable (→ that analysis) and show
 * a tooltip with date, product count, score, and grade on hover.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Sparkline({ points, width = 220, height = 48 }) {
  const router = useRouter();
  const [hover, setHover] = useState(null);

  if (!points?.length) return <span className="muted">No history yet</span>;

  const pad = 4;
  const xs = points.map(
    (_, i) => pad + (i * (width - pad * 2)) / Math.max(points.length - 1, 1)
  );
  const ys = points.map(
    (p) => height - pad - (p.overall / 100) * (height - pad * 2)
  );
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  const last = points[points.length - 1];
  const hovered = hover != null ? points[hover] : null;

  function open(point) {
    if (point.id) router.push(`/analyses/${point.id}`);
  }

  return (
    <span className="sparkline" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Health score history, latest ${last.overall}`}
      >
        <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2" />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r={hover === i ? 4.5 : i === xs.length - 1 ? 3.5 : 2}
            fill="var(--signal)"
          />
        ))}
        {/* Invisible, larger hit targets on top of the tiny dots */}
        {xs.map((x, i) => (
          <circle
            key={`hit-${i}`}
            cx={x}
            cy={ys[i]}
            r={10}
            fill="transparent"
            style={points[i].id ? { cursor: "pointer" } : undefined}
            tabIndex={points[i].id ? 0 : undefined}
            role={points[i].id ? "link" : undefined}
            aria-label={`Analysis of ${new Date(points[i].createdAt).toLocaleDateString()}, score ${points[i].overall}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => open(points[i])}
            onKeyDown={(e) => e.key === "Enter" && open(points[i])}
          />
        ))}
      </svg>
      {hovered && (
        <span
          className="spark-tip"
          style={{
            left: Math.min(Math.max(xs[hover], 55), width - 55),
            top: ys[hover] - 10,
          }}
        >
          <span className="spark-tip-date">
            {new Date(hovered.createdAt).toLocaleString()}
          </span>
          {hovered.productCount != null && <>{hovered.productCount} products · </>}
          <strong>{hovered.overall}</strong>/100
          {hovered.grade && (
            <>
              {" · "}
              <strong className={`spark-grade ${hovered.grade}`}>{hovered.grade}</strong>
            </>
          )}
        </span>
      )}
    </span>
  );
}
