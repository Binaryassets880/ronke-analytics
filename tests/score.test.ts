import { describe, it, expect } from "vitest";
import { computeScore, durationPoints, diamondMultiplier, type ScoreInput } from "@/lib/score/compute";
import { SCORE_CONFIG as C } from "@/config/score";

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  ronkeBalanceWhole: 0,
  ronkeHold: null,
  ronkestrBalanceWhole: 0,
  ronkestrHold: null,
  nftRarityFactors: [],
  nftHold: null,
  bodyTypesHeld: 0,
  bodyTypesTotal: 10,
  oneOfOneCount: 0,
  ...over,
});

describe("durationPoints", () => {
  it("grows exponentially with months held", () => {
    expect(durationPoints(0)).toBeCloseTo(C.duration.base, 5);
    expect(durationPoints(30)).toBeCloseTo(C.duration.base * C.duration.growthPerMonth, 5);
    // strictly increasing
    expect(durationPoints(90)).toBeGreaterThan(durationPoints(60));
  });
  it("caps at capMonths so it can't run away", () => {
    const capped = C.duration.base * Math.pow(C.duration.growthPerMonth, C.duration.capMonths);
    expect(durationPoints(100 * 365)).toBeCloseTo(capped, 5);
  });
});

describe("diamondMultiplier", () => {
  it("rewards never-sold fully, penalizes paper hands", () => {
    expect(diamondMultiplier({ durationDays: 0, neverSold: true, everPaperSold: false })).toBe(C.diamond.neverSold);
    expect(diamondMultiplier({ durationDays: 0, neverSold: false, everPaperSold: true })).toBe(C.diamond.everPaperSold);
    expect(diamondMultiplier({ durationDays: 0, neverSold: false, everPaperSold: false })).toBe(C.diamond.soldNotPaper);
  });
});

describe("computeScore", () => {
  it("combined score is the sum of the three sub-scores", () => {
    const r = computeScore(
      base({ ronkeBalanceWhole: 1_000_000, ronkestrBalanceWhole: 50_000, nftRarityFactors: [0.9] }),
    );
    expect(r.score).toBe(r.ronkeSubscore + r.ronkestrSubscore + r.nftSubscore);
  });

  it("gates duration: a dust wallet below the minimum earns no duration points", () => {
    const dust = computeScore(
      base({ ronkeBalanceWhole: 10, ronkeHold: { durationDays: 700, neverSold: true, everPaperSold: false } }),
    );
    expect(dust.breakdown.ronkeDurationPoints).toBe(0); // below gate.minRonke
    const held = computeScore(
      base({ ronkeBalanceWhole: 200_000, ronkeHold: { durationDays: 700, neverSold: true, everPaperSold: false } }),
    );
    expect(held.breakdown.ronkeDurationPoints).toBeGreaterThan(0);
  });

  it("diamond behavior amplifies duration (never-sold out-earns paper hands)", () => {
    const held: ScoreInput = base({
      nftRarityFactors: [0.5, 0.5],
      nftHold: { durationDays: 365, neverSold: true, everPaperSold: false },
    });
    const paper: ScoreInput = base({
      nftRarityFactors: [0.5, 0.5],
      nftHold: { durationDays: 365, neverSold: false, everPaperSold: true },
    });
    expect(computeScore(held).breakdown.nftDurationPoints).toBeGreaterThan(
      computeScore(paper).breakdown.nftDurationPoints,
    );
  });

  it("diminishing returns: a long-term diamond mid-holder can out-score a passive whale", () => {
    // Passive whale: 300 mostly-common NFTs, but paper-handed and short hold.
    const whale = computeScore(
      base({
        nftRarityFactors: Array.from({ length: 300 }, () => 0.05),
        nftHold: { durationDays: 20, neverSold: false, everPaperSold: true },
      }),
    );
    // Committed mid-holder: 8 rare NFTs, 2 years, never sold, full body set.
    const diamond = computeScore(
      base({
        nftRarityFactors: Array.from({ length: 8 }, () => 0.95),
        nftHold: { durationDays: 730, neverSold: true, everPaperSold: false },
        bodyTypesHeld: 10,
        bodyTypesTotal: 10,
      }),
    );
    expect(diamond.score).toBeGreaterThan(whale.score);
  });

  it("dampens NFT rarity points sub-linearly (a mega-bag can't farm rarity linearly)", () => {
    // Same per-token rarity, 10x the count: rarity points must grow, but far less
    // than 10x (the sub-linear rarityExp guard against whale skew).
    const few = computeScore(base({ nftRarityFactors: Array.from({ length: 10 }, () => 0.5) }));
    const many = computeScore(base({ nftRarityFactors: Array.from({ length: 100 }, () => 0.5) }));
    const fewRarity = few.breakdown.nftHoldingPoints;
    const manyRarity = many.breakdown.nftHoldingPoints;
    expect(manyRarity).toBeGreaterThan(fewRarity); // more still helps
    expect(manyRarity).toBeLessThan(fewRarity * 10); // but with diminishing returns
  });

  it("awards the collector kicker only for a complete body set", () => {
    const partial = computeScore(base({ nftRarityFactors: [0.5], bodyTypesHeld: 9, bodyTypesTotal: 10 }));
    const full = computeScore(base({ nftRarityFactors: [0.5], bodyTypesHeld: 10, bodyTypesTotal: 10 }));
    expect(full.breakdown.collectorPoints).toBe(
      C.collector.perType * 10 + C.collector.fullKicker,
    );
    expect(full.breakdown.collectorPoints - partial.breakdown.collectorPoints).toBe(
      C.collector.perType + C.collector.fullKicker,
    );
  });

  it("adds a flat 1/1 bonus per one-of-one held, into the NFT sub-score", () => {
    const none = computeScore(base({ nftRarityFactors: [1] }));
    const one = computeScore(base({ nftRarityFactors: [1], oneOfOneCount: 1 }));
    const two = computeScore(base({ nftRarityFactors: [1, 1], oneOfOneCount: 2 }));
    expect(none.breakdown.oneOfOnePoints).toBe(0);
    expect(one.breakdown.oneOfOnePoints).toBe(C.oneOfOne.bonus);
    expect(two.breakdown.oneOfOnePoints).toBe(2 * C.oneOfOne.bonus);
    // The bonus flows into the NFT sub-score (and thus the combined score).
    expect(one.nftSubscore - none.nftSubscore).toBe(C.oneOfOne.bonus);
    expect(one.breakdown.oneOfOneCount).toBe(1);
  });

  it("contributes no duration for an asset never held (null metrics)", () => {
    const r = computeScore(base({ ronkeBalanceWhole: 1_000_000, ronkeHold: null }));
    expect(r.breakdown.ronkeDurationPoints).toBe(0);
    expect(r.breakdown.ronkeHoldingPoints).toBeGreaterThan(0); // holding still counts
  });

  it("scores a RonkeStr-only wallet with a positive RonkeStr sub-score and nothing else", () => {
    const r = computeScore(
      base({
        ronkestrBalanceWhole: 100_000,
        ronkestrHold: { durationDays: 200, neverSold: true, everPaperSold: false },
      }),
    );
    expect(r.ronkestrSubscore).toBeGreaterThan(0);
    expect(r.ronkeSubscore).toBe(0);
    expect(r.nftSubscore).toBe(0);
    expect(r.score).toBe(r.ronkestrSubscore);
  });

  it("RonkeStr holding follows the diminishing log curve (10x balance != 10x points)", () => {
    const small = computeScore(base({ ronkestrBalanceWhole: 10_000 })).breakdown.ronkestrHoldingPoints;
    const big = computeScore(base({ ronkestrBalanceWhole: 100_000 })).breakdown.ronkestrHoldingPoints;
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(small * 10); // sub-linear
    // +1 decade of balance adds ~holdWeight points.
    expect(big - small).toBeCloseTo(C.ronkestr.holdWeight, 0);
  });

  it("gates RonkeStr duration below gate.minRonkestr", () => {
    const belowGate = C.gate.minRonkestr - 1;
    const dust = computeScore(
      base({
        ronkestrBalanceWhole: belowGate,
        ronkestrHold: { durationDays: 700, neverSold: true, everPaperSold: false },
      }),
    );
    expect(dust.breakdown.ronkestrDurationPoints).toBe(0);
    const gated = computeScore(
      base({
        ronkestrBalanceWhole: C.gate.minRonkestr,
        ronkestrHold: { durationDays: 700, neverSold: true, everPaperSold: false },
      }),
    );
    expect(gated.breakdown.ronkestrDurationPoints).toBeGreaterThan(0);
  });

  it("applies the diamond multiplier to RonkeStr duration (never-sold out-earns paper)", () => {
    const held = computeScore(
      base({
        ronkestrBalanceWhole: 100_000,
        ronkestrHold: { durationDays: 365, neverSold: true, everPaperSold: false },
      }),
    );
    const paper = computeScore(
      base({
        ronkestrBalanceWhole: 100_000,
        ronkestrHold: { durationDays: 365, neverSold: false, everPaperSold: true },
      }),
    );
    expect(held.breakdown.ronkestrDurationPoints).toBeGreaterThan(
      paper.breakdown.ronkestrDurationPoints,
    );
    expect(held.breakdown.ronkestrDiamondMult).toBe(C.diamond.neverSold);
    expect(paper.breakdown.ronkestrDiamondMult).toBe(C.diamond.everPaperSold);
  });
});
