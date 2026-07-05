/**
 * Derived-snapshot types produced by the rebuild engine (U5/U6/U14).
 * All are computed purely from transfer_events + labels, so they are testable
 * without a database.
 */

import type { Asset, DiamondBucket } from "@/config/contracts";

export interface HolderBalance {
  asset: Asset;
  address: string;
  /** Raw base-unit balance (token). 0 for a pure NFT holder row. */
  balance: bigint;
  /** NFT count. 0 for a token holder row. */
  tokenCount: number;
  firstAcquiredAt: Date | null;
  lastActivityAt: Date | null;
  isCurrentHolder: boolean;
}

export interface HolderLot {
  asset: Asset;
  address: string;
  tokenId: string | null; // nft; null for token
  acquiredAt: Date;
  acquiredBlock: number;
  quantityRemaining: bigint;
}

export interface HolderMetric {
  asset: Asset;
  address: string;
  holdingDurationDays: number;
  weightedDurationDays: number;
  diamondBucket: DiamondBucket;
  everPaperSold: boolean;
  neverSold: boolean;
  sellCount: number;
  pctOriginalHeld: number; // 0..1
}

export const MS_PER_DAY = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}
