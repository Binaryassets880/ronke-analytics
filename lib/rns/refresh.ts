/**
 * RNS name cache refresh (E4, KTD-E4).
 *
 * Runs off-Vercel as part of the daily sync (never in a request handler).
 * Reverse-resolves current-holder addresses into `rns_names`, incrementally:
 * addresses resolved within `maxAgeDays` are skipped, and each run is capped at
 * `limit` new/stale addresses so a large holder set is worked down over several
 * runs rather than hammering the RPC in one pass. Best-effort throughout - a
 * per-address RPC failure is logged and skipped, never fatal.
 */

import type { Sql } from "@/db/client";
import { lookupName, defaultReader, type RnsReader } from "./resolve";

export interface RefreshOptions {
  reader?: RnsReader;
  /** Max addresses to (re)resolve per run. */
  limit?: number;
  /** Skip addresses resolved more recently than this many days ago. */
  maxAgeDays?: number;
  /** Injected clock for deterministic tests. */
  now?: Date;
  log?: (msg: string) => void;
}

export interface RefreshResult {
  checked: number;
  resolved: number;
  cleared: number;
  capped: boolean;
}

/**
 * Reverse-resolve current holders and upsert `rns_names`. Stores a row even when
 * a wallet has no name (name = NULL) so we don't re-query it every run within the
 * freshness window.
 */
export async function refreshRnsNames(sql: Sql, opts: RefreshOptions = {}): Promise<RefreshResult> {
  const reader = opts.reader ?? defaultReader();
  const limit = opts.limit ?? 1000;
  const maxAgeDays = opts.maxAgeDays ?? 7;
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});

  // Current holders (either asset) with no fresh rns_names row. Never-resolved
  // addresses first, then oldest-resolved - a fair round-robin. (Ordering by
  // address starved the high-hex tail: with >limit*maxAgeDays holders, low
  // addresses went stale and re-filled every batch before the tail was reached.)
  const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
  const candidates = await sql`
    SELECT DISTINCT b.address, n.resolved_at
    FROM holder_balances b
    LEFT JOIN rns_names n ON n.address = b.address
    WHERE b.is_current_holder = true
      AND (n.address IS NULL OR n.resolved_at < ${cutoff})
    ORDER BY n.resolved_at ASC NULLS FIRST, b.address
    LIMIT ${limit + 1}
  `;
  const capped = candidates.length > limit;
  const batch = candidates.slice(0, limit);

  let resolved = 0;
  let cleared = 0;
  const nowIso = now.toISOString();
  for (const row of batch) {
    const address = row.address as string;
    let name: string | null = null;
    try {
      name = await lookupName(address, reader);
    } catch (err) {
      log(`RNS lookup failed for ${address}: ${(err as Error)?.message ?? err}`);
      continue; // leave any existing row untouched; retry next run
    }
    await sql`
      INSERT INTO rns_names (address, name, resolved_at)
      VALUES (${address}, ${name}, ${nowIso})
      ON CONFLICT (address) DO UPDATE SET name = EXCLUDED.name, resolved_at = EXCLUDED.resolved_at
    `;
    if (name) resolved += 1;
    else cleared += 1;
  }

  log(`RNS refresh: checked ${batch.length}, named ${resolved}, unnamed ${cleared}${capped ? " (capped)" : ""}`);
  return { checked: batch.length, resolved, cleared, capped };
}
