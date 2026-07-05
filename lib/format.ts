/**
 * Display formatting helpers (pure, unit-testable).
 */

import type { Asset } from "@/config/contracts";
import { CONTRACTS } from "@/config/contracts";

/** Compact number: 1234567 -> "1.23M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, suffix] of units) {
    if (abs >= v) return `${(n / v).toFixed(2).replace(/\.?0+$/, "")}${suffix}`;
  }
  return String(Math.round(n));
}

/** Raw ERC-20 base units -> whole tokens (number). */
export function toWholeTokens(raw: bigint, asset: Asset = "ronke_token"): number {
  const decimals = CONTRACTS[asset].decimals ?? 18;
  return Number(raw) / 10 ** decimals;
}

/** A share in 0..1 -> "12.3%". */
export function formatPct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** Days -> a human duration: "3d", "5mo", "1.2y". */
export function formatDuration(days: number): string {
  if (days < 1) return "<1d";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Truncate a 0x address for display (full value preserved by callers in
 * title/href). Public-dashboard convention; not the crypto-books copy-paste
 * context where full values are mandatory.
 */
export function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** ISO-ish timestamp -> a short "2026-07-05 14:10 UTC". */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Hours since a timestamp (for staleness). */
export function hoursSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 3_600_000;
}

/** Basic 0x address validation + normalization. */
export function normalizeAddress(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(trimmed) ? trimmed : null;
}

/** URL asset param -> Asset (default token). */
export function assetFromParam(param: string | undefined | null): Asset {
  return param === "nft" || param === "ronkeverse_nft" ? "ronkeverse_nft" : "ronke_token";
}

/** Asset -> URL param short form. */
export function assetToParam(asset: Asset): "token" | "nft" {
  return asset === "ronkeverse_nft" ? "nft" : "token";
}
