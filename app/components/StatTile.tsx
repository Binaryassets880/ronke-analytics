import { InfoTip } from "./Tip";

/** A headline stat tile. `hero` enlarges it for the overview's lead metric. */
export function StatTile({
  label,
  value,
  sub,
  hint,
  hero = false,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Optional plain-English explanation of the metric, shown as a hover "i". */
  hint?: string;
  hero?: boolean;
  /** Optional extra classes on the value (e.g. an accent color). */
  valueClassName?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 ${
        hero ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-center text-xs text-[var(--muted-2)]">
        <span>{label}</span>
        {hint ? <InfoTip text={hint} /> : null}
      </div>
      <div className={`mono mt-2 font-bold tracking-tight ${hero ? "text-4xl" : "text-[22px]"}${valueClassName ? ` ${valueClassName}` : ""}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-sm text-[var(--muted)]">{sub}</div> : null}
    </div>
  );
}
