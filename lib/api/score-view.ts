/**
 * Internal WalletScore -> public API shape.
 *
 * Kept pure and separate from the routes so the published contract is one
 * readable object rather than an emergent property of a handler, and so a
 * rename inside `lib/queries.ts` cannot silently change what third parties see.
 *
 * Conventions, all deliberate:
 *  - snake_case keys. This is a public JSON API consumed from any language, not
 *    the site's internal TypeScript.
 *  - `score` leads. It is the number the community actually reads and talks
 *    about, so it is first-class here and in the docs.
 *  - `rank` is the field the docs steer gates toward: absolute scores shift
 *    whenever the weights are retuned (the July calibration moved #1 from
 *    17,133 to 8,830), while "top 100" stays 100 people through any retune.
 *  - `percentile` rides along for callers who want a gate that also survives
 *    community GROWTH, which rank does not: "top 100" quietly tightens as the
 *    holder base expands, "top 1%" does not.
 */

import type { WalletScore } from "@/lib/queries";

export interface PublicScore {
  address: string;
  /** Primary .ron name when known, else null. */
  name: string | null;
  /**
   * False when the wallet carries no Ronke Score. NOT an error: deriveScores
   * drops zero-score wallets, so absence means "scored zero", and a 404 here
   * would make every game show an error screen for its newest players.
   */
  found: boolean;
  score: number;
  /** Competition rank (ties share the lower rank). Null when unscored. */
  rank: number | null;
  /**
   * 0-100 within the scored population. Null when unscored - deliberately not
   * 0, because a real 0 percentile (genuine last place) is a different fact
   * from "not ranked at all", and collapsing them would corrupt banding math.
   */
  percentile: number | null;
  subscores: {
    ronke: number;
    ronkestr: number;
    nft: number;
  };
  breakdown: {
    ronke_holding: number;
    ronke_duration: number;
    ronke_diamond_mult: number;
    ronkestr_holding: number;
    ronkestr_duration: number;
    ronkestr_diamond_mult: number;
    nft_holding: number;
    nft_duration: number;
    nft_diamond_mult: number;
    collector_points: number;
    body_types_held: number;
    body_types_total: number;
    oneofone_points: number;
    oneofone_count: number;
  };
}

/** The zeroed shape for a wallet with no score. Same keys, so clients stay typed. */
function empty(address: string, name: string | null): PublicScore {
  return {
    address,
    name,
    found: false,
    score: 0,
    rank: null,
    percentile: null,
    subscores: { ronke: 0, ronkestr: 0, nft: 0 },
    breakdown: {
      ronke_holding: 0,
      ronke_duration: 0,
      ronke_diamond_mult: 0,
      ronkestr_holding: 0,
      ronkestr_duration: 0,
      ronkestr_diamond_mult: 0,
      nft_holding: 0,
      nft_duration: 0,
      nft_diamond_mult: 0,
      collector_points: 0,
      body_types_held: 0,
      body_types_total: 0,
      oneofone_points: 0,
      oneofone_count: 0,
    },
  };
}

export function toPublicScore(
  score: WalletScore | null | undefined,
  address: string,
  name: string | null = null,
): PublicScore {
  if (!score) return empty(address, name);
  return {
    address,
    name,
    found: true,
    score: score.score,
    rank: score.rank,
    percentile: score.percentile,
    subscores: {
      ronke: score.ronkeSubscore,
      ronkestr: score.ronkestrSubscore,
      nft: score.nftSubscore,
    },
    breakdown: {
      ronke_holding: score.ronkeHolding,
      ronke_duration: score.ronkeDuration,
      ronke_diamond_mult: score.ronkeDiamondMult,
      ronkestr_holding: score.ronkestrHolding,
      ronkestr_duration: score.ronkestrDuration,
      ronkestr_diamond_mult: score.ronkestrDiamondMult,
      nft_holding: score.nftHolding,
      nft_duration: score.nftDuration,
      nft_diamond_mult: score.nftDiamondMult,
      collector_points: score.collectorPoints,
      body_types_held: score.bodyTypesHeld,
      body_types_total: score.bodyTypesTotal,
      oneofone_points: score.oneOfOnePoints,
      oneofone_count: score.oneOfOneCount,
    },
  };
}
