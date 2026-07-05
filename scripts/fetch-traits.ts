/**
 * Ronkeverse trait ingestion + rarity recompute (U10, local/on-demand).
 *
 * NOT part of the daily transfer sync (traits are static post-reveal - KTD-8).
 * Streams each token's normalized_metadata from Moralis, upserts nft_traits
 * (idempotent on (token_id, trait_type)), records revealed_supply, then
 * recomputes + persists trait_stats and token_rarity (U11). Tokens with no
 * usable attributes are flagged for resync rather than stored as zero-trait
 * (which would corrupt rarity - R6).
 *
 * Run: MORALIS_API_KEY=... DATABASE_URL=... npm run fetch-traits
 */

import { requireSql, type Sql } from "@/db/client";
import { moralisApiKey } from "@/config/env";
import { MoralisProvider } from "@/lib/ronin/moralis";
import { contractFor } from "@/config/contracts";
import { normalizeAttributes, type NormalizedTrait } from "@/lib/rarity/traits";
import { persistRarity } from "@/lib/rarity/persist";

async function setMeta(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function fetchTraits(
  sql: Sql,
  provider: MoralisProvider,
  asOf: Date = new Date(),
): Promise<{ revealedSupply: number; unrevealed: number }> {
  const contract = contractFor("ronkeverse_nft");
  const allTraits: NormalizedTrait[] = [];
  const images = new Map<string, string | null>();
  const unrevealed: string[] = [];

  for await (const { tokenId, attributes, imageUrl } of provider.fetchCollectionMetadata(
    contract,
  )) {
    images.set(tokenId, imageUrl);
    const norm = normalizeAttributes(tokenId, attributes);
    if (norm.length === 0) {
      unrevealed.push(tokenId); // flag for resync, do not store zero-trait
      continue;
    }
    allTraits.push(...norm);
    for (const t of norm) {
      await sql`
        INSERT INTO nft_traits (token_id, trait_type, value, display_type, fetched_at)
        VALUES (${t.tokenId}, ${t.traitType}, ${t.value}, ${t.displayType}, ${asOf.toISOString()})
        ON CONFLICT (token_id, trait_type) DO UPDATE
          SET value = EXCLUDED.value, display_type = EXCLUDED.display_type,
              fetched_at = EXCLUDED.fetched_at
      `;
    }
  }

  const revealedSupply = new Set(allTraits.map((t) => t.tokenId)).size;
  await setMeta(sql, "revealed_supply", String(revealedSupply));
  await setMeta(sql, "traits_fetched_at", asOf.toISOString());

  await persistRarity(sql, allTraits, images, asOf);

  if (unrevealed.length > 0) {
    console.warn(`${unrevealed.length} tokens had no usable metadata (flagged for resync).`);
  }
  return { revealedSupply, unrevealed: unrevealed.length };
}

if (process.argv[1]?.endsWith("fetch-traits.ts")) {
  const sql = requireSql();
  const provider = new MoralisProvider({ apiKey: moralisApiKey() });
  fetchTraits(sql, provider)
    .then(({ revealedSupply, unrevealed }) => {
      console.log(`Traits fetched. Revealed supply: ${revealedSupply}, unrevealed: ${unrevealed}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("fetch-traits failed:", err);
      process.exit(1);
    });
}
