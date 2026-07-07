import { describe, it, expect } from "vitest";
import { evaluateWallet, type WalletAggregate } from "@/lib/badges/derive";

function agg(over: Partial<WalletAggregate>): WalletAggregate {
  return {
    address: "0xw",
    ronkeBalanceWhole: 0,
    ronkestrBalanceWhole: 0,
    ronkeverseCount: 0,
    holdingDurationDays: 0,
    neverSold: true,
    everPaperSold: false,
    ogEarly: false,
    isWhale: false,
    hasTopRarity: false,
    lotCount: 0,
    ...over,
  };
}

const keys = (a: WalletAggregate) => evaluateWallet(a).map((b) => b.badgeKey);

describe("evaluateWallet - tiers", () => {
  it("awards the highest bag-size tier reached, not a lower one", () => {
    const badges = evaluateWallet(agg({ ronkeBalanceWhole: 250_000_000 }));
    const bag = badges.find((b) => b.badgeKey === "bag_size")!;
    expect(bag.tier).toBe(4); // Leviathan
  });

  it("awards no bag-size badge below the first threshold", () => {
    expect(keys(agg({ ronkeBalanceWhole: 0 }))).not.toContain("bag_size");
  });
});

describe("evaluateWallet - achievements", () => {
  it("Dual Citizen requires both assets", () => {
    expect(keys(agg({ ronkeBalanceWhole: 10, ronkeverseCount: 2 }))).toContain("dual_citizen");
    expect(keys(agg({ ronkeBalanceWhole: 10, ronkeverseCount: 0 }))).not.toContain("dual_citizen");
  });

  it("Diamond Hands iff never_sold; Never Paper-handed iff !ever_paper_sold (independent)", () => {
    // A real, seasoned, never-sold position (baseline for the diamond checks below).
    const seasoned = { ronkeBalanceWhole: 5_000, holdingDurationDays: 120 };
    // sold but never within a day: diamond no, never-paper yes
    const soldClean = agg({ ...seasoned, neverSold: false, everPaperSold: false });
    expect(keys(soldClean)).not.toContain("diamond_hands");
    expect(keys(soldClean)).toContain("never_paper_handed");
    // never sold but (hypothetically) flagged paper: diamond yes, never-paper no
    const heldButPaper = agg({ ...seasoned, neverSold: true, everPaperSold: true });
    expect(keys(heldButPaper)).toContain("diamond_hands");
    expect(keys(heldButPaper)).not.toContain("never_paper_handed");
  });

  it("Diamond Hands requires a real (non-dust) position held past the diamond window", () => {
    // Never sold, but a dust bag -> no diamond.
    expect(keys(agg({ neverSold: true, ronkeBalanceWhole: 5, holdingDurationDays: 400 }))).not.toContain(
      "diamond_hands",
    );
    // Never sold, real bag, but held only a few days -> no diamond.
    expect(keys(agg({ neverSold: true, ronkeBalanceWhole: 50_000, holdingDurationDays: 10 }))).not.toContain(
      "diamond_hands",
    );
    // Real bag, seasoned, never sold -> diamond.
    expect(keys(agg({ neverSold: true, ronkeBalanceWhole: 2_000, holdingDurationDays: 60 }))).toContain(
      "diamond_hands",
    );
    // Any Ronkeverse NFT counts as a real position (seasoned + never sold).
    expect(keys(agg({ neverSold: true, ronkeverseCount: 1, holdingDurationDays: 60 }))).toContain(
      "diamond_hands",
    );
    // A seasoned RonkeStr-only holder qualifies too.
    expect(keys(agg({ neverSold: true, ronkestrBalanceWhole: 1_000, holdingDurationDays: 60 }))).toContain(
      "diamond_hands",
    );
  });

  it("Rarity Hunter only when holding a top-rarity token", () => {
    expect(keys(agg({ hasTopRarity: true }))).toContain("rarity_hunter");
    expect(keys(agg({ hasTopRarity: false }))).not.toContain("rarity_hunter");
  });

  it("Whale only when flagged by concentration", () => {
    expect(keys(agg({ isWhale: true }))).toContain("whale");
  });

  it("OG/Early only when acquired before migration", () => {
    expect(keys(agg({ ogEarly: true }))).toContain("og_early");
  });

  it("Accumulator requires never-sold AND more than one lot", () => {
    expect(keys(agg({ neverSold: true, lotCount: 3 }))).toContain("accumulator");
    expect(keys(agg({ neverSold: true, lotCount: 1 }))).not.toContain("accumulator");
    expect(keys(agg({ neverSold: false, lotCount: 5 }))).not.toContain("accumulator");
  });
});

describe("evaluateWallet - empty", () => {
  it("a wallet that qualifies for nothing produces zero rows", () => {
    const nothing = agg({
      ronkeBalanceWhole: 0,
      ronkeverseCount: 0,
      neverSold: false,
      everPaperSold: true,
      holdingDurationDays: 0,
    });
    expect(evaluateWallet(nothing)).toEqual([]);
  });

  it("is deterministic across repeated evaluation", () => {
    const a = agg({ ronkeBalanceWhole: 1_500_000, ronkeverseCount: 4, neverSold: true });
    expect(JSON.stringify(evaluateWallet(a))).toBe(JSON.stringify(evaluateWallet(a)));
  });
});
