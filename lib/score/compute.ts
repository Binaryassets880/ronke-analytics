/**
 * Ronke Score engine (S-series). Pure + unit-tested; the DB assembly lives in
 * lib/score/derive.ts. Computes a combined score plus $RONKE and Ronkeverse
 * sub-scores, each broken down so the profile can explain how it was earned.
 */

import { SCORE_CONFIG as C } from "@/config/score";

/** Per-asset holding behavior (from holder_metrics). */
export interface AssetHold {
  durationDays: number;
  neverSold: boolean;
  everPaperSold: boolean;
}

export interface ScoreInput {
  /** Whole $RONKE held (0 if none). */
  ronkeBalanceWhole: number;
  /** $RONKE holder_metrics, or null if never a token holder. */
  ronkeHold: AssetHold | null;
  /** One rarity factor per held Ronkeverse NFT, in (0,1]; rarer = higher. */
  nftRarityFactors: number[];
  /** Ronkeverse holder_metrics, or null if never an NFT holder. */
  nftHold: AssetHold | null;
  /** Distinct Body trait values currently held, and the total that exist. */
  bodyTypesHeld: number;
  bodyTypesTotal: number;
}

export interface ScoreResult {
  score: number; // combined, rounded
  ronkeSubscore: number;
  nftSubscore: number;
  breakdown: {
    ronkeHoldingPoints: number;
    ronkeDurationPoints: number; // after diamond multiplier
    ronkeDiamondMult: number;
    nftHoldingPoints: number;
    nftDurationPoints: number; // after diamond multiplier
    nftDiamondMult: number;
    collectorPoints: number;
    bodyTypesHeld: number;
    bodyTypesTotal: number;
  };
}

/** Exponential duration points, capped. Pure. */
export function durationPoints(days: number): number {
  const months = Math.min(Math.max(days, 0) / 30, C.duration.capMonths);
  return C.duration.base * Math.pow(C.duration.growthPerMonth, months);
}

/** Diamond-hands multiplier from behavioral flags. Pure. */
export function diamondMultiplier(hold: AssetHold): number {
  if (hold.neverSold) return C.diamond.neverSold;
  if (hold.everPaperSold) return C.diamond.everPaperSold;
  return C.diamond.soldNotPaper;
}

const round = (n: number) => Math.round(n);

export function computeScore(input: ScoreInput): ScoreResult {
  // ── $RONKE sub-score ──────────────────────────────────────────────
  const ronkeHoldingPoints =
    input.ronkeBalanceWhole > 0 ? C.ronke.holdWeight * Math.log10(1 + input.ronkeBalanceWhole) : 0;
  const ronkeDiamondMult = input.ronkeHold ? diamondMultiplier(input.ronkeHold) : 0;
  const ronkeGated = input.ronkeBalanceWhole >= C.gate.minRonke;
  const ronkeDurationRaw = input.ronkeHold && ronkeGated ? durationPoints(input.ronkeHold.durationDays) : 0;
  const ronkeDurationPoints = ronkeDurationRaw * ronkeDiamondMult;
  const ronkeSubscore = ronkeHoldingPoints + ronkeDurationPoints;

  // ── Ronkeverse sub-score ──────────────────────────────────────────
  const count = input.nftRarityFactors.length;
  const nftCountPoints = count > 0 ? C.nft.base * Math.pow(count, C.nft.countExp) : 0;
  const nftRarityPoints = C.nft.rarityWeight * input.nftRarityFactors.reduce((s, f) => s + f, 0);
  const nftHoldingPoints = nftCountPoints + nftRarityPoints;

  const nftDiamondMult = input.nftHold ? diamondMultiplier(input.nftHold) : 0;
  const nftGated = count >= C.gate.minNftCount;
  const nftDurationRaw = input.nftHold && nftGated ? durationPoints(input.nftHold.durationDays) : 0;
  const nftDurationPoints = nftDurationRaw * nftDiamondMult;

  const collectorPoints =
    C.collector.perType * input.bodyTypesHeld +
    (input.bodyTypesTotal > 0 && input.bodyTypesHeld >= input.bodyTypesTotal ? C.collector.fullKicker : 0);

  const nftSubscore = nftHoldingPoints + nftDurationPoints + collectorPoints;

  return {
    score: round(ronkeSubscore + nftSubscore),
    ronkeSubscore: round(ronkeSubscore),
    nftSubscore: round(nftSubscore),
    breakdown: {
      ronkeHoldingPoints: round(ronkeHoldingPoints),
      ronkeDurationPoints: round(ronkeDurationPoints),
      ronkeDiamondMult,
      nftHoldingPoints: round(nftHoldingPoints),
      nftDurationPoints: round(nftDurationPoints),
      nftDiamondMult,
      collectorPoints: round(collectorPoints),
      bodyTypesHeld: input.bodyTypesHeld,
      bodyTypesTotal: input.bodyTypesTotal,
    },
  };
}
