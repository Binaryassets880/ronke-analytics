/**
 * Manual full rebuild (U4/U11, local): rarity + snapshots + badges.
 *
 * Use after a metric-definition change. Recomputes rarity from the already-
 * stored nft_traits first (so the Rarity Hunter badge sees fresh ranks), then
 * runs the transfer-snapshot rebuild (which derives badges as its final step).
 * Runs off-Vercel; no serverless duration limit (KTD-7).
 *
 * Run: DATABASE_URL=... npm run rebuild
 */

import { requireSql, type Sql } from "@/db/client";
import { rebuild } from "@/lib/analytics/rebuild";
import { persistRarity } from "@/lib/rarity/persist";
import type { NormalizedTrait, DisplayType } from "@/lib/rarity/traits";

/** Recompute rarity from stored traits (preserving known image URLs). */
export async function recomputeRarity(sql: Sql, asOf: Date = new Date()): Promise<number> {
  const traitRows = await sql`SELECT token_id, trait_type, value, display_type FROM nft_traits`;
  if (traitRows.length === 0) return 0;
  const traits: NormalizedTrait[] = traitRows.map((r) => ({
    tokenId: String(r.token_id),
    traitType: r.trait_type as string,
    value: r.value as string,
    displayType: (r.display_type as DisplayType) ?? "string",
  }));
  const imgRows = await sql`SELECT token_id, image_url FROM token_rarity`;
  const images = new Map<string, string | null>(
    imgRows.map((r) => [String(r.token_id), (r.image_url as string | null) ?? null]),
  );
  const { tokens } = await persistRarity(sql, traits, images, asOf);
  return tokens;
}

export async function manualRebuild(sql: Sql, asOf: Date = new Date()): Promise<void> {
  await recomputeRarity(sql, asOf);
  await rebuild(sql, asOf); // snapshots + badges (badges read fresh token_rarity)
}

if (process.argv[1]?.endsWith("rebuild.ts")) {
  manualRebuild(requireSql())
    .then(() => {
      console.log("Manual rebuild complete (rarity + snapshots + badges).");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Manual rebuild failed:", err);
      process.exit(1);
    });
}
