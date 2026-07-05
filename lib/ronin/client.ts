/**
 * RoninDataClient - source-agnostic transfer/owner interface (KTD-4).
 *
 * Blockscout is the primary transfer source (no CU cap, full history, spans the
 * L2 boundary as the canonical index); Moralis remains available (e.g. for the
 * continuity assertion / owners). Everything downstream keys on block_number,
 * so the source is a data detail, not a schema or analytics branch.
 */

import type { NormalizedTransfer, OwnerRow, ProviderSource } from "@/lib/types";
import type { Asset } from "@/config/contracts";
import { contractFor } from "@/config/contracts";
import { MoralisProvider, type TransferQuery } from "./moralis";
import { BlockscoutProvider } from "./blockscout";
import { GoldRushProvider } from "./goldrush";

export interface RoninDataClientOptions {
  moralis?: MoralisProvider;
  blockscout?: BlockscoutProvider;
  goldrush?: GoldRushProvider;
}

/** Sentinel end block for open-ended ranges. */
const MAX_BLOCK = 999_999_999;

export class RoninDataClient {
  private moralis?: MoralisProvider;
  private blockscout?: BlockscoutProvider;
  private goldrush?: GoldRushProvider;

  constructor(opts: RoninDataClientOptions) {
    this.moralis = opts.moralis;
    this.blockscout = opts.blockscout;
    this.goldrush = opts.goldrush;
  }

  private requireMoralis(): MoralisProvider {
    if (!this.moralis) throw new Error("Moralis provider not configured");
    return this.moralis;
  }
  private requireBlockscout(): BlockscoutProvider {
    if (!this.blockscout) throw new Error("Blockscout provider not configured");
    return this.blockscout;
  }
  private requireGoldrush(): GoldRushProvider {
    if (!this.goldrush) throw new Error("GoldRush provider not configured");
    return this.goldrush;
  }

  /**
   * Stream normalized transfers over [fromBlock, toBlock], deduped on
   * (txHash, logIndex). Blockscout pages DESC over the full history; Moralis
   * pages ASC (block filters are unusable there - U13). Both filter by
   * block_number client-side. Used by backfill (fromBlock=0 -> everything).
   */
  async *fetchTransfers(
    asset: Asset,
    fromBlock = 0,
    toBlock?: number,
    source: ProviderSource = "blockscout",
  ): AsyncIterable<NormalizedTransfer> {
    const contract = contractFor(asset);
    const seen = new Set<string>();
    const stream =
      source === "blockscout"
        ? this.requireBlockscout().fetchTransfers(contract)
        : source === "goldrush"
          ? this.requireGoldrush().fetchTransfers(contract, fromBlock, toBlock ?? MAX_BLOCK)
          : this.requireMoralis().fetchTransfers(contract, { order: "ASC" } as TransferQuery);
    for await (const t of stream) {
      if (t.blockNumber < fromBlock) continue;
      if (toBlock != null && t.blockNumber > toBlock) continue;
      const key = `${t.txHash}:${t.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      yield t;
    }
  }

  /**
   * Stream only the recent tail (block_number > sinceBlock). Blockscout pages
   * DESC (newest first) and we STOP as soon as we reach an event at or below
   * the cursor, so a daily sync reads only new activity. Efficient + free.
   */
  async *fetchNewTransfers(
    asset: Asset,
    sinceBlock: number,
    source: ProviderSource = "blockscout",
  ): AsyncIterable<NormalizedTransfer> {
    const contract = contractFor(asset);
    const seen = new Set<string>();
    if (source === "blockscout") {
      for await (const t of this.requireBlockscout().fetchTransfers(contract)) {
        if (t.blockNumber <= sinceBlock) return; // DESC: reached known history, stop
        const key = `${t.txHash}:${t.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        yield t;
      }
    } else {
      for await (const t of this.requireMoralis().fetchTransfers(contract, { order: "DESC" })) {
        if (t.blockNumber <= sinceBlock) return;
        const key = `${t.txHash}:${t.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        yield t;
      }
    }
  }

  /** Stream current owners for an asset. */
  async *fetchOwners(
    asset: Asset,
    source: ProviderSource = "moralis",
  ): AsyncIterable<OwnerRow> {
    const contract = contractFor(asset);
    if (source === "blockscout") {
      yield* this.requireBlockscout().fetchOwners(contract);
    } else {
      yield* this.requireMoralis().fetchOwners(contract);
    }
  }
}
