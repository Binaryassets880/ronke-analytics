import { describe, it, expect } from "vitest";
import { computeDailySeries } from "@/lib/analytics/timeseries";
import { Labels, SEED_LABELS } from "@/lib/analytics/labels";
import { tx, day, ADDR } from "./helpers";

const labels = new Labels(SEED_LABELS);

describe("computeDailySeries", () => {
  it("returns an empty series for an asset with no transfers", () => {
    expect(computeDailySeries("ronke_token", [], labels)).toEqual([]);
  });

  it("counts a first-time wallet as new, and a drop-to-zero as exited", () => {
    const events = [
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet, quantity: 100n, blockTime: day(1) }),
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet2, quantity: 50n, blockTime: day(2) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.external, quantity: 100n, blockTime: day(3) }),
    ];
    const series = computeDailySeries("ronke_token", events, labels);
    const byDate = Object.fromEntries(series.map((s) => [s.date, s]));
    const d1 = byDate["2026-01-02"]; // day(1)
    const d2 = byDate["2026-01-03"]; // day(2)
    const d3 = byDate["2026-01-04"]; // day(3): wallet exits, external enters

    expect(d1.newHolders).toBe(1); // wallet
    expect(d1.holderCount).toBe(1);
    expect(d2.newHolders).toBe(1); // wallet2
    expect(d2.holderCount).toBe(2);
    expect(d3.newHolders).toBe(1); // external
    expect(d3.exitedHolders).toBe(1); // wallet dropped to 0
    expect(d3.holderCount).toBe(2); // wallet2 + external
  });

  it("tracks supply held excluding label-excluded addresses", () => {
    const events = [
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet, quantity: 100n, blockTime: day(1) }),
      // move to marketplace (excluded) - leaves the holder set, supply drops
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: 40n, blockTime: day(2) }),
    ];
    const series = computeDailySeries("ronke_token", events, labels);
    const last = series[series.length - 1];
    expect(last.supplyHeld).toBe(60n); // marketplace holdings excluded
    expect(last.holderCount).toBe(1);
  });

  it("counts NFT holders per token", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(1) }),
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "2", blockTime: day(1) }),
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet2, tokenId: "3", blockTime: day(1) }),
    ];
    const series = computeDailySeries("ronkeverse_nft", events, labels);
    const d = series[0];
    expect(d.holderCount).toBe(2);
    expect(d.supplyHeld).toBe(3n);
  });
});
