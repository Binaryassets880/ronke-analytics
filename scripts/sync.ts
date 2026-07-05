/**
 * Daily incremental sync + rebuild (U4), run by the scheduled worker
 * (.github/workflows/sync.yml) or `npm run sync` locally. Never in a Vercel
 * request handler (KTD-7).
 *
 * For each asset: read the cursor, append transfers past it, advance the
 * cursor, then - ALWAYS, as the final step - rebuild snapshots (KTD-3). Skipping
 * the rebuild is the documented crypto-books staleness footgun; the rebuild
 * runs even when zero events were appended, and meta.last_rebuild_at advances.
 * Idempotent: re-running with no new activity appends nothing.
 */

import { requireSql, type Sql } from "@/db/client";
import { moralisApiKey } from "@/config/env";
import { ASSETS, type Asset } from "@/config/contracts";
import { MoralisProvider } from "@/lib/ronin/moralis";
import { RoninDataClient } from "@/lib/ronin/client";
import { getCursor, setCursor, insertTransfer, setMeta } from "@/lib/ingest";
import { rebuild } from "@/lib/analytics/rebuild";

export interface SyncClient {
  /** Recent tail only: transfers with block_number > sinceBlock (DESC + stop). */
  fetchNewTransfers(
    asset: Asset,
    sinceBlock: number,
  ): AsyncIterable<import("@/lib/types").NormalizedTransfer>;
}

export type RebuildFn = (sql: Sql, asOf?: Date) => Promise<void>;

/** Append new events for one asset past its cursor; return the append count. */
export async function syncAsset(
  sql: Sql,
  client: SyncClient,
  asset: Asset,
): Promise<{ appended: number; cursor: number }> {
  const cursor = await getCursor(sql, asset);
  let maxBlock = cursor;
  let appended = 0;
  for await (const t of client.fetchNewTransfers(asset, cursor)) {
    if (t.blockNumber <= cursor) continue; // guard: only strictly-newer events
    appended += await insertTransfer(sql, t);
    if (t.blockNumber > maxBlock) maxBlock = t.blockNumber;
  }
  if (maxBlock > cursor) await setCursor(sql, asset, maxBlock);
  return { appended, cursor: maxBlock };
}

/** Full sync across all assets, then the mandatory rebuild (KTD-3). */
export async function sync(
  sql: Sql,
  client: SyncClient,
  opts: { rebuildFn?: RebuildFn; asOf?: Date } = {},
): Promise<{ appended: number }> {
  const asOf = opts.asOf ?? new Date();
  const rebuildFn = opts.rebuildFn ?? rebuild;
  let appended = 0;
  for (const asset of ASSETS) {
    const r = await syncAsset(sql, client, asset);
    appended += r.appended;
  }
  await setMeta(sql, "last_sync_at", asOf.toISOString());
  // ALWAYS rebuild, even when appended === 0 (staleness footgun guard).
  await rebuildFn(sql, asOf);
  return { appended };
}

if (process.argv[1]?.endsWith("sync.ts")) {
  const sql = requireSql();
  const client = new RoninDataClient({
    moralis: new MoralisProvider({ apiKey: moralisApiKey() }),
  });
  sync(sql, client)
    .then(({ appended }) => {
      console.log(`Sync complete. Appended ${appended} new events; snapshots rebuilt.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Sync failed:", err);
      process.exit(1);
    });
}
