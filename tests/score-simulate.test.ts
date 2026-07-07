import { describe, it, expect } from "vitest";
import { computeScore, type ScoreInput } from "@/lib/score/compute";
import { SCORE_CONFIG as C } from "@/config/score";
import {
  applyKnobs,
  dilutedDays,
  emptyScoreInput,
  simulate,
  EMPTY_KNOBS,
  SIM_RARITY,
  type SimKnobs,
} from "@/lib/score/simulate";

const knobs = (over: Partial<SimKnobs> = {}): SimKnobs => ({ ...EMPTY_KNOBS, ...over });

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  ...emptyScoreInput(10),
  ...over,
});

describe("applyKnobs", () => {
  it("no knobs = identical input and score", () => {
    const b = base({
      ronkeBalanceWhole: 200_000,
      ronkeHold: { durationDays: 400, neverSold: true, everPaperSold: false },
      nftRarityFactors: [0.5],
      nftHold: { durationDays: 100, neverSold: true, everPaperSold: false },
      bodyTypesHeld: 1,
    });
    const after = applyKnobs(b, knobs());
    expect(computeScore(after).score).toBe(computeScore(b).score);
  });

  it("a fresh buyer starts a clean never-sold clock at 0 days", () => {
    const after = applyKnobs(base(), knobs({ addRonke: 60_000 }));
    expect(after.ronkeBalanceWhole).toBe(60_000);
    expect(after.ronkeHold).toEqual({ durationDays: 0, neverSold: true, everPaperSold: false });
  });

  it("buying more dilutes the weighted holding clock (real engine oddity)", () => {
    const b = base({
      ronkeBalanceWhole: 100_000,
      ronkeHold: { durationDays: 720, neverSold: true, everPaperSold: false },
    });
    const after = applyKnobs(b, knobs({ addRonke: 1_000_000 }));
    // (100k * 720) / 1.1M ≈ 65.45 days
    expect(after.ronkeHold!.durationDays).toBeCloseTo(dilutedDays(100_000, 720, 1_000_000), 6);
    expect(after.ronkeHold!.durationDays).toBeLessThan(100);
    // and the combined score can actually DROP: duration collapses from the
    // 24-month zone while log-curve holding points barely move.
    expect(computeScore(after).score).toBeLessThan(computeScore(b).score);
  });

  it("holding X more days ages existing units fully and new units from zero", () => {
    const b = base({
      ronkeBalanceWhole: 100_000,
      ronkeHold: { durationDays: 100, neverSold: true, everPaperSold: false },
    });
    const noBuy = applyKnobs(b, knobs({ holdMoreDays: 90 }));
    expect(noBuy.ronkeHold!.durationDays).toBeCloseTo(190, 6);
    const withBuy = applyKnobs(b, knobs({ addRonke: 100_000, holdMoreDays: 90 }));
    // (100k*(100+90) + 100k*90) / 200k = 140
    expect(withBuy.ronkeHold!.durationDays).toBeCloseTo(140, 6);
  });

  it("buying can't undo past sells - behavioral flags are preserved", () => {
    const b = base({
      ronkeBalanceWhole: 10_000,
      ronkeHold: { durationDays: 50, neverSold: false, everPaperSold: true },
    });
    const after = applyKnobs(b, knobs({ addRonke: 500_000 }));
    expect(after.ronkeHold!.neverSold).toBe(false);
    expect(after.ronkeHold!.everPaperSold).toBe(true);
  });

  it("NFT buys append representative rarity factors and 1/1s count twice (factor + bonus)", () => {
    const after = applyKnobs(base(), knobs({ addCommonNfts: 2, addRareNfts: 1, addOneOfOnes: 1 }));
    expect(after.nftRarityFactors).toEqual([
      SIM_RARITY.common,
      SIM_RARITY.common,
      SIM_RARITY.rare,
      SIM_RARITY.oneOfOne,
    ]);
    expect(after.oneOfOneCount).toBe(1);
  });

  it("body types are clamped to the collection total and NFTs held", () => {
    const b = base({ bodyTypesHeld: 8, bodyTypesTotal: 10, nftRarityFactors: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] });
    const capped = applyKnobs(b, knobs({ addCommonNfts: 5, newBodyTypes: 99 }));
    expect(capped.bodyTypesHeld).toBe(10);
    // can't claim more body types than NFTs held
    const empty = applyKnobs(base(), knobs({ addCommonNfts: 2, newBodyTypes: 5 }));
    expect(empty.bodyTypesHeld).toBe(2);
  });
});

describe("explainSimulation / simulate", () => {
  it("crossing the 50k $RONKE gate produces the unlock note", () => {
    const b = base({
      ronkeBalanceWhole: 30_000,
      ronkeHold: { durationDays: 300, neverSold: true, everPaperSold: false },
    });
    const { notes, current, simulated } = simulate(b, knobs({ addRonke: 25_000 }));
    expect(simulated.score).toBeGreaterThan(current.score);
    expect(notes.some((n) => n.emoji === "🔓" && n.text.includes("$RONKE"))).toBe(true);
  });

  it("still-below-gate wallets get the locked note with the exact shortfall", () => {
    const { notes } = simulate(base(), knobs({ addRonke: 10_000 }));
    const locked = notes.find((n) => n.emoji === "🔒" && n.text.includes("$RONKE"));
    expect(locked).toBeDefined();
    expect(locked!.text).toContain("40,000");
  });

  it("reaching the 24-month cap produces the cap note", () => {
    const b = base({
      ronkeBalanceWhole: 100_000,
      ronkeHold: { durationDays: 700, neverSold: true, everPaperSold: false },
    });
    const { notes } = simulate(b, knobs({ holdMoreDays: 100 }));
    expect(notes.some((n) => n.emoji === "🏁")).toBe(true);
  });

  it("completing the body set produces the full-set kicker note and the +1000", () => {
    const b = base({
      nftRarityFactors: Array(9).fill(0.3),
      nftHold: { durationDays: 60, neverSold: true, everPaperSold: false },
      bodyTypesHeld: 9,
      bodyTypesTotal: 10,
    });
    const before = computeScore(b);
    const { notes, simulated } = simulate(b, knobs({ addCommonNfts: 1, newBodyTypes: 1 }));
    expect(notes.some((n) => n.emoji === "🏆")).toBe(true);
    // +150 per type +1000 kicker, plus the NFT itself
    expect(simulated.score - before.score).toBeGreaterThanOrEqual(1150);
  });

  it("a big top-up on an old bag warns about clock dilution", () => {
    const b = base({
      ronkeBalanceWhole: 100_000,
      ronkeHold: { durationDays: 720, neverSold: true, everPaperSold: false },
    });
    const { notes } = simulate(b, knobs({ addRonke: 1_000_000 }));
    expect(notes.some((n) => n.emoji === "⚖️")).toBe(true);
  });

  it("a past-seller sees the diamond-multiplier penalty note", () => {
    const b = base({
      ronkeBalanceWhole: 200_000,
      ronkeHold: { durationDays: 300, neverSold: false, everPaperSold: false },
    });
    const { notes } = simulate(b, knobs({ holdMoreDays: 30 }));
    const diamond = notes.find((n) => n.emoji === "💎");
    expect(diamond).toBeDefined();
    expect(diamond!.text).toContain(`×${C.diamond.soldNotPaper}`);
  });
});
