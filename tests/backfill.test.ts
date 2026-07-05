import { describe, it, expect } from "vitest";
import { backfill, backfillAsset } from "@/scripts/backfill";
import { RoninDataClient } from "@/lib/ronin/client";
import { MoralisProvider, type FetchImpl } from "@/lib/ronin/moralis";
import { makeFakeDb, makeFakeClient } from "./fakedb";
import { tx, day, ADDR } from "./helpers";
import { MIGRATION_BLOCK } from "@/config/contracts";

const nft = (block: number, hash: string, tokenId: string) =>
  tx("ronkeverse_nft", {
    from: ADDR.zero,
    to: ADDR.wallet,
    tokenId,
    blockNumber: block,
    txHash: hash,
    blockTime: day(1),
  });

describe("backfillAsset", () => {
  it("pulls the full range and produces a gapless sequence across MIGRATION_BLOCK", async () => {
    const { sql, cursors } = makeFakeDb();
    const client = makeFakeClient({
      ronkeverse_nft: [
        nft(MIGRATION_BLOCK - 100, "0xpre", "1"), // legacy era
        nft(MIGRATION_BLOCK, "0xat", "2"), // boundary
        nft(MIGRATION_BLOCK + 500, "0xpost", "3"), // L2 era
      ],
    });
    const r = await backfillAsset(sql, client, "ronkeverse_nft");
    expect(r.appended).toBe(3);
    expect(cursors.get("ronkeverse_nft")).toBe(MIGRATION_BLOCK + 500);
  });

  it("is resumable: interrupting then re-running does not duplicate events", async () => {
    const { sql, cursors, eventCount } = makeFakeDb();
    const dataset = {
      ronkeverse_nft: [nft(10, "0xa", "1"), nft(20, "0xb", "2"), nft(30, "0xc", "3")],
    };
    const client = makeFakeClient(dataset);
    await backfillAsset(sql, client, "ronkeverse_nft");
    const afterFirst = eventCount();
    expect(afterFirst).toBe(3);
    // Re-run from the advanced cursor: nothing new, no duplicates.
    await backfillAsset(sql, client, "ronkeverse_nft");
    expect(eventCount()).toBe(3);
    expect(cursors.get("ronkeverse_nft")).toBe(30);
  });
});

describe("backfill (continuity gate)", () => {
  it("raises when a known pre-migration transfer is missing from the source", async () => {
    const { sql } = makeFakeDb();
    // A Moralis-backed client whose fake fetch never returns the known pre tx.
    const emptyFetch = (async () =>
      new Response(JSON.stringify({ result: [], cursor: null }), { status: 200 })) as unknown as FetchImpl;
    const client = new RoninDataClient({
      moralis: new MoralisProvider({ apiKey: "k", fetchImpl: emptyFetch, rateDelayMs: 0 }),
    });
    await expect(
      backfill(sql, client, { rebuildFn: async () => {}, assertContinuityFor: ["ronkeverse_nft"] }),
    ).rejects.toThrow(/Continuity FAILED/);
  });

  it("runs the full backfill + rebuild when continuity is skipped/passing", async () => {
    const { sql, meta } = makeFakeDb();
    const client = makeFakeClient({
      ronke_token: [tx("ronke_token", { from: ADDR.external, to: ADDR.wallet, quantity: 5n, blockNumber: 3, txHash: "0xr", blockTime: day(1) })],
      ronkeverse_nft: [nft(4, "0xn", "1")],
    }) as unknown as RoninDataClient;
    let rebuilt = 0;
    const res = await backfill(sql, client, {
      rebuildFn: async () => void (rebuilt += 1),
      assertContinuityFor: [], // skip live assertion in this unit
    });
    expect(res.appended).toBe(2);
    expect(rebuilt).toBe(1);
    expect(meta.get("backfill_complete")).toBe("true");
  });
});
