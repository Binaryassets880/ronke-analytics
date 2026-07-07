import Link from "next/link";
import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";
import type { LeaderboardRow } from "@/lib/queries";
import { DiamondBadge } from "./DiamondBadge";
import { EmptyState } from "./States";
import { LeaderboardModes } from "./LeaderboardModes";
import { displayName, formatCompact, formatDuration, toWholeTokens, assetToParam } from "@/lib/format";

/** Holdings leaderboard (U8): current holders ranked by balance, paginated. */
export function LeaderboardView({
  asset,
  page,
  rows,
  pageSize = 50,
}: {
  asset: Asset;
  page: number;
  rows: LeaderboardRow[];
  pageSize?: number;
}) {
  const isNft = asset === "ronkeverse_nft";
  const assetParam = assetToParam(asset);
  const label = CONTRACTS[asset].label;
  const href = (nextPage: number) =>
    `/leaderboard?asset=${assetParam}&by=size&page=${nextPage}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{label} · Holdings</h1>
        <LeaderboardModes active="size" assetParam={assetParam} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No holders on this page." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">
                <th className="p-3 font-medium">#</th>
                <th className="font-medium">Wallet</th>
                <th className="font-medium">{isNft ? "Tokens" : "Balance"}</th>
                <th className="font-medium">Held</th>
                <th className="p-3 font-medium">Hands</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rank = page * pageSize + i + 1;
                const amount = isNft ? r.tokenCount : toWholeTokens(BigInt(r.balance), asset);
                const topAmount = isNft
                  ? rows[0]?.tokenCount || 1
                  : toWholeTokens(BigInt(rows[0]?.balance ?? "0"), asset) || 1;
                return (
                  <tr key={r.address} className="rv-row border-b border-[var(--border-soft)]">
                    <td className="p-3">
                      <span className={`mono ${rank <= 3 ? "font-bold text-[var(--accent)]" : "text-[var(--muted-2)]"}`}>
                        {rank}
                      </span>
                    </td>
                    <td>
                      <Link href={`/wallet/${r.address}`} className="text-[var(--accent)] hover:underline" title={r.address}>
                        {displayName(r.name, r.address)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-1">
                        <span className="mono text-[var(--foreground)]">{formatCompact(amount)}</span>
                        <div className="rv-meter w-24">
                          <span style={{ width: `${Math.max(3, (amount / topAmount) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="mono text-[var(--muted)]">{formatDuration(r.holdingDurationDays)}</td>
                    <td className="p-3">
                      <DiamondBadge bucket={r.diamondBucket} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        {page > 0 ? (
          <Link href={href(page - 1)} className="text-[var(--accent)] hover:underline">
            ← Prev
          </Link>
        ) : (
          <span />
        )}
        {rows.length === pageSize ? (
          <Link href={href(page + 1)} className="text-[var(--accent)] hover:underline">
            Next →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
