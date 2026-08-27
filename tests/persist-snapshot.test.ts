/**
 * persistSnapshot write-behaviour tests (2026-08-27, perf/neon-compute-cost).
 *
 * This function had no coverage at all before this file, which is how it went
 * unnoticed that it rewrote every derived table from scratch every night:
 * 20.8M lifetime row inserts against 20.5M deletes to maintain ~296k live rows.
 *
 * These tests pin the property that actually controls the Neon bill - a run
 * that would write byte-identical rows must issue no writes - and the property
 * that keeps KTD-3 honest, which is that anything time-derived is still written
 * every single run.
 */

import { describe, it, expect } from "vitest";
import { persistSnapshot, type AssetSnapshot } from "@/lib/analytics/rebuild";
import type { Sql } from "@/db/client";

/**
 * Records every statement issued. Tagged-template calls arrive through the
 * function itself; insertMany goes through `.query(text, params)`.
 */
function recordingDb() {
  const stmts: string[] = [];
  const meta = new Map<string, string>();

  const sql = ((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const text = strings.join("?");
    stmts.push(text.replace(/\s+/g, " ").trim());
    if (text.includes("INSERT INTO meta")) {
      meta.set(String(vals[0]), String(vals[1]));
      return Promise.resolve([]);
    }
    if (text.includes("FROM meta WHERE key LIKE")) {
      const like = String(vals[0]).replace("%", "");
      const out = [...meta.entries()]
        .filter(([k]) => k.startsWith(like))
        .map(([key, value]) => ({ key, value }));
      return Promise.resolve(out);
    }
    return Promise.resolve([]);
  }) as unknown as Sql;

  (sql as unknown as { query: (t: string, p: unknown[]) => Promise<unknown[]> }).query = (
    text: string,
  ) => {
    stmts.push(text.replace(/\s+/g, " ").trim());
    return Promise.resolve([]);
  };

  return { sql, stmts, meta };
}

function snapshot(overrides: Partial<AssetSnapshot> = {}): AssetSnapshot {
  return {
    asset: "ronke_nft",
    asOf: new Date("2026-08-27T07:00:00Z"),
    balances: [
      {
        asset: "ronke_nft", address: "0xaaa", balance: 1n, tokenCount: 1,
        firstAcquiredAt: new Date("2026-01-01T00:00:00Z"),
        lastActivityAt: new Date("2026-01-01T00:00:00Z"), isCurrentHolder: true,
      },
    ],
    lots: [
      {
        asset: "ronke_nft", address: "0xaaa", tokenId: "1",
        acquiredAt: new Date("2026-01-01T00:00:00Z"), acquiredBlock: 100,
        quantityRemaining: 1n,
      },
    ],
    metrics: [
      {
        asset: "ronke_nft", address: "0xaaa", holdingDurationDays: 239,
        weightedDurationDays: 239, diamondBucket: "diamond", everPaperSold: false,
        neverSold: true, sellCount: 0, pctOriginalHeld: 1, peakSellRate: 0,
        episodeCount: 0, rebuildTarget: 0, rebuildHeld: 0,
        sentenceServedDays: 0, sentenceRequiredDays: 0,
      },
    ],
    daily: [],
    concentration: { gini: 0, top10Pct: 0, whaleCount: 0 },
    ...overrides,
  } as AssetSnapshot;
}

const wrote = (stmts: string[], table: string) =>
  stmts.filter((s) => s.includes(`DELETE FROM ${table}`) || s.includes(`INSERT INTO ${table}`));

describe("persistSnapshot write behaviour", () => {
  it("writes lots and balances on the first run and stores their fingerprints", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot());

    expect(wrote(db.stmts, "holder_lots").length).toBeGreaterThan(0);
    expect(wrote(db.stmts, "holder_balances").length).toBeGreaterThan(0);
    expect([...db.meta.keys()]).toEqual(
      expect.arrayContaining([
        "snapshot_fp:ronke_nft:holder_lots",
        "snapshot_fp:ronke_nft:holder_balances",
      ]),
    );
  });

  it("skips lots and balances entirely when the rows are unchanged", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot());
    db.stmts.length = 0; // second run, same events

    await persistSnapshot(db.sql, snapshot());

    expect(wrote(db.stmts, "holder_lots")).toEqual([]);
    expect(wrote(db.stmts, "holder_balances")).toEqual([]);
  });

  it("still writes holder_metrics on an unchanged run, because it is time-derived", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot());
    db.stmts.length = 0;

    await persistSnapshot(db.sql, snapshot());

    const m = wrote(db.stmts, "holder_metrics");
    expect(m.length).toBeGreaterThan(0);
    expect(m.some((s) => s.includes("ON CONFLICT (asset,address) DO UPDATE"))).toBe(true);
  });

  it("upserts holder_metrics rather than deleting and re-inserting it", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot());

    // The only DELETE against holder_metrics is the generation prune, which is
    // bounded by updated_at - never an unconditional wipe of the asset.
    const deletes = db.stmts.filter((s) => s.includes("DELETE FROM holder_metrics"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain("updated_at <");
  });

  it("writes lots again once the underlying rows actually change", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot());
    db.stmts.length = 0;

    const moved = snapshot();
    moved.lots[0].address = "0xbbb"; // a transfer happened
    await persistSnapshot(db.sql, moved);

    expect(wrote(db.stmts, "holder_lots").length).toBeGreaterThan(0);
  });

  it("does not prune holder_metrics when the snapshot computed no rows", async () => {
    const db = recordingDb();
    await persistSnapshot(db.sql, snapshot({ metrics: [] }));

    // A failed or empty compute must not be able to empty the table.
    expect(db.stmts.filter((s) => s.includes("DELETE FROM holder_metrics"))).toEqual([]);
  });
});
