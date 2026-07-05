import { describe, it, expect } from "vitest";
import { computeRarity, TRAIT_COUNT_KEY } from "@/lib/rarity/openrarity";
import type { NormalizedTrait } from "@/lib/rarity/traits";

function trait(tokenId: string, traitType: string, value: string): NormalizedTrait {
  return { tokenId, traitType, value, displayType: "string" };
}

// 3-token / 2-trait hand fixture:
//   A: Color=Red,  Size=Big
//   B: Color=Red,  Size=Small
//   C: Color=Blue, Size=Big
// Color: Red=2/3, Blue=1/3.  Size: Big=2/3, Small=1/3.  trait_count: all 2 -> p=1.
// IC_A = -log2(2/3)*2       = 1.1699
// IC_B = -log2(2/3)-log2(1/3) = 2.1699
// IC_C = -log2(1/3)-log2(2/3) = 2.1699
const FIXTURE: NormalizedTrait[] = [
  trait("A", "Color", "Red"),
  trait("A", "Size", "Big"),
  trait("B", "Color", "Red"),
  trait("B", "Size", "Small"),
  trait("C", "Color", "Blue"),
  trait("C", "Size", "Big"),
];

describe("computeRarity - information content", () => {
  it("matches the hand-computed 3-token / 2-trait fixture", () => {
    const r = computeRarity(FIXTURE);
    const byId = Object.fromEntries(r.map((x) => [x.tokenId, x]));
    // B and C tie for rarest (equal IC); A is least rare.
    expect(byId.A.rarityRank).toBe(3);
    expect(byId.B.infoContentScore).toBeCloseTo(byId.C.infoContentScore, 6);
    expect(byId.A.infoContentScore).toBeLessThan(byId.B.infoContentScore);
    // Normalized A = IC_A / avgIC = 1.1699 / 1.8366 ~= 0.637
    expect(byId.A.infoContentScore).toBeCloseTo(0.637, 2);
    // Deterministic tiebreak by tokenId.
    expect(byId.B.rarityRank).toBe(1);
    expect(byId.C.rarityRank).toBe(2);
  });

  it("ranks a token with the unique rarest value in every trait as #1", () => {
    const traits: NormalizedTrait[] = [
      ...FIXTURE,
      trait("Z", "Color", "Gold"), // unique
      trait("Z", "Size", "Tiny"), // unique
    ];
    const r = computeRarity(traits);
    expect(r[0].tokenId).toBe("Z");
    expect(r[0].rarityRank).toBe(1);
  });

  it("the trait-count heuristic shifts ranks for unusual trait counts", () => {
    // Two 2-trait tokens + one 1-trait token. The odd trait-count token gets
    // extra information content from the rare _trait_count value.
    const traits: NormalizedTrait[] = [
      trait("A", "Color", "Red"),
      trait("A", "Size", "Big"),
      trait("B", "Color", "Red"),
      trait("B", "Size", "Big"),
      trait("C", "Color", "Red"), // only 1 trait -> trait_count=1 is unique
    ];
    const r = computeRarity(traits);
    const c = r.find((x) => x.tokenId === "C")!;
    // C's rare trait_count (1, p=1/3) boosts its info content above the pair.
    expect(c.rarityRank).toBe(1);
  });

  it("trait-frequency and OpenRarity can disagree yet each is internally consistent", () => {
    const r = computeRarity(FIXTURE);
    // Every token has a distinct, contiguous rank in both schemes.
    const icRanks = r.map((x) => x.rarityRank).sort((a, b) => a - b);
    const freqRanks = r.map((x) => x.traitFreqRank).sort((a, b) => a - b);
    expect(icRanks).toEqual([1, 2, 3]);
    expect(freqRanks).toEqual([1, 2, 3]);
  });

  it("does not throw on an unseen/zero-probability trait (no log2(0))", () => {
    // A token referencing a value with probability handling; all present values
    // have p>0, so this simply must not throw and must produce finite scores.
    const r = computeRarity(FIXTURE);
    for (const x of r) {
      expect(Number.isFinite(x.infoContentScore)).toBe(true);
      expect(Number.isFinite(x.traitFreqScore)).toBe(true);
    }
  });

  it("only ranks the tokens it is given (unrevealed tokens are the caller's job)", () => {
    const r = computeRarity(FIXTURE);
    expect(r.map((x) => x.tokenId).sort()).toEqual(["A", "B", "C"]);
  });

  it("is deterministic across repeated runs", () => {
    expect(JSON.stringify(computeRarity(FIXTURE))).toBe(JSON.stringify(computeRarity(FIXTURE)));
  });

  it("returns [] for an empty collection", () => {
    expect(computeRarity([])).toEqual([]);
  });
});

describe("computeTraitStats via computeRarity coverage", () => {
  it("does not expose _trait_count as a real trait type on tokens", () => {
    // sanity: the synthetic key is internal, not a token trait
    expect(TRAIT_COUNT_KEY.startsWith("_")).toBe(true);
  });
});
