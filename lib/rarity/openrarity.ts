/**
 * Rarity computation (U11, KTD-8).
 *
 * The user-facing ranking is OpenRarity information content: per token, the sum
 * of -log2(probability) across its traits (including the synthetic _trait_count
 * trait per the Trait-Count heuristic), normalized by the collection average.
 * Higher information content = rarer = lower rank number (rank 1 = rarest).
 * Ties are broken deterministically by token_id (the Double-Sort heuristic).
 *
 * A simpler trait-frequency score (sum of 1/probability) is computed and stored
 * as an internal cross-check ONLY - deliberately NOT the user-facing ranking,
 * because summing probabilities computes an OR, not the AND that rarity intends.
 *
 * Pure and deterministic. Zero/unseen probabilities are guarded so no log2(0)
 * can occur. Tokens with no traits must be excluded by the caller (they are
 * "unrevealed" and are never ranked as rarest by accident).
 */

import type { NormalizedTrait } from "./traits";

export const METHOD_VERSION = "openrarity-v2-tiered";
export const TRAIT_COUNT_KEY = "_trait_count";

/**
 * Rarity tier (bucket). The 1/1 tiers are hand-made one-of-ones that carry only
 * 1-2 trait slots, so additive OpenRarity information content buries them below
 * fully-traited standard tokens. They are pulled OUT of the standard 1..N ladder
 * into their own buckets rather than being ranked as near-common (they ARE the
 * rarest). `standard` covers everything else, including the Halloween edition.
 */
export type RarityTier = "community_1of1" | "official_1of1" | "standard";

/** The trait_type that marks a community-artist 1/1. */
const COMMUNITY_1OF1_TRAIT = "Community 1/1";
/** A Special=1/1 token is an official/team one-of-one. */
const SPECIAL_TRAIT = "Special";
const OFFICIAL_1OF1_VALUE = "1/1";

/** Classify a token into its rarity tier from its traits. */
export function tierOf(traits: NormalizedTrait[]): RarityTier {
  if (traits.some((t) => t.traitType === COMMUNITY_1OF1_TRAIT)) return "community_1of1";
  if (traits.some((t) => t.traitType === SPECIAL_TRAIT && t.value === OFFICIAL_1OF1_VALUE)) {
    return "official_1of1";
  }
  return "standard";
}

export interface TraitStat {
  traitType: string;
  value: string;
  count: number;
  probability: number; // count / revealedSupply
}

export interface TokenRarity {
  tokenId: string;
  tier: RarityTier;
  infoContentScore: number; // normalized by collection average
  rarityRank: number | null; // 1 = rarest among STANDARD tokens; null for 1/1 buckets
  traitFreqScore: number; // cross-check
  traitFreqRank: number | null; // cross-check; null for 1/1 buckets
}

/** log base 2. */
const log2 = (x: number) => Math.log(x) / Math.LN2;

/** Null char: never appears in a trait type/value, so it is a collision-safe key delimiter. */
const SEP = String.fromCharCode(0);
const statKey = (type: string, value: string) => `${type}${SEP}${value}`;

/** Group flat traits by token. */
function byToken(traits: NormalizedTrait[]): Map<string, NormalizedTrait[]> {
  const m = new Map<string, NormalizedTrait[]>();
  for (const t of traits) {
    const arr = m.get(t.tokenId) ?? [];
    arr.push(t);
    m.set(t.tokenId, arr);
  }
  return m;
}

/**
 * Compute per (trait_type, value) stats over the revealed collection, including
 * the synthetic `_trait_count` trait_type (how many traits a token has).
 */
export function computeTraitStats(traits: NormalizedTrait[]): TraitStat[] {
  const tokens = byToken(traits);
  const revealedSupply = tokens.size;
  const counts = new Map<string, number>();
  const meta = new Map<string, { traitType: string; value: string }>();
  const bump = (traitType: string, value: string) => {
    const k = statKey(traitType, value);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!meta.has(k)) meta.set(k, { traitType, value });
  };
  for (const [, list] of tokens) {
    for (const t of list) bump(t.traitType, t.value);
    bump(TRAIT_COUNT_KEY, String(list.length));
  }
  const stats: TraitStat[] = [];
  for (const [k, count] of counts) {
    const { traitType, value } = meta.get(k)!;
    stats.push({
      traitType,
      value,
      count,
      probability: revealedSupply > 0 ? count / revealedSupply : 0,
    });
  }
  return stats;
}

/**
 * Compute per-token OpenRarity + trait-frequency scores and ranks.
 * `traits` must contain ONLY revealed tokens (those with >=1 trait).
 */
export function computeRarity(traits: NormalizedTrait[]): TokenRarity[] {
  const tokens = byToken(traits);
  if (tokens.size === 0) return [];

  const stats = computeTraitStats(traits);
  const prob = new Map<string, number>();
  for (const s of stats) prob.set(statKey(s.traitType, s.value), s.probability);
  const probOf = (type: string, value: string) => prob.get(statKey(type, value)) ?? 0;

  interface Raw {
    tokenId: string;
    ic: number;
    freq: number;
  }
  const raw: Raw[] = [];
  for (const [tokenId, list] of tokens) {
    let ic = 0;
    let freq = 0;
    for (const t of list) {
      const p = probOf(t.traitType, t.value);
      if (p > 0) {
        ic += -log2(p);
        freq += 1 / p;
      }
    }
    // Trait-Count heuristic contributes to information content.
    const pc = probOf(TRAIT_COUNT_KEY, String(list.length));
    if (pc > 0) ic += -log2(pc);
    raw.push({ tokenId, ic, freq });
  }

  const avgIc = raw.reduce((s, r) => s + r.ic, 0) / raw.length;

  // Tier each token from its traits. 1/1 buckets are ranked separately (they get
  // no standard rank number), so the standard ladder reads a clean 1..N.
  const tierMap = new Map<string, RarityTier>();
  for (const [tokenId, list] of tokens) tierMap.set(tokenId, tierOf(list));
  const isStandard = (tokenId: string) => tierMap.get(tokenId) === "standard";

  // OpenRarity rank over STANDARD tokens only: highest IC = rarest = rank 1.
  // Double-Sort tiebreak by id. 1/1 tokens are excluded and left null-ranked.
  const standard = raw.filter((r) => isStandard(r.tokenId));
  const byIc = [...standard].sort((a, b) => b.ic - a.ic || a.tokenId.localeCompare(b.tokenId));
  const icRank = new Map<string, number>();
  byIc.forEach((r, i) => icRank.set(r.tokenId, i + 1));

  // Trait-frequency rank (cross-check), also standard-only.
  const byFreq = [...standard].sort((a, b) => b.freq - a.freq || a.tokenId.localeCompare(b.tokenId));
  const freqRank = new Map<string, number>();
  byFreq.forEach((r, i) => freqRank.set(r.tokenId, i + 1));

  return raw
    .map((r) => {
      const std = isStandard(r.tokenId);
      return {
        tokenId: r.tokenId,
        tier: tierMap.get(r.tokenId)!,
        infoContentScore: avgIc > 0 ? r.ic / avgIc : 0,
        rarityRank: std ? icRank.get(r.tokenId)! : null,
        traitFreqScore: r.freq,
        traitFreqRank: std ? freqRank.get(r.tokenId)! : null,
      };
    })
    // Standard tokens by rank (rarest first), then the 1/1 buckets by token_id.
    .sort(
      (a, b) =>
        (a.rarityRank ?? Number.POSITIVE_INFINITY) - (b.rarityRank ?? Number.POSITIVE_INFINITY) ||
        a.tokenId.localeCompare(b.tokenId),
    );
}
