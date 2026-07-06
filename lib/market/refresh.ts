/**
 * Market data refresh (E6), run off-Vercel as part of the daily sync (KTD-7).
 * Two independent best-effort steps:
 *  1. Upsert the $RONKE GeckoTerminal snapshot (price/volume/liquidity).
 *  2. Index new Ronkeverse WRON-settled sales into nft_sales (all venues).
 * Either failing is logged, never fatal to the sync.
 */

import type { Sql } from "@/db/client";
import { fetchRonkeMarket } from "./geckoterminal";
import { indexNftSales, type IndexOptions } from "./sales";

export type MarketRefreshOptions = IndexOptions;

export async function refreshMarket(sql: Sql, opts: MarketRefreshOptions = {}): Promise<void> {
  const log = opts.log ?? (() => {});

  // 1. $RONKE price/volume/liquidity snapshot.
  try {
    const market = await fetchRonkeMarket();
    if (market) {
      await sql`
        INSERT INTO market_snapshots (source, asset, snapshot, fetched_at)
        VALUES ('geckoterminal', 'ronke_token', ${JSON.stringify(market)}::jsonb, now())
        ON CONFLICT (source, asset) DO UPDATE SET snapshot = EXCLUDED.snapshot, fetched_at = now()
      `;
      log(`market: $RONKE price=$${market.priceUsd ?? "?"} vol24=$${market.volume24hUsd ?? "?"}`);
    } else {
      log("market: GeckoTerminal returned no data (skipped $RONKE snapshot)");
    }
  } catch (err) {
    log(`market: $RONKE snapshot failed: ${(err as Error)?.message ?? err}`);
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
