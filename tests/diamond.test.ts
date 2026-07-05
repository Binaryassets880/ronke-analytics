import { describe, it, expect } from "vitest";
import { computeDiamond } from "@/lib/analytics/diamond";
import { Labels, SEED_LABELS } from "@/lib/analytics/labels";
import { tx, day, ADDR } from "./helpers";

const labels = new Labels(SEED_LABELS);
const metricFor = (res: { metrics: any[] }, addr: string) =>
  res.metrics.find((m) => m.address === addr.toLowerCase());

describe("computeDiamond - NFT", () => {
  it("mint-and-hold: never_sold true, duration measured from mint", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(true);
    expect(m.holdingDurationDays).toBeCloseTo(40, 5);
    expect(m.diamondBucket).toBe("diamond");
  });

  it("transfer out then reacquire resets the holding clock", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "1", blockTime: day(10) }),
      tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: "1", blockTime: day(20) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(30));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.holdingDurationDays).toBeCloseTo(10, 5); // day30 - day20
    expect(m.neverSold).toBe(false); // the day-10 transfer to external was a sell
  });

  it("selling within 1 day of acquiring flags ever_paper_sold + paper bucket", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
      tx("ronkeverse_nft", {
        from: ADDR.wallet,
        to: ADDR.external,
        tokenId: "1",
        blockTime: new Date(day(0).getTime() + 3_600_000), // +1h
      }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(1));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.everPaperSold).toBe(true);
    expect(m.diamondBucket).toBe("paper"); // holds nothing now
  });
});

describe("computeDiamond - token FIFO", () => {
  it("buy 100, sell 40 to marketplace -> pct_original_held = 0.6", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 100n, blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: 40n, blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.pctOriginalHeld).toBeCloseTo(0.6, 5);
    expect(m.sellCount).toBe(1);
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // oldest remaining lot from day 0
    expect(m.diamondBucket).toBe("diamond");
  });

  it("transfer to staking is NOT a sell and does NOT reset the diamond clock", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 100n, blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.staking, quantity: 100n, blockTime: day(5) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.sellCount).toBe(0);
    expect(m.neverSold).toBe(true);
    // clock preserved from day 0 (staking retains ownership)
    expect(m.holdingDurationDays).toBeCloseTo(40, 5);
    expect(m.diamondBucket).toBe("diamond");
  });

  it("staking round-trip preserves lots (unstake creates no new lot)", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 100n, blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.staking, quantity: 100n, blockTime: day(5) }),
      tx("ronke_token", { from: ADDR.staking, to: ADDR.wallet, quantity: 100n, blockTime: day(20) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // still the day-0 lot
    expect(m.pctOriginalHeld).toBeCloseTo(1, 5);
  });

  it("selling to an unlabeled external wallet counts as a sell", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 100n, blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.wallet2, quantity: 50n, blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    expect(metricFor(res, ADDR.wallet)!.sellCount).toBe(1);
  });

  it("paper bucket for a fresh holder (<7d)", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 10n, blockTime: day(0) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(3));
    expect(metricFor(res, ADDR.wallet)!.diamondBucket).toBe("paper");
  });
});

describe("computeDiamond - determinism", () => {
  it("produces identical rows on repeated runs", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 100n, blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: 40n, blockTime: day(2) }),
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet2, quantity: 5n, blockTime: day(1) }),
    ];
    const a = computeDiamond("ronke_token", events, labels, day(40));
    const b = computeDiamond("ronke_token", events, labels, day(40));
    const norm = (r: any) =>
      JSON.stringify(
        r.metrics
          .slice()
          .sort((x: any, y: any) => x.address.localeCompare(y.address)),
      );
    expect(norm(a)).toBe(norm(b));
  });
});
