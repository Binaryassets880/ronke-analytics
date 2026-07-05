/**
 * Pre-L2 history backfill via GoldRush (the KTD-4 migration stitch).
 *
 * Blockscout only indexes post-L2 history, so this fills the pre-migration era
 * (genesis -> MIGRATION_BLOCK) from GoldRush, which has full Ronin history.
 * Complements the post-L2 Blockscout backfill; together they cover everything.
 *
 * Chunks the block range into windows and persists progress per window
 * (meta.prel2_cursor_<asset>), so it resumes efficiently if interrupted (e.g.
 * on a free-tier credit limit) - GoldRush supports native block-range queries,
 * so resume does not re-read. Does NOT touch sync_cursor (that tracks the
 * post-L2 tip for the ongoing Blockscout sync). Rebuilds snapshots at the end.
 *
 * Run: GOLDRUSH_API_KEY=... DATABASE_URL=... npm run backfill:prel2
 */

import { requireSql, type Sql } from "@/db/client";
import { requireEnv } from "@/config/env";
import { ASSETS, MIGRATION_BLOCK, type Asset } from "@/config/contracts";
import { GoldRushProvider } from "@/lib/ronin/goldrush";
import { RoninDataClient } from "@/lib/ronin/client";
import { getMeta, setMeta, insertTransfer } from "@/lib/ingest";
import { rebuild } from "@/lib/analytics/rebuild";

/** Safe floor below both contracts' genesis (RONKE 41.98M, Ronkeverse 42.88M). */
const GENESIS_FLOOR = 41_000_000;
const WINDOW = 1_000_000;
const END_BLOCK = MIGRATION_BLOCK - 1;

export async function backfillPreL2Asset(
  sql: Sql,
  client: RoninDataClient,
  asset: Asset,
): Promise<number> {
  const saved = await getMeta(sql, `prel2_cursor_${asset}`);
  let winStart = saved ? Number(saved) + 1 : GENESIS_FLOOR;
  let appended = 0;
  while (winStart <= END_BLOCK) {
    const winEnd = Math.min(winStart + WINDOW - 1, END_BLOCK);
    let winCount = 0;
    for await (const t of client.fetchTransfers(asset, winStart, winEnd, "goldrush")) {
      const n = await insertTransfer(sql, t);
      appended += n;
      winCount += n;
    }
    await setMeta(sql, `prel2_cursor_${asset}`, String(winEnd));
    console.log(
      `[${asset}] blocks ${winStart}-${winEnd}: +${winCount} (total pre-L2 appended ${appended})`,
    );
    winStart = winEnd + 1;
  }
  return appended;
}

export async function backfillPreL2(sql: Sql, client: RoninDataClient): Promise<number> {
  let appended = 0;
  for (const asset of ASSETS) {
    appended += await backfillPreL2Asset(sql, client, asset);
  }
  await setMeta(sql, "prel2_complete", "true");
  console.log(`Pre-L2 backfill done (+${appended}). Rebuilding snapshots...`);
  await rebuild(sql);
  return appended;
}

if (process.argv[1]?.endsWith("backfill-prel2.ts")) {
  const sql = requireSql();
  const client = new RoninDataClient({
    goldrush: new GoldRushProvider({
      apiKey: requireEnv("GOLDRUSH_API_KEY", "Get a free key at https://goldrush.dev"),
    }),
  });
  backfillPreL2(sql, client)
    .then((appended) => {
      console.log(`Pre-L2 backfill complete. Appended ${appended} events; snapshots rebuilt.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Pre-L2 backfill failed:", err);
      process.exit(1);
    });
}
