/**
 * Snapshot rebuild orchestrator (U5, extended by U6 + U14).
 *
 * Reads the append-only transfer_events, replays them into derived snapshots,
 * and writes the holder_* tables. KTD-3: this runs as the final step of every
 * sync so appended events never silently vanish. Deterministic: the same events
 * always yield the same snapshot rows.
 *
 * The pure compute (`computeAssetSnapshot`) is separated from persistence so it
 * is testable without a database.
 */

import { createHash } from "node:crypto";
import { insertMany, type Sql } from "@/db/client";
import type { Asset } from "@/config/contracts";
import { ASSETS } from "@/config/contracts";
import type { ReplayEvent } from "@/lib/types";
import { Labels, type AddressLabel } from "./labels";
import { computeBalances } from "./balances";
import { computeDiamond } from "./diamond";
import { computeConcentration, type Concentration } from "./concentration";
import { computeDailySeries, type DailySnapshot } from "./timeseries";
import type { HolderBalance, HolderLot, HolderMetric } from "./types";

export interface AssetSnapshot {
  asset: Asset;
  asOf: Date;
  balances: HolderBalance[];
  lots: HolderLot[];
  metrics: HolderMetric[];
  concentration: Concentration;
  daily: DailySnapshot[];
}

/** Pure: compute every derived snapshot for one asset from its events. */
export function computeAssetSnapshot(
  asset: Asset,
  events: ReplayEvent[],
  labels: Labels,
  asOf: Date,
): AssetSnapshot {
  const sorted = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
  );
  const balances = computeBalances(asset, sorted, labels);
  const { lots, metrics } = computeDiamond(asset, sorted, labels, asOf);
  const concentration = computeConcentration(asset, balances, metrics);
  const daily = computeDailySeries(asset, sorted, labels);
  return { asset, asOf, balances, lots, metrics, concentration, daily };
}

// ── DB glue ──────────────────────────────────────────────────────────

/**
 * Read all transfer_events for an asset in block order, KEYSET-paginated.
 * A single SELECT of a full asset (500k+ rows) exceeds the Neon HTTP driver's
 * 64MB response cap, so we page by (block_number, log_index) in batches and
 * accumulate. The rebuild needs the whole series in memory to replay FIFO.
 *
 * This is the single largest consumer of Neon network transfer in the project:
 * it streams the entire event history on every nightly run (the rebuild cannot
 * be skipped on quiet days - see KTD-3 and the asOf note on computeDiamond).
 * It is therefore deliberately narrow: 7 columns, returned positionally. See
 * ReplayEvent in lib/types.ts before adding a column here.
 */
export async function readEvents(sql: Sql, asset: Asset): Promise<ReplayEvent[]> {
  const BATCH = 20_000;
  const out: ReplayEvent[] = [];
  let lastBlock = -1;
  let lastLog = -1;
  // Column order is load-bearing: arrayMode returns positional rows.
  const QUERY = `
    SELECT log_index, block_number, block_time,
           from_address, to_address, token_id, quantity
    FROM transfer_events
    WHERE asset = $1
      AND (block_number, log_index) > ($2, $3)
    ORDER BY block_number ASC, log_index ASC
    LIMIT $4
  `;
  const LOG_INDEX = 0,
    BLOCK_NUMBER = 1,
    BLOCK_TIME = 2,
    FROM = 3,
    TO = 4,
    TOKEN_ID = 5,
    QUANTITY = 6;
  for (;;) {
    // arrayMode: positional rows drop the repeated JSON key names, which cost
    // ~54MB per full rebuild at 670k events. Type parsing is unchanged - in
    // particular NUMERIC still arrives as a string, so the BigInt() below stays
    // lossless (quantities reach 1e27 wei and would round as JSON numbers).
    const rows = (await sql.query(QUERY, [asset, lastBlock, lastLog, BATCH], {
      arrayMode: true,
    })) as unknown[][];
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push({
        asset,
        logIndex: Number(r[LOG_INDEX]),
        blockNumber: Number(r[BLOCK_NUMBER]),
        blockTime: new Date(r[BLOCK_TIME] as string),
        from: r[FROM] as string,
        to: r[TO] as string,
        tokenId: (r[TOKEN_ID] as string | null) ?? null,
        quantity: BigInt(r[QUANTITY] as string),
      });
    }
    const last = rows[rows.length - 1];
    lastBlock = Number(last[BLOCK_NUMBER]);
    lastLog = Number(last[LOG_INDEX]);
    if (rows.length < BATCH) break;
  }
  return out;
}

export async function loadLabelsFromDb(sql: Sql): Promise<Labels> {
  const rows = await sql`
    SELECT address, label, category, exclude_from_holders, counts_as_sell, note
    FROM address_labels
  `;
  const labels: AddressLabel[] = rows.map((r) => ({
    address: r.address as string,
    label: r.label as string,
    category: r.category,
    excludeFromHolders: r.exclude_from_holders as boolean,
    countsAsSell: r.counts_as_sell as boolean,
    note: (r.note as string | undefined) ?? undefined,
  }));
  return new Labels(labels);
}

/**
 * Stable content fingerprint for a batch of rows. `computeAssetSnapshot` is
 * deterministic (same events -> same rows in the same order), so an identical
 * fingerprint means an identical table, byte for byte.
 */
function fingerprint(rows: unknown[][]): string {
  const h = createHash("sha256");
  for (const r of rows) {
    h.update(JSON.stringify(r));
    h.update("\n");
  }
  return h.digest("hex");
}

/**
 * Build `ON CONFLICT (...) DO UPDATE SET ...` covering every non-key column.
 *
 * Derived programmatically from the same column list passed to insertMany, so
 * adding a column to that list cannot leave the upsert silently stale. That is
 * the exact footgun called out in db/schema.sql above the hand-tier ALTERs.
 */
function upsertAll(conflictCols: string[], allCols: string[]): string {
  const sets = allCols
    .filter((c) => !conflictCols.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  return `ON CONFLICT (${conflictCols.join(",")}) DO UPDATE SET ${sets}`;
}

const FP_PREFIX = "snapshot_fp";
const fpKey = (asset: Asset, table: string) => `${FP_PREFIX}:${asset}:${table}`;

/**
 * Persist one asset's snapshot.
 *
 * COST NOTE (2026-08-27). This used to DELETE and re-INSERT all four derived
 * tables on every run. That is ~296k row writes per rebuild to maintain ~296k
 * live rows, and pg_stat_user_tables showed 20.8M lifetime inserts against
 * 20.5M deletes - the compute and WAL for a full rewrite, every night, almost
 * always producing identical bytes. transfer_events, the append-only source of
 * truth, had 950,329 inserts and exactly 1 delete over the same period. That
 * contrast is the whole argument for this change.
 *
 * KTD-3 IS NOT WEAKENED. The rebuild still runs in full every time: events are
 * still read, the snapshot is still recomputed from scratch, and
 * `last_rebuild_at` still advances. The only thing that changed is that a write
 * whose result would be byte-identical to what is already stored is skipped.
 * A skipped write cannot make data stale, because the data it would have
 * written is the data already there. Do not "restore" the unconditional
 * DELETE to satisfy KTD-3 - re-read this paragraph instead.
 *
 * The two strategies, and why they differ:
 *
 *   holder_lots, holder_balances - derived ONLY from transfer_events. No field
 *     on either is a function of `asOf` (check HolderLot: asset, address,
 *     tokenId, acquiredAt, acquiredBlock, quantityRemaining - all event facts).
 *     So on a day with no new events these tables are provably unchanged, and
 *     the whole write is skipped on a fingerprint match. holder_lots is the
 *     big win: 197k rows, 64MB, and 12.3M of the 20.8M lifetime writes.
 *     When the fingerprint DOES differ they are still DELETEd and re-INSERTed,
 *     because holder_lots has no natural key to upsert on (BIGSERIAL id).
 *
 *   holder_metrics, snapshot_daily - carry time-derived fields
 *     (holding_duration_days, sentence_served_days) that tick up every day
 *     even with zero new events, so they genuinely must be written daily.
 *     They upsert on their existing primary keys instead of DELETE+INSERT,
 *     which halves the row-write count and removes the index churn from the
 *     delete. holder_metrics is then pruned by `updated_at` to drop addresses
 *     that fell out of the snapshot (a newly-excluded label, for instance).
 *     snapshot_daily needs no prune: dates only ever accumulate.
 */
export async function persistSnapshot(sql: Sql, snap: AssetSnapshot): Promise<void> {
  const { asset, asOf } = snap;
  const stamp = asOf.toISOString();

  const balanceCols = ["asset", "address", "balance", "token_count", "first_acquired_at", "last_activity_at", "is_current_holder"];
  const balanceRows = snap.balances.map((b) => [
    asset, b.address, b.balance.toString(), b.tokenCount,
    b.firstAcquiredAt?.toISOString() ?? null, b.lastActivityAt?.toISOString() ?? null, b.isCurrentHolder,
  ]);

  const lotCols = ["asset", "address", "token_id", "acquired_at", "acquired_block", "quantity_remaining"];
  const lotRows = snap.lots.map((l) => [
    asset, l.address, l.tokenId, l.acquiredAt.toISOString(), l.acquiredBlock, l.quantityRemaining.toString(),
  ]);

  const metricCols = ["asset", "address", "holding_duration_days", "weighted_duration_days", "diamond_bucket", "ever_paper_sold", "never_sold", "sell_count", "pct_original_held", "peak_sell_rate", "episode_count", "rebuild_target", "rebuild_held", "sentence_served_days", "sentence_required_days", "updated_at"];
  const metricRows = snap.metrics.map((m) => [
    asset, m.address, m.holdingDurationDays, m.weightedDurationDays, m.diamondBucket,
    m.everPaperSold, m.neverSold, m.sellCount, m.pctOriginalHeld,
    m.peakSellRate, m.episodeCount, m.rebuildTarget, m.rebuildHeld,
    m.sentenceServedDays, m.sentenceRequiredDays, stamp,
  ]);

  const dailyCols = ["asset", "date", "holder_count", "gini", "top10_pct", "whale_count", "new_holders", "exited_holders", "supply_held"];
  const dailyRows = snap.daily.map((d) => [
    asset, d.date, d.holderCount, d.gini, d.top10Pct, d.whaleCount, d.newHolders, d.exitedHolders, d.supplyHeld.toString(),
  ]);

  const prior = await readFingerprints(sql, asset);

  // ── holder_balances: event-derived, skippable ────────────────────────
  const balanceFp = fingerprint(balanceRows);
  if (balanceFp !== prior.get("holder_balances")) {
    await sql`DELETE FROM holder_balances WHERE asset = ${asset}`;
    await insertMany(sql, "holder_balances", balanceCols, balanceRows);
    await setMeta(sql, fpKey(asset, "holder_balances"), balanceFp);
  }

  // ── holder_lots: event-derived, skippable. The 12.3M-write table. ────
  const lotFp = fingerprint(lotRows);
  if (lotFp !== prior.get("holder_lots")) {
    await sql`DELETE FROM holder_lots WHERE asset = ${asset}`;
    await insertMany(sql, "holder_lots", lotCols, lotRows);
    await setMeta(sql, fpKey(asset, "holder_lots"), lotFp);
  }

  // ── holder_metrics: time-derived, upsert then prune ──────────────────
  await insertMany(sql, "holder_metrics", metricCols, metricRows, {
    conflict: upsertAll(["asset", "address"], metricCols),
  });
  // Anything not touched by the upsert above is no longer in the snapshot.
  // Guarded on rows existing: an empty snapshot must not wipe the table on
  // the back of a failed compute.
  if (metricRows.length > 0) {
    await sql`DELETE FROM holder_metrics WHERE asset = ${asset} AND updated_at < ${stamp}`;
  }

  // ── snapshot_daily: upsert only rows whose values actually moved ─────
  // Historical dates are immutable once computed, so the IS DISTINCT FROM
  // guard turns ~1,300 daily row rewrites into roughly one.
  await insertMany(sql, "snapshot_daily", dailyCols, dailyRows, {
    conflict:
      upsertAll(["asset", "date"], dailyCols) +
      " WHERE snapshot_daily IS DISTINCT FROM EXCLUDED",
  });
}

/** Read this asset's stored table fingerprints in one round trip. */
async function readFingerprints(sql: Sql, asset: Asset): Promise<Map<string, string>> {
  const rows = await sql`
    SELECT key, value FROM meta WHERE key LIKE ${`${FP_PREFIX}:${asset}:%`}
  `;
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(String(r.key).split(":").pop() as string, r.value as string);
  }
  return m;
}

async function setMeta(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

/**
 * Full rebuild across all assets. `asOf` defaults to now; pass a fixed date for
 * reproducible runs. Badge derivation (U14) is invoked as the final step.
 */
export async function rebuild(sql: Sql, asOf: Date = new Date()): Promise<void> {
  const labels = await loadLabelsFromDb(sql);
  for (const asset of ASSETS) {
    const events = await readEvents(sql, asset);
    const snap = computeAssetSnapshot(asset, events, labels, asOf);
    await persistSnapshot(sql, snap);
  }
  // Badge derivation reads only derived tables (U14).
  const { deriveBadges } = await import("@/lib/badges/derive");
  await deriveBadges(sql);
  // Ronke Score derivation reads only derived tables (S-series), after badges.
  const { deriveScores } = await import("@/lib/score/derive");
  await deriveScores(sql);
  await setMeta(sql, "last_rebuild_at", asOf.toISOString());
}
