import { describe, it, expect } from "vitest";
import { sync, syncAsset } from "@/scripts/sync";
import { makeFakeDb, makeFakeClient } from "./fakedb";
import { tx, day, ADDR } from "./helpers";

const ronke = (block: number, hash: string) =>
  tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 10n, blockNumber: block, txHash: hash, blockTime: day(1) });

describe("syncAsset", () => {
  it("appends only events past the cursor and advances it to the max block", async () => {
    const { sql, cursors } = makeFakeDb();
    cursors.set("ronke_token", 100);
    const client = makeFakeClient({
      ronke_token: [ronke(100, "0xold"), ronke(150, "0xa"), ronke(200, "0xb")],
    });
    const r = await syncAsset(sql, client, "ronke_token");
    expect(r.appended).toBe(2); // 150 and 200 only (100 == cursor, skipped)
    expect(cursors.get("ronke_token")).toBe(200);
  });

  it("re-running with no new activity appends zero and does not move the cursor back", async () => {
    const { sql, cursors } = makeFakeDb();
    const client = makeFakeClient({ ronke_token: [ronke(10, "0xa"), ronke(20, "0xb")] });
    await syncAsset(sql, client, "ronke_token");
    expect(cursors.get("ronke_token")).toBe(20);
    // second run: client still returns the same rows; cursor filters them out
    const r2 = await syncAsset(sql, client, "ronke_token");
    expect(r2.appended).toBe(0);
    expect(cursors.get("ronke_token")).toBe(20);
  });
});

describe("sync", () => {
  it("always calls rebuild() as the final step, even with zero appended", async () => {
    const { sql, cursors, meta } = makeFakeDb();
    cursors.set("ronke_token", 999);
    cursors.set("ronkeverse_nft", 999);
    const client = makeFakeClient({}); // nothing new
    let rebuilt = 0;
    const asOf = new Date("2026-07-05T00:00:00Z");
    const res = await sync(sql, client, {
      asOf,
      rebuildFn: async () => {
        rebuilt += 1;
      },
    });
    expect(res.appended).toBe(0);
    expect(rebuilt).toBe(1); // rebuild ran despite zero appends (footgun guard)
    expect(meta.get("last_sync_at")).toBe(asOf.toISOString());
  });

  it("appends across both assets then rebuilds once", async () => {
    const { sql } = makeFakeDb();
    const client = makeFakeClient({
      ronke_token: [ronke(5, "0xa")],
      ronkeverse_nft: [
        tx("ronkeverse_nft", { from: ADDR.zero, to: ADDR.wallet, tokenId: "1", blockNumber: 7, txHash: "0xn", blockTime: day(1) }),
      ],
    });
    let rebuilt = 0;
    const res = await sync(sql, client, { rebuildFn: async () => void (rebuilt += 1) });
    expect(res.appended).toBe(2);
    expect(rebuilt).toBe(1);
  });
});
