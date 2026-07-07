import { describe, it, expect } from "vitest";
import {
  formatCompact,
  formatPct,
  formatDuration,
  shortAddress,
  normalizeAddress,
  assetFromParam,
  assetToParam,
  hoursSince,
  toWholeTokens,
} from "@/lib/format";

describe("format helpers", () => {
  it("formats compact numbers", () => {
    expect(formatCompact(1_234_567)).toBe("1.23M");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(2_000_000_000)).toBe("2B");
  });
  it("formats percentages and durations", () => {
    expect(formatPct(0.123)).toBe("12.3%");
    expect(formatDuration(0.5)).toBe("<1d");
    expect(formatDuration(10)).toBe("10d");
    expect(formatDuration(60)).toBe("2mo");
    expect(formatDuration(400)).toBe("1.1y");
  });
  it("shortens addresses but callers keep the full value", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });
  it("validates + normalizes 0x addresses (mixed case -> lowercase)", () => {
    expect(normalizeAddress("0xABCDEF0000000000000000000000000000000001")).toBe(
      "0xabcdef0000000000000000000000000000000001",
    );
    expect(normalizeAddress("not-an-address")).toBeNull();
    expect(normalizeAddress("0x123")).toBeNull(); // too short
  });
  it("maps the asset URL param (default token)", () => {
    expect(assetFromParam("nft")).toBe("ronkeverse_nft");
    expect(assetFromParam(undefined)).toBe("ronke_token");
    expect(assetFromParam("token")).toBe("ronke_token");
    expect(assetFromParam("ronkestr")).toBe("ronkestr_token");
    expect(assetFromParam("ronkestr_token")).toBe("ronkestr_token");
  });
  it("round-trips every asset through its URL param short form", () => {
    for (const p of ["token", "ronkestr", "nft"] as const) {
      expect(assetToParam(assetFromParam(p))).toBe(p);
    }
  });
  it("computes hours since a timestamp", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    expect(hoursSince("2026-07-05T00:00:00Z", now)).toBeCloseTo(12, 5);
    expect(hoursSince(null, now)).toBeNull();
  });
  it("converts raw base units to whole tokens", () => {
    expect(toWholeTokens(1_000_000_000_000_000_000n)).toBe(1);
  });
});
