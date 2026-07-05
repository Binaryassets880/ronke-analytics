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

export const METHOD_VERSION = "openrarity-v1";
export const TRAIT_COUNT_KEY = "_trait_count";

export interface TraitStat {
  traitType: string;
  value: string;
  count: number;
  probability: number; // count / revealedSupply
}

export interface TokenRarity {
  tokenId: string;
  infoContentScore: number; // normalized by collection average
  rarityRank: number; // 1 = rarest (OpenRarity)
  traitFreqScore: number; // cross-check
  traitFreqRank: number; // cross-check
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

  // OpenRarity rank: highest IC = rarest = rank 1. Double-Sort tiebreak by id.
  const byIc = [...raw].sort((a, b) => b.ic - a.ic || a.tokenId.localeCompare(b.tokenId));
  const icRank = new Map<string, number>();
  byIc.forEach((r, i) => icRank.set(r.tokenId, i + 1));

  // Trait-frequency rank (cross-check): highest freq = rarest = rank 1.
  const byFreq = [...raw].sort((a, b) => b.freq - a.freq || a.tokenId.localeCompare(b.tokenId));
  const freqRank = new Map<string, number>();
  byFreq.forEach((r, i) => freqRank.set(r.tokenId, i + 1));

  return raw
    .map((r) => ({
      tokenId: r.tokenId,
      infoContentScore: avgIc > 0 ? r.ic / avgIc : 0,
      rarityRank: icRank.get(r.tokenId)!,
      traitFreqScore: r.freq,
      traitFreqRank: freqRank.get(r.tokenId)!,
    }))
    .sort((a, b) => a.rarityRank - b.rarityRank);
}
