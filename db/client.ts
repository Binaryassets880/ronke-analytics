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
