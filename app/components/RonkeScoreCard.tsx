import type { WalletScore } from "@/lib/queries";
import { formatCompact } from "@/lib/format";

/**
 * The wallet's Ronke Score, front and center on the profile (S-series), with a
 * transparent breakdown so a holder understands exactly how it was earned:
 * $RONKE and Ronkeverse sub-scores, each split into holding and duration (with
 * its diamond-hands multiplier), plus collector progress on the NFT side.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="tabular-nums text-neutral-200">{value}</span>
    </div>
  );
}

function mult(m: number): string {
  return `×${m.toFixed(m < 1 ? 2 : 1)}`;
}

export function RonkeScoreCard({ score }: { score: WalletScore }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-sky-500/10 via-[var(--card)] to-emerald-500/10 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">Ronke Score</div>
          <div className="mt-1 text-4xl font-bold tabular-nums">{score.score.toLocaleString()}</div>
        </div>
        {score.rank ? (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Rank</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">#{score.rank.toLocaleString()}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">$RONKE</span>
            <span className="tabular-nums text-sm font-semibold">{formatCompact(score.ronkeSubscore)}</span>
          </div>
          <Row label="Holding" value={formatCompact(score.ronkeHolding)} />
          <Row
            label={`Duration ${mult(score.ronkeDiamondMult)} diamond`}
            value={formatCompact(score.ronkeDuration)}
          />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">RonkeStr</span>
            <span className="tabular-nums text-sm font-semibold">{formatCompact(score.ronkestrSubscore)}</span>
          </div>
          <Row label="Holding" value={formatCompact(score.ronkestrHolding)} />
          <Row
            label={`Duration ${mult(score.ronkestrDiamondMult)} diamond`}
            value={formatCompact(score.ronkestrDuration)}
          />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Ronkeverse</span>
            <span className="tabular-nums text-sm font-semibold">{formatCompact(score.nftSubscore)}</span>
          </div>
          <Row label="Holding (rarity-weighted)" value={formatCompact(score.nftHolding)} />
          <Row
            label={`Duration ${mult(score.nftDiamondMult)} diamond`}
            value={formatCompact(score.nftDuration)}
          />
          <Row
            label={`Collector${score.bodyTypesTotal > 0 ? ` (${score.bodyTypesHeld}/${score.bodyTypesTotal} bodies)` : ""}`}
            value={formatCompact(score.collectorPoints)}
          />
          {score.oneOfOneCount > 0 ? (
            <Row
              label={`1/1 bonus (${score.oneOfOneCount}×)`}
              value={formatCompact(score.oneOfOnePoints)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
