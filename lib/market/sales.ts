/**
 * Ronkeverse on-chain sale indexer (E6, KTD-E3).
 *
 * Walks new Ronkeverse transfers past a cursor, fetches each candidate tx's
 * receipt, and records WRON-settled sales into nft_sales - marketplace-agnostic,
 * so OpenSea Seaport and Ronin-native marketplace sales are both captured.
 * Volume/last-sale/avg are computed at read time from nft_sales.
 *
 * Bounded per run (like the RNS refresh) so a long history backfills over
 * several passes instead of one giant RPC burst. Idempotent: re-recording a
 * sale collides on (asset, tx_hash, token_id) and is a no-op.
 */

import type { Sql } from "@/db/client";
import type { TransactionReceipt } from "viem";
import { roninPublicClient } from "@/lib/rns/resolve";
import { wronLegsFromReceipt, grossSalePrice } from "./settlement";

const ASSET = "ronkeverse_nft";
const ZERO = "0x0000000000000000000000000000000000000000";

/** One Ronkeverse Transfer leg within a tx (from transfer_events). */
export interface NftTransferLeg {
  tokenId: string;
  seller: string; // Transfer.from
  buyer: string; // Transfer.to
  blockNumber: number;
  blockTime: string;
}

export interface TxSaleRow {
  tokenId: string;
  seller: string;
  buyer: string;
  priceWron: bigint;
  marketplace: string;
  blockNumber: number;
  blockTime: string;
}

/**
 * Pure: given all Ronkeverse transfers in one tx and that tx's receipt, derive
 * the per-token sale rows. Gross WRON is computed once (excluding refunds to any
 * buyer and the buyer->escrow hop) then split evenly across the tokens moved, so
 * a bundle sale sums back to the correct total. Returns [] when no WRON settled.
 */
export function computeTxSales(transfers: NftTransferLeg[], receipt: TransactionReceipt): TxSaleRow[] {
  if (transfers.length === 0) return [];
  const legs = wronLegsFromReceipt(receipt);
  if (legs.length === 0) return []; // not a WRON sale (plain move / other token)

  const marketplace = (receipt.to ?? "").toLowerCase();
  const buyers = new Set(transfers.map((t) => t.buyer.toLowerCase()));
  // Exclude every buyer (refunds) and the marketplace escrow from the gross.
  let gross = 0n;
  for (const leg of legs) {
    const to = leg.to.toLowerCase();
    if (buyers.has(to)) continue;
    if (marketplace && to === marketplace) continue;
    gross += leg.value;
  }
  if (gross <= 0n) return [];

  const n = BigInt(transfers.length);
  const per = gross / n; // even split; integer division loses <n wei, negligible
  return transfers.map((t) => ({
    tokenId: t.tokenId,
    seller: t.seller.toLowerCase(),
    buyer: t.buyer.toLowerCase(),
    priceWron: per,
    marketplace,
    blockNumber: t.blockNumber,
    blockTime: t.blockTime,
  }));
}

export type GetReceipt = (txHash: string) => Promise<TransactionReceipt>;

export interface IndexOptions {
  getReceipt?: GetReceipt;
  /** Max distinct candidate txs to process per run. */
  limit?: number;
  /**
   * On a fresh cursor (never indexed), skip ancient history and start from the
   * first block within this many days. The market tiles only show recent windows
   * (24h/7d/30d), so there's no need to fetch receipts for months of old txs.
   */
  sinceDays?: number;
  /** Injected clock for deterministic tests. */
  now?: Date;
  log?: (msg: string) => void;
}

export interface IndexResult {
  txsScanned: number;
  salesRecorded: number;
  cursor: number;
  capped: boolean;
}

/**
 * Index new Ronkeverse WRON-settled sales into nft_sales. Best-effort per tx:
 * a receipt fetch failure is logged and skipped (retried next run since the
 * cursor only advances past fully-processed blocks).
 */
export async function indexNftSales(sql: Sql, opts: IndexOptions = {}): Promise<IndexResult> {
  const limit = opts.limit ?? 300;
  const log = opts.log ?? (() => {});
  const getReceipt =
    opts.getReceipt ??
    ((txHash: string) =>
      roninPublicClient().getTransactionReceipt({ hash: txHash as `0x${string}` }));

  const cur = await sql`SELECT last_block FROM nft_sales_cursor WHERE asset = ${ASSET}`;
  const cursor = Number(cur[0]?.last_block ?? 0);

  // On a fresh cursor, skip ancient history: start just before the first block
  // in the recent window (the tiles only cover 24h/7d/30d).
  let start = cursor;
  if (cursor === 0 && opts.sinceDays) {
    const floor = await sql`
      SELECT coalesce(min(block_number), 0)::bigint AS b
      FROM transfer_events
      WHERE asset = ${ASSET} AND block_time > now() - (${opts.sinceDays} || ' days')::interval
    `;
    start = Math.max(start, Number(floor[0]?.b ?? 0) - 1);
  }

  // Candidate sale transfers past the start (exclude mints). Grouped by tx so
  // each receipt is fetched once and bundles are handled together.
  const rows = await sql`
    SELECT tx_hash, token_id, from_address, to_address, block_number,
           block_time::text AS block_time
    FROM transfer_events
    WHERE asset = ${ASSET} AND from_address <> ${ZERO} AND block_number > ${start}
    ORDER BY block_number ASC, tx_hash ASC
  `;

  // Group into txs, preserving block order.
  const byTx = new Map<string, NftTransferLeg[]>();
  const txBlock = new Map<string, number>();
  const txTime = new Map<string, number>();
  for (const r of rows) {
    const tx = String(r.tx_hash);
    (byTx.get(tx) ?? byTx.set(tx, []).get(tx)!).push({
      tokenId: String(r.token_id),
      seller: String(r.from_address),
      buyer: String(r.to_address),
      blockNumber: Number(r.block_number),
      blockTime: String(r.block_time),
    });
    txBlock.set(tx, Number(r.block_number));
    txTime.set(tx, new Date(String(r.block_time)).getTime());
  }

  const txs = [...byTx.keys()];
  const capped = txs.length > limit;
  const batch = txs.slice(0, limit);

  // A receipt for a tx older than this is treated as permanently unavailable on
  // a non-archive RPC (skip + advance past it); a newer one may just not be
  // propagated yet (hold the cursor so it retries next run).
  const RECENT_PENDING_MS = 60 * 60 * 1000; // 1h
  const nowMs = (opts.now ?? new Date()).getTime();

  let salesRecorded = 0;
  let skippedOld = 0;
  let maxBlockDone = start;
  for (const tx of batch) {
    const transfers = byTx.get(tx)!;
    let receipt: TransactionReceipt;
    try {
      receipt = await getReceipt(tx);
    } catch (err) {
      const ageMs = nowMs - (txTime.get(tx) ?? nowMs);
      if (ageMs > RECENT_PENDING_MS) {
        // Old + unavailable (non-archive node): skip it and let the cursor pass.
        skippedOld += 1;
        maxBlockDone = Math.max(maxBlockDone, txBlock.get(tx)!);
        continue;
      }
      // Recent + not yet available: stop here so it (and later txs) retry next run.
      log(`receipt not yet available for recent ${tx}: ${(err as Error)?.message ?? err}`);
      break;
    }
    const sales = computeTxSales(transfers, receipt);
    for (const s of sales) {
      await sql`
        INSERT INTO nft_sales (asset, tx_hash, token_id, block_number, block_time, seller, buyer, price_wron, marketplace)
        VALUES (${ASSET}, ${tx}, ${s.tokenId}, ${s.blockNumber}, ${s.blockTime}, ${s.seller}, ${s.buyer}, ${s.priceWron.toString()}, ${s.marketplace})
        ON CONFLICT (asset, tx_hash, token_id) DO NOTHING
      `;
      salesRecorded += 1;
    }
    maxBlockDone = Math.max(maxBlockDone, txBlock.get(tx)!);
  }

  if (maxBlockDone > cursor) {
    await sql`
      INSERT INTO nft_sales_cursor (asset, last_block, updated_at)
      VALUES (${ASSET}, ${maxBlockDone}, now())
      ON CONFLICT (asset) DO UPDATE SET last_block = EXCLUDED.last_block, updated_at = now()
    `;
  }

  log(
    `nft_sales: scanned ${batch.length} txs, recorded ${salesRecorded} sales` +
      `${skippedOld ? `, skipped ${skippedOld} old/unavailable` : ""}${capped ? " (capped)" : ""}`,
  );
  return { txsScanned: batch.length, salesRecorded, cursor: maxBlockDone, capped };
}
