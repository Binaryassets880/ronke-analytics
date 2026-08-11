/**
 * GET /api/v1/score/{addressOrName}
 *
 * One wallet's Ronke Score, sub-scores, breakdown, and standing. Public,
 * keyless, CDN-cached. Accepts a 0x address or a cached .ron name.
 *
 * Deliberately NOT `force-dynamic` (unlike /api/score-inputs, which prefills the
 * on-site simulator): this endpoint is meant to be hammered by third parties, so
 * it must be served by the CDN. The Cache-Control header from `ok()` is what
 * makes third-party traffic cost roughly one database read per TTL window
 * instead of one per request.
 */

import { resolveParam } from "@/lib/api/address";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { toPublicScore } from "@/lib/api/score-view";
import { getWalletScore, getScoredPopulation } from "@/lib/queries";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await ctx.params;

  const resolved = await resolveParam(raw);
  if (!resolved.ok) {
    const status =
      resolved.code === "name_not_resolved" ? 404 : resolved.code === "not_configured" ? 503 : 400;
    return fail(resolved.code, resolved.message, status);
  }

  try {
    const [score, population, meta] = await Promise.all([
      getWalletScore(resolved.address),
      getScoredPopulation(),
      apiMeta(),
    ]);
    return ok(toPublicScore(score, resolved.address, resolved.name), {
      meta: { ...meta, population },
      ttl: CACHE.score,
    });
  } catch (e) {
    console.error("GET /api/v1/score failed", e);
    return fail("internal", "Score lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
