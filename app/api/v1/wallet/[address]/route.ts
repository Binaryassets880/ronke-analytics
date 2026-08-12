/**
 * GET /api/v1/wallet/{addressOrName}
 *
 * What the wallet actually holds: per-asset balances and behavior, held
 * Ronkeverse token IDs with rarity, and earned badges. This is the endpoint a
 * game uses when it wants to render the player's real assets or gate on a
 * specific holding, rather than on the composite score.
 */

import { resolveParam } from "@/lib/api/address";
import { apiMeta, ok, fail, preflight, CACHE } from "@/lib/api/respond";
import { toPublicWallet } from "@/lib/api/wallet-view";
import { getWallet, getWalletBadges } from "@/lib/queries";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await ctx.params;

  const resolved = await resolveParam(raw);
  if (!resolved.ok) {
    const status =
      resolved.code === "name_not_resolved" ? 404 : resolved.code === "not_configured" ? 503 : 400;
    return fail(resolved.code, resolved.message, status);
  }

  try {
    const [wallet, badges, meta] = await Promise.all([
      getWallet(resolved.address),
      getWalletBadges(resolved.address),
      apiMeta(),
    ]);
    const data = toPublicWallet(wallet, badges);
    // Prefer the name the caller resolved by, else whatever the ledger knows.
    return ok({ ...data, name: resolved.name ?? data.name }, { meta, ttl: CACHE.score });
  } catch (e) {
    console.error("GET /api/v1/wallet failed", e);
    return fail("internal", "Wallet lookup failed. Try again.", 500);
  }
}

export const OPTIONS = preflight;
