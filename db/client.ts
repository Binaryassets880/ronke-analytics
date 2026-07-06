/**
 * Neon Postgres connection helpers.
 *
 * Two flavors:
 *  - `getSql()` returns a tagged-template query fn or null when DATABASE_URL is
 *    unset. The web app uses this so a missing DB renders an empty state rather
 *    than crashing the whole render (mirrors cre-hub's getSql()).
 *  - `requireSql()` throws a clear error when DATABASE_URL is unset. Ingestion
 *    scripts (migrate/backfill/sync) use this - they cannot proceed without a DB.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { databaseUrl } from "@/config/env";

export type Sql = NeonQueryFunction<false, false>;

/** Web-app read path: null when DATABASE_URL is unset. */
export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

/** Ingestion path: throws MissingEnvError when DATABASE_URL is unset. */
export function requireSql(): Sql {
  return neon(databaseUrl());
}

/**
 * Batched multi-row INSERT over the Neon HTTP driver, which does one statement
 * per round-trip - so inserting hundreds of thousands of derived rows one at a
 * time is far too slow. This packs `chunkSize` rows per statement.
 *
 * `rows` are value arrays in `columns` order. `casts` optionally applies a
 * per-column SQL cast (e.g. "jsonb") to its placeholder. `conflict` is an
 * optional trailing clause (e.g. "ON CONFLICT (address,badge_key) DO UPDATE ...").
 */
export async function insertMany(
  sql: Sql,
  table: string,
  columns: string[],
  rows: unknown[][],
  opts: { chunkSize?: number; conflict?: string; casts?: (string | null)[] } = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = columns.length;
  const chunkSize = opts.chunkSize ?? 500;
  const cast = (i: number) => (opts.casts?.[i] ? `::${opts.casts[i]}` : "");
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const placeholders = batch
      .map(
        (_, r) =>
          `(${columns.map((_, c) => `$${r * cols + c + 1}${cast(c)}`).join(",")})`,
      )
      .join(",");
    const params = batch.flat();
    let q = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`;
    if (opts.conflict) q += ` ${opts.conflict}`;
    await sql.query(q, params);
    inserted += batch.length;
  }
  return inserted;
}
