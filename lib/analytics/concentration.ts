/**
 * Concentration metrics (U6): Gini, top-N whale share, distribution histogram.
 *
 * Computed from current holder balances, excluding label-excluded addresses
 * (already dropped upstream in computeBalances, but guarded here too). Pure.
 */

import type { Asset } from "@/config/contracts";
import { WHALE_SUPPLY_SHARE } from "@/config/badges";
import type { HolderBalance, HolderMetric } from "./types";

export interface HistogramBucket {
  label: string;
  min: number; // inclusive lower edge (in whole units / token count)
  max: number | null; // exclusive upper edge; null = open-ended
  count: number;
}

export interface Concentration {
  asset: Asset;
  holderCount: number;
  gini: number; // 0 = perfectly equal, ~1 = one holder
  top10Pct: number; // 0..1 share of supply held by top 10
  topNPct: Record<number, number>; // e.g. {1,10,50}
  whaleCount: number; // holders > WHALE_SUPPLY_SHARE of supply
  supplyHeld: bigint;
  histogram: HistogramBucket[];
  /** Diamond-bucket distribution among current holders. */
  diamondDistribution: Record<string, number>;
}

/** Numeric weight of a holder (token balance or nft count). */
function weightOf(b: HolderBalance): number {
  return b.tokenCount > 0 || b.balance === 0n ? b.tokenCount : Number(b.balance);
}

/** Gini coefficient over a list of non-negative weights. */
export function gini(weights: number[]): number {
  const xs = weights.filter((w) => w > 0).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const total = xs.reduce((s, x) => s + x, 0);
  if (total === 0) return 0;
  // G = (2 * sum(i * x_i) / (n * sum(x))) - (n + 1) / n, with i 1-based.
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/** Share of total held by the top `n` holders. */
export function topNShare(weights: number[], n: number): number {
  const total = weights.reduce((s, x) => s + x, 0);
  if (total === 0) return 0;
  const top = weights
    .slice()
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((s, x) => s + x, 0);
  return top / total;
}

const TOKEN_BUCKETS: [number, number | null][] = [
  [0, 1],
  [1, 1_000],
  [1_000, 10_000],
  [10_000, 100_000],
  [100_000, 1_000_000],
  [1_000_000, 10_000_000],
  [10_000_000, null],
];
const NFT_BUCKETS: [number, number | null][] = [
  [1, 2],
  [2, 4],
  [4, 11],
  [11, 26],
  [26, null],
];

function buildHistogram(weights: number[], isNft: boolean): HistogramBucket[] {
  const edges = isNft ? NFT_BUCKETS : TOKEN_BUCKETS;
  return edges.map(([min, max]) => ({
    label: max === null ? `${min}+` : `${min}-${max - 1}`,
    min,
    max,
    count: weights.filter((w) => w >= min && (max === null || w < max)).length,
  }));
}

export function computeConcentration(
  asset: Asset,
  balances: HolderBalance[],
  metrics: HolderMetric[],
): Concentration {
  const current = balances.filter((b) => b.isCurrentHolder);
  const isNft = current.some((b) => b.tokenCount > 0);
  const weights = current.map(weightOf).filter((w) => w > 0);
  const holderCount = weights.length;
  const supplyHeld = current.reduce(
    (s, b) => s + (b.tokenCount > 0 ? BigInt(b.tokenCount) : b.balance),
    0n,
  );
  const totalWeight = weights.reduce((s, x) => s + x, 0);
  const whaleCount = weights.filter(
    (w) => totalWeight > 0 && w / totalWeight > WHALE_SUPPLY_SHARE,
  ).length;

  const metricByAddr = new Map(metrics.map((m) => [m.address, m]));
  const diamondDistribution: Record<string, number> = { paper: 0, regular: 0, diamond: 0 };
  for (const b of current) {
    const m = metricByAddr.get(b.address);
    if (m) diamondDistribution[m.diamondBucket] = (diamondDistribution[m.diamondBucket] ?? 0) + 1;
  }

  return {
    asset,
    holderCount,
    gini: gini(weights),
    top10Pct: topNShare(weights, 10),
    topNPct: {
      1: topNShare(weights, 1),
      10: topNShare(weights, 10),
      50: topNShare(weights, 50),
    },
    whaleCount,
    supplyHeld,
    histogram: buildHistogram(weights, isNft),
    diamondDistribution,
  };
}
