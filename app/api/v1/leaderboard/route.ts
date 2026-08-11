/**
 * GET /api/v1/leaderboard?limit=&offset=
 *
 * Top wallets by Ronke Score, with rank and percentile.
 *
 * Both bounds are hard-capped. Unbounded pagination is the cheap way for a
 * scraper to walk the entire wallet_scores table at Neon's expense, and the
 * transfer allowance is already mostly spent on the nightly rebuild - so the
 * caps are a cost control, not a courtesy. Over-limit is an explicit 400 rather
 * than a silent clamp: a caller asking for 1,000 rows and receiving 100 without
 * being told would page incorrectly and conclude the leaderboard was truncated.
 */

import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { getScoreLeaderboard, getScoredPopulation } from "@/lib/queries";

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;
export const MAX_OFFSET = 5_000;

/** Parse a bounded non-negative integer query param. Pure, exported for tests. */
export function parseBounded(
  raw: string | null,
  { fallback, max, name }: { fallback: number; max: number; name: string },
): { ok: true; value: number } | { ok: false; message: string } {
  if (raw == null || raw.trim() === "") return { ok: true, value: fallback };
  if (!/^\d+$/.test(raw.trim())) {
    return { ok: false, message: `${name} must be a non-negative integer.` };
  }
  const value = Number(raw);
  if (value > max) return { ok: false, message: `${name} must be at most ${max}; got ${value}.` };
  return { ok: true, value };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = parseBounded(q.get("limit"), {
    fallback: DEFAULT_LIMIT,
    max: MAX_LIMIT,
    name: "limit",
  });
  if (!limit.ok) return fail("invalid_param", limit.message, 400);
  const offset = parseBounded(q.get("offset"), { fallback: 0, max: MAX_OFFSET, name: "offset" });
  if (!offset.ok) return fail("invalid_param", offset.message, 400);
  if (limit.value === 0) return fail("invalid_param", "limit must be at least 1.", 400);

  try {
    // getScoreLeaderboard pages by (page, pageSize). Expose offset instead so a
    // caller can step by any stride; translate by using offset as page 0 of a
    // window - i.e. request offset+limit rows and drop the first offset.
    const pageSize = limit.value;
    const page = Math.floor(offset.value / pageSize);
    const skew = offset.value - page * pageSize;
    const [rows, population, meta] = await Promise.all([
      getScoreLeaderboard(page, pageSize + skew),
      getScoredPopulation(),
      apiMeta(),
    ]);
    const windowed = rows.slice(skew, skew + pageSize);

    return ok(
      {
        entries: windowed.map((r) => ({
          address: r.address,
          name: r.name,
          score: r.score,
          rank: r.rank,
          percentile: r.percentile,
          subscores: { ronke: r.ronkeSubscore, ronkestr: r.ronkestrSubscore, nft: r.nftSubscore },
          body_types_held: r.bodyTypesHeld,
          body_types_total: r.bodyTypesTotal,
        })),
        count: windowed.length,
        limit: pageSize,
        offset: offset.value,
      },
      { meta: { ...meta, population }, ttl: CACHE.score },
    );
  } catch (e) {
    console.error("GET /api/v1/leaderboard failed", e);
    return fail("internal", "Leaderboard lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
