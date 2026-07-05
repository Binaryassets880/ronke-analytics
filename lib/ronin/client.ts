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
   * deduped on (txHash, logIndex). `source` defaults to Moralis.
   */
  async *fetchTransfers(
    asset: Asset,
    fromBlock?: number,
    toBlock?: number,
    source: ProviderSource = "moralis",
  ): AsyncIterable<NormalizedTransfer> {
    const contract = contractFor(asset);
    const query: TransferQuery = { fromBlock, toBlock, order: "ASC" };
    const seen = new Set<string>();
    if (source === "moralis") {
      for await (const t of this.moralis.fetchTransfers(contract, query)) {
        const key = `${t.txHash}:${t.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        yield t;
      }
    } else {
      throw new Error(
        "Blockscout transfer streaming is a deferred deliverable (KTD-5); " +
          "Moralis spans the full history per the U13 spike.",
      );
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
