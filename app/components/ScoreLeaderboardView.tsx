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
      <p className="max-w-2xl text-sm text-[var(--muted)]">
        Combined score from holdings (rarity-aware), hold duration (exponential, diamond-hands
        multiplied), and collector progress. Higher is stronger.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No scored wallets yet." hint="Scores populate after the next rebuild." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">
                <th className="p-3 font-medium">#</th>
                <th className="font-medium">Wallet</th>
                <th className="text-right font-medium">Total Score</th>
                <th className="text-right font-medium">$RONKE</th>
                <th className="text-right font-medium">RonkeStr</th>
                <th className="text-right font-medium">Ronkeverse</th>
                <th className="p-3 text-right font-medium">Bodies</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rank = page * pageSize + i + 1;
                const topMax = rows[0]?.score || 1;
                return (
                  <tr key={r.address} className="rv-row border-b border-[var(--border-soft)]">
                    <td className="p-3">
                      <span
                        className={`mono ${rank <= 3 ? "font-bold text-[var(--accent)]" : "text-[var(--muted-2)]"}`}
                      >
                        {rank}
                      </span>
                    </td>
                    <td>
                      <Link href={`/wallet/${r.address}`} className="text-[var(--accent)] hover:underline" title={r.address}>
                        {displayName(r.name, r.address)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className="mono font-semibold text-[var(--foreground)]">{formatCompact(r.score)}</span>
                        <div className="rv-meter w-24">
                          <span style={{ width: `${Math.max(3, (r.score / topMax) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="text-right mono text-[var(--muted)]">{formatCompact(r.ronkeSubscore)}</td>
                    <td className="text-right mono text-[var(--muted)]">{formatCompact(r.ronkestrSubscore)}</td>
                    <td className="text-right mono text-[var(--muted)]">{formatCompact(r.nftSubscore)}</td>
                    <td className="p-3 text-right mono text-[var(--muted-2)]">
                      {r.bodyTypesTotal > 0 ? `${r.bodyTypesHeld}/${r.bodyTypesTotal}` : "—"}
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
