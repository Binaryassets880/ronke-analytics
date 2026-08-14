/**
 * Behavioral diamond-hands engine (U5, KTD-6).
 *
 * RONKE is unpriced, so "diamond hands" is behavioral, not basis-driven. Two
 * orthogonal, fully-partitioned classifications are produced:
 *  - diamondBucket: matches the Diamond Hands BADGE engine (2026-07-07):
 *    diamond = never made a significant sell AND holds a non-dust position AND
 *    has held >= diamondDays; paper = paper-handed or fresh (< regularDays);
 *    regular = everything else. (Previously age-only, which saturated at ~98%
 *    "diamond" once the collection grew older than the 30d cutoff.)
 *  - everPaperSold: true if the wallet ever SIGNIFICANTLY sold units within
 *    < 1 day of acquiring them, independent of current bucket.
 *
 * Sell tolerance (2026-07-07): a genuine sell of less than
 * DIAMOND_THRESHOLDS.sellTolerancePct (10%) of the wallet's holdings at that
 * moment is a TRIM - units leave FIFO, but never-sold status and the holding
 * clock survive. A sell of 10%+ is significant: it increments sellCount (so
 * never_sold flips false) AND resets the holding clock on everything still
 * held (all remaining lots re-date to the sell moment).
 *
 * Two clocks per lot/token (2026-08-14): `acquiredAt` is the DISPLAY clock and
 * is what a significant sell resets; `trueAcquiredAt` records when the wallet
 * genuinely took custody and is NEVER reset. The paper-hands window measures
 * against `trueAcquiredAt`. Before this split, a second significant sell within
 * a day of a first one was automatically "paper-handed" - the first sell had
 * re-dated everything still held to its own timestamp, so the second sell
 * compared against a synthetic clock. That mislabeled genuinely long-held
 * positions (e.g. an NFT held 4.5 months, sold 2m36s after another one) and
 * cost those wallets the 0.3x paper multiplier on their Ronke Score.
 *
 * Behavioral ownership model (documented divergence from raw on-chain balance):
 *  - Only genuine sells (labels.isSell) can be significant; burns consume lots
 *    (units gone) but are not sells and never reset the clock.
 *  - Moves to/from staking/bridge/team retain ownership: they neither create
 *    nor consume a lot, so the diamond clock is preserved.
 *  - Mints and genuine buys create lots (acquisitions).
 */

import type { Asset, DiamondBucket } from "@/config/contracts";
import { contractFor, DIAMOND_THRESHOLDS } from "@/config/contracts";
import { DIAMOND_BADGE_MIN } from "@/config/badges";
import type { ReplayEvent } from "@/lib/types";
import type { Labels } from "./labels";
import type { HolderLot, HolderMetric } from "./types";
import { daysBetween, MS_PER_DAY } from "./types";

const PAPER_WINDOW_MS = DIAMOND_THRESHOLDS.paperSellWindowDays * MS_PER_DAY;
/** Sell tolerance as an integer per-mille ratio so bigint math stays exact. */
const TOLERANCE_MILLI = BigInt(Math.round(DIAMOND_THRESHOLDS.sellTolerancePct * 1000));

/** True when selling `quantity` out of `balanceBefore` crosses the tolerance. */
function isSignificantSell(quantity: bigint, balanceBefore: bigint): boolean {
  if (balanceBefore <= 0n) return false;
  return quantity * 1000n >= balanceBefore * TOLERANCE_MILLI;
}

/**
 * Badge-parity bucket: diamond only for a never-sold, non-dust position held
 * past the diamond window; paper for paper-handed or fresh positions.
 */
function bucketFor(
  flags: { neverSold: boolean; everPaperSold: boolean },
  durationDays: number,
  hasHoldings: boolean,
  nonDust: boolean,
): DiamondBucket {
  if (!hasHoldings) return "paper";
  if (flags.neverSold && nonDust && durationDays >= DIAMOND_THRESHOLDS.diamondDays) return "diamond";
  if (flags.everPaperSold || durationDays < DIAMOND_THRESHOLDS.regularDays) return "paper";
  return "regular";
}

/** Non-dust floor for a token asset, in raw base units. */
function dustFloorRaw(asset: Asset): bigint {
  const whole =
    asset === "ronke_token"
      ? DIAMOND_BADGE_MIN.ronke
      : asset === "ronkestr_token"
        ? DIAMOND_BADGE_MIN.ronkestr
        : 0;
  const decimals = contractFor(asset).decimals ?? 18;
  return BigInt(whole) * 10n ** BigInt(decimals);
}

export interface DiamondResult {
  lots: HolderLot[];
  metrics: HolderMetric[];
}

/** Compute FIFO lots + diamond metrics. `events` sorted ascending by block. */
export function computeDiamond(
  asset: Asset,
  events: ReplayEvent[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  return contractFor(asset).standard === "erc20"
    ? computeToken(asset, events, labels, asOf)
    : computeNft(asset, events, labels, asOf);
}

// ── ERC-20: FIFO behavioral lots ─────────────────────────────────────
interface Lot {
  /** Display clock: reset to the sell moment by a significant sell. */
  acquiredAt: Date;
  /** Genuine custody date, never reset. Drives the paper-hands window. */
  trueAcquiredAt: Date;
  acquiredBlock: number;
  quantityRemaining: bigint;
}
interface TokenState {
  queue: Lot[];
  /** Running tracked balance (sum of lot remainders), kept for tolerance math. */
  balance: bigint;
  originalStack: bigint;
  firstLot: Lot | null;
  sellCount: number;
  everPaperSold: boolean;
  everAcquired: boolean;
}

function computeToken(
  asset: Asset,
  events: ReplayEvent[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  const floorRaw = dustFloorRaw(asset);
  const state = new Map<string, TokenState>();
  const ensure = (a: string): TokenState => {
    let s = state.get(a);
    if (!s) {
      s = {
        queue: [],
        balance: 0n,
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
        trueAcquiredAt: e.blockTime,
        acquiredBlock: e.blockNumber,
        quantityRemaining: e.quantity,
      };
      s.queue.push(lot);
      s.balance += e.quantity;
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
        const balanceBefore = s.balance;
        const consumed = consumeFifo(s.queue, e.quantity);
        for (const c of consumed) s.balance -= c.consumed;
        // A sell below the tolerance is a trim: units leave, but never-sold
        // status and the holding clock survive. At/above it, the sell counts
        // and the clock resets on everything still held.
        if (sell && isSignificantSell(e.quantity, balanceBefore)) {
          s.sellCount += 1;
          for (const c of consumed) {
            // Against the genuine custody date, not a prior sell's reset.
            if (e.blockTime.getTime() - c.trueAcquiredAt.getTime() < PAPER_WINDOW_MS) {
              s.everPaperSold = true;
            }
          }
          for (const lot of s.queue) {
            if (lot.quantityRemaining > 0n) {
              lot.acquiredAt = e.blockTime;
              lot.acquiredBlock = e.blockNumber;
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
    const flags = { neverSold: s.sellCount === 0, everPaperSold: s.everPaperSold };
    metrics.push({
      asset,
      address,
      holdingDurationDays,
      weightedDurationDays: totalQty > 0 ? weightedNum / totalQty : 0,
      diamondBucket: bucketFor(flags, holdingDurationDays, totalQty > 0, s.balance >= floorRaw),
      everPaperSold: s.everPaperSold,
      neverSold: flags.neverSold,
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
): { acquiredAt: Date; trueAcquiredAt: Date; consumed: bigint }[] {
  const out: { acquiredAt: Date; trueAcquiredAt: Date; consumed: bigint }[] = [];
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
    out.push({
      acquiredAt: lot.acquiredAt,
      trueAcquiredAt: lot.trueAcquiredAt,
      consumed: take,
    });
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
  events: ReplayEvent[],
  labels: Labels,
  asOf: Date,
): DiamondResult {
  // token_id -> current owner, its display clock, and its genuine custody date.
  const owner = new Map<
    string,
    { address: string; acquiredAt: Date; trueAcquiredAt: Date }
  >();
  // address -> the token_ids it currently owns (for tolerance + clock resets).
  const ownedBy = new Map<string, Set<string>>();
  const state = new Map<string, NftState>();
  const ensure = (a: string): NftState => {
    let s = state.get(a);
    if (!s) {
      s = { sellCount: 0, everPaperSold: false, everAcquiredCount: 0 };
      state.set(a, s);
    }
    return s;
  };
  const removeOwned = (address: string, tokenId: string) => {
    ownedBy.get(address)?.delete(tokenId);
  };
  const addOwned = (address: string, tokenId: string) => {
    let set = ownedBy.get(address);
    if (!set) {
      set = new Set();
      ownedBy.set(address, set);
    }
    set.add(tokenId);
  };

  for (const e of events) {
    if (e.tokenId == null) continue;
    const prev = owner.get(e.tokenId);

    // Retain-ownership custody moves (staking/bridge/team): the wallet keeps
    // ownership and its holding clock throughout. A deposit leaves the owner
    // map untouched (the staker still "owns" the token); the matching return
    // to the owner of record is then a no-op. Mirrors the token path, where
    // retain moves neither create nor consume lots.
    if (labels.isRetainOwnership(e.to)) continue;
    if (labels.isRetainOwnership(e.from) && prev?.address === e.to) continue;

    const sell = labels.isSell(e.from, e.to);

    // Seller side: selling 1 token out of N held is significant only when it
    // crosses the tolerance (1/N >= sellTolerancePct). A trim out of a big
    // collection keeps never-sold status and the clock on the rest.
    if (prev && !labels.excludeFromHolders(prev.address) && sell) {
      const countBefore = BigInt(ownedBy.get(prev.address)?.size ?? 0);
      if (isSignificantSell(1n, countBefore)) {
        const s = ensure(prev.address);
        s.sellCount += 1;
        // Against the genuine custody date, not a prior sell's reset.
        if (e.blockTime.getTime() - prev.trueAcquiredAt.getTime() < PAPER_WINDOW_MS) {
          s.everPaperSold = true;
        }
        // Reset the holding clock on everything the seller still holds.
        for (const heldId of ownedBy.get(prev.address) ?? []) {
          if (heldId === e.tokenId) continue;
          const o = owner.get(heldId);
          if (o) o.acquiredAt = e.blockTime;
        }
      }
    }

    // Receiver side: becomes owner with a fresh holding clock. (Returns from
    // retain-ownership custody to the owner of record were already skipped
    // above, so reaching here means custody genuinely changed.)
    if (prev) removeOwned(prev.address, e.tokenId);
    if (!labels.excludeFromHolders(e.to)) {
      owner.set(e.tokenId, {
        address: e.to,
        acquiredAt: e.blockTime,
        trueAcquiredAt: e.blockTime,
      });
      addOwned(e.to, e.tokenId);
      ensure(e.to).everAcquiredCount += 1;
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
    const flags = { neverSold: s.sellCount === 0, everPaperSold: s.everPaperSold };
    metrics.push({
      asset,
      address,
      holdingDurationDays,
      weightedDurationDays: held.length > 0 ? weightedSum / held.length : 0,
      diamondBucket: bucketFor(
        flags,
        holdingDurationDays,
        held.length > 0,
        held.length >= DIAMOND_BADGE_MIN.nftCount,
      ),
      everPaperSold: s.everPaperSold,
      neverSold: flags.neverSold,
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
