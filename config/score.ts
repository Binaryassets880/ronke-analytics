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
  ronkestr: {
    /**
     * RonkeStr ($RONKE Strategy) holding points = holdWeight * log10(1 + balanceWhole).
     * Mirrors the $RONKE curve so a long-term diamond mid-holder still out-scores a
     * passive whale. Tune independently once RonkeStr's holder distribution is known.
     */
    holdWeight: 150,
  },
  nft: {
    /** Count points = base * count^countExp (sub-linear, dampens quantity). */
    base: 25,
    countExp: 0.6,
    /**
     * Rarity points = rarityWeight * (sum rarityFactor)^rarityExp. rarer tokens
     * worth more. rarityExp < 1 dampens the sum so a mega-bag of NFTs can't farm
     * unbounded rarity points - buying more NFTs helps with diminishing returns,
     * matching the count curve, instead of scaling linearly. (Was linear: rarityExp
     * effectively 1.0, which let the biggest NFT bag dominate the whole leaderboard.)
     */
    rarityWeight: 60,
    rarityExp: 0.6,
  },
  duration: {
    /**
     * Duration points = base * growthPerMonth ^ min(months, capMonths). Still
     * exponential (longevity should compound) but far gentler than the original
     * 1.25/mo, which hockey-sticked to ~8,470 at the cap and made duration ~36% of
     * ALL points on the NFT side. At 1.15/mo the cap is ~1,430, so long holders are
     * clearly rewarded without a single old token dwarfing everything else.
     */
    base: 50,
    growthPerMonth: 1.15,
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
    /**
     * Whole $RONKE required for $RONKE duration to accrue. Lowered 100k -> 50k
     * (2026-07-07): 100k credited loyalty to only the top ~4.5% of holders while
     * the median holder holds ~4 tokens; 50k reaches ~6.3% and, crucially, pairs
     * with minRonkestr below at the SAME supply share (~0.006% of held supply) so
     * both token communities clear an equivalent skin-in-the-game bar.
     */
    minRonke: 50_000,
    /**
     * Whole RonkeStr required for RonkeStr duration to accrue. Kept at 1,000 (NOT
     * halved): against the real 230-holder distribution 1,000 already passes ~71%
     * of holders (it only excludes sub-1,000 dust / fresh flippers), and 50k RONKE
     * / 1,000 RONKESTR sit at the same ~0.006% share of each token's held supply.
     * Dropping to 500 would make RonkeStr loyalty cheaper to earn than $RONKE's.
     */
    minRonkestr: 1_000,
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
  /**
   * Flat bonus per one-of-one (1/1) Ronkeverse held, community OR official. The
   * 107 community + 52 official 1/1s are the collection's hand-made showpieces;
   * additive OpenRarity buries them (only 1-2 trait slots), so they earn this
   * dedicated bonus instead of relying on the rarity curve. Tunable.
   */
  oneOfOne: {
    bonus: 500,
  },
} as const;
