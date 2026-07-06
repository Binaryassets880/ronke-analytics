import { describe, it, expect } from "vitest";
import { computeScore, durationPoints, diamondMultiplier, type ScoreInput } from "@/lib/score/compute";
import { SCORE_CONFIG as C } from "@/config/score";

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  ronkeBalanceWhole: 0,
  ronkeHold: null,
  nftRarityFactors: [],
  nftHold: null,
  bodyTypesHeld: 0,
  bodyTypesTotal: 10,
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
  it("combined score is the sum of the two sub-scores", () => {
    const r = computeScore(base({ ronkeBalanceWhole: 1_000_000, nftRarityFactors: [0.9] }));
    expect(r.score).toBe(r.ronkeSubscore + r.nftSubscore);
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

  it("contributes no duration for an asset never held (null metrics)", () => {
    const r = computeScore(base({ ronkeBalanceWhole: 1_000_000, ronkeHold: null }));
    expect(r.breakdown.ronkeDurationPoints).toBe(0);
    expect(r.breakdown.ronkeHoldingPoints).toBeGreaterThan(0); // holding still counts
  });
});
