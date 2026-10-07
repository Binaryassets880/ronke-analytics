/**
 * Event cache for the nightly rebuild (2026-10-07).
 *
 * `readEvents` streams every transfer event out of Neon on every run - ~800k rows,
 * ~130 MB a night, most of the free plan's 5 GB monthly transfer, and growing with
 * the history. The events never change once written (lib/ingest.ts only INSERTs,
 * ON CONFLICT DO NOTHING; nothing updates or deletes them), so the GitHub Action keeps
 * a copy between runs and Neon is asked only for rows it has not seen.
 *
 * "Not seen" is by `id`, not by block: a backfill can insert an event older than the
 * newest one, and its BIGSERIAL id is still higher than anything cached. After merging,
 * the series is re-sorted into (block_number, log_index) order - exactly what
 * `readEvents` returns.
 *
 * Proof before trust: the cache is used only when its row count plus the new rows equals
 * Neon's own count for the asset. Anything else - a missing or unreadable file, a count
 * that does not add up, a cache older than FULL_RELOAD_DAYS - falls back to the full read
 * and rewrites the cache. Off unless EVENT_CACHE_DIR is set, so nothing else changes.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Sql } from "@/db/client";
import type { Asset } from "@/config/contracts";
import type { ReplayEvent } from "@/lib/types";

/** A full read at least this often, whatever the counts say. */
export const FULL_RELOAD_DAYS = 7;
const BATCH = 20_000;
const VERSION = 1;

/** [id, log_index, block_number, block_time ISO, from, to, token_id, quantity] */
type Row = [number, number, number, string, string, string, string | null, string];
interface CacheFile { version: number; asset: string; savedAt: string; fullAt: string; maxId: number; rows: Row[] }

const file = (dir: string, asset: Asset) => join(dir, `${asset}.json.gz`);

function toEvent(asset: Asset, r: Row): ReplayEvent {
  return { asset, logIndex: r[1], blockNumber: r[2], blockTime: new Date(r[3]), from: r[4], to: r[5], tokenId: r[6], quantity: BigInt(r[7]) };
}

function fromDb(r: unknown[]): Row {
  return [Number(r[0]), Number(r[1]), Number(r[2]), new Date(r[3] as string).toISOString(),
    r[4] as string, r[5] as string, (r[6] as string | null) ?? null, String(r[7])];
}

const byChain = (a: Row, b: Row) => a[2] - b[2] || a[1] - b[1];

/** Rows with id > afterId (all of them for afterId = 0), id-ordered, in pages. */
async function readRowsAfter(sql: Sql, asset: Asset, afterId: number): Promise<Row[]> {
  const out: Row[] = [];
  let last = afterId;
  const QUERY = `
    SELECT id, log_index, block_number, block_time,
           from_address, to_address, token_id, quantity
    FROM transfer_events
    WHERE asset = $1 AND id > $2
    ORDER BY id ASC
    LIMIT $3
  `;
  for (;;) {
    const rows = (await sql.query(QUERY, [asset, last, BATCH], { arrayMode: true })) as unknown[][];
    if (rows.length === 0) break;
    for (const r of rows) out.push(fromDb(r));
    last = out[out.length - 1][0];
    if (rows.length < BATCH) break;
  }
  return out;
}

function load(dir: string, asset: Asset): CacheFile | null {
  try {
    const f = file(dir, asset);
    if (!existsSync(f)) return null;
    const c = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as CacheFile;
    return c.version === VERSION && c.asset === asset && Array.isArray(c.rows) ? c : null;
  } catch {
    return null;
  }
}

export interface CacheReport { mode: "delta" | "full"; reason: string; cached: number; fetched: number; total: number }

/** Same result as `readEvents(sql, asset)`, reading only new rows from Neon when it can. */
export async function readEventsCached(
  sql: Sql, asset: Asset, dir: string, now: Date = new Date(), log: (m: string) => void = () => {},
): Promise<{ events: ReplayEvent[]; report: CacheReport }> {
  const stat = (await sql.query(
    "SELECT count(*)::bigint AS n, COALESCE(max(id), 0)::bigint AS m FROM transfer_events WHERE asset = $1",
    [asset], { arrayMode: true },
  )) as unknown[][];
  const dbCount = Number(stat[0][0]);
  const cache = load(dir, asset);

  let rows: Row[] | null = null;
  let report: CacheReport;
  const stale = cache && now.getTime() - Date.parse(cache.fullAt) > FULL_RELOAD_DAYS * 86_400_000;
  if (cache && !stale) {
    const fresh = await readRowsAfter(sql, asset, cache.maxId);
    if (cache.rows.length + fresh.length === dbCount) {
      rows = cache.rows.concat(fresh);
      if (fresh.length) rows.sort(byChain);
      report = { mode: "delta", reason: "counts match", cached: cache.rows.length, fetched: fresh.length, total: rows.length };
    } else {
      report = { mode: "full", reason: `count mismatch (cache ${cache.rows.length} + new ${fresh.length} != db ${dbCount})`, cached: 0, fetched: 0, total: 0 };
    }
  } else {
    report = { mode: "full", reason: cache ? `weekly full read (cache from ${cache.fullAt})` : "no cache", cached: 0, fetched: 0, total: 0 };
  }

  let fullAt = cache?.fullAt ?? now.toISOString();
  if (!rows) {
    rows = (await readRowsAfter(sql, asset, 0)).sort(byChain);
    if (rows.length !== dbCount) throw new Error(`event read for ${asset} returned ${rows.length} rows, Neon counts ${dbCount}`);
    report = { ...report, fetched: rows.length, total: rows.length };
    fullAt = now.toISOString();
  }

  const maxId = rows.reduce((m, r) => (r[0] > m ? r[0] : m), 0);
  mkdirSync(dir, { recursive: true });
  const body: CacheFile = { version: VERSION, asset, savedAt: now.toISOString(), fullAt, maxId, rows };
  writeFileSync(file(dir, asset), gzipSync(JSON.stringify(body)));
  log(`events ${asset}: ${report.mode} (${report.reason}) - ${report.fetched} rows from Neon, ${report.total} total`);
  return { events: rows.map((r) => toEvent(asset, r)), report };
}
