/**
 * Horizontal bar chart for distributions (histogram / trait values / hands).
 *
 * Bars can carry a semantic color (e.g. diamond-green vs paper-orange) so the
 * category reads without a legend; each row shows both the raw count and its
 * share of the total, bar length encodes magnitude against the largest bucket.
 */
export function BarChart({
  bars,
  label,
}: {
  bars: { label: string; count: number; color?: string }[];
  label?: string;
}) {
  if (bars.length === 0) return <div className="text-sm text-[var(--muted-2)]">No data yet.</div>;
  const max = Math.max(...bars.map((b) => b.count), 1);
  const total = bars.reduce((s, b) => s + b.count, 0);
  return (
    <div className="space-y-2" aria-label={label}>
      {bars.map((b) => {
        const pct = total > 0 ? (b.count / total) * 100 : 0;
        const fill = b.color ?? "var(--accent)";
        return (
          <div key={b.label} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-[var(--muted)]" title={b.label}>
              {b.label}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(b.count / max) * 100}%`, background: fill }}
              />
            </div>
            <span className="mono w-14 shrink-0 text-right font-medium text-[var(--foreground)]">
              {b.count.toLocaleString()}
            </span>
            <span className="mono w-12 shrink-0 text-right text-xs text-[var(--muted-2)]">
              {pct.toFixed(pct < 10 ? 1 : 0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
