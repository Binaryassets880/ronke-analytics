import { describe, it, expect } from "vitest";
import { supplyStatsFrom } from "@/lib/queries";
import { ZERO_ADDRESS, DEAD_ADDRESS, isBurnAddress } from "@/config/contracts";
import { tx, ADDR } from "./helpers";

const E18 = 10n ** 18n;

describe("supplyStatsFrom (burn tracker math)", () => {
  it("computes minted/burned/circulating/burnedPct in whole tokens", () => {
    const s = supplyStatsFrom(1000n * E18, 130n * E18, "ronke_token");
    expect(s.minted).toBe(1000);
    expect(s.burned).toBe(130);
    expect(s.circulating).toBe(870);
    expect(s.burnedPct).toBeCloseTo(0.13, 10);
  });

  it("zero burns -> burnedPct 0, circulating = minted", () => {
    const s = supplyStatsFrom(21_000_000n * E18, 0n, "ronkestr_token");
    expect(s.burned).toBe(0);
    expect(s.circulating).toBe(21_000_000);
    expect(s.burnedPct).toBe(0);
  });

  it("no data at all -> zeros, never NaN (no division by zero)", () => {
    const s = supplyStatsFrom(0n, 0n, "ronke_token");
    expect(s.minted).toBe(0);
    expect(s.burned).toBe(0);
    expect(s.circulating).toBe(0);
    expect(s.burnedPct).toBe(0);
    expect(Number.isNaN(s.burnedPct)).toBe(false);
  });

  it("survives RONKE-scale base units (1e27) without precision blowups", () => {
    // Live figures from 2026-07-09: 1B minted, ~130.6M burned.
    const minted = 1_000_000_000n * E18;
    const burned = 130_605_432n * E18;
    const s = supplyStatsFrom(minted, burned, "ronke_token");
    expect(s.minted).toBeCloseTo(1_000_000_000, 0);
    expect(s.burned).toBeCloseTo(130_605_432, 0);
    expect(s.circulating).toBeCloseTo(869_394_568, 0);
    expect(s.burnedPct).toBeCloseTo(0.130605432, 9);
  });
});

describe("burn definition (single source of truth)", () => {
  it("isBurnAddress covers both the zero and dead addresses", () => {
    expect(isBurnAddress(ZERO_ADDRESS)).toBe(true);
    expect(isBurnAddress(DEAD_ADDRESS)).toBe(true);
    expect(isBurnAddress(ADDR.wallet)).toBe(false);
  });

  it("only transfers to burn addresses get the is_burn flag the aggregate sums", () => {
    const toWallet = tx("ronke_token", { from: ADDR.wallet, to: ADDR.wallet2 });
    const toDead = tx("ronke_token", { from: ADDR.wallet, to: DEAD_ADDRESS });
    const mint = tx("ronke_token", { from: ZERO_ADDRESS, to: ADDR.wallet });
    expect(toWallet.isBurn).toBe(false);
    expect(toDead.isBurn).toBe(true);
    expect(mint.isMint).toBe(true);
    expect(mint.isBurn).toBe(false);
  });
});
