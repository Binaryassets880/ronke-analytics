/**
 * GET /api/v1/stats
 *
 * State of the Ronkeverse: holder counts per asset, supply/burn figures, DEX
 * prices, and NFT volume. The read a dashboard or Discord bot wants for an
 * "ecosystem at a glance" panel.
 *
 * Market and supply figures degrade to null instead of failing the request. A
 * missing GeckoTerminal snapshot is a routine condition (the market layer parses
 * null-on-drift by design), and a 500 here would take out the holder counts too,
 * which come from our own ledger and are always available.
 */

import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { getEcosystemStats, getSupplyStats } from "@/lib/queries";

export async function GET() {
  try {
    const [stats, ronkeSupply, ronkestrSupply, meta] = await Promise.all([
      getEcosystemStats(),
      getSupplyStats("ronke_token").catch(() => null),
      getSupplyStats("ronkestr_token").catch(() => null),
      apiMeta(),
    ]);

    const supply = (s: Awaited<ReturnType<typeof getSupplyStats>>) =>
      s == null
        ? null
        : {
            minted: s.minted,
            circulating: s.circulating,
            burned: s.burned,
            burned_pct: s.burnedPct,
          };

    return ok(
      {
        ronke_token: {
          holders: stats.ronkeHolders,
          price_usd: stats.ronkePriceUsd,
          supply: supply(ronkeSupply),
        },
        ronkestr_token: {
          holders: stats.ronkestrHolders,
          price_usd: stats.ronkestrPriceUsd,
          supply: supply(ronkestrSupply),
        },
        ronkeverse_nft: {
          holders: stats.ronkeverseHolders,
          volume_7d_wron: stats.ronkeverse7dVolWron,
        },
        badges: {
          wallets_with_badges: stats.ratedWallets,
          total_earned: stats.totalBadges,
        },
      },
      { meta, ttl: CACHE.score },
    );
  } catch (e) {
    console.error("GET /api/v1/stats failed", e);
    return fail("internal", "Stats lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
