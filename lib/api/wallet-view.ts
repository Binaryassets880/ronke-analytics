/**
 * Internal WalletData / WalletBadge -> public API shape.
 *
 * The balance representation is the load-bearing decision here. A $RONKE balance
 * in base units reaches ~1e27, far past Number.MAX_SAFE_INTEGER, so emitting it
 * as a JSON number would silently round it and hand integrators a balance that
 * is wrong by an arbitrary amount with no error anywhere. Every asset therefore
 * carries BOTH:
 *   - `balance_raw`: exact base units as a decimal STRING. Authoritative.
 *   - `balance_whole`: a convenience float for display. Lossy at extreme sizes.
 * Documented as such, so a caller doing accounting knows which to read.
 */

import { CONTRACTS, type Asset } from "@/config/contracts";
import type { WalletData, WalletBadge, WalletHeldToken } from "@/lib/queries";

export interface PublicAssetHolding {
  asset: Asset;
  label: string;
  /** Exact base units as a string. Authoritative for tokens; "0" for NFTs. */
  balance_raw: string;
  /** Convenience decimal. Lossy above ~9e15 base units - prefer balance_raw. */
  balance_whole: number;
  /** NFT count; 0 for tokens. */
  token_count: number;
  is_held: boolean;
  duration_days: number;
  diamond_bucket: string | null;
  first_acquired_at: string | null;
  never_sold: boolean;
  ever_paper_sold: boolean;
}

export interface PublicWallet {
  address: string;
  name: string | null;
  /** False when this wallet has never held any Ronke asset. */
  found: boolean;
  holdings: PublicAssetHolding[];
  nfts: {
    token_id: string;
    rarity_rank: number | null;
    tier: WalletHeldToken["tier"];
    image_url: string | null;
  }[];
  badges: { key: string; tier: number | null; context: Record<string, unknown> }[];
}

/**
 * Postgres timestamp -> ISO 8601.
 *
 * Neon hands back `2025-01-25 13:38:44+00` (space separator, no milliseconds).
 * V8 happens to parse that, but it is not ISO 8601 and it is not required to
 * work anywhere else - Safari has historically returned Invalid Date for the
 * space form. A public API consumed from arbitrary languages must emit the
 * standard form, so normalize once here rather than making every integrator
 * discover this. Unparseable input passes through untouched rather than
 * becoming null: losing the value would be worse than an odd-looking one.
 */
export function toIso(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .replace(" ", "T")
    // Postgres writes a bare-hour offset (`+00`); ISO 8601 requires minutes, and
    // Date rejects the short form outright rather than guessing.
    .replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Base units string -> whole tokens, via the asset's declared decimals. */
export function toWholeNumber(raw: string, asset: Asset): number {
  const decimals = CONTRACTS[asset].decimals;
  if (decimals == null) return 0; // NFTs have no decimal balance
  try {
    return Number(BigInt(raw)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

export function toPublicWallet(
  wallet: WalletData,
  badges: WalletBadge[],
): PublicWallet {
  return {
    address: wallet.address,
    name: wallet.name,
    found: wallet.everHeld,
    // Always all three assets, even at zero: a stable key set keeps typed
    // clients from branching on presence.
    holdings: wallet.assetHoldings.map((h) => ({
      asset: h.asset,
      label: h.label,
      balance_raw: h.balance,
      balance_whole: toWholeNumber(h.balance, h.asset),
      token_count: h.tokenCount,
      is_held: h.isHeld,
      duration_days: h.holdingDurationDays,
      diamond_bucket: h.diamondBucket,
      first_acquired_at: toIso(h.firstAcquiredAt),
      never_sold: h.neverSold,
      ever_paper_sold: h.everPaperSold,
    })),
    nfts: wallet.heldTokens.map((t) => ({
      token_id: t.tokenId,
      rarity_rank: t.rarityRank,
      tier: t.tier,
      image_url: t.imageUrl,
    })),
    badges: badges.map((b) => ({ key: b.badgeKey, tier: b.tier, context: b.context })),
  };
}
