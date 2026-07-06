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
      className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 ${
        hero ? "sm:col-span-2" : ""
      }`}
    >
      <div className="text-xs text-[var(--muted-2)]">{label}</div>
      <div className={`mono mt-2 font-bold tracking-tight ${hero ? "text-4xl" : "text-[22px]"}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-sm text-[var(--muted)]">{sub}</div> : null}
    </div>
  );
}
