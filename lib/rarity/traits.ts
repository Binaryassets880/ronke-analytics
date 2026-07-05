/**
 * Trait normalization (U10).
 *
 * Turns a token's raw Moralis `normalized_metadata.attributes` into clean
 * (token_id, trait_type, value, display_type) rows. Casing/whitespace are
 * normalized so "Pink " and "Pink" collapse to one value. Tokens with no
 * attributes are returned empty so the caller can flag them for resync rather
 * than storing a zero-trait token (which would corrupt rarity - R6).
 */

import type { MoralisAttribute } from "@/lib/ronin/moralis";

export type DisplayType = "string" | "number" | "date" | "bool";

export interface NormalizedTrait {
  tokenId: string;
  traitType: string;
  value: string;
  displayType: DisplayType;
}

/** Trim + collapse internal whitespace. */
function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function inferDisplayType(attr: MoralisAttribute): DisplayType {
  const dt = attr.display_type?.toLowerCase();
  if (dt === "number" || dt === "boost_number" || dt === "boost_percentage") return "number";
  if (dt === "date") return "date";
  if (typeof attr.value === "boolean" || dt === "boolean" || dt === "bool") return "bool";
  if (typeof attr.value === "number") return "number";
  return "string";
}

/**
 * Normalize one token's attributes. Drops attributes with an empty trait_type
 * or null/empty value. Returns [] for a token with no usable attributes.
 */
export function normalizeAttributes(
  tokenId: string,
  attributes: MoralisAttribute[],
): NormalizedTrait[] {
  const out: NormalizedTrait[] = [];
  const seen = new Set<string>();
  for (const attr of attributes ?? []) {
    const traitType = clean(String(attr.trait_type ?? ""));
    if (traitType === "") continue;
    if (attr.value == null) continue;
    const value = clean(String(attr.value));
    if (value === "") continue;
    // Unique per (token, trait_type) - matches the nft_traits PK.
    if (seen.has(traitType)) continue;
    seen.add(traitType);
    out.push({ tokenId: String(tokenId), traitType, value, displayType: inferDisplayType(attr) });
  }
  return out;
}

/** True if a token has no usable traits (should be flagged for resync). */
export function isUnrevealed(traits: NormalizedTrait[]): boolean {
  return traits.length === 0;
}
