/**
 * GET /api/v1/scores/all
 *
 * Every scored wallet in one response, compact. Built for the periodic
 * re-check: a Discord bot pruning roles from members who sold needs to see the
 * whole set, and paging through it 50 at a time is worse for everyone than one
 * cached response.
 *
 * Four fields per row (address, score, rank, percentile) because that is what
 * role gating actually reads. Callers wanting sub-scores or the points
 * breakdown for a specific wallet should follow up on /score/{address}.
 *
 * Note what is NOT here: wallets whose entire position rounds to zero points
 * are never stored, so they are absent rather than present-with-score-0. For a
 * role bot that is the right behaviour - absent means "no standing", the same
 * thing found:false means on the single-wallet endpoint - but it does mean this
 * dump is not a holder census. Every current Ronkeverse NFT holder IS included.
 */

import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { getAllScoresCompact } from "@/lib/queries";

/**
 * Safety valve, ~4x current population (6,199 as of 2026-08-11). Not paging:
 * if this ever trips, `complete: false` makes the truncation visible instead of
 * letting a caller believe it has the full set, and it is the signal to add
 * keyset pagination rather than raise the number.
 *
 * The ceiling is a platform limit, not a taste call. Measured payload is ~100
 * bytes per row (617 KB at 6,199 rows), and Vercel caps a serverless function
 * response at 4.5 MB - so 25,000 rows is ~2.5 MB, comfortably inside it, while
 * the 50,000 this started at would have been ~5 MB and thrown a platform error
 * BEFORE the valve could report the truncation it exists to report. Raising
 * this without re-measuring bytes/row would reintroduce that.
 */
export const MAX_ROWS = 25_000;

export async function GET() {
  try {
    const [{ rows, complete }, meta] = await Promise.all([
      getAllScoresCompact(MAX_ROWS),
      apiMeta(),
    ]);

    return ok(
      {
        scores: rows,
        count: rows.length,
        /**
         * False only if MAX_ROWS was hit. A caller that gates on completeness
         * should check this rather than assuming a successful 200 means "all".
         */
        complete,
        ...(complete
          ? {}
          : {
              note:
                `Truncated at ${MAX_ROWS} rows. Use /api/v1/leaderboard for the top of the ` +
                "distribution and /api/v1/scores?addresses= for specific wallets.",
            }),
      },
      { meta: { ...meta, population: rows.length }, ttl: CACHE.bulk },
    );
  } catch (e) {
    console.error("GET /api/v1/scores/all failed", e);
    return fail("internal", "Full score dump failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
