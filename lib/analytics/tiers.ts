/**
 * Hand-tier engine: one rolling "let-go rate" that both the ERC-20 and the
 * ERC-721 paths share.
 *
 * The rule it replaces asked "is this ONE transfer at least 10% of your bag?".
 * For a token that is a real proportional test. For an NFT every transfer moves
 * exactly one unit, so the same question degenerates into "do you hold ten or
 * fewer?" - and any wallet above that line disposed of its collection without
 * the engine ever recording a sale. See HAND_TIERS in config/contracts.ts.
 *
 * What this measures instead: over any rolling window, the share of the
 * position the wallet let go. The denominator is what it held when the window
 * opened PLUS anything it acquired inside the window, so a wallet that is
 * actively buying is not punished for churn, and the number reads the same at
 * any wallet size.
 *
 * Three things come out of it:
 *  - the LIFETIME PEAK rate, which gates diamond and is never forgiven;
 *  - dumping EPISODES, opened when a window reaches the paper line;
 *  - a REBUILD TARGET, a share of the largest position the wallet ever took
 *    into a dump, which it must currently hold to leave paper.
 *
 * The rebuild target deliberately uses the largest such position rather than
 * the most recent one. Measured against the most recent, a wallet that dumps,
 * rebuilds, then dumps again has its target reset to the wreckage of the first
 * dump: 0xa8da6b89 went 76 -> 16, and would read "recovered" while holding a
 * fifth of what it started with.
 */

import {
  HAND_TIERS,
  DIAMOND_THRESHOLDS,
  sentenceDaysFor,
  type DiamondBucket,
} from "@/config/contracts";
import { MS_PER_DAY } from "./types";

const WINDOW_MS = HAND_TIERS.windowDays * MS_PER_DAY;
const GAP_MS = HAND_TIERS.episodeGapDays * MS_PER_DAY;

interface Sale {
  t: number;
  qty: number;
  /** Units held immediately before this sale. */
  heldBefore: number;
}

interface Episode {
  start: number;
  end: number;
  /** Units held when the window that crossed the line opened. */
  baseline: number;
}

export interface TierInputs {
  /** Units held right now. */
  heldNow: number;
  /** Age of the oldest surviving position, in days. */
  durationDays: number;
  /** False for a wallet that has fully exited. */
  hasHoldings: boolean;
  /** False for a dust position, which cannot be diamond. */
  nonDust: boolean;
  asOf: Date;
}

export interface TierOutcome {
  bucket: DiamondBucket;
  peakSellRate: number;
  /** Episodes that cleared the position floor. */
  episodeCount: number;
  rebuildTarget: number;
  rebuildHeld: number;
  sentenceServedDays: number;
  sentenceRequiredDays: number;
}

/**
 * Accumulates one wallet's sales for one asset. Callers feed events in
 * ascending block order and act on `crossed` to reset holding clocks.
 */
export class TierTracker {
  /** Rolling window of sales. Never cleared, so the peak is a lifetime figure. */
  private window: Sale[] = [];
  private buys: { t: number; qty: number }[] = [];
  private peak = 0;
  private episodes: Episode[] = [];

  /** An acquisition. Counts toward the denominator of any live window. */
  acquire(at: Date, qty: number): void {
    if (qty <= 0) return;
    this.buys.push({ t: at.getTime(), qty });
  }

  /**
   * A genuine sale. Returns whether this sale put the wallet's rolling window
   * at or above the paper line, which is when holding clocks reset.
   */
  sell(at: Date, qty: number, heldBefore: number): { crossed: boolean; rate: number } {
    if (qty <= 0) return { crossed: false, rate: 0 };
    const t = at.getTime();
    this.window = this.window.filter((s) => t - s.t < WINDOW_MS);
    this.buys = this.buys.filter((b) => t - b.t < WINDOW_MS);
    this.window.push({ t, qty, heldBefore });

    const opened = this.window[0];
    const boughtSince = this.buys
      .filter((b) => b.t >= opened.t)
      .reduce((n, b) => n + b.qty, 0);
    const denom = opened.heldBefore + boughtSince;
    const sold = this.window.reduce((n, s) => n + s.qty, 0);
    const rate = denom > 0 ? sold / denom : 0;
    if (rate > this.peak) this.peak = rate;

    if (rate < HAND_TIERS.paperLinePct) return { crossed: false, rate };

    const last = this.episodes[this.episodes.length - 1];
    if (last && t - last.end < GAP_MS) last.end = t;
    else this.episodes.push({ start: t, end: t, baseline: opened.heldBefore });
    return { crossed: true, rate };
  }

  /**
   * Resolve the wallet's tier. Episodes out of a position below the floor still
   * reset holding clocks (a dump is a dump) but do not brand the wallet, so a
   * one-NFT seller is not filed alongside a wallet that unloaded 300.
   */
  resolve(input: TierInputs): TierOutcome {
    const qualifying = this.episodes.filter(
      (e) => e.baseline >= HAND_TIERS.minPositionForEpisode,
    );
    const base: TierOutcome = {
      bucket: "regular",
      peakSellRate: this.peak,
      episodeCount: qualifying.length,
      rebuildTarget: 0,
      rebuildHeld: input.heldNow,
      sentenceServedDays: 0,
      sentenceRequiredDays: 0,
    };

    // A wallet holding nothing keeps today's behaviour and reads paper. The
    // proposal's "no tier at all" needs a fourth enum value, which would be a
    // breaking change for /api/v1 consumers; deferred deliberately.
    if (!input.hasHoldings) return { ...base, bucket: "paper" };

    if (qualifying.length === 0) {
      const clean =
        this.peak < HAND_TIERS.diamondLinePct &&
        input.nonDust &&
        input.durationDays >= DIAMOND_THRESHOLDS.diamondDays;
      return { ...base, bucket: clean ? "diamond" : "regular" };
    }

    // Largest position ever taken into a dump, so the target cannot ratchet down.
    const highWater = Math.max(...qualifying.map((e) => e.baseline));
    const target = Math.ceil(highWater * HAND_TIERS.rebuildPct);
    const latest = qualifying[qualifying.length - 1];
    const served = (input.asOf.getTime() - latest.end) / MS_PER_DAY;
    const required = sentenceDaysFor(qualifying.length);
    const out: TierOutcome = {
      ...base,
      rebuildTarget: target,
      sentenceServedDays: Math.max(0, served),
      sentenceRequiredDays: required,
    };
    // Both, not either: time served AND still holding the position back.
    const free = served >= required && input.heldNow >= target;
    return { ...out, bucket: free ? "regular" : "paper" };
  }
}

