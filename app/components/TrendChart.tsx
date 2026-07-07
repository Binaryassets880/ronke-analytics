"use client";

import { useState } from "react";

/**
 * Theme-aware area/line trend chart (inline SVG, no deps).
 *
 * Tufte-minded: the data is the ink. Two faint reference lines carry the min/max
 * scale, the latest value is labelled directly, and a hover crosshair lets you
 * read any point's exact date + value instead of only seeing the shape.
 */
function fmt(n: number, format: "full" | "compact"): string {
  if (format === "compact") {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString();
}

export function TrendChart({
  points,
  label,
  height = 140,
  format = "full",
}: {
  points: { x: string; y: number }[];
  label: string;
  height?: number;
  format?: "full" | "compact";
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <div className="text-sm text-[var(--muted-2)]">No data yet.</div>;
  }

  const w = 600;
  const h = height;
  const padX = 8;
  const padTop = 10;
  const padBottom = 10;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const plotH = h - padTop - padBottom;
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = padTop + plotH * (1 - (p.y - min) / range);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - padBottom} L${coords[0][0].toFixed(1)},${h - padBottom} Z`;

  const last = points[points.length - 1];
  const active = hover != null ? hover : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1))));
    setHover(idx);
  }

  const tipLeftPct = active != null && points.length > 1 ? (active / (points.length - 1)) * 100 : 0;

  return (
    <figure className="w-full">
      {/* Header: label + current value, so the number is readable at a glance. */}
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-[var(--muted)]">{label}</span>
        <span className="mono text-lg font-semibold text-[var(--foreground)]">{fmt(last.y, format)}</span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ height }}
          className="w-full touch-none"
          role="img"
          aria-label={`${label}: ${fmt(min, format)} to ${fmt(max, format)} from ${points[0].x} to ${last.x}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Reference lines carry the scale without a heavy axis. */}
          <line x1={padX} x2={w - padX} y1={padTop} y2={padTop} stroke="var(--border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={padX} x2={w - padX} y1={h - padBottom} y2={h - padBottom} stroke="var(--border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={area} fill="var(--accent)" opacity={0.12} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {/* Latest point marker. */}
          <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={3.5} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
          {/* Hover crosshair + point. */}
          {active != null ? (
            <>
              <line x1={coords[active][0]} x2={coords[active][0]} y1={padTop} y2={h - padBottom} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} vectorEffect="non-scaling-stroke" />
              <circle cx={coords[active][0]} cy={coords[active][1]} r={4} fill="var(--accent)" stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>

        {/* Min/max scale labels, pinned to the plot edges. */}
        <span className="pointer-events-none absolute right-1 top-0 mono text-[10px] text-[var(--muted-3)]">{fmt(max, format)}</span>
        <span className="pointer-events-none absolute bottom-0 right-1 mono text-[10px] text-[var(--muted-3)]">{fmt(min, format)}</span>

        {/* Tooltip: exact date + value for the hovered point. */}
        {active != null ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-[var(--border-strong)] bg-[var(--card-2)] px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, tipLeftPct))}%` }}
          >
            <div className="mono font-semibold text-[var(--foreground)]">{fmt(points[active].y, format)}</div>
            <div className="text-[var(--muted-2)]">{points[active].x}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-xs text-[var(--muted-2)]">
        <span>{points[0].x}</span>
        <span>{last.x}</span>
      </div>
    </figure>
  );
}
