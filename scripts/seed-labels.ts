/**
 * Seed address_labels with the curated known-Ronin-infra starter set (U9).
 *
 * Idempotent: upserts on the address PK so re-running does not duplicate. Labels
 * are also editable directly in the DB in v1 (a full admin UI is deferred).
 *
 * Curation gap (R4): largely closed 2026-08-23. The high-fan-out unlabeled
 * counterparties were triaged against the Ronin explorer (is_contract) and
 * against our own transfer_events (same-transaction pass-through, and, for the
 * NFT side, what share of deposits return to the depositing wallet). See the
 * dated block at the end of SEED_LABELS for the evidence behind each entry.
 *
 * What is still NOT labeled, on purpose:
 *  - Plain wallets. High fan-out is not evidence of infrastructure; the busiest
 *    unlabeled addresses in this dataset are ordinary active traders.
 *  - EIP-7702 delegated EOAs. They report is_contract = true but are people.
 *  - Centralised exchange deposit addresses. No tag source available on Ronin
 *    today, and guessing would wrongly forgive or punish real sales.
 *  - Three token-side contracts whose purpose could not be established:
 *    0x14bb374e, 0xf0107aa0, 0x5078cb39. They are neither clean pass-throughs
 *    nor clean sinks. Left at the unlabeled default (counts as a sell).
 */

import { requireSql } from "@/db/client";
import { SEED_LABELS } from "@/lib/analytics/labels";

export async function seedLabels(): Promise<number> {
  const sql = requireSql();
  for (const l of SEED_LABELS) {
    await sql`
      INSERT INTO address_labels
        (address, label, category, exclude_from_holders, counts_as_sell, note)
      VALUES
        (${l.address.toLowerCase()}, ${l.label}, ${l.category},
         ${l.excludeFromHolders}, ${l.countsAsSell}, ${l.note ?? null})
      ON CONFLICT (address) DO UPDATE SET
        label = EXCLUDED.label,
        category = EXCLUDED.category,
        exclude_from_holders = EXCLUDED.exclude_from_holders,
        counts_as_sell = EXCLUDED.counts_as_sell,
        note = EXCLUDED.note,
        updated_at = now()
    `;
  }
  return SEED_LABELS.length;
}

/** Load all labels from the DB into a plain array (used by rebuild). */
export async function loadLabels() {
  const sql = requireSql();
  const rows = await sql`
    SELECT address, label, category, exclude_from_holders, counts_as_sell, note
    FROM address_labels
  `;
  return rows.map((r) => ({
    address: r.address as string,
    label: r.label as string,
    category: r.category,
    excludeFromHolders: r.exclude_from_holders as boolean,
    countsAsSell: r.counts_as_sell as boolean,
    note: r.note as string | undefined,
  }));
}

if (process.argv[1]?.endsWith("seed-labels.ts")) {
  seedLabels()
    .then((n) => {
      console.log(`Seeded/updated ${n} address labels.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
