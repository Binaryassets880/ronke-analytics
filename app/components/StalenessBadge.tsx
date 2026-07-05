import { formatTimestamp, hoursSince } from "@/lib/format";

/**
 * Surfaces data freshness (KTD-3 / R5). Shows the last rebuild time and flags
 * data older than the expected refresh window (default 36h - the daily sync
 * plus slack) so live-but-stale data is visible, not silently wrong.
 */
export function StalenessBadge({
  lastRebuildAt,
  staleAfterHours = 36,
  now,
}: {
  lastRebuildAt: string | null;
  staleAfterHours?: number;
  now?: Date;
}) {
  const hrs = hoursSince(lastRebuildAt, now);
  const stale = hrs === null || hrs > staleAfterHours;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        stale
          ? "border-amber-500/40 text-amber-300"
          : "border-emerald-500/30 text-emerald-300"
      }`}
      title={`Snapshots last rebuilt: ${formatTimestamp(lastRebuildAt)}`}
    >
      <span aria-hidden>{stale ? "⚠" : "✓"}</span>
      {stale ? "data may be stale" : "up to date"}
      <span className="text-neutral-500">· {formatTimestamp(lastRebuildAt)}</span>
    </span>
  );
}
