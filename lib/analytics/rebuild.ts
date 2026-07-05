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

import type { Sql } from "@/db/client";
import type { Asset } from "@/config/contracts";
import { ASSETS } from "@/config/contracts";
import type { NormalizedTransfer } from "@/lib/types";
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
  events: NormalizedTransfer[],
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

/** Read all transfer_events for an asset in block order. */
export async function readEvents(sql: Sql, asset: Asset): Promise<NormalizedTransfer[]> {
  const rows = await sql`
    SELECT asset, tx_hash, log_index, block_number, block_time,
           from_address, to_address, token_id, quantity, is_mint, is_burn
    FROM transfer_events
    WHERE asset = ${asset}
    ORDER BY block_number ASC, log_index ASC
  `;
  return rows.map((r) => ({
    asset: r.asset as Asset,
    txHash: r.tx_hash as string,
    logIndex: Number(r.log_index),
    blockNumber: Number(r.block_number),
    blockTime: new Date(r.block_time as string),
    from: r.from_address as string,
    to: r.to_address as string,
    tokenId: (r.token_id as string | null) ?? null,
    quantity: BigInt(r.quantity as string),
    isMint: r.is_mint as boolean,
    isBurn: r.is_burn as boolean,
  }));
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
  // Derived tables are fully rebuildable: clear this asset then re-insert.
  await sql`DELETE FROM holder_balances WHERE asset = ${asset}`;
  await sql`DELETE FROM holder_lots WHERE asset = ${asset}`;
  await sql`DELETE FROM holder_metrics WHERE asset = ${asset}`;
  await sql`DELETE FROM snapshot_daily WHERE asset = ${asset}`;

  for (const b of snap.balances) {
    await sql`
      INSERT INTO holder_balances
        (asset, address, balance, token_count, first_acquired_at, last_activity_at, is_current_holder)
      VALUES (${asset}, ${b.address}, ${b.balance.toString()}, ${b.tokenCount},
              ${b.firstAcquiredAt?.toISOString() ?? null},
              ${b.lastActivityAt?.toISOString() ?? null}, ${b.isCurrentHolder})
    `;
  }
  for (const l of snap.lots) {
    await sql`
      INSERT INTO holder_lots
        (asset, address, token_id, acquired_at, acquired_block, quantity_remaining)
      VALUES (${asset}, ${l.address}, ${l.tokenId}, ${l.acquiredAt.toISOString()},
              ${l.acquiredBlock}, ${l.quantityRemaining.toString()})
    `;
  }
  for (const m of snap.metrics) {
    await sql`
      INSERT INTO holder_metrics
        (asset, address, holding_duration_days, weighted_duration_days,
         diamond_bucket, ever_paper_sold, never_sold, sell_count, pct_original_held)
      VALUES (${asset}, ${m.address}, ${m.holdingDurationDays}, ${m.weightedDurationDays},
              ${m.diamondBucket}, ${m.everPaperSold}, ${m.neverSold}, ${m.sellCount},
              ${m.pctOriginalHeld})
    `;
  }
  for (const d of snap.daily) {
    await sql`
      INSERT INTO snapshot_daily
        (asset, date, holder_count, gini, top10_pct, whale_count,
         new_holders, exited_holders, supply_held)
      VALUES (${asset}, ${d.date}, ${d.holderCount}, ${d.gini}, ${d.top10Pct},
              ${d.whaleCount}, ${d.newHolders}, ${d.exitedHolders}, ${d.supplyHeld.toString()})
    `;
  }
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
  await setMeta(sql, "last_rebuild_at", asOf.toISOString());
}
