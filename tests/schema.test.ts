import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitStatements } from "@/db/migrate";

const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");

describe("db/schema.sql (static analysis)", () => {
  const statements = splitStatements(schema);

  it("splits into statements and drops comment-only chunks", () => {
    expect(statements.length).toBeGreaterThan(10);
    for (const s of statements) {
      // Every executable chunk must contain real SQL, not just comments.
      expect(s.toUpperCase()).toMatch(/CREATE|ALTER|INSERT/);
    }
  });

  it("makes every CREATE idempotent with IF NOT EXISTS", () => {
    const creates = statements.filter((s) => /^CREATE/i.test(s));
    for (const c of creates) {
      expect(c).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("enforces the append-idempotency unique key on transfer_events", () => {
    expect(schema).toMatch(
      /UNIQUE\s*\(\s*asset\s*,\s*tx_hash\s*,\s*log_index\s*\)/i,
    );
  });

  it("declares token_id nullable (no NOT NULL) in transfer_events", () => {
    const table = schema.slice(
      schema.indexOf("CREATE TABLE IF NOT EXISTS transfer_events"),
      schema.indexOf("CREATE INDEX IF NOT EXISTS transfer_events_asset_block"),
    );
    expect(table).toMatch(/token_id\s+TEXT\b/i);
    expect(table).not.toMatch(/token_id\s+TEXT\s+NOT NULL/i);
  });

  it("creates the required transfer_events lookup indexes", () => {
    for (const idx of [
      "transfer_events_asset_block_idx",
      "transfer_events_asset_from_idx",
      "transfer_events_asset_to_idx",
      "transfer_events_asset_token_idx",
    ]) {
      expect(schema).toContain(idx);
    }
  });

  it("defines every table in the data model", () => {
    for (const table of [
      "transfer_events",
      "sync_cursor",
      "address_labels",
      "holder_balances",
      "holder_lots",
      "holder_metrics",
      "snapshot_daily",
      "nft_traits",
      "trait_stats",
      "token_rarity",
      "wallet_badges",
      "meta",
    ]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });
});

// Live round-trip: only runs when a throwaway DATABASE_URL is present.
const hasDb = !!process.env.DATABASE_URL;
describe.skipIf(!hasDb)("db/migrate (live Neon)", () => {
  it("is idempotent (runs twice cleanly) and rejects duplicate events", async () => {
    const { migrate } = await import("@/db/migrate");
    const { requireSql } = await import("@/db/client");
    await migrate();
    await migrate(); // second run must not error
    const sql = requireSql();
    const ins = async () =>
      sql`INSERT INTO transfer_events
            (asset, tx_hash, log_index, block_number, block_time, from_address, to_address, quantity)
          VALUES ('ronke_token', '0xtest', 0, 1, now(), '0x1', '0x2', 1)
          ON CONFLICT DO NOTHING`;
    await ins();
    await ins(); // conflict -> no-op, no error
    const rows =
      await sql`SELECT count(*)::int AS n FROM transfer_events WHERE tx_hash = '0xtest'`;
    expect(rows[0].n).toBe(1);
    await sql`DELETE FROM transfer_events WHERE tx_hash = '0xtest'`;
  });
});
