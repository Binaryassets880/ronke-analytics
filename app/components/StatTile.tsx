/** A headline stat tile. `hero` enlarges it for the overview's lead metric. */
export function StatTile({
  label,
  value,
  sub,
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 ${
        hero ? "sm:col-span-2" : ""
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-1 font-semibold ${hero ? "text-4xl" : "text-2xl"}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-neutral-400">{sub}</div> : null}
    </div>
  );
}
