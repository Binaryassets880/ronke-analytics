/**
 * Ronke Score engine (S-series). Pure + unit-tested; the DB assembly lives in
 * lib/score/derive.ts. Computes a combined score plus $RONKE and Ronkeverse
 * sub-scores, each broken down so the profile can explain how it was earned.
 */

import { SCORE_CONFIG as C } from "@/config/score";
import type { DiamondBucket } from "@/config/contracts";

/** Per-asset holding behavior (from holder_metrics). */
export interface AssetHold {
  durationDays: number;
  neverSold: boolean;
  everPaperSold: boolean;
  /**
   * The wallet's tier for this asset. When present it is the sole input to the
   * multiplier. Before 2026-08-23 the multiplier read the two flags above while
   * the displayed badge came from `bucketFor`, which applies holdings, dust and
   * duration gates the flags know nothing about - so the two disagreed on 8,248
   * wallet-asset rows, always in the wallet's favour. Optional so a caller that
   * only has the legacy flags still gets a sane answer.
   */
  bucket?: DiamondBucket;
}

export interface ScoreInput {
  /** Whole $RONKE held (0 if none). */
  ronkeBalanceWhole: number;
  /** $RONKE holder_metrics, or null if never a token holder. */
  ronkeHold: AssetHold | null;
  /** Whole RonkeStr held (0 if none). */
  ronkestrBalanceWhole: number;
  /** RonkeStr holder_metrics, or null if never a RonkeStr holder. */
  ronkestrHold: AssetHold | null;
  /** One rarity factor per held Ronkeverse NFT, in (0,1]; rarer = higher. */
  nftRarityFactors: number[];
  /** Ronkeverse holder_metrics, or null if never an NFT holder. */
  nftHold: AssetHold | null;
  /** Distinct Body trait values currently held, and the total that exist. */
  bodyTypesHeld: number;
  bodyTypesTotal: number;
  /** Count of one-of-one (1/1) Ronkeverse held - community + official. */
  oneOfOneCount: number;
  /** PewPew units held at level >= SCORE_CONFIG.units.minLevel (0 if none). */
  unitsCount?: number;
  /** PewPew units of any level held (0 if none). */
  unitsTotal?: number;
}

export interface ScoreResult {
  score: number; // combined, rounded
  ronkeSubscore: number;
  ronkestrSubscore: number;
  nftSubscore: number;
  unitsSubscore: number;
  breakdown: {
    ronkeHoldingPoints: number;
    ronkeDurationPoints: number; // after diamond multiplier
    ronkeDiamondMult: number;
    ronkestrHoldingPoints: number;
    ronkestrDurationPoints: number; // after diamond multiplier
    ronkestrDiamondMult: number;
    nftHoldingPoints: number;
    nftDurationPoints: number; // after diamond multiplier
    nftDiamondMult: number;
    collectorPoints: number;
    oneOfOnePoints: number; // flat 1/1 bonus
    oneOfOneCount: number;
    bodyTypesHeld: number;
    bodyTypesTotal: number;
    unitsCount: number; // level 10+ units held
    unitsCounted: number; // the ones that earn points (capped)
    unitsHeld: number; // units of any level held
    unitsHoldPoints: number; // holding bonus (part of unitsSubscore)
  };
}

/** Exponential duration points, capped. Pure. */
export function durationPoints(days: number): number {
  const months = Math.min(Math.max(days, 0) / 30, C.duration.capMonths);
  return C.duration.base * Math.pow(C.duration.growthPerMonth, months);
}

/**
 * Hand-tier multiplier. Pure.
 *
 * Reads the tier when the caller has one, so the badge on the profile and the
 * multiplier in the score can never disagree again. Falls back to the legacy
 * flags otherwise.
 */
export function diamondMultiplier(hold: AssetHold): number {
  if (hold.bucket) {
    if (hold.bucket === "diamond") return C.diamond.neverSold;
    if (hold.bucket === "paper") return C.diamond.everPaperSold;
    return C.diamond.soldNotPaper;
  }
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

  // ── RonkeStr sub-score (mirrors the $RONKE token math) ────────────
  const ronkestrHoldingPoints =
    input.ronkestrBalanceWhole > 0 ? C.ronkestr.holdWeight * Math.log10(1 + input.ronkestrBalanceWhole) : 0;
  const ronkestrDiamondMult = input.ronkestrHold ? diamondMultiplier(input.ronkestrHold) : 0;
  const ronkestrGated = input.ronkestrBalanceWhole >= C.gate.minRonkestr;
  const ronkestrDurationRaw =
    input.ronkestrHold && ronkestrGated ? durationPoints(input.ronkestrHold.durationDays) : 0;
  const ronkestrDurationPoints = ronkestrDurationRaw * ronkestrDiamondMult;
  const ronkestrSubscore = ronkestrHoldingPoints + ronkestrDurationPoints;

  // ── Ronkeverse sub-score ──────────────────────────────────────────
  const count = input.nftRarityFactors.length;
  const nftCountPoints = count > 0 ? C.nft.base * Math.pow(count, C.nft.countExp) : 0;
  // Dampen the rarity sum sub-linearly (rarityExp < 1) so a huge NFT bag earns
  // rarity points with diminishing returns instead of scaling linearly with count.
  const raritySum = input.nftRarityFactors.reduce((s, f) => s + f, 0);
  const nftRarityPoints = raritySum > 0 ? C.nft.rarityWeight * Math.pow(raritySum, C.nft.rarityExp) : 0;
  const nftHoldingPoints = nftCountPoints + nftRarityPoints;

  const nftDiamondMult = input.nftHold ? diamondMultiplier(input.nftHold) : 0;
  const nftGated = count >= C.gate.minNftCount;
  const nftDurationRaw = input.nftHold && nftGated ? durationPoints(input.nftHold.durationDays) : 0;
  const nftDurationPoints = nftDurationRaw * nftDiamondMult;

  const collectorPoints =
    C.collector.perType * input.bodyTypesHeld +
    (input.bodyTypesTotal > 0 && input.bodyTypesHeld >= input.bodyTypesTotal ? C.collector.fullKicker : 0);

  // Flat bonus per 1/1 held (community or official) - the showpiece flex.
  const oneOfOnePoints = C.oneOfOne.bonus * Math.max(0, input.oneOfOneCount);

  const nftSubscore = nftHoldingPoints + nftDurationPoints + collectorPoints + oneOfOnePoints;

  // ── PewPew units sub-score (level 10+, capped, no duration) ───────
  const unitsCount = Math.max(0, Math.floor(input.unitsCount ?? 0));
  const unitsCounted = Math.min(unitsCount, C.units.maxCount);
  const unitsLevelPoints = unitsCounted > 0 ? C.units.base * Math.pow(unitsCounted, C.units.countExp) : 0;
  // Holding bonus from holdMin units of any level, capped at holdMaxCount.
  const unitsHeld = Math.max(0, Math.floor(input.unitsTotal ?? 0));
  const unitsHoldPoints = unitsHeld >= C.units.holdMin
    ? C.units.holdBase * Math.pow(Math.min(unitsHeld, C.units.holdMaxCount) / C.units.holdMin, C.units.holdExp)
    : 0;
  const unitsSubscore = unitsLevelPoints + unitsHoldPoints;

  return {
    score: round(ronkeSubscore + ronkestrSubscore + nftSubscore) + round(unitsSubscore),
    ronkeSubscore: round(ronkeSubscore),
    ronkestrSubscore: round(ronkestrSubscore),
    nftSubscore: round(nftSubscore),
    unitsSubscore: round(unitsSubscore),
    breakdown: {
      ronkeHoldingPoints: round(ronkeHoldingPoints),
      ronkeDurationPoints: round(ronkeDurationPoints),
      ronkeDiamondMult,
      ronkestrHoldingPoints: round(ronkestrHoldingPoints),
      ronkestrDurationPoints: round(ronkestrDurationPoints),
      ronkestrDiamondMult,
      nftHoldingPoints: round(nftHoldingPoints),
      nftDurationPoints: round(nftDurationPoints),
      nftDiamondMult,
      collectorPoints: round(collectorPoints),
      oneOfOnePoints: round(oneOfOnePoints),
      oneOfOneCount: input.oneOfOneCount,
      bodyTypesHeld: input.bodyTypesHeld,
      bodyTypesTotal: input.bodyTypesTotal,
      unitsCount,
      unitsCounted,
      unitsHeld,
      unitsHoldPoints: round(unitsHoldPoints),
    },
  };
}
