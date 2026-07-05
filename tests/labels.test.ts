import { describe, it, expect } from "vitest";
import { Labels, SEED_LABELS } from "@/lib/analytics/labels";
import { ZERO_ADDRESS, DEAD_ADDRESS } from "@/config/contracts";

const labels = new Labels(SEED_LABELS);

describe("Labels.excludeFromHolders", () => {
  it("excludes burn/dead addresses even if not explicitly labeled", () => {
    expect(labels.excludeFromHolders(ZERO_ADDRESS)).toBe(true);
    expect(labels.excludeFromHolders(DEAD_ADDRESS)).toBe(true);
    expect(new Labels([]).excludeFromHolders(DEAD_ADDRESS)).toBe(true);
  });

  it("excludes labeled CEX/contract addresses", () => {
    // Katana router is a contract, excluded from holders.
    expect(labels.excludeFromHolders("0x7d0556d55ca1a92708681e2e231733ebd922597d")).toBe(true);
  });

  it("counts an unlabeled external wallet as a holder", () => {
    expect(labels.excludeFromHolders("0xabc0000000000000000000000000000000000001")).toBe(false);
  });
});

describe("Labels.isSell", () => {
  it("does not count a self-move as a sell", () => {
    expect(labels.isSell("0xAAA", "0xaaa")).toBe(false);
  });

  it("does not count a burn as a sell", () => {
    expect(labels.isSell("0xwallet", DEAD_ADDRESS)).toBe(false);
    expect(labels.isSell("0xwallet", ZERO_ADDRESS)).toBe(false);
  });

  it("does not count a transfer to a staking contract as a sell", () => {
    // AXS Staking Pool: countsAsSell = false.
    expect(labels.isSell("0xwallet", "0xfff9ce5f71ca6178d3beecedb61e7eff1602950e")).toBe(false);
  });

  it("counts a transfer to a marketplace / DEX / LP as a sell", () => {
    expect(labels.isSell("0xwallet", "0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3")).toBe(true); // Axie mkt
    expect(labels.isSell("0xwallet", "0x75ae353997242927c701d4d6c2722ebef43fd2d3")).toBe(true); // LP pool
  });

  it("counts a transfer to an unlabeled external wallet as a sell", () => {
    expect(labels.isSell("0xwallet", "0xdef0000000000000000000000000000000000002")).toBe(true);
  });
});

describe("SEED_LABELS integrity", () => {
  it("has the burn address flagged exclude + not-a-sell", () => {
    const burn = SEED_LABELS.find((l) => l.address === ZERO_ADDRESS)!;
    expect(burn.excludeFromHolders).toBe(true);
    expect(burn.countsAsSell).toBe(false);
  });

  it("stores every address lowercased and unique", () => {
    const addrs = SEED_LABELS.map((l) => l.address);
    for (const a of addrs) expect(a).toBe(a.toLowerCase());
    expect(new Set(addrs).size).toBe(addrs.length);
  });
});
