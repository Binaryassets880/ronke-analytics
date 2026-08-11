/**
 * Shared response layer for /api/v1/*.
 *
 * Every public route goes through `ok()` / `fail()` so the envelope, CORS
 * headers, and cache headers cannot drift between endpoints - and, more to the
 * point, so a new route cannot silently ship without caching. That last one is
 * the expensive mistake: Neon's transfer allowance is largely consumed by the
 * nightly rebuild already, and an uncached public endpoint reads the database
 * once per request instead of once per TTL window. Nothing errors when that
 * happens; the bill just moves. Hence one chokepoint plus header tests.
 */

import { NextResponse } from "next/server";
import { getMetaState } from "@/lib/queries";
import { API_VERSION, scoreVersion } from "./version";

/**
 * Cache lifetimes in seconds, by data volatility.
 *
 * The underlying tables only change when the nightly sync rebuilds them
 * (07:00 UTC), so these could be far longer; they are kept modest so a
 * manually-triggered rebuild shows up within the hour without a purge step.
 * `stale-while-revalidate` is generous: an expired entry still serves instantly
 * while it refreshes in the background, so a cache miss never costs a visitor
 * latency and never stampedes Neon.
 */
export const CACHE = {
  /** Scores, leaderboard, ecosystem stats - rebuilt nightly. */
  score: 900,
  /**
   * The full dump. Longer than `score` on purpose, because this is the one
   * response where a cache miss is expensive: ~450 KB out of Neon per query
   * against a transfer allowance the nightly rebuild has already largely spent.
   * At 15 minutes, a continuously-polled dump would cost ~1.2 GB/month; at an
   * hour it is ~310 MB. Costs nothing in freshness - the underlying data only
   * changes once a day, and a caller that needs to know exactly which rebuild
   * it holds reads `meta.as_of` off the dump itself.
   */
  bulk: 3600,
  /** Scoring rules - change only on a deploy. */
  config: 3600,
  /** Sync freshness + health - short so staleness is visible quickly. */
  meta: 300,
  /** NFT rarity and traits - static after reveal. */
  nft: 86_400,
} as const;

const SWR_MULTIPLIER = 8;

/** Machine-readable error codes. Documented; never invent one inline. */
export const ERROR_CODES = [
  "invalid_address",
  "invalid_param",
  "invalid_token_id",
  "name_not_resolved",
  "too_many_addresses",
  "not_found",
  "not_configured",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiMeta {
  /** Timestamp of the rebuild this data came from. Null before the first run. */
  as_of: string | null;
  api_version: string;
  score_version: string;
  [key: string]: unknown;
}

/**
 * Build the meta block. Routes call this inside a `Promise.all` alongside their
 * own query so freshness costs no extra round-trip latency.
 */
export async function apiMeta(extra: Record<string, unknown> = {}): Promise<ApiMeta> {
  const state = await getMetaState();
  return {
    as_of: state.lastRebuildAt,
    api_version: API_VERSION,
    score_version: scoreVersion(),
    ...extra,
  };
}

/**
 * CORS for anonymous cross-origin reads.
 *
 * The allowed origin is a literal `*` for every caller, so the response does NOT
 * vary by request origin and deliberately carries no `Vary: Origin` - adding one
 * would fragment the CDN cache per origin for no benefit, which is the opposite
 * of what this API needs.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function cacheHeader(ttl: number): string {
  return `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * SWR_MULTIPLIER}`;
}

export interface OkOptions {
  meta: ApiMeta;
  /** Seconds the CDN may serve this response. Use a CACHE constant. */
  ttl: number;
}

/** Success envelope: `{ data, meta }`, cached and CORS-enabled. */
export function ok<T>(data: T, opts: OkOptions): NextResponse {
  return NextResponse.json(
    { data, meta: opts.meta },
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": cacheHeader(opts.ttl) },
    },
  );
}

/**
 * Error envelope: `{ error: { code, message } }`.
 *
 * Always `no-store`. Caching an error would pin a transient database blip to the
 * CDN for the full TTL, turning a one-second outage into a fifteen-minute one.
 */
export function fail(code: ErrorCode, message: string, status = 400): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
  );
}

/** Shared CORS preflight handler - re-exported as `OPTIONS` by each route. */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
