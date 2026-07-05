/**
 * Shared domain types across ingestion and analytics.
 *
 * `NormalizedTransfer` is the provider-agnostic shape the RoninDataClient
 * yields and the shape `transfer_events` stores. Both Moralis and Blockscout
 * normalize into this so downstream analytics never sees provider specifics.
 */

import type { Asset } from "@/config/contracts";

/** One transfer/event, normalized from any provider. */
export interface NormalizedTransfer {
  asset: Asset;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: Date;
  from: string; // lowercased
  to: string; // lowercased
  tokenId: string | null; // null for ERC-20
  quantity: bigint; // raw base units (wei for token, 1 per NFT)
  isMint: boolean;
  isBurn: boolean;
  raw?: unknown;
}

/** A current owner as reported by an `owners` snapshot endpoint. */
export interface OwnerRow {
  address: string; // lowercased
  balance: bigint; // raw base units
  tokenCount?: number; // nft
  isContract?: boolean;
  label?: string | null;
}

/** Which provider served a request. */
export type ProviderSource = "moralis" | "blockscout" | "goldrush";
