/**
 * Page-facing cache layer over lib/queries.ts.
 *
 * COST NOTE (2026-08-27). Seven pages were marked `force-dynamic`, so every
 * request - every visitor, every bot crawl, every uptime pinger - went straight
 * through to Neon. That is what kept this project's compute from ever scaling
 * to zero: it was observed awake at 06:31 with no cron scheduled and nobody
 * using the site. Compute-hours, not storage, are what this project costs.
 *
 * The data behind these reads changes exactly once a day, when the sync Action
 * finishes its rebuild (see .github/workflows/sync.yml, 07:00 UTC). Serving it
 * fresh per request buys nothing.
 *
 * WHY A SEPARATE MODULE, not `unstable_cache` inside lib/queries.ts: the
 * uncached functions are still the right thing for the scheduled worker and for
 * anything that must read its own writes. Keeping the raw reads importable
 * under their original names means this file is a policy layer that can be
 * deleted in one step, not a behaviour change buried in a 1,100-line module.
 *
 * Pages import from here. Scripts, the rebuild, and API routes that set their
 * own Cache-Control keep importing "@/lib/queries" directly.
 */

import { unstable_cache } from "next/cache";
import * as q from "@/lib/queries";

/** Everything derived from the nightly rebuild shares one tag. */
export const SNAPSHOT_TAG = "snapshot";

/**
 * One hour. The rebuild runs daily, so this is already 24x more often than the
 * data can possibly change; it is short only to bound how long a manual
 * workflow_dispatch rebuild stays invisible. Raise it before lowering it.
 */
const TTL = 3600;

/**
 * unstable_cache keys on the arguments actually passed at the call site, so
 * `getWalletHistory(address)` keys on [address] and its `now = new Date()`
 * default never enters the key. If a caller ever starts passing `now`
 * explicitly, that call stops sharing a cache entry - which is correct, but
 * worth knowing before someone debugs a "why is this uncached" mystery.
 */
function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
): (...args: A) => Promise<R> {
  return unstable_cache(fn, [key], { revalidate: TTL, tags: [SNAPSHOT_TAG] }) as (
    ...args: A
  ) => Promise<R>;
}

export const getMetaState = cached(q.getMetaState, "getMetaState");
export const getOverview = cached(q.getOverview, "getOverview");
export const getTokenMarket = cached(q.getTokenMarket, "getTokenMarket");
export const getNftMarket = cached(q.getNftMarket, "getNftMarket");
export const getSupplyStats = cached(q.getSupplyStats, "getSupplyStats");
export const getEcosystemStats = cached(q.getEcosystemStats, "getEcosystemStats");
export const getScoreLeaderboard = cached(q.getScoreLeaderboard, "getScoreLeaderboard");
export const getScoredPopulation = cached(q.getScoredPopulation, "getScoredPopulation");
export const getWalletScore = cached(q.getWalletScore, "getWalletScore");
export const getWalletScoresBatch = cached(q.getWalletScoresBatch, "getWalletScoresBatch");
export const getAllScoresCompact = cached(q.getAllScoresCompact, "getAllScoresCompact");
export const getHolders = cached(q.getHolders, "getHolders");
export const getLeaderboard = cached(q.getLeaderboard, "getLeaderboard");
export const getWallet = cached(q.getWallet, "getWallet");
export const getWalletHistory = cached(q.getWalletHistory, "getWalletHistory");
export const getWalletBadges = cached(q.getWalletBadges, "getWalletBadges");
export const getRarityLeaderboard = cached(q.getRarityLeaderboard, "getRarityLeaderboard");
export const getOneOfOneBucket = cached(q.getOneOfOneBucket, "getOneOfOneBucket");
export const getOneOfOneCounts = cached(q.getOneOfOneCounts, "getOneOfOneCounts");
export const getToken = cached(q.getToken, "getToken");
export const getTraitDistribution = cached(q.getTraitDistribution, "getTraitDistribution");

/**
 * getDailyRandomToken is deliberately NOT cached here: it is already seeded by
 * day (the seed argument IS the cache key the caller wants), and wrapping it
 * would add a second, differently-expiring layer over the same intent.
 */
export { getDailyRandomToken } from "@/lib/queries";

/** Re-exported so pages can keep importing their view-model types from one place. */
export type * from "@/lib/queries";
