import Link from "next/link";
import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";
import type { LeaderboardRow } from "@/lib/queries";
import { DiamondBadge } from "./DiamondBadge";
import { EmptyState } from "./States";
import { LeaderboardModes } from "./LeaderboardModes";
import { displayName, formatCompact, formatDuration, toWholeTokens, assetToParam } from "@/lib/format";

/** Holder-race leaderboard (U8): rank by size or by diamond score, paginated. */
export function LeaderboardView({
  asset,
  by,
  page,
  rows,
  pageSize = 50,
}: {
  asset: Asset;
  by: "size" | "diamond";
  page: number;
  rows: LeaderboardRow[];
  pageSize?: number;
}) {
  const isNft = asset === "ronkeverse_nft";
  const assetParam = assetToParam(asset);
  const label = CONTRACTS[asset].label;
  const href = (nextBy: "size" | "diamond", nextPage: number) =>
    `/leaderboard?asset=${assetParam}&by=${nextBy}&page=${nextPage}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{label} · Holder race</h1>
        <LeaderboardModes active={by} assetParam={assetParam} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No holders on this page." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-neutral-400">
                <th className="p-3">#</th>
                <th>Wallet</th>
                <th>{isNft ? "Tokens" : "Balance"}</th>
                <th>Held</th>
                <th>Hands</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.address} className="border-b border-[var(--border)]/50">
                  <td className="p-3 tabular-nums text-neutral-500">{page * pageSize + i + 1}</td>
                  <td>
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
      )}

      <div className="flex justify-between text-sm">
        {page > 0 ? (
          <Link href={href(by, page - 1)} className="text-[var(--accent)] hover:underline">
            ← Prev
          </Link>
        ) : (
          <span />
        )}
        {rows.length === pageSize ? (
          <Link href={href(by, page + 1)} className="text-[var(--accent)] hover:underline">
            Next →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
