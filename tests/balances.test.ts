import { describe, it, expect } from "vitest";
import { computeBalances, currentHolders } from "@/lib/analytics/balances";
import { Labels, SEED_LABELS } from "@/lib/analytics/labels";
import { tx, day, ADDR } from "./helpers";

const labels = new Labels(SEED_LABELS);

describe("computeBalances (token)", () => {
  it("tracks running balance and first/last activity", () => {
    const events = [
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet, quantity: 100n, blockTime: day(1) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.external, quantity: 40n, blockTime: day(5) }),
    ];
    const balances = computeBalances("ronke_token", events, labels);
    const w = balances.find((b) => b.address === ADDR.wallet)!;
    expect(w.balance).toBe(60n);
    expect(w.isCurrentHolder).toBe(true);
    expect(w.firstAcquiredAt).toEqual(day(1));
    expect(w.lastActivityAt).toEqual(day(5));
  });

  it("retains an exited holder as balance 0 / not current", () => {
    const events = [
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet, quantity: 100n, blockTime: day(1) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.external, quantity: 100n, blockTime: day(2) }),
    ];
    const balances = computeBalances("ronke_token", events, labels);
    const w = balances.find((b) => b.address === ADDR.wallet)!;
    expect(w.balance).toBe(0n);
    expect(w.isCurrentHolder).toBe(false);
    // still present in the historical set
    expect(balances.some((b) => b.address === ADDR.wallet)).toBe(true);
  });

  it("excludes contract/burn addresses from holder rows", () => {
    const events = [
      tx("ronke_token", { from: ADDR.zero, to: ADDR.wallet, quantity: 100n, blockTime: day(1) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: 30n, blockTime: day(2) }),
    ];
    const balances = computeBalances("ronke_token", events, labels);
    // zero (mint source) and the marketplace contract must not appear.
    expect(balances.some((b) => b.address === ADDR.zero)).toBe(false);
    expect(balances.some((b) => b.address === ADDR.marketplace)).toBe(false);
  });
});

describe("computeBalances (nft)", () => {
  it("counts tokens held and drops them on transfer out", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(1) }),
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "2", blockTime: day(1) }),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "2", blockTime: day(3) }),
    ];
    const balances = computeBalances("ronkeverse_nft", events, labels);
    const w = balances.find((b) => b.address === ADDR.wallet)!;
    expect(w.tokenCount).toBe(1);
    expect(w.isCurrentHolder).toBe(true);
    expect(currentHolders(balances).some((b) => b.address === ADDR.external)).toBe(true);
  });
});
