import Link from "next/link";
import type { ScoreLeaderboardRow } from "@/lib/queries";
import { EmptyState } from "./States";
import { LeaderboardModes } from "./LeaderboardModes";
import { displayName, formatCompact } from "@/lib/format";

/**
 * Global Ronke Score leaderboard (S-series). Ranks wallets by their combined
 * Ronke Score, with the $RONKE / Ronkeverse sub-scores and body-set progress
 * shown so the ranking is legible at a glance.
 */
export function ScoreLeaderboardView({
  page,
  rows,
  pageSize = 50,
}: {
  page: number;
  rows: ScoreLeaderboardRow[];
  pageSize?: number;
}) {
  const href = (nextPage: number) => `/leaderboard?by=score&page=${nextPage}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Ronke Score · Leaderboard</h1>
        <LeaderboardModes active="score" />
      </div>
      <p className="text-sm text-neutral-400">
        Combined score from holdings (rarity-aware), hold duration (exponential, diamond-hands
        multiplied), and collector progress. Higher is stronger.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No scored wallets yet." hint="Scores populate after the next rebuild." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-neutral-400">
                <th className="p-3">#</th>
                <th>Wallet</th>
                <th className="text-right">Total Score</th>
                <th className="text-right">$RONKE Score</th>
                <th className="text-right">RonkeStr Score</th>
                <th className="text-right">Ronkeverse Score</th>
                <th className="text-right">Bodies</th>
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
                  <td className="text-right font-semibold tabular-nums">{formatCompact(r.score)}</td>
                  <td className="text-right tabular-nums text-neutral-300">{formatCompact(r.ronkeSubscore)}</td>
                  <td className="text-right tabular-nums text-neutral-300">{formatCompact(r.ronkestrSubscore)}</td>
                  <td className="text-right tabular-nums text-neutral-300">{formatCompact(r.nftSubscore)}</td>
                  <td className="text-right tabular-nums text-neutral-400">
                    {r.bodyTypesTotal > 0 ? `${r.bodyTypesHeld}/${r.bodyTypesTotal}` : "—"}
                  </td>
                </tr>
              ))}
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
