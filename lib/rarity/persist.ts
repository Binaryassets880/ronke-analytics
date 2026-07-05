/**
 * Rarity persistence (U10/U11 glue).
 *
 * Writes trait_stats + token_rarity from computed values. Kept separate from
 * the pure computation so it can be called by both fetch-traits.ts (after a
 * metadata fetch) and scripts/rebuild.ts (manual recompute) - NOT by the daily
 * transfer rebuild(), since traits are static post-reveal (KTD-8 timing note).
 */

import type { Sql } from "@/db/client";
import type { NormalizedTrait } from "./traits";
import { computeTraitStats, computeRarity, METHOD_VERSION } from "./openrarity";

async function setMeta(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

/**
 * Recompute trait_stats + token_rarity from the full revealed trait set and
 * persist. `images` maps token_id -> image_url for the rarity leaderboard.
 */
export async function persistRarity(
  sql: Sql,
  traits: NormalizedTrait[],
  images: Map<string, string | null>,
  asOf: Date = new Date(),
): Promise<{ tokens: number; traitValues: number }> {
  const stats = computeTraitStats(traits);
  const rarity = computeRarity(traits);

  await sql`DELETE FROM trait_stats`;
  for (const s of stats) {
    await sql`
      INSERT INTO trait_stats (trait_type, value, count, probability)
      VALUES (${s.traitType}, ${s.value}, ${s.count}, ${s.probability})
      ON CONFLICT (trait_type, value) DO UPDATE
        SET count = EXCLUDED.count, probability = EXCLUDED.probability
    `;
  }

  await sql`DELETE FROM token_rarity`;
  for (const r of rarity) {
    await sql`
      INSERT INTO token_rarity
        (token_id, info_content_score, rarity_rank, trait_freq_score,
         trait_freq_rank, method_version, image_url)
      VALUES (${r.tokenId}, ${r.infoContentScore}, ${r.rarityRank},
              ${r.traitFreqScore}, ${r.traitFreqRank}, ${METHOD_VERSION},
              ${images.get(r.tokenId) ?? null})
    `;
  }

  await setMeta(sql, "rarity_computed_at", asOf.toISOString());
  return { tokens: rarity.length, traitValues: stats.length };
}
