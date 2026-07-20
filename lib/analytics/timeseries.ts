/**
 * Daily time series (U6): holder count, new/exited holders (day-over-day set
 * difference), supply held, and per-day concentration (Gini, top-10, whales).
 *
 * Replays events in order, snapshotting the holder set at each day boundary.
 * Pure. Label-excluded addresses never enter the holder set.
 */

import type { Asset } from "@/config/contracts";
import { contractFor } from "@/config/contracts";
import { WHALE_SUPPLY_SHARE } from "@/config/badges";
import type { ReplayEvent } from "@/lib/types";
import type { Labels } from "./labels";
import { gini, topNShare } from "./concentration";

export interface DailySnapshot {
  asset: Asset;
  date: string; // YYYY-MM-DD (UTC)
  holderCount: number;
  gini: number;
  top10Pct: number;
  whaleCount: number;
  newHolders: number;
  exitedHolders: number;
  supplyHeld: bigint;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeDailySeries(
  asset: Asset,
  events: ReplayEvent[],
  labels: Labels,
): DailySnapshot[] {
  if (events.length === 0) return [];
  const isNft = contractFor(asset).standard === "erc721";
  const balance = new Map<string, bigint>();

  const apply = (e: ReplayEvent) => {
    const delta = isNft ? 1n : e.quantity;
    if (!labels.excludeFromHolders(e.to)) {
      balance.set(e.to, (balance.get(e.to) ?? 0n) + delta);
    }
    if (!labels.excludeFromHolders(e.from)) {
      const next = (balance.get(e.from) ?? 0n) - delta;
      balance.set(e.from, next < 0n ? 0n : next);
    }
  };

  const out: DailySnapshot[] = [];
  let prevHolders = new Set<string>();

  const emit = (date: string) => {
    const holders: string[] = [];
    const weights: number[] = [];
    let supply = 0n;
    for (const [addr, bal] of balance) {
      if (bal > 0n) {
        holders.push(addr);
        weights.push(Number(bal));
        supply += bal;
      }
    }
    const holderSet = new Set(holders);
    let newHolders = 0;
    for (const h of holderSet) if (!prevHolders.has(h)) newHolders += 1;
    let exitedHolders = 0;
    for (const h of prevHolders) if (!holderSet.has(h)) exitedHolders += 1;
    const total = weights.reduce((s, x) => s + x, 0);
    const whaleCount = weights.filter(
      (w) => total > 0 && w / total > WHALE_SUPPLY_SHARE,
    ).length;
    out.push({
      asset,
      date,
      holderCount: holders.length,
      gini: gini(weights),
      top10Pct: topNShare(weights, 10),
      whaleCount,
      newHolders,
      exitedHolders,
      supplyHeld: supply,
    });
    prevHolders = holderSet;
  };

  const sorted = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
  );
  let currentDay: string | null = null;
  for (const e of sorted) {
    const d = dayKey(e.blockTime);
    if (currentDay !== null && d !== currentDay) emit(currentDay);
    apply(e);
    currentDay = d;
  }
  if (currentDay !== null) emit(currentDay);
  return out;
}
