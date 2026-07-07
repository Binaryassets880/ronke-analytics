"use client";

import { useState } from "react";
import Link from "next/link";
import type { HolderRow } from "@/lib/queries";
import type { Asset } from "@/config/contracts";
import { DiamondBadge } from "./DiamondBadge";
import { displayName, formatCompact, formatDuration, toWholeTokens } from "@/lib/format";

type SortKey = "amount" | "duration";

/** Sortable holder table (client-side sort by balance/count or holding duration). */
export function HolderTable({ rows, asset }: { rows: HolderRow[]; asset: Asset }) {
  const [sort, setSort] = useState<SortKey>("amount");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const isNft = asset === "ronkeverse_nft";

  function toggle(key: SortKey) {
    if (key === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDir("desc");
    }
  }

  const amount = (r: HolderRow) => (isNft ? r.tokenCount : Number(r.balance));
  const sign = dir === "desc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) =>
    sort === "amount"
      ? sign * (amount(b) - amount(a))
      : sign * (b.holdingDurationDays - a.holdingDurationDays),
  );
  const caret = dir === "desc" ? "▾" : "▴";

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted-2)]">No holders yet.</p>;
  }

  function SortHeader({
    label,
    ariaLabel,
    sortKey,
    className = "",
  }: {
    label: string;
    ariaLabel: string;
    sortKey: SortKey;
    className?: string;
  }) {
    const active = sort === sortKey;
    return (
      <th className={className}>
        <button
          className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--foreground)] ${
            active ? "text-[var(--accent)]" : ""
          }`}
          onClick={() => toggle(sortKey)}
          aria-label={ariaLabel}
        >
          {label}
          <span className={active ? "opacity-100" : "opacity-30"} aria-hidden>
            {active ? caret : "▾"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">
            <th className="py-2 font-medium">Wallet</th>
            <SortHeader label={isNft ? "Tokens" : "Balance"} ariaLabel="Sort by amount" sortKey="amount" className="font-medium" />
            <SortHeader label="Held" ariaLabel="Sort by holding duration" sortKey="duration" className="font-medium" />
            <th className="font-medium">Hands</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.address} className="rv-row border-b border-[var(--border-soft)]">
              <td className="py-2">
                <Link href={`/wallet/${r.address}`} className="text-[var(--accent)] hover:underline" title={r.address}>
                  {displayName(r.name, r.address)}
                </Link>
              </td>
              <td className="mono">
                {isNft ? r.tokenCount : formatCompact(toWholeTokens(BigInt(r.balance), asset))}
              </td>
              <td className="mono text-[var(--muted)]">{formatDuration(r.holdingDurationDays)}</td>
              <td>
                <DiamondBadge bucket={r.diamondBucket} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
