/**
 * Ingestion store helpers (U4): append transfer_events, manage the per-asset
 * cursor, and read/write meta. Kept separate so backfill.ts and sync.ts share
 * exactly one append path and one cursor discipline.
 */

import type { Sql } from "@/db/client";
import type { Asset } from "@/config/contracts";
import type { NormalizedTransfer } from "@/lib/types";

export async function getCursor(sql: Sql, asset: Asset): Promise<number> {
  const rows = await sql`SELECT last_block FROM sync_cursor WHERE asset = ${asset}`;
  return rows.length ? Number(rows[0].last_block) : 0;
}

export async function setCursor(
  sql: Sql,
  asset: Asset,
  lastBlock: number,
  source = "moralis",
): Promise<void> {
  await sql`
    INSERT INTO sync_cursor (asset, last_block, source, updated_at)
    VALUES (${asset}, ${lastBlock}, ${source}, now())
    ON CONFLICT (asset) DO UPDATE
      SET last_block = EXCLUDED.last_block, source = EXCLUDED.source, updated_at = now()
  `;
}

/**
 * Append one transfer. Returns 1 if inserted, 0 on conflict (already present).
 * The RETURNING clause yields no row when ON CONFLICT DO NOTHING fires, which
 * is how we count genuinely-new appends.
 */
export async function insertTransfer(sql: Sql, t: NormalizedTransfer): Promise<number> {
  // NOTE: the `raw` provider payload is intentionally NOT persisted - it added
  // ~1.3 KB/row (mostly Blockscout's inline NFT metadata) and blew past Neon's
  // free-tier storage cap. Analytics derive everything from the typed columns.
  const rows = await sql`
    INSERT INTO transfer_events
      (asset, tx_hash, log_index, block_number, block_time, from_address,
       to_address, token_id, quantity, is_mint, is_burn)
    VALUES (${t.asset}, ${t.txHash}, ${t.logIndex}, ${t.blockNumber},
            ${t.blockTime.toISOString()}, ${t.from}, ${t.to}, ${t.tokenId},
            ${t.quantity.toString()}, ${t.isMint}, ${t.isBurn})
    ON CONFLICT (asset, tx_hash, log_index) DO NOTHING
    RETURNING id
  `;
  return rows.length;
}

export async function setMeta(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function getMeta(sql: Sql, key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM meta WHERE key = ${key}`;
  return rows.length ? (rows[0].value as string) : null;
}
