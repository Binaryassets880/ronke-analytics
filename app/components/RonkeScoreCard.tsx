import type { ReactNode } from "react";
import Link from "next/link";
import type { WalletScore } from "@/lib/queries";
import { formatCompact } from "@/lib/format";
import { SCORE_EXPLAINER } from "@/config/scoreExplainer";

/**
 * The wallet's Ronke Score, front and center on the profile (S-series), with a
 * transparent breakdown so a holder understands exactly how it was earned:
 * $RONKE and Ronkeverse sub-scores, each split into holding and duration (with
 * its diamond-hands multiplier), plus collector progress on the NFT side.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="mono text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function mult(m: number): string {
  return `×${m.toFixed(m < 1 ? 2 : 1)}`;
}

function Panel({ title, subscore, children }: { title: string; subscore: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3.5">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--border-soft)] pb-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="mono text-sm font-semibold text-[var(--accent)]">{subscore}</span>
      </div>
      {children}
    </div>
  );
}

export function RonkeScoreCard({ score, address }: { score: WalletScore; address?: string }) {
  return (
    <section
      className="rounded-2xl border border-[var(--border)] p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--card)) 0%, var(--card) 45%, color-mix(in srgb, var(--diamond) 12%, var(--card)) 100%)",
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--muted-2)]">Ronke Score</div>
          <div className="mono mt-1 text-4xl font-bold text-[var(--accent)]">{score.score.toLocaleString()}</div>
        </div>
        {score.rank ? (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-[var(--muted-2)]">Rank</div>
            <div className="mono mt-1 text-2xl font-semibold">#{score.rank.toLocaleString()}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="$RONKE" subscore={formatCompact(score.ronkeSubscore)}>
          <Row label="Holding" value={formatCompact(score.ronkeHolding)} />
          <Row label={`Duration (${mult(score.ronkeDiamondMult)})`} value={formatCompact(score.ronkeDuration)} />
        </Panel>

        <Panel title="RonkeStr" subscore={formatCompact(score.ronkestrSubscore)}>
          <Row label="Holding" value={formatCompact(score.ronkestrHolding)} />
          <Row label={`Duration (${mult(score.ronkestrDiamondMult)})`} value={formatCompact(score.ronkestrDuration)} />
        </Panel>

        <Panel title="Ronkeverse" subscore={formatCompact(score.nftSubscore)}>
          <Row label="Holding (rarity-weighted)" value={formatCompact(score.nftHolding)} />
          <Row label={`Duration (${mult(score.nftDiamondMult)})`} value={formatCompact(score.nftDuration)} />
          <Row
            label={`Collector${score.bodyTypesTotal > 0 ? ` (${score.bodyTypesHeld}/${score.bodyTypesTotal} bodies)` : ""}`}
            value={formatCompact(score.collectorPoints)}
          />
          {score.oneOfOneCount > 0 ? (
            <Row label={`1/1 bonus (${score.oneOfOneCount}×)`} value={formatCompact(score.oneOfOnePoints)} />
          ) : null}
        </Panel>
      </div>

      <details className="group mt-3 rounded-xl border border-[var(--border-soft)] bg-[var(--card-2)] px-3.5 py-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--foreground)]">
          <span>How is this calculated?</span>
          <span className="text-[var(--muted-2)] transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-2.5 space-y-2 border-t border-[var(--border-soft)] pt-2.5">
          {SCORE_EXPLAINER.factors.map((f) => (
            <p key={f.title} className="text-xs leading-relaxed text-[var(--muted)]">
              <span className="font-semibold text-[var(--foreground)]">
                {f.emoji} {f.title}.
              </span>{" "}
              {f.body}
            </p>
          ))}
          <div className="flex flex-wrap gap-x-4 pt-1">
            <Link
              href={`/resources#${SCORE_EXPLAINER.anchor}`}
              className="inline-block text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Learn more about the Ronke Score →
            </Link>
            <Link
              href={
                address
                  ? `/resources?sim=${address}#score-calculator`
                  : "/resources#score-calculator"
              }
              className="inline-block text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Simulate improvements in the calculator →
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
