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
    // The window hits 100%, but a one-NFT position is below
    // HAND_TIERS.minPositionForEpisode, so it never brands the wallet.
    expect(m.neverSold).toBe(true);
    expect(m.episodeCount).toBe(0);
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
    // Selling your only NFT is under the position floor, so no episode opens.
    // The wallet still reads paper, but because it holds nothing at all.
    expect(m.everPaperSold).toBe(false);
    expect(m.episodeCount).toBe(0);
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
    expect(m.neverSold).toBe(true); // 1/20 = 5%, nowhere near the 50% line
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // clock untouched
    expect(m.diamondBucket).toBe("diamond");
  });

  it("selling 1 of 5 NFTs is a trim, not a dump: nothing resets", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(i + 1), blockTime: day(0) }),
      ),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "5", blockTime: day(25) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    // 1/5 = 20%, below the 50% line. Under the old per-transfer rule this
    // tripped the 10% tolerance and cost the wallet its clock and its badge.
    expect(m.neverSold).toBe(true);
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // clock untouched
    // 20% is past the 10% diamond line but short of the 50% paper line, so the
    // wallet lands in the middle tier: it sold something, it is not dumping.
    expect(m.peakSellRate).toBeCloseTo(0.2, 5);
    expect(m.diamondBucket).toBe("regular");
  });

  it("staking an NFT is NOT a sell and the wallet keeps holding it", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.staking, tokenId: "1", blockTime: day(10) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(true);
    expect(m.everPaperSold).toBe(false);
    // still counted as held with the original clock while staked
    expect(m.holdingDurationDays).toBeCloseTo(40, 5);
    expect(m.diamondBucket).toBe("diamond");
  });

  it("NFT staking round-trip preserves the holding clock (unstake is a no-op)", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.staking, tokenId: "1", blockTime: day(10) }),
      tx("ronkeverse_nft", { from: ADDR.staking, to: ADDR.wallet, tokenId: "1", blockTime: day(30) }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(true);
    expect(m.holdingDurationDays).toBeCloseTo(40, 5); // day-0 clock survives the stake
    expect(m.pctOriginalHeld).toBeCloseTo(1, 5); // unstake did not double-count an acquisition
    expect(m.diamondBucket).toBe("diamond");
  });

  it("selling after an unstake uses the original acquire date for the paper window", () => {
    const events = [
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockTime: day(0) }),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.staking, tokenId: "1", blockTime: day(10) }),
      tx("ronkeverse_nft", { from: ADDR.staking, to: ADDR.wallet, tokenId: "1", blockTime: day(30) }),
      tx("ronkeverse_nft", {
        from: ADDR.wallet,
        to: ADDR.external,
        tokenId: "1",
        blockTime: new Date(day(30).getTime() + 3_600_000), // 1h after unstake
      }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    // One NFT is under the position floor, so no episode opens either way.
    expect(m.neverSold).toBe(true);
    expect(m.everPaperSold).toBe(false); // held since day 0 regardless
  });

  it("a second sell soon after a first is NOT paper when the tokens were long-held", () => {
    // Regression: the first significant sell re-dates every remaining token's
    // display clock to its own timestamp. A second sell minutes later must
    // still measure the paper window against genuine custody, not that reset.
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(i + 1), blockTime: day(0) }),
      ),
      tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "5", blockTime: day(100) }),
      tx("ronkeverse_nft", {
        from: ADDR.wallet,
        to: ADDR.external,
        tokenId: "4",
        blockTime: new Date(day(100).getTime() + 156_000), // 2m36s later
      }),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(140));
    const m = metricFor(res, ADDR.wallet)!;
    // 2 of 5 in one window is 40%, under the line, so nothing is recorded and
    // no clock moves. The old rule counted each sale separately and reset twice.
    expect(m.sellCount).toBe(0);
    expect(m.everPaperSold).toBe(false);
    expect(m.diamondBucket).toBe("regular"); // 40% peak costs diamond, not more
    expect(m.holdingDurationDays).toBeCloseTo(140, 2); // clock never reset
  });

  it("buying more does not shield a genuine dump", () => {
    // Ten held, six gone inside an hour. Accumulating widens the denominator,
    // but it cannot hide a majority of the position leaving.
    const events = [
      ...Array.from({ length: 10 }, (_, i) =>
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(i + 1), blockTime: day(0) }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        tx("ronkeverse_nft", {
          from: ADDR.wallet,
          to: ADDR.external,
          tokenId: String(i + 1),
          blockTime: new Date(day(100).getTime() + i * 60_000),
        }),
      ),
    ];
    const res = computeDiamond("ronkeverse_nft", events, labels, day(140));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.episodeCount).toBe(1);
    expect(m.peakSellRate).toBeCloseTo(0.6, 5);
    expect(m.rebuildTarget).toBe(5); // half of the ten it took into the dump
    expect(m.rebuildHeld).toBe(4);
    expect(m.diamondBucket).toBe("paper"); // 40 clean days, but still short
  });
});

describe("computeDiamond - token FIFO", () => {
  it("buy 10,000, sell 6,000 (60%): the window crosses and the clock resets", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(6_000), blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.pctOriginalHeld).toBeCloseTo(0.4, 5);
    expect(m.sellCount).toBe(1);
    expect(m.neverSold).toBe(false);
    expect(m.holdingDurationDays).toBeCloseTo(38, 5); // clock reset at day 2
    // Tokens use the same rule as NFTs now: 38 clean days is the sentence
    // served, but the wallet holds 4,000 against a 5,000 rebuild target.
    expect(m.rebuildTarget).toBeCloseTo(Number(WHOLE(5_000)), -18);
    expect(m.diamondBucket).toBe("paper");
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

  it("crossing the paper line resets the holding clock to the sell moment", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(6_000), blockTime: day(30) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.neverSold).toBe(false);
    expect(m.holdingDurationDays).toBeCloseTo(10, 5); // day40 - day30
    expect(m.weightedDurationDays).toBeCloseTo(10, 5); // every remaining lot re-dated
  });

  it("a second sell the day after a first is NOT paper when the lots are old", () => {
    // Regression, token side: sell #1 re-dates the surviving lots to day 30.
    // Sell #2 on day 31 consumes those lots and must not read them as
    // "acquired yesterday" - they were genuinely bought on day 0.
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(2_000), blockTime: day(30) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(2_000), blockTime: day(31) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(60));
    const m = metricFor(res, ADDR.wallet)!;
    // 4,000 of 10,000 across the two days is 40%, one window, under the line.
    expect(m.sellCount).toBe(0);
    expect(m.everPaperSold).toBe(false);
    expect(m.diamondBucket).toBe("regular"); // not "paper"
  });

  it("a genuine same-day buy-then-dump still flags paper on the token side", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(1_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.marketplace, quantity: WHOLE(1_000), blockTime: day(30) }),
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(5_000), blockTime: day(40) }),
      tx("ronke_token", {
        from: ADDR.wallet,
        to: ADDR.marketplace,
        quantity: WHOLE(5_000),
        blockTime: new Date(day(40).getTime() + 3_600_000), // +1h
      }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(60));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.everPaperSold).toBe(true);
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

  it("wagering at a game contract consumes units but is NOT a sell", () => {
    const game = "0x744b467ce265dbc5078b43036271aec378821b2d"; // seed: CoinFlipper
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10_000), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: game, quantity: WHOLE(5_000), blockTime: day(10) }),
      tx("ronke_token", { from: game, to: ADDR.wallet, quantity: WHOLE(9_000), blockTime: day(11) }), // winnings
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.sellCount).toBe(0); // wager is not paper-handing
    expect(m.neverSold).toBe(true);
    expect(m.everPaperSold).toBe(false);
    // original 5,000 keep the day-0 clock; the 9,000 winnings are a fresh lot
    expect(m.holdingDurationDays).toBeCloseTo(40, 5);
  });

  it("selling to an unlabeled external wallet counts as a sell", () => {
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(100), blockTime: day(0) }),
      tx("ronke_token", { from: ADDR.wallet, to: ADDR.wallet2, quantity: WHOLE(50), blockTime: day(2) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(40));
    expect(metricFor(res, ADDR.wallet)!.sellCount).toBe(1);
  });

  it("a brand-new holder is regular, not paper", () => {
    // The old rule forced anything under 7 days old into paper, which filed
    // "bought yesterday and still holding" alongside "dumped the bag". Paper
    // now means one thing only: this wallet is dumping.
    const events = [
      tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: WHOLE(10), blockTime: day(0) }),
    ];
    const res = computeDiamond("ronke_token", events, labels, day(3));
    const m = metricFor(res, ADDR.wallet)!;
    expect(m.diamondBucket).toBe("regular");
    expect(m.episodeCount).toBe(0);
    expect(m.peakSellRate).toBe(0);
  });
});

describe("hand tiers - the cases the old rule missed", () => {
  /** Mint `n` NFTs to the wallet at `at`. */
  const mint = (n: number, at: Date, offset = 0) =>
    Array.from({ length: n }, (_, i) =>
      tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: String(offset + i + 1), blockTime: at }),
    );
  /** Sell `n` NFTs starting at `at`, one a minute. */
  const dump = (n: number, at: Date, offset = 0) =>
    Array.from({ length: n }, (_, i) =>
      tx("ronkeverse_nft", {
        from: ADDR.wallet,
        to: ADDR.external,
        tokenId: String(offset + i + 1),
        blockTime: new Date(at.getTime() + i * 60_000),
      }),
    );
  const run = (events: any[], asOf: Date) =>
    computeDiamond("ronkeverse_nft", events, labels, asOf).metrics
      .find((m) => m.address === ADDR.wallet.toLowerCase())!;

  it("catches the 21-in-a-day dump the per-transfer rule could not see", () => {
    // The wallet that started all this sold 21 NFTs out of 145 in one day. Each
    // sale was 0.7% of the stack, so the 10% per-transfer tolerance never fired
    // and the wallet kept reading `diamond` while shedding a seventh of its bag.
    const m = run([...mint(30, day(0)), ...dump(21, day(100))], day(200));
    expect(m.episodeCount).toBe(1);
    expect(m.peakSellRate).toBeCloseTo(21 / 30, 5);
    expect(m.diamondBucket).toBe("paper");
    expect(m.neverSold).toBe(false);
  });

  it("forgives a slow bleeder under the line but takes its diamond", () => {
    // 4 of 30 every 40 days: never a dump, but not untouched either.
    const events = [...mint(30, day(0))];
    for (let k = 0; k < 4; k += 1) events.push(...dump(4, day(100 + k * 40), k * 4));
    const m = run(events, day(400));
    expect(m.episodeCount).toBe(0);
    expect(m.diamondBucket).toBe("regular");
    expect(m.peakSellRate).toBeGreaterThan(0.1); // past the diamond line
    expect(m.peakSellRate).toBeLessThan(0.5); // short of the paper line
  });

  it("ignores a dump out of a position below the floor", () => {
    // Four NFTs, all gone. A wallet this size should not carry the same brand
    // as one that unloaded three hundred.
    const m = run([...mint(4, day(0)), ...dump(4, day(100))], day(200));
    expect(m.episodeCount).toBe(0);
    expect(m.rebuildTarget).toBe(0);
  });

  it("keeps a wallet in paper until it has BOTH served the time and rebuilt", () => {
    const dumped = [...mint(20, day(0)), ...dump(12, day(100))];
    // Day 105: inside the sentence and nowhere near the target.
    const serving = run(dumped, day(105));
    expect(serving.diamondBucket).toBe("paper");
    expect(serving.sentenceServedDays).toBeCloseTo(5, 0);

    // Day 200: time served, still holding 8 of the 10 needed.
    const short = run(dumped, day(200));
    expect(short.diamondBucket).toBe("paper");
    expect(short.rebuildTarget).toBe(10);
    expect(short.rebuildHeld).toBe(8);

    // Buys two back: time served AND target met.
    const rebuilt = run(
      [...dumped,
        tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: "90", blockTime: day(150) }),
        tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: "91", blockTime: day(151) })],
      day(200),
    );
    expect(rebuilt.rebuildHeld).toBe(10);
    expect(rebuilt.diamondBucket).toBe("regular");
  });

  it("puts a redeemed wallet straight back in paper if it sells below the line again", () => {
    const m = run(
      [...mint(20, day(0)), ...dump(12, day(100)),
        tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: "90", blockTime: day(150) }),
        tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: "91", blockTime: day(151) }),
        // Back to 10, target met, then one goes out again.
        tx("ronkeverse_nft", { from: ADDR.wallet, to: ADDR.external, tokenId: "91", blockTime: day(300) })],
      day(400),
    );
    expect(m.rebuildHeld).toBe(9);
    expect(m.rebuildTarget).toBe(10);
    expect(m.diamondBucket).toBe("paper"); // there is no graduation
  });

  it("does not let the rebuild target ratchet down on a second dump", () => {
    // 0xa8da6b89 in miniature: dumped from 40, then dumped again from 10.
    // Measured against the latest dump the target would be 5 and the wallet
    // would read recovered while holding a fraction of what it started with.
    const m = run(
      [...mint(40, day(0)), ...dump(30, day(100)),
        ...dump(6, day(300), 30)],
      day(500),
    );
    expect(m.episodeCount).toBe(2);
    expect(m.rebuildTarget).toBe(20); // half of 40, not half of 10
    expect(m.diamondBucket).toBe("paper");
  });

  it("makes a repeat offender serve longer", () => {
    const events = [...mint(40, day(0)), ...dump(30, day(100)), ...dump(6, day(300), 30)];
    // Second episode ends day 300; 60 days required, so day 340 is still inside.
    expect(run(events, day(340)).sentenceRequiredDays).toBe(60);
    expect(run(events, day(340)).sentenceServedDays).toBeCloseTo(40, 0);
  });

  it("never restores diamond once the lifetime peak is past the line", () => {
    // Dumps, waits years, rebuilds past the original position. Regular at best.
    const m = run(
      [...mint(20, day(0)), ...dump(12, day(100)),
        ...Array.from({ length: 30 }, (_, i) =>
          tx("ronkeverse_nft", { from: ADDR.external, to: ADDR.wallet, tokenId: String(200 + i), blockTime: day(200) }))],
      day(900),
    );
    expect(m.rebuildHeld).toBeGreaterThan(m.rebuildTarget);
    expect(m.diamondBucket).toBe("regular");
    expect(m.diamondBucket).not.toBe("diamond");
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
