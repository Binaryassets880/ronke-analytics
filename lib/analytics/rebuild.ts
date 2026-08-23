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

/** Persist one asset's snapshot: replace the derived rows for that asset. */
export async function persistSnapshot(sql: Sql, snap: AssetSnapshot): Promise<void> {
  const { asset } = snap;
  // Derived tables are fully rebuildable: clear this asset then re-insert
  // (batched multi-row inserts - per-row HTTP round-trips are far too slow at
  // this row count).
  await sql`DELETE FROM holder_balances WHERE asset = ${asset}`;
  await sql`DELETE FROM holder_lots WHERE asset = ${asset}`;
  await sql`DELETE FROM holder_metrics WHERE asset = ${asset}`;
  await sql`DELETE FROM snapshot_daily WHERE asset = ${asset}`;

  await insertMany(
    sql,
    "holder_balances",
    ["asset", "address", "balance", "token_count", "first_acquired_at", "last_activity_at", "is_current_holder"],
    snap.balances.map((b) => [
      asset, b.address, b.balance.toString(), b.tokenCount,
      b.firstAcquiredAt?.toISOString() ?? null, b.lastActivityAt?.toISOString() ?? null, b.isCurrentHolder,
    ]),
  );
  await insertMany(
    sql,
    "holder_lots",
    ["asset", "address", "token_id", "acquired_at", "acquired_block", "quantity_remaining"],
    snap.lots.map((l) => [
      asset, l.address, l.tokenId, l.acquiredAt.toISOString(), l.acquiredBlock, l.quantityRemaining.toString(),
    ]),
  );
  await insertMany(
    sql,
    "holder_metrics",
    ["asset", "address", "holding_duration_days", "weighted_duration_days", "diamond_bucket", "ever_paper_sold", "never_sold", "sell_count", "pct_original_held", "peak_sell_rate", "episode_count", "rebuild_target", "rebuild_held", "sentence_served_days", "sentence_required_days"],
    snap.metrics.map((m) => [
      asset, m.address, m.holdingDurationDays, m.weightedDurationDays, m.diamondBucket,
      m.everPaperSold, m.neverSold, m.sellCount, m.pctOriginalHeld,
      m.peakSellRate, m.episodeCount, m.rebuildTarget, m.rebuildHeld,
      m.sentenceServedDays, m.sentenceRequiredDays,
    ]),
  );
  await insertMany(
    sql,
    "snapshot_daily",
    ["asset", "date", "holder_count", "gini", "top10_pct", "whale_count", "new_holders", "exited_holders", "supply_held"],
    snap.daily.map((d) => [
      asset, d.date, d.holderCount, d.gini, d.top10Pct, d.whaleCount, d.newHolders, d.exitedHolders, d.supplyHeld.toString(),
    ]),
  );
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
