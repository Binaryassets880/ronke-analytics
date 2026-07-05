/** Pre-backfill state: history is still being gathered (not "broken zeros"). */
export function PreBackfill() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
      <div className="text-3xl" aria-hidden>
        {"\u{1F6F0}"}
      </div>
      <h2 className="mt-2 text-lg font-semibold">Gathering on-chain history…</h2>
      <p className="mt-1 text-sm text-neutral-400">
        The full transfer history is being ingested. Holder stats appear once the
        one-time backfill completes.
      </p>
    </div>
  );
}

/** Generic empty state. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
      <p className="text-neutral-300">{title}</p>
      {hint ? <p className="mt-1 text-sm text-neutral-500">{hint}</p> : null}
    </div>
  );
}
