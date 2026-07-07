/**
 * Plain-English explanation of the Ronke Score (S-series), in ONE place so the
 * same copy renders both inline on the profile (RonkeScoreCard disclosure) and as
 * the canonical, linkable methodology section on the Resources page
 * (/resources#ronke-score). Keep it non-technical: holders, not engineers, read this.
 *
 * Design decision (2026-07-07): the deep explanation lives on a real, shareable URL
 * (people ask "how does this work?" in Discord - you want a link to drop), with a
 * lightweight expandable summary on the card itself. No modal/popup: a popup isn't
 * linkable, is hostile on mobile, and hides the content from search.
 */

export interface ScoreFactor {
  emoji: string;
  title: string;
  body: string;
}

export const SCORE_EXPLAINER = {
  /** The anchor id used on the Resources page; the card's "Learn more" links here. */
  anchor: "ronke-score",

  headline: "How the Ronke Score works",

  intro:
    "Your Ronke Score is a single number that rewards being a real, long-term member of " +
    "the Ronke ecosystem. It looks at everything you hold - $RONKE, RonkeStr, and Ronkeverse " +
    "NFTs - and rewards holding more, holding longer, and never selling. It is designed so a " +
    "committed mid-sized holder can out-rank a passive whale.",

  factors: [
    {
      emoji: "💰",
      title: "How much you hold",
      body:
        "Your $RONKE and RonkeStr balances and your Ronkeverse NFTs all add points. It uses " +
        "diminishing returns, so a whale with 100x the bag does not get 100x the points - " +
        "size helps, but it never runs away with the score. Rarer NFTs are worth more than common ones.",
    },
    {
      emoji: "⏳",
      title: "How long you have held",
      body:
        "The longer you hold, the more your duration points grow. This only starts counting once " +
        "you hold a meaningful amount, so nobody can farm it with a dust wallet. Recent top-ups pull " +
        "your clock toward the new coins, and selling 10% or more of your holdings in one go resets " +
        "the clock entirely - the score reflects how long you have really been in.",
    },
    {
      emoji: "💎",
      title: "Diamond hands",
      body:
        "Never selling multiplies your duration points. Small trims are forgiven - selling under 10% " +
        "of your holdings does not break your streak - but selling 10% or more counts as a real sell: " +
        "it reduces your multiplier and resets your holding clock. Dumping right after buying (paper " +
        "hands) reduces the multiplier the most. Moving coins to staking, a bridge, or a game never " +
        "counts as selling - you still own them.",
    },
    {
      emoji: "🖼️",
      title: "Collector & 1/1 bonuses",
      body:
        "On the Ronkeverse side, holding more of the 10 body types earns a collector bonus, with an " +
        "extra kicker for completing the full set. Owning hand-made 1-of-1 pieces (community or official) " +
        "adds a dedicated showpiece bonus on top - one 1/1 is tuned to be worth roughly as much as " +
        "bulk-buying 40 common pieces.",
    },
  ] as ScoreFactor[],

  howToRaise: [
    "Hold more $RONKE, RonkeStr, or Ronkeverse - across the whole ecosystem, not just one asset.",
    "Hold for the long term, and avoid selling so your diamond-hands multiplier stays at full.",
    "Collect across body types and chase rarer pieces to grow the Ronkeverse side.",
  ],

  note:
    "The score is behavioral, not price-based: because $RONKE has no reliable price, \"diamond hands\" " +
    "means you genuinely never sold, not that you are in profit. Every weight is tunable and the score " +
    "is rebuilt from on-chain history, so it can be recalibrated as the community grows.",
} as const;
