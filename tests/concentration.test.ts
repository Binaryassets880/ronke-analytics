import { describe, it, expect } from "vitest";
import { gini, topNShare, computeConcentration } from "@/lib/analytics/concentration";
import type { HolderBalance, HolderMetric } from "@/lib/analytics/types";

describe("gini", () => {
  it("is ~0 for a perfectly equal set", () => {
    expect(gini([10, 10, 10, 10])).toBeCloseTo(0, 5);
  });
  it("approaches ~1 for a single dominant holder", () => {
    expect(gini([1000000, 0.000001])).toBeGreaterThan(0.49);
  });
  it("is 0 for an empty set (no divide-by-zero)", () => {
    expect(gini([])).toBe(0);
  });
});

describe("topNShare", () => {
  it("returns the top-N fraction of total", () => {
    expect(topNShare([50, 30, 20], 1)).toBeCloseTo(0.5, 5);
    expect(topNShare([50, 30, 20], 2)).toBeCloseTo(0.8, 5);
  });
  it("is 0 for an empty set", () => {
    expect(topNShare([], 10)).toBe(0);
  });
});

function tokenHolder(address: string, balance: bigint, current = true): HolderBalance {
  return {
    asset: "ronke_token",
    address,
    balance,
    tokenCount: 0,
    firstAcquiredAt: null,
    lastActivityAt: null,
    isCurrentHolder: current,
  };
}

describe("computeConcentration", () => {
  it("excludes non-current holders and zeroes an empty asset", () => {
    const empty = computeConcentration("ronke_token", [], []);
    expect(empty.holderCount).toBe(0);
    expect(empty.gini).toBe(0);
    expect(empty.supplyHeld).toBe(0n);
  });

  it("counts whales above the supply-share threshold", () => {
    const balances = [
      tokenHolder("0x1", 980n), // 98% -> whale
      tokenHolder("0x2", 10n),
      tokenHolder("0x3", 10n),
      tokenHolder("0x4", 0n, false), // exited, ignored
    ];
    const c = computeConcentration("ronke_token", balances, []);
    expect(c.holderCount).toBe(3);
    expect(c.whaleCount).toBe(1);
    expect(c.supplyHeld).toBe(1000n);
    expect(c.top10Pct).toBeCloseTo(1, 5); // all 3 fit in top 10
  });

  it("histogram bucket counts sum to the holder count", () => {
    const balances = [
      tokenHolder("0x1", 5n),
      tokenHolder("0x2", 5_000n),
      tokenHolder("0x3", 50_000_000n),
    ];
    const c = computeConcentration("ronke_token", balances, []);
    const sum = c.histogram.reduce((s, b) => s + b.count, 0);
    expect(sum).toBe(c.holderCount);
  });

  it("tallies the diamond-bucket distribution among current holders", () => {
    const balances = [tokenHolder("0x1", 100n), tokenHolder("0x2", 100n)];
    const metrics: HolderMetric[] = [
      {
        asset: "ronke_token",
        address: "0x1",
        holdingDurationDays: 40,
        weightedDurationDays: 40,
        diamondBucket: "diamond",
        everPaperSold: false,
        neverSold: true,
        sellCount: 0,
        pctOriginalHeld: 1,
      },
      {
        asset: "ronke_token",
        address: "0x2",
        holdingDurationDays: 2,
        weightedDurationDays: 2,
        diamondBucket: "paper",
        everPaperSold: false,
        neverSold: true,
        sellCount: 0,
        pctOriginalHeld: 1,
      },
    ];
    const c = computeConcentration("ronke_token", balances, metrics);
    expect(c.diamondDistribution.diamond).toBe(1);
    expect(c.diamondDistribution.paper).toBe(1);
  });
});
