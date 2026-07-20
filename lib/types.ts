/**
 * Shared domain types across ingestion and analytics.
 *
 * `NormalizedTransfer` is the provider-agnostic shape the RoninDataClient
 * yields and the shape `transfer_events` stores. Both Moralis and Blockscout
 * normalize into this so downstream analytics never sees provider specifics.
 */

import type { Asset } from "@/config/contracts";

/**
 * The subset of a transfer the snapshot replay actually reads.
 *
 * The nightly rebuild streams every historical event out of Neon, so the
 * columns it does NOT read are pure egress cost. `txHash`, `isMint` and
 * `isBurn` are stored but never consulted by the replay - mint/burn semantics
 * are re-derived from the addresses via isBurnAddress() at compute time - so
 * `readEvents` selects only these fields. Keep this type minimal: every field
 * added here is re-fetched for all ~670k events on every rebuild.
 */
export interface ReplayEvent {
  asset: Asset;
  logIndex: number; // ordering + keyset pagination only
  blockNumber: number;
  blockTime: Date;
  from: string; // lowercased
  to: string; // lowercased
  tokenId: string | null; // null for ERC-20
  quantity: bigint; // raw base units (wei for token, 1 per NFT)
}

/**
 * One transfer/event, normalized from any provider. The ingest path needs the
 * full shape (`txHash` keys dedup/continuity); only the replay narrows to
 * `ReplayEvent`, which this extends so a NormalizedTransfer is always usable
 * wherever a ReplayEvent is expected.
 */
export interface NormalizedTransfer extends ReplayEvent {
  txHash: string;
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
