/**
 * RoninDataClient - source-agnostic, block-range transfer/owner interface.
 *
 * KTD-4: exposes fetchTransfers over a block range independent of provider, so
 * the L2-migration boundary (MIGRATION_BLOCK) is a data detail, not a schema or
 * analytics branch. Everything downstream keys on block_number. Default source
 * is Moralis; Blockscout is selectable for the legacy era if the continuity
 * assertion ever fails (it does not, per U13).
 */

import type { NormalizedTransfer, OwnerRow, ProviderSource } from "@/lib/types";
import type { Asset } from "@/config/contracts";
import { contractFor } from "@/config/contracts";
import { MoralisProvider, type TransferQuery } from "./moralis";
import { BlockscoutProvider } from "./blockscout";

export interface RoninDataClientOptions {
  moralis: MoralisProvider;
  blockscout?: BlockscoutProvider;
}

export class RoninDataClient {
  private moralis: MoralisProvider;
  private blockscout?: BlockscoutProvider;

  constructor(opts: RoninDataClientOptions) {
    this.moralis = opts.moralis;
    this.blockscout = opts.blockscout;
  }

  /**
   * Stream normalized transfers for an asset over [fromBlock, toBlock],
   * deduped on (txHash, logIndex). Pages the full history ASC via cursor and
   * filters by block_number CLIENT-SIDE - Moralis's from_block/to_block filters
   * 425 on older Ronin blocks (U13), so we never send them. Used by backfill
   * (fromBlock=0 -> everything) and by continuity's pre-migration scan.
   */
  async *fetchTransfers(
    asset: Asset,
    fromBlock = 0,
    toBlock?: number,
    source: ProviderSource = "moralis",
  ): AsyncIterable<NormalizedTransfer> {
    if (source !== "moralis") {
      throw new Error(
        "Blockscout transfer streaming is a deferred deliverable (KTD-5); " +
          "Moralis spans the full history per the U13 spike.",
      );
    }
    const contract = contractFor(asset);
    const query: TransferQuery = { order: "ASC" };
    const seen = new Set<string>();
    for await (const t of this.moralis.fetchTransfers(contract, query)) {
      if (t.blockNumber < fromBlock) continue;
      if (toBlock != null && t.blockNumber > toBlock) continue;
      const key = `${t.txHash}:${t.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      yield t;
    }
  }

  /**
   * Stream only the recent tail: transfers with block_number > sinceBlock.
   * Pages DESC (newest first) and STOPS as soon as it reaches an event at or
   * below the cursor, so a daily sync reads only new activity instead of the
   * full history. This is the efficient incremental path (no block filters).
   */
  async *fetchNewTransfers(
    asset: Asset,
    sinceBlock: number,
    source: ProviderSource = "moralis",
  ): AsyncIterable<NormalizedTransfer> {
    if (source !== "moralis") {
      throw new Error("Only the Moralis source is implemented (KTD-5).");
    }
    const contract = contractFor(asset);
    const seen = new Set<string>();
    for await (const t of this.moralis.fetchTransfers(contract, { order: "DESC" })) {
      if (t.blockNumber <= sinceBlock) return; // reached known history; stop paging
      const key = `${t.txHash}:${t.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      yield t;
    }
  }

  /** Stream current owners for an asset. */
  async *fetchOwners(
    asset: Asset,
    source: ProviderSource = "moralis",
  ): AsyncIterable<OwnerRow> {
    const contract = contractFor(asset);
    if (source === "blockscout") {
      if (!this.blockscout) throw new Error("Blockscout provider not configured");
      yield* this.blockscout.fetchOwners(contract);
    } else {
      yield* this.moralis.fetchOwners(contract);
    }
  }
}
