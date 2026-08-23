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

  it("is a well-formed 0x address in every entry", () => {
    for (const l of SEED_LABELS) expect(l.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  /**
   * A wrong label is far more damaging than a missing one, because an unlabeled
   * address already falls back to the safe default (counts as a holder, and an
   * outbound to it counts as a sell). Anything that overrides that default has
   * to carry the evidence for doing so.
   */
  it("justifies every non-default label with a note", () => {
    const seeded = SEED_LABELS.filter((l) => l.category !== "burn");
    for (const l of seeded) {
      if (!l.countsAsSell) {
        expect(l.note, `${l.label} forgives sales without recording why`).toBeTruthy();
      }
    }
  });
});

describe("labels added 2026-08-23", () => {
  const at = (address: string) => SEED_LABELS.find((l) => l.address === address);

  it("treats swap routers as sell venues that never rank as holders", () => {
    for (const a of [
      "0x5f0acdd3ec767514ff1bf7e79949640bf94576bd", // Katana AggregateRouter
      "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // KyberSwap
      "0x77f96cf7b98b963fb8a9b84787806d396d953b2b", // AffiliateRouter
      "0xc05afc8c9353c1dd5f872eccfacd60fd5a2a9ac7", // PermissionedRouter
      "0x452cf1b8597e6319cd21abd847312bf17e26d8d1", // LiFiDiamond
      "0xe377e13256002ab260e8ab59478652710a79ac5c", // unnamed router
      "0x8f10b468b06c6fd214b65f87778827f7d113f996", // unnamed router
    ]) {
      expect(at(a), `${a} missing from SEED_LABELS`).toBeDefined();
      expect(labels.isSell("0xwallet", a)).toBe(true);
      expect(labels.excludeFromHolders(a)).toBe(true);
      expect(labels.isRetainOwnership(a)).toBe(false);
    }
  });

  it("does not treat providing liquidity as a sale, unlike swapping into a pool", () => {
    const pm = "0x7cf0fb64d72b733695d77d197c664e90d07cf45a"; // V3 position manager
    expect(labels.isSell("0xwallet", pm)).toBe(false);
    expect(labels.excludeFromHolders(pm)).toBe(true);
    // The pools themselves stay sales - that distinction is the whole point.
    expect(labels.isSell("0xwallet", "0x75ae353997242927c701d4d6c2722ebef43fd2d3")).toBe(true);
    expect(labels.isSell("0xwallet", "0x93171ecace2f6b8be8dd09539f55fabe7f805af1")).toBe(true);
  });

  it("does not treat bulk distribution or game wagering as a sale", () => {
    expect(labels.isSell("0xwallet", "0x5d518933351a0bc14b24b329b33b813565608769")).toBe(false); // Scatter
    expect(labels.isSell("0xwallet", "0xa9b7d87df126ae0b80b90ded3d481209e20eb3bf")).toBe(false); // ClickTile
  });

  it("keeps the NFT custody contract as retain-ownership, not a sale", () => {
    const custody = "0x22e8ecccbc419cda1a6b2c6fca72ee2cb239f506";
    expect(at(custody)?.category).toBe("staking");
    expect(labels.isRetainOwnership(custody)).toBe(true);
    expect(labels.isSell("0xwallet", custody)).toBe(false);
    expect(labels.excludeFromHolders(custody)).toBe(true);
  });

  it("keeps NFT venues as sales - deposits there leave to a different wallet", () => {
    for (const a of [
      "0x7962c19767f10df016f1f7154b5fe286e502e023", // mystery pack vault, sellBackNFT
      "0xf9333ebf0d47b26803a963fcbc27ddde11bb18b6", // BeaconProxy vault
      "0xc16af7ea967ef43a468b84f5003c7577b299ab6d", // RealmWalkers
      "0xdfda7f48a58618af138cb5c3582b5426bf418d0d", // RealmWalkers #2
      "0x644a6d2aa3abeec944c874260d64805ed262eb4c",
      "0x7b2d268eea7f99520f7e968052fac76f52c73c7e",
    ]) {
      expect(at(a), `${a} missing from SEED_LABELS`).toBeDefined();
      expect(labels.isSell("0xwallet", a)).toBe(true);
      expect(labels.excludeFromHolders(a)).toBe(true);
      expect(labels.isRetainOwnership(a)).toBe(false);
    }
  });

  /**
   * These report is_contract = true on the explorer but are individual people
   * using smart wallets. Labeling one would drop a real holder out of the
   * rankings and forgive their real sales.
   */
  it("never labels EIP-7702 delegated EOAs", () => {
    for (const a of [
      "0x439f8425568ddf301ace4a1d80a33d9e9bfd0419",
      "0x07a00a351b95019e0ec27c3b973682754b5681d5",
    ]) {
      expect(at(a), `${a} is a person's wallet and must stay unlabeled`).toBeUndefined();
      expect(labels.excludeFromHolders(a)).toBe(false);
      expect(labels.isSell("0xwallet", a)).toBe(true);
    }
  });

  it("leaves the three unidentified token contracts at the safe default", () => {
    for (const a of [
      "0x14bb374eff7d8cba7e2df7985c0d5f36019582e2",
      "0xf0107aa09dad1ce122f03fff0d26ae3b52cc4f88",
      "0x5078cb39b427d2264b4b769f8def6a496acbd507",
    ]) {
      expect(at(a), `${a} was labeled without establishing what it is`).toBeUndefined();
      expect(labels.isSell("0xwallet", a)).toBe(true);
    }
  });
});
