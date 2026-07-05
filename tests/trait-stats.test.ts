import { describe, it, expect } from "vitest";
import { computeTraitStats, TRAIT_COUNT_KEY } from "@/lib/rarity/openrarity";
import { normalizeAttributes, isUnrevealed } from "@/lib/rarity/traits";
import type { MoralisAttribute } from "@/lib/ronin/moralis";
import type { NormalizedTrait } from "@/lib/rarity/traits";

const trait = (tokenId: string, traitType: string, value: string): NormalizedTrait => ({
  tokenId,
  traitType,
  value,
  displayType: "string",
});

describe("normalizeAttributes (U10)", () => {
  it("maps each attribute to one trait row with normalized whitespace/casing", () => {
    const attrs: MoralisAttribute[] = [
      { trait_type: " Background ", value: "Pink ", display_type: null },
      { trait_type: "Clothes", value: "WcRonke", display_type: null },
    ];
    const rows = normalizeAttributes("1", attrs);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tokenId: "1", traitType: "Background", value: "Pink" });
  });

  it("preserves numeric/boolean display types distinctly from strings", () => {
    const attrs: MoralisAttribute[] = [
      { trait_type: "Level", value: 5, display_type: "number" },
      { trait_type: "Shiny", value: true, display_type: null },
      { trait_type: "Name", value: "Ronke", display_type: null },
    ];
    const rows = normalizeAttributes("1", attrs);
    expect(rows.find((r) => r.traitType === "Level")!.displayType).toBe("number");
    expect(rows.find((r) => r.traitType === "Shiny")!.displayType).toBe("bool");
    expect(rows.find((r) => r.traitType === "Name")!.displayType).toBe("string");
  });

  it("returns empty for a token with no usable attributes (flag for resync)", () => {
    expect(normalizeAttributes("1", [])).toEqual([]);
    expect(isUnrevealed(normalizeAttributes("1", []))).toBe(true);
    // null/empty values are dropped
    const rows = normalizeAttributes("2", [
      { trait_type: "Background", value: null, display_type: null },
    ]);
    expect(rows).toEqual([]);
  });
});

describe("computeTraitStats (U11)", () => {
  const traits = [
    trait("A", "Color", "Red"),
    trait("A", "Size", "Big"),
    trait("B", "Color", "Red"),
    trait("B", "Size", "Small"),
    trait("C", "Color", "Blue"),
    trait("C", "Size", "Big"),
  ];

  it("computes count and probability = count / revealed supply", () => {
    const stats = computeTraitStats(traits);
    const red = stats.find((s) => s.traitType === "Color" && s.value === "Red")!;
    expect(red.count).toBe(2);
    expect(red.probability).toBeCloseTo(2 / 3, 6);
  });

  it("includes the synthetic _trait_count trait", () => {
    const stats = computeTraitStats(traits);
    const tc = stats.find((s) => s.traitType === TRAIT_COUNT_KEY)!;
    expect(tc).toBeDefined();
    expect(tc.value).toBe("2"); // every token has 2 traits
    expect(tc.count).toBe(3);
  });

  it("keeps trait types/values with spaces distinct (delimiter safety)", () => {
    const t = [
      trait("A", "Hair - Headwear", "Slickedback Yellow"),
      trait("A", "Hair", "- Headwear Slickedback Yellow"),
    ];
    const stats = computeTraitStats(t);
    // Two distinct (type,value) pairs must not collide into one.
    const pairs = stats.filter((s) => s.traitType !== TRAIT_COUNT_KEY);
    expect(pairs).toHaveLength(2);
  });
});
