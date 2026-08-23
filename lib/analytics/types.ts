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
  /** Worst rolling-window let-go rate the wallet ever reached, 0..1. */
  peakSellRate: number;
  /** Dumping episodes that cleared the position floor. */
  episodeCount: number;
  /** Units the wallet must currently hold to leave paper. 0 when never dumped. */
  rebuildTarget: number;
  /** Units it holds against that target, for the profile popover. */
  rebuildHeld: number;
  /** Clean days served since the last qualifying episode ended. */
  sentenceServedDays: number;
  /** Clean days that episode requires. 0 when never dumped. */
  sentenceRequiredDays: number;
}

export const MS_PER_DAY = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}
