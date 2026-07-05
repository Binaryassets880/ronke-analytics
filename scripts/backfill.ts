/**
 * One-time full-history backfill (U4, local). Runs off-Vercel; no serverless
 * limit (KTD-7). Resumable: appends with ON CONFLICT DO NOTHING and advances
 * the cursor, so interrupting and re-running continues rather than duplicating
 * (and picks up where the last CU-budget day left off - R3).
 *
 * Per the U13 spike, Moralis indexes pre-L2 history, so a single Moralis pass
 * spans MIGRATION_BLOCK. A continuity assertion (KTD-4) guards this: if a known
 * pre-migration transfer does NOT return, it raises rather than silently
 * proceeding (which would demand the Blockscout legacy path).
 *
 * Run: MORALIS_API_KEY=... DATABASE_URL=... npm run backfill
 */

import { requireSql, type Sql } from "@/db/client";
import { moralisApiKey } from "@/config/env";
import { ASSETS, type Asset } from "@/config/contracts";
import { MoralisProvider } from "@/lib/ronin/moralis";
import { RoninDataClient } from "@/lib/ronin/client";
import { assertContinuity, type KnownTransfer } from "@/lib/ronin/continuity";
import { getCursor, setCursor, insertTransfer, setMeta } from "@/lib/ingest";
import { rebuild } from "@/lib/analytics/rebuild";
import type { SyncClient, RebuildFn } from "./sync";

/**
 * Known continuity fixtures recorded by the U13 spike (a real pre-migration and
 * post-migration transfer per asset). Used to assert the source spans the L2
 * boundary before trusting a single-pass backfill.
 */
export const KNOWN_CONTINUITY: Partial<Record<Asset, { pre: KnownTransfer; post: KnownTransfer }>> = {
  ronkeverse_nft: {
    pre: {
      txHash: "0x583d488b808c8f1cbb7d3b31154d807719109d4971c469ef6c4f7b262d0a51e6",
      blockNumber: 42_878_820,
    },
    post: {
      txHash: "0xb6a3701ce4dddb253c37e8caf53f6f8e0c6a170eeed84e977a5058deb13651a9",
      blockNumber: 57_885_401,
    },
  },
  // RONKE continuity was verified in U13 (genesis block 41,986,352 is pre-migration
  // and returns via Moralis); no per-tx fixture was recorded, so it is not
  // asserted at runtime here.
};

/** Full-history pull for one asset, resuming from its cursor. */
export async function backfillAsset(
  sql: Sql,
  client: SyncClient,
  asset: Asset,
): Promise<{ appended: number; maxBlock: number }> {
  const cursor = await getCursor(sql, asset);
  const fromBlock = cursor > 0 ? cursor + 1 : 0;
  let maxBlock = cursor;
  let appended = 0;
  for await (const t of client.fetchTransfers(asset, fromBlock)) {
    appended += await insertTransfer(sql, t);
    if (t.blockNumber > maxBlock) maxBlock = t.blockNumber;
  }
  if (maxBlock > cursor) await setCursor(sql, asset, maxBlock);
  return { appended, maxBlock };
}

export async function backfill(
  sql: Sql,
  client: RoninDataClient,
  opts: { rebuildFn?: RebuildFn; asOf?: Date; assertContinuityFor?: Asset[] } = {},
): Promise<{ appended: number }> {
  const asOf = opts.asOf ?? new Date();
  const rebuildFn = opts.rebuildFn ?? rebuild;

  // Continuity gate before pulling (KTD-4).
  const toAssert = opts.assertContinuityFor ?? (Object.keys(KNOWN_CONTINUITY) as Asset[]);
  for (const asset of toAssert) {
    const known = KNOWN_CONTINUITY[asset];
    if (known) await assertContinuity(client, asset, known);
  }
  await setMeta(sql, "continuity_verified", "true");

  let appended = 0;
  for (const asset of ASSETS) {
    const r = await backfillAsset(sql, client, asset);
    appended += r.appended;
  }
  await setMeta(sql, "backfill_complete", "true");
  await rebuildFn(sql, asOf);
  return { appended };
}

if (process.argv[1]?.endsWith("backfill.ts")) {
  const sql = requireSql();
  const client = new RoninDataClient({
    moralis: new MoralisProvider({ apiKey: moralisApiKey() }),
  });
  backfill(sql, client)
    .then(({ appended }) => {
      console.log(`Backfill complete. Appended ${appended} events; snapshots rebuilt.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
