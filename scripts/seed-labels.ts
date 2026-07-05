/**
 * Seed address_labels with the curated known-Ronin-infra starter set (U9).
 *
 * Idempotent: upserts on the address PK so re-running does not duplicate. Labels
 * are also editable directly in the DB in v1 (a full admin UI is deferred).
 *
 * Curation gap (R4): Ronkeverse-specific staking / game-internal contracts are
 * NOT in the seed (their addresses were not confidently identified). Until they
 * are added here or via DB edit, transfers to them are conservatively counted as
 * sells, which UNDERSTATES diamond hands. Triage the "unlabeled high-frequency
 * counterparties" once backfill lands and add them.
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
