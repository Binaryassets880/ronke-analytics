/**
 * Ronke Score configuration (S-series).
 *
 * The Ronke Score is a single per-wallet number combining a $RONKE sub-score and
 * a Ronkeverse sub-score, each = holding + (duration x diamond) [+ collector for
 * NFTs]. Every weight/curve lives here so the score can be tuned without touching
 * the scoring engine (lib/score/compute.ts). Grounded in the founder's ask:
 * holding (rarity-aware for NFTs), exponential duration gated by a minimum hold,
 * a diamond-hands multiplier, and a collector bonus for completing body types.
 *
 * Design choices (confirmed): ONE combined score + per-asset sub-scores;
 * DIMINISHING returns on holding size (log for $RONKE, sub-linear count for NFTs)
 * so a long-term diamond-hand mid-holder can out-score a passive mega-whale.
 */

export const SCORE_CONFIG = {
  ronke: {
    /** Holding points = holdWeight * log10(1 + balanceWhole). Diminishing. */
    holdWeight: 150,
  },
  nft: {
    /** Count points = base * count^countExp (sub-linear, dampens quantity). */
    base: 25,
    countExp: 0.6,
    /** Rarity points = rarityWeight * sum(rarityFactor), rarer tokens worth more. */
    rarityWeight: 60,
  },
  duration: {
    /** Duration points = base * growthPerMonth ^ min(months, capMonths). Exponential. */
    base: 40,
    growthPerMonth: 1.25,
    capMonths: 24,
  },
  /** Diamond-hands multiplier applied to duration points (amplifies longevity). */
  diamond: {
    neverSold: 1.0,
    soldNotPaper: 0.6,
    everPaperSold: 0.3,
  },
  /** Duration only accrues while the wallet holds at least this much (anti-farm gate). */
  gate: {
    minRonke: 100_000, // whole $RONKE
    minNftCount: 1,
  },
  collector: {
    /** The Ronkeverse trait whose full set is the collector achievement. */
    bodyTrait: "Body",
    /** Points per distinct body type held. */
    perType: 150,
    /** Extra kicker for holding all body types. */
    fullKicker: 1000,
  },
} as const;
