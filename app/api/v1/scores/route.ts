/**
 * GET /api/v1/scores?addresses=0xa,0xb,...
 *
 * Batch score lookup, capped at MAX_ADDRESSES. This exists so a Discord bot
 * syncing roles for a guild, or a game checking a lobby, costs ONE database
 * round-trip rather than one per player.
 *
 * A cacheable GET rather than a POST on purpose: a bot polling the same roster
 * every few minutes then hits the CDN every time instead of the database. The
 * trade is a URL length ceiling, which is what MAX_ADDRESSES is sized against
 * (50 x 43 chars ~ 2.1 KB, comfortably inside every proxy's limit).
 *
 * Callers get results in the order they asked, including duplicates, so a
 * response can be zipped straight onto the request list.
 */

import { parseAddressList } from "@/lib/api/address";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { toPublicScore } from "@/lib/api/score-view";
import { getWalletScoresBatch, getScoredPopulation } from "@/lib/queries";

/** Sorting the query set means ?addresses=b,a and ?addresses=a,b do identical work. */
export const MAX_ADDRESSES = 50;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = parseAddressList(url.searchParams.get("addresses"), MAX_ADDRESSES);
  if (!parsed.ok) return fail(parsed.code, parsed.message, 400);

  try {
    const [found, population, meta] = await Promise.all([
      getWalletScoresBatch(parsed.unique),
      getScoredPopulation(),
      apiMeta(),
    ]);
    // Mirror the request list one-for-one. An address the query did not return
    // is not an error - it scored zero and was never stored.
    const scores = parsed.requested.map((address) =>
      toPublicScore(found.get(address), address),
    );
    return ok(
      { scores, count: scores.length },
      { meta: { ...meta, population }, ttl: CACHE.score },
    );
  } catch (e) {
    console.error("GET /api/v1/scores failed", e);
    return fail("internal", "Batch score lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
