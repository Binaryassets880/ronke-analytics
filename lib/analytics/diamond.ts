/**
 * Behavioral diamond-hands engine (U5, KTD-6).
 *
 * RONKE is unpriced, so "diamond hands" is behavioral, not basis-driven. Two
 * orthogonal, fully-partitioned classifications are produced:
 *  - diamondBucket: exhaustive over the wallet's current holding duration
 *    (age of its oldest still-held lot/token): paper < 7d, regular [7,30), diamond >= 30d.
 *  - everPaperSold: true if the wallet ever sold units within < 1 day of
 *    acquiring them, independent of current bucket.
 *
 * Behavioral ownership model (documented divergence from raw on-chain balance):
 *  - A genuine sell (labels.isSell) is the ONLY event that consumes FIFO lots
 *    for the diamond clock, increments sellCount, and can set everPaperSold.
 *  - Moves to/from staking/bridge/team retain ownership: they neither create
 *    nor consume a lot, so the diamond clock is preserved.
 *  - Burns consume lots (units gone) but are not sells.
 *  - Mints and genuine buys create lots (acquisitions).
 */

import type { Asset, DiamondBucket } from "@/config/contracts";
import { contractFor, diamondBucketFor, DIAMOND_THRESHOLDS } from "@/config/contracts";
import type { NormalizedTransfer } from "@/lib/types";
import type { Labels } from "./labels";
import type { HolderLot, HolderMetric } from "./types";
import { daysBetween, MS_PER_DAY } from "./types";

const PAPER_WINDOW_MS = DIAMOND_THRESHOLDS.paperSellWindowDays * MS_PER_DAY;

export interface DiamondResult {
  lots: HolderLot[];
  metrics: HolderMetric[];
}

/** Compute FIFO lots + diamond metrics. `events` sorted ascending by block. */
export function computeDiamond(
  asset: Asset,
  events: NormalizedTransfer[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  return contractFor(asset).standard === "erc20"
    ? computeToken(asset, events, labels, asOf)
    : computeNft(asset, events, labels, asOf);
}

// ── ERC-20: FIFO behavioral lots ─────────────────────────────────────
interface Lot {
  acquiredAt: Date;
  acquiredBlock: number;
  quantityRemaining: bigint;
}
interface TokenState {
  queue: Lot[];
  originalStack: bigint;
  firstLot: Lot | null;
  sellCount: number;
  everPaperSold: boolean;
  everAcquired: boolean;
}

function computeToken(
  asset: Asset,
  events: NormalizedTransfer[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  const state = new Map<string, TokenState>();
  const ensure = (a: string): TokenState => {
    let s = state.get(a);
    if (!s) {
      s = {
        queue: [],
        originalStack: 0n,
        firstLot: null,
        sellCount: 0,
        everPaperSold: false,
        everAcquired: false,
      };
      state.set(a, s);
    }
    return s;
  };

  for (const e of events) {
    // Inbound acquisition (skip self, retain-ownership returns, excluded addrs).
    if (
      e.to !== e.from &&
      !labels.excludeFromHolders(e.to) &&
      !labels.isRetainOwnership(e.from)
    ) {
      const s = ensure(e.to);
      const lot: Lot = {
        acquiredAt: e.blockTime,
        acquiredBlock: e.blockNumber,
        quantityRemaining: e.quantity,
      };
      s.queue.push(lot);
      s.everAcquired = true;
      if (s.firstLot === null) {
        s.firstLot = lot;
        s.originalStack = e.quantity;
      }
    }
    // Outbound disposal.
    if (e.from !== e.to && !labels.excludeFromHolders(e.from)) {
      const sell = labels.isSell(e.from, e.to);
      const retain = labels.isRetainOwnership(e.to);
      if (!retain) {
        // Consume FIFO (burn or sell both remove units); retain moves do not.
        const s = ensure(e.from);
        const consumed = consumeFifo(s.queue, e.quantity);
        if (sell) {
          s.sellCount += 1;
          for (const c of consumed) {
            if (e.blockTime.getTime() - c.acquiredAt.getTime() < PAPER_WINDOW_MS) {
              s.everPaperSold = true;
            }
          }
        }
      }
    }
  }

  const lots: HolderLot[] = [];
  const metrics: HolderMetric[] = [];
  for (const [address, s] of state) {
    if (!s.everAcquired) continue;
    let oldest: Date | null = null;
    let weightedNum = 0;
    let totalQty = 0;
    for (const lot of s.queue) {
      if (lot.quantityRemaining <= 0n) continue;
      lots.push({
        asset,
        address,
        tokenId: null,
        acquiredAt: lot.acquiredAt,
        acquiredBlock: lot.acquiredBlock,
        quantityRemaining: lot.quantityRemaining,
      });
      if (oldest === null || lot.acquiredAt < oldest) oldest = lot.acquiredAt;
      const age = daysBetween(lot.acquiredAt, asOf);
      const q = Number(lot.quantityRemaining);
      weightedNum += age * q;
      totalQty += q;
    }
    const holdingDurationDays = oldest ? daysBetween(oldest, asOf) : 0;
    const firstRemaining = s.firstLot ? s.firstLot.quantityRemaining : 0n;
    const pctOriginalHeld =
      s.originalStack > 0n
        ? Number((firstRemaining * 1_000_000n) / s.originalStack) / 1_000_000
        : 0;
    metrics.push({
      asset,
      address,
      holdingDurationDays,
      weightedDurationDays: totalQty > 0 ? weightedNum / totalQty : 0,
      diamondBucket: bucketOrNone(holdingDurationDays, totalQty > 0),
      everPaperSold: s.everPaperSold,
      neverSold: s.sellCount === 0,
      sellCount: s.sellCount,
      pctOriginalHeld,
    });
  }
  return { lots, metrics };
}

/** Consume `amount` from the front of the FIFO queue; return consumed slices. */
function consumeFifo(
  queue: Lot[],
  amount: bigint,
): { acquiredAt: Date; consumed: bigint }[] {
  const out: { acquiredAt: Date; consumed: bigint }[] = [];
  let remaining = amount;
  let i = 0;
  while (remaining > 0n && i < queue.length) {
    const lot = queue[i];
    if (lot.quantityRemaining <= 0n) {
      i += 1;
      continue;
    }
    const take = lot.quantityRemaining <= remaining ? lot.quantityRemaining : remaining;
    lot.quantityRemaining -= take;
    remaining -= take;
    out.push({ acquiredAt: lot.acquiredAt, consumed: take });
    if (lot.quantityRemaining === 0n) i += 1;
  }
  return out;
}

// ── ERC-721: per-token holding clock ─────────────────────────────────
interface NftState {
  sellCount: number;
  everPaperSold: boolean;
  everAcquiredCount: number;
}

function computeNft(
  asset: Asset,
  events: NormalizedTransfer[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  // token_id -> current owner + when the current owner acquired it.
  const owner = new Map<string, { address: string; acquiredAt: Date }>();
  const state = new Map<string, NftState>();
  const ensure = (a: string): NftState => {
    let s = state.get(a);
    if (!s) {
      s = { sellCount: 0, everPaperSold: false, everAcquiredCount: 0 };
      state.set(a, s);
    }
    return s;
  };

  for (const e of events) {
    if (e.tokenId == null) continue;
    const prev = owner.get(e.tokenId);
    const sell = labels.isSell(e.from, e.to);

    // Seller side: record a genuine sell + paper-sell detection.
    if (prev && !labels.excludeFromHolders(prev.address) && sell) {
      const s = ensure(prev.address);
      s.sellCount += 1;
      if (e.blockTime.getTime() - prev.acquiredAt.getTime() < PAPER_WINDOW_MS) {
        s.everPaperSold = true;
      }
    }

    // Receiver side: becomes owner. Retain-ownership returns preserve the
    // prior acquiredAt; otherwise the holding clock resets to now.
    if (!labels.excludeFromHolders(e.to)) {
      const retainReturn =
        labels.isRetainOwnership(e.from) && prev?.address === e.to;
      const acquiredAt = retainReturn ? prev!.acquiredAt : e.blockTime;
      owner.set(e.tokenId, { address: e.to, acquiredAt });
      if (!retainReturn) ensure(e.to).everAcquiredCount += 1;
    } else {
      owner.delete(e.tokenId);
    }
  }

  // Aggregate current holdings per address.
  const heldByAddr = new Map<string, Date[]>();
  for (const { address, acquiredAt } of owner.values()) {
    if (labels.excludeFromHolders(address)) continue;
    const arr = heldByAddr.get(address) ?? [];
    arr.push(acquiredAt);
    heldByAddr.set(address, arr);
  }

  const lots: HolderLot[] = [];
  const metrics: HolderMetric[] = [];
  const addresses = new Set<string>([...state.keys(), ...heldByAddr.keys()]);
  for (const address of addresses) {
    const held = heldByAddr.get(address) ?? [];
    const s = state.get(address) ?? {
      sellCount: 0,
      everPaperSold: false,
      everAcquiredCount: held.length,
    };
    let oldest: Date | null = null;
    let weightedSum = 0;
    for (const acquiredAt of held) {
      if (oldest === null || acquiredAt < oldest) oldest = acquiredAt;
      weightedSum += daysBetween(acquiredAt, asOf);
    }
    // Emit one lot row per currently-held token (for provenance).
    // (token_id association is reconstructed in rebuild persistence.)
    const holdingDurationDays = oldest ? daysBetween(oldest, asOf) : 0;
    metrics.push({
      asset,
      address,
      holdingDurationDays,
      weightedDurationDays: held.length > 0 ? weightedSum / held.length : 0,
      diamondBucket: bucketOrNone(holdingDurationDays, held.length > 0),
      everPaperSold: s.everPaperSold,
      neverSold: s.sellCount === 0,
      sellCount: s.sellCount,
      pctOriginalHeld:
        s.everAcquiredCount > 0 ? held.length / s.everAcquiredCount : 0,
    });
  }

  // Per-token lots for the NFT side.
  for (const [tokenId, { address, acquiredAt }] of owner) {
    if (labels.excludeFromHolders(address)) continue;
    lots.push({
      asset,
      address,
      tokenId,
      acquiredAt,
      acquiredBlock: 0,
      quantityRemaining: 1n,
    });
  }

  return { lots, metrics };
}

/** A holder with no current holdings is bucketed paper (duration 0). */
function bucketOrNone(durationDays: number, hasHoldings: boolean): DiamondBucket {
  if (!hasHoldings) return "paper";
  return diamondBucketFor(durationDays);
}
