/** Horizontal bar chart for distributions (histogram / trait values). */
export function BarChart({
  bars,
  label,
}: {
  bars: { label: string; count: number }[];
  label?: string;
}) {
  if (bars.length === 0) return <div className="text-sm text-neutral-500">No data yet.</div>;
  const max = Math.max(...bars.map((b) => b.count), 1);
  return (
    <div className="space-y-1" aria-label={label}>
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-neutral-400" title={b.label}>
            {b.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--border)]">
            <div
              className="h-full rounded bg-[var(--accent)]"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">{b.count}</span>
        </div>
      ))}
    </div>
  );
}
