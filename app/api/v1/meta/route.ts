/**
 * GET /api/v1/meta
 *
 * Freshness, versions, population, and the contract addresses this API indexes.
 * Doubles as a health check.
 *
 * The contract addresses are included so an integrator can verify at a glance
 * that they are pointed at the right assets on the right chain, rather than
 * trusting that "the Ronke API" means the same tokens they think it does.
 */

import { CONTRACTS, ASSETS, RONIN_CHAIN_PARAM } from "@/config/contracts";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { getMetaState, getScoredPopulation } from "@/lib/queries";

/** The nightly sync + rebuild cron in .github/workflows/sync.yml. */
export const REBUILD_CRON_UTC = "0 7 * * *";

export async function GET() {
  try {
    const [state, population, meta] = await Promise.all([
      getMetaState(),
      getScoredPopulation(),
      apiMeta(),
    ]);
    return ok(
      {
        as_of: state.lastRebuildAt,
        last_sync_at: state.lastSyncAt,
        backfill_complete: state.backfillComplete,
        revealed_supply: state.revealedSupply,
        scored_population: population,
        rebuild_schedule_utc: REBUILD_CRON_UTC,
        chain: RONIN_CHAIN_PARAM,
        contracts: ASSETS.map((asset) => ({
          asset,
          label: CONTRACTS[asset].label,
          address: CONTRACTS[asset].address,
          standard: CONTRACTS[asset].standard,
          decimals: CONTRACTS[asset].decimals ?? null,
        })),
      },
      { meta: { ...meta, population }, ttl: CACHE.meta },
    );
  } catch (e) {
    console.error("GET /api/v1/meta failed", e);
    return fail("internal", "Meta lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
