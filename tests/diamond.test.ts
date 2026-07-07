import { describe, it, expect } from "vitest";
import { computeDiamond } from "@/lib/analytics/diamond";
import { Labels, SEED_LABELS } from "@/lib/analytics/labels";
import { tx, day, ADDR } from "./helpers";

const labels = new Labels(SEED_LABELS);
const metricFor = (res: { metrics: any[] }, addr: string) =>
  res.metrics.find((m) => m.address === addr.toLowerCase());
/** Whole tokens in raw 18-decimal base units (dust floors are in whole tokens). */
const WHOLE = (n: number) => BigInt(n) * 10n ** 18n;

describe("computeDiamond - NFT", () => {
  it("mint-and-hold: never_sold true, duration measured from mint, diamond bucket", () => {
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
    expect(m.neverSold).toBe(false); // sold 1 of 1 held = 100% >= tolerance
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

  it("selling 1 of 20 NFTs is a forgiven trim: never_sold survives, clocks intact", () => {
    const events = [
      ...Array.from({ length: 20 }, (_, i) =>
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(i + 1), blockTime: day(0) }),
      ),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "20", blockTime: day(10) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(true); // 1/20 = 5% < 10% tolerance
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // clock untouched
    expect(m.diamondBucket).toBe("diamond");
  });

  it("selling 1 of 5 NFTs is significant: never_sold breaks and remaining clocks reset", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(i + 1), blockTime: day(0) }),
      ),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "5", blockTime: day(25) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(false); // 1/5 = 20% >= 10% tolerance
    expect(m.holdingDurationDays).toBeCloseTo(15, 5); // reset to the day-25 sell
    expect(m.diamondBucket).toBe("regular");
  });
});

describe("computeDiamond - token FIFO", () => {
  it("buy 100, sell 40 (40% = significant): sell counts and the clock resets", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(100), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(40), blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.pctOriginalHeld).toBeCloseTo(0.6, 5);
    expect(m.sellCount).toBe(1);
    expect(m.neverSold).toBe(false);
    expect(m.holdingDurationDays).toBeCloseTo(38, 5); // clock reset at day 2
    expect(m.diamondBucket).toBe("regular"); // sold, so never diamond
  });

  it("selling under the 10% tolerance is a trim: never_sold and the clock survive", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(500), blockTime: day(10) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.sellCount).toBe(0); // 5% < tolerance
    expect(m.neverSold).toBe(true);
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // clock untouched
    expect(m.pctOriginalHeld).toBeCloseTo(0.95, 5); // units still left FIFO
    expect(m.diamondBucket).toBe("diamond");
  });

  it("selling 10%+ resets the holding clock to the sell moment", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(2_000), blockTime: day(30) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(false);
    expect(m.holdingDurationDays).toBeCloseTo(10, 5); // day40 - day30
    expect(m.weightedDurationDays).toBeCloseTo(10, 5); // every remaining lot re-dated
  });

  it("a dust position is never diamond, even if never sold and old", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(5), blockTime: day(0) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(400));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(true);
    expect(m.diamondBucket).toBe("regular"); // below the 1,000 $RONKE dust floor
  });

  it("transfer to staking is NOT a sell and does NOT reset the diamond clock", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(5_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.staking, quantity: WHOLE(5_000), blockTime: day(5) }),
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
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(5_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.staking, quantity: WHOLE(5_000), blockTime: day(5) }),
      tx("ronke_token", { from: ADDR.staking, to: ADDR.wallet, quantity: WHOLE(5_000), blockTime: day(20) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // still the day-0 lot
    expect(m.pctOriginalHeld).toBeCloseTo(1, 5);
  });

  it("selling to an unlabeled external wallet counts as a sell", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(100), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.wallet2, quantity: WHOLE(50), blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    expect(metricFor(res, ADDR.wallet)!.sellCount).toBe(1);
  });

  it("paper bucket for a fresh holder (<7d)", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10), blockTime: day(0) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(3));
    expect(metricFor(res, ADDR.wallet)!.diamondBucket).toBe("paper");
  });
});

describe("computeDiamond - determinism", () => {
  it("produces identical rows on repeated runs", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(100), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(40), blockTime: day(2) }),
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet2, quantity: WHOLE(5), blockTime: day(1) }),
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
