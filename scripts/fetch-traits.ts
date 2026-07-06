/**
 * Ronkeverse trait ingestion + rarity recompute (U10, local/on-demand).
 *
 * NOT part of the daily transfer sync (traits are static post-reveal - KTD-8).
 * Fetches per-token metadata directly from the collection's tokenURI base
 * (S3) - Moralis only indexed ~29% of tokens on Ronin (R6), while the source
 * has all of them. Reads the exact minted token_id set from our own
 * transfer_events, fetches with bounded concurrency, and is resumable (skips
 * token_ids already in nft_traits). Then recomputes + persists trait_stats and
 * token_rarity (U11) over the full trait set.
 *
 * Run: DATABASE_URL=... npm run fetch-traits
 */

import { requireSql, insertMany, type Sql } from "@/db/client";
import { RONKEVERSE_METADATA_BASE } from "@/config/contracts";
import { normalizeAttributes, type NormalizedTrait, type DisplayType } from "@/lib/rarity/traits";
import type { MoralisAttribute } from "@/lib/ronin/moralis";
import { persistRarity } from "@/lib/rarity/persist";

export interface TokenMetadata {
  attributes: MoralisAttribute[];
  imageUrl: string | null;
}
export type MetadataFetcher = (tokenId: string) => Promise<TokenMetadata | null>;

/** Default fetcher: read the token's JSON from `${baseUrl}/${tokenId}`. */
export function httpMetadataFetcher(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): MetadataFetcher {
  return async (tokenId) => {
    const res = await fetchImpl(`${baseUrl}/${tokenId}`);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j) return null;
    const attributes: MoralisAttribute[] = (j.attributes ?? []).map((a: any) => ({
      trait_type: a.trait_type,
      value: a.value,
      display_type: a.display_type ?? null,
    }));
    return { attributes, imageUrl: j.image ?? null };
  };
}

/** Run `fn` over `items` with at most `concurrency` in flight; preserves order. */
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

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
  fetchMetadata: MetadataFetcher,
  asOf: Date = new Date(),
  opts: { concurrency?: number; chunkSize?: number } = {},
): Promise<{ revealedSupply: number; unrevealed: number }> {
  const concurrency = opts.concurrency ?? 20;
  const chunkSize = opts.chunkSize ?? 500;

  const idRows = await sql`
    SELECT DISTINCT token_id FROM transfer_events
    WHERE asset = 'ronkeverse_nft' AND token_id IS NOT NULL
  `;
  const allIds = idRows.map((r) => String(r.token_id));
  const doneRows = await sql`SELECT DISTINCT token_id FROM nft_traits`;
  const done = new Set(doneRows.map((r) => String(r.token_id)));
  const todo = allIds.filter((id) => !done.has(id));

  const images = new Map<string, string | null>();
  let fetched = 0;
  let unrevealed = 0;
  let processed = 0;

  for (let start = 0; start < todo.length; start += chunkSize) {
    const slice = todo.slice(start, start + chunkSize);
    const metas = await mapPool(slice, concurrency, async (id) => {
      try {
        return await fetchMetadata(id);
      } catch {
        return null;
      }
    });
    const buffer: NormalizedTrait[] = [];
    slice.forEach((id, k) => {
      processed += 1;
      const meta = metas[k];
      if (!meta) {
        unrevealed += 1;
        return;
      }
      images.set(id, meta.imageUrl);
      const norm = normalizeAttributes(id, meta.attributes);
      if (norm.length === 0) {
        unrevealed += 1;
        return;
      }
      buffer.push(...norm);
      fetched += 1;
    });
    await flush(sql, buffer);
    console.log(`traits: ${processed}/${todo.length} (revealed ${fetched}, unrevealed ${unrevealed})`);
  }

  // Recompute rarity over the FULL trait set now in the DB.
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
  const fetcher = httpMetadataFetcher(RONKEVERSE_METADATA_BASE);
  fetchTraits(sql, fetcher)
    .then(({ revealedSupply, unrevealed }) => {
      console.log(`Traits fetched. Revealed supply: ${revealedSupply}, unrevealed: ${unrevealed}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("fetch-traits failed:", err);
      process.exit(1);
    });
}
