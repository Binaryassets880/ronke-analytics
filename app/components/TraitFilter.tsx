"use client";

import { useRouter } from "next/navigation";
import type { TraitDistribution } from "@/lib/queries";

/**
 * Single-select trait filter (U12). Multi-trait AND-filtering is deferred. On
 * selection it navigates to /rarity?tt=<type>&tv=<value>; "All" clears. Options
 * are addressed by a flat index so trait values with any characters are safe.
 */
export function TraitFilter({
  distributions,
  active,
}: {
  distributions: TraitDistribution[];
  active?: { traitType: string; value: string };
}) {
  const router = useRouter();

  const flat: { traitType: string; value: string; count: number }[] = [];
  for (const d of distributions) {
    for (const v of d.values) flat.push({ traitType: d.traitType, value: v.value, count: v.count });
  }

  const activeIndex = active
    ? flat.findIndex((f) => f.traitType === active.traitType && f.value === active.value)
    : -1;

  const onPick = (raw: string) => {
    const idx = Number(raw);
    if (Number.isNaN(idx) || idx < 0 || idx >= flat.length) {
      router.push("/rarity");
      return;
    }
    const f = flat[idx];
    router.push(`/rarity?tt=${encodeURIComponent(f.traitType)}&tv=${encodeURIComponent(f.value)}`);
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Filter trait</span>
      <select
        aria-label="Filter by trait"
        value={activeIndex >= 0 ? String(activeIndex) : ""}
        onChange={(e) => onPick(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1"
      >
        <option value="">All tokens</option>
        {distributions.map((d) => (
          <optgroup key={d.traitType} label={d.traitType}>
            {d.values.map((v) => {
              const idx = flat.findIndex((f) => f.traitType === d.traitType && f.value === v.value);
              return (
                <option key={v.value} value={idx}>
                  {v.value} ({v.count})
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
