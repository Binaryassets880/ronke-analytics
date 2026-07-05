/**
 * Minimal theme-aware area/line chart (inline SVG, no deps). Follows dataviz
 * principles: single accent series, accessible label, scrolls nothing.
 */
export function TrendChart({
  points,
  label,
  height = 120,
}: {
  points: { x: string; y: number }[];
  label: string;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="text-sm text-neutral-500">No data yet.</div>;
  }
  const w = 600;
  const h = height;
  const pad = 8;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p.y - min) / range);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={`${label}: ${points[0].x} to ${points[points.length - 1].x}`}
      >
        <path d={area} fill="var(--accent)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-neutral-500">
        <span>{points[0].x}</span>
        <span>{label}</span>
        <span>{points[points.length - 1].x}</span>
      </figcaption>
    </figure>
  );
}
