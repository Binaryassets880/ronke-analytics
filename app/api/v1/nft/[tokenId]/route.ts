/**
 * GET /api/v1/nft/{tokenId}
 *
 * One Ronkeverse token: rarity, tier, traits with their collection-wide
 * probability, image, and current owner.
 *
 * Cached for a day rather than the usual 15 minutes - traits and rarity are
 * static after reveal, so the only thing that moves here is the owner, and a
 * caller that needs live ownership should be reading the wallet endpoint.
 */

import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { getToken } from "@/lib/queries";

/** Ronkeverse is a single contract with token IDs 1..6969. */
export const MAX_TOKEN_ID = 6969;

/** Validate a token-id route param. Pure, exported for tests. */
export function parseTokenId(raw: string): number | null {
  const trimmed = decodeURIComponent(raw ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return id >= 1 && id <= MAX_TOKEN_ID ? id : null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId: raw } = await ctx.params;

  const id = parseTokenId(raw);
  if (id == null) {
    return fail(
      "invalid_token_id",
      `Token id must be a whole number from 1 to ${MAX_TOKEN_ID}.`,
      400,
    );
  }

  try {
    const [token, meta] = await Promise.all([getToken(String(id)), apiMeta()]);
    if (!token) {
      // Distinct from the score endpoint's found:false. A token id inside the
      // valid range with no rarity row genuinely does not exist in our index
      // (unrevealed or not yet ingested), which is a real absence, not a zero.
      return fail("not_found", `No indexed Ronkeverse token with id ${id}.`, 404);
    }
    return ok(
      {
        token_id: token.tokenId,
        rarity_rank: token.rarityRank,
        tier: token.tier,
        info_content_score: token.infoContentScore,
        image_url: token.imageUrl,
        traits: token.traits.map((t) => ({
          trait_type: t.traitType,
          value: t.value,
          probability: t.probability,
        })),
        owner: token.owner,
      },
      { meta, ttl: CACHE.nft },
    );
  } catch (e) {
    console.error("GET /api/v1/nft failed", e);
    return fail("internal", "Token lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
