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
  const isNft = asset === "ronkeverse_nft";

  const amount = (r: HolderRow) => (isNft ? r.tokenCount : Number(r.balance));
  const sorted = [...rows].sort((a, b) =>
    sort === "amount" ? amount(b) - amount(a) : b.holdingDurationDays - a.holdingDurationDays,
  );

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No holders yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-neutral-400">
            <th className="py-2">Wallet</th>
            <th>
              <button className="hover:text-white" onClick={() => setSort("amount")} aria-label="Sort by amount">
                {isNft ? "Tokens" : "Balance"} {sort === "amount" ? "▾" : ""}
              </button>
            </th>
            <th>
              <button className="hover:text-white" onClick={() => setSort("duration")} aria-label="Sort by holding duration">
                Held {sort === "duration" ? "▾" : ""}
              </button>
            </th>
            <th>Hands</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.address} className="border-b border-[var(--border)]/50">
              <td className="py-2">
                <Link href={`/wallet/${r.address}`} className="text-[var(--accent)] hover:underline" title={r.address}>
                  {displayName(r.name, r.address)}
                </Link>
              </td>
              <td className="tabular-nums">
                {isNft ? r.tokenCount : formatCompact(toWholeTokens(BigInt(r.balance), asset))}
              </td>
              <td className="tabular-nums text-neutral-300">{formatDuration(r.holdingDurationDays)}</td>
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
