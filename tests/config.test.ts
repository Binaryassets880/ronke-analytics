import { describe, it, expect, afterEach } from "vitest";
import {
  CONTRACTS,
  ASSETS,
  MIGRATION_BLOCK,
  DIAMOND_THRESHOLDS,
  diamondBucketFor,
  assetForAddress,
  isBurnAddress,
  ZERO_ADDRESS,
} from "@/config/contracts";
import { requireEnv, MissingEnvError } from "@/config/env";
import { BADGES, highestTier, badgeDef } from "@/config/badges";

describe("config/contracts", () => {
  it("exports both contract addresses in lowercase canonical form", () => {
    for (const asset of Object.keys(CONTRACTS) as (keyof typeof CONTRACTS)[]) {
      const addr = CONTRACTS[asset].address;
      expect(addr).toBe(addr.toLowerCase());
      expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("pins MIGRATION_BLOCK to 55577490", () => {
    expect(MIGRATION_BLOCK).toBe(55577490);
  });

  it("orders diamond thresholds paper < regular < diamond", () => {
    expect(DIAMOND_THRESHOLDS.paperSellWindowDays).toBeLessThan(
      DIAMOND_THRESHOLDS.regularDays,
    );
    expect(DIAMOND_THRESHOLDS.regularDays).toBeLessThan(
      DIAMOND_THRESHOLDS.diamondDays,
    );
  });

  it("buckets durations against the thresholds", () => {
    expect(diamondBucketFor(0)).toBe("paper");
    expect(diamondBucketFor(6)).toBe("paper");
    expect(diamondBucketFor(7)).toBe("regular");
    expect(diamondBucketFor(29)).toBe("regular");
    expect(diamondBucketFor(30)).toBe("diamond");
    expect(diamondBucketFor(400)).toBe("diamond");
  });

  it("resolves an address back to its asset (case-insensitive)", () => {
    const upper = CONTRACTS.ronke_token.address.toUpperCase();
    expect(assetForAddress(upper)).toBe("ronke_token");
    expect(assetForAddress(CONTRACTS.ronkeverse_nft.address)).toBe(
      "ronkeverse_nft",
    );
    expect(assetForAddress("0xdeadbeef")).toBeNull();
  });

  it("registers RonkeStr as an ERC-20 with 18 decimals (case-insensitive resolve)", () => {
    const c = CONTRACTS.ronkestr_token;
    expect(c.address).toBe("0x404533a09bf281199ce6b0ef60b7eff7123ff8dc");
    expect(c.standard).toBe("erc20");
    expect(c.decimals).toBe(18);
    expect(assetForAddress(c.address.toUpperCase())).toBe("ronkestr_token");
  });

  it("lists all three assets in ASSETS", () => {
    expect(ASSETS).toEqual(["ronke_token", "ronkestr_token", "ronkeverse_nft"]);
  });

  it("recognizes burn addresses", () => {
    expect(isBurnAddress(ZERO_ADDRESS)).toBe(true);
    expect(isBurnAddress("0x000000000000000000000000000000000000dEaD")).toBe(
      true,
    );
    expect(isBurnAddress(CONTRACTS.ronke_token.address)).toBe(false);
  });
});

describe("config/env", () => {
  const KEY = "RONKE_TEST_ENV_KEY";
  afterEach(() => {
    delete process.env[KEY];
  });

  it("returns a set env var", () => {
    process.env[KEY] = "hello";
    expect(requireEnv(KEY, "hint")).toBe("hello");
  });

  it("throws a clear MissingEnvError (not silent undefined) when unset", () => {
    expect(() => requireEnv(KEY, "set it please")).toThrowError(MissingEnvError);
    expect(() => requireEnv(KEY, "set it please")).toThrowError(/set it please/);
  });

  it("treats a blank value as missing", () => {
    process.env[KEY] = "   ";
    expect(() => requireEnv(KEY, "hint")).toThrowError(MissingEnvError);
  });
});

describe("config/badges", () => {
  it("defines the v1 badge set with unique keys", () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("diamond_hands");
    expect(keys).toContain("dual_citizen");
  });

  it("resolves the highest tier reached", () => {
    const bag = badgeDef("bag_size")!;
    expect(highestTier(bag, 0)).toBeNull();
    expect(highestTier(bag, 1)?.label).toBe("Shrimp");
    expect(highestTier(bag, 5_000_000)?.label).toBe("Believer");
    expect(highestTier(bag, 999_000_000)?.label).toBe("Leviathan");
  });
});
