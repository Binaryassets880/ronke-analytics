/**
 * Ronkeverse trait ingestion + rarity recompute (U10, local/on-demand).
 *
 * NOT part of the daily transfer sync (traits are static post-reveal - KTD-8).
 * Fetches per-token metadata from Moralis's per-token endpoint (the bulk
 * collection endpoint 500s on Ronin), reading the exact minted token_id set
 * from our own transfer_events. Resilient (skips a token that errors) and
 * resumable (skips token_ids already in nft_traits). Then recomputes + persists
 * trait_stats and token_rarity (U11) over the full trait set.
 *
 * Run: MORALIS_API_KEY=... DATABASE_URL=... npm run fetch-traits
 */

import { requireSql, insertMany, type Sql } from "@/db/client";
import { moralisApiKey } from "@/config/env";
import { MoralisProvider } from "@/lib/ronin/moralis";
import { contractFor } from "@/config/contracts";
import { normalizeAttributes, type NormalizedTrait, type DisplayType } from "@/lib/rarity/traits";
import { persistRarity } from "@/lib/rarity/persist";

async function setMeta(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

async function flush(sql: Sql, buffer: NormalizedTrait[]): Promise<void> {
  if (buffer.length === 0) return;
  await insertMany(
    sql,
    "nft_traits",
    ["token_id", "trait_type", "value", "display_type", "fetched_at"],
    buffer.map((t) => [t.tokenId, t.traitType, t.value, t.displayType, new Date().toISOString()]),
    {
      conflict:
        "ON CONFLICT (token_id, trait_type) DO UPDATE SET value = EXCLUDED.value, display_type = EXCLUDED.display_type, fetched_at = EXCLUDED.fetched_at",
    },
  );
}

export async function fetchTraits(
  sql: Sql,
  provider: MoralisProvider,
  asOf: Date = new Date(),
): Promise<{ revealedSupply: number; unrevealed: number }> {
  const contract = contractFor("ronkeverse_nft");

  // The exact minted token set, from our own ingested history.
  const idRows = await sql`
    SELECT DISTINCT token_id FROM transfer_events
    WHERE asset = 'ronkeverse_nft' AND token_id IS NOT NULL
  `;
  const allIds = idRows.map((r) => String(r.token_id));
  // Resume: skip tokens already fetched.
  const doneRows = await sql`SELECT DISTINCT token_id FROM nft_traits`;
  const done = new Set(doneRows.map((r) => String(r.token_id)));
  const todo = allIds.filter((id) => !done.has(id));

  const images = new Map<string, string | null>();
  let buffer: NormalizedTrait[] = [];
  let fetched = 0;
  let unrevealed = 0;

  for (const tokenId of todo) {
    let meta;
    try {
      meta = await provider.fetchTokenMetadata(contract, tokenId);
    } catch {
      unrevealed += 1; // leave for a later resync
      continue;
    }
    images.set(tokenId, meta.imageUrl);
    const norm = normalizeAttributes(tokenId, meta.attributes);
    if (norm.length === 0) {
      unrevealed += 1;
      continue;
    }
    buffer.push(...norm);
    fetched += 1;
    if (buffer.length >= 1000) {
      await flush(sql, buffer);
      buffer = [];
    }
    if (fetched % 500 === 0) console.log(`traits: ${fetched}/${todo.length}`);
  }
  await flush(sql, buffer);

  // Recompute rarity over the FULL trait set now in the DB (incl. prior runs).
  const traitRows = await sql`SELECT token_id, trait_type, value, display_type FROM nft_traits`;
  const allTraits: NormalizedTrait[] = traitRows.map((r) => ({
    tokenId: String(r.token_id),
    traitType: r.trait_type as string,
    value: r.value as string,
    displayType: (r.display_type as DisplayType) ?? "string",
  }));
  const revealedSupply = new Set(allTraits.map((t) => t.tokenId)).size;
  await setMeta(sql, "revealed_supply", String(revealedSupply));
  await setMeta(sql, "traits_fetched_at", asOf.toISOString());
  await persistRarity(sql, allTraits, images, asOf);

  if (unrevealed > 0) {
    console.warn(`${unrevealed} tokens had no usable metadata (flagged for resync).`);
  }
  return { revealedSupply, unrevealed };
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
