/**
 * Market data refresh (E6), run off-Vercel as part of the daily sync (KTD-7).
 * Independent best-effort steps:
 *  1. Upsert a GeckoTerminal snapshot per token asset ($RONKE, RonkeStr).
 *  2. Index new Ronkeverse WRON-settled sales into nft_sales (all venues).
 * Any one failing is logged, never fatal to the sync.
 */

import type { Sql } from "@/db/client";
import { CONTRACTS, type Asset } from "@/config/contracts";
import { fetchTokenMarket } from "./geckoterminal";
import { indexNftSales, type IndexOptions } from "./sales";

export type MarketRefreshOptions = IndexOptions;

/** Token assets that carry a GeckoTerminal DEX quote (thin-liquidity). */
const MARKET_TOKEN_ASSETS: Asset[] = ["ronke_token", "ronkestr_token"];

export async function refreshMarket(sql: Sql, opts: MarketRefreshOptions = {}): Promise<void> {
  const log = opts.log ?? (() => {});

  // 1. Per-token GeckoTerminal snapshot (price/volume/liquidity). Each token is
  // independent: one failing/unindexed token never blocks the others.
  for (const asset of MARKET_TOKEN_ASSETS) {
    const label = CONTRACTS[asset].label;
    try {
      const market = await fetchTokenMarket({ address: CONTRACTS[asset].address });
      if (market) {
        await sql`
          INSERT INTO market_snapshots (source, asset, snapshot, fetched_at)
          VALUES ('geckoterminal', ${asset}, ${JSON.stringify(market)}::jsonb, now())
          ON CONFLICT (source, asset) DO UPDATE SET snapshot = EXCLUDED.snapshot, fetched_at = now()
        `;
        log(`market: ${label} price=$${market.priceUsd ?? "?"} vol24=$${market.volume24hUsd ?? "?"}`);
      } else {
        log(`market: GeckoTerminal returned no data (skipped ${label} snapshot)`);
      }
    } catch (err) {
      log(`market: ${label} snapshot failed: ${(err as Error)?.message ?? err}`);
    }
  }

  // 2. Ronkeverse on-chain sales (WRON settlement, all venues). On a fresh DB
  // this backfills the recent window (~90 days); daily runs process new sales.
  try {
    await indexNftSales(sql, {
      getReceipt: opts.getReceipt,
      limit: opts.limit ?? 600,
      // Public Ronin RPC is non-archive (~2 week receipt retention); 14 days is
      // fully servable and covers the 24h/7d tiles. Raise via an archive
      // RONIN_RPC_URL for deeper history; skip-old handles boundary stragglers.
      sinceDays: opts.sinceDays ?? 14,
      log,
    });
  } catch (err) {
    log(`market: Ronkeverse sale indexing failed: ${(err as Error)?.message ?? err}`);
  }
}
