import { describe, it, expect } from "vitest";
import { BlockscoutProvider, normalizeBlockscoutTransfer } from "@/lib/ronin/blockscout";
import { RoninDataClient } from "@/lib/ronin/client";
import { contractFor, ZERO_ADDRESS } from "@/config/contracts";
import type { FetchImpl } from "@/lib/ronin/moralis";

const RONKE = contractFor("ronke_token");
const RVERSE = contractFor("ronkeverse_nft");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const erc20Item = (over: Record<string, unknown> = {}) => ({
  block_number: 42000000,
  timestamp: "2025-02-01T00:00:00.000000Z",
  transaction_hash: "0xAA",
  log_index: 3,
  from: { hash: "0xSENDER" },
  to: { hash: "0xRECEIVER" },
  token_type: "ERC-20",
  type: "token_transfer",
  total: { decimals: "18", value: "1000000000000000000" },
  ...over,
});

describe("normalizeBlockscoutTransfer", () => {
  it("maps an ERC-20 item to the normalized shape (lowercased, raw quantity)", () => {
    const t = normalizeBlockscoutTransfer("ronke_token", "erc20", erc20Item())!;
    expect(t).toMatchObject({
      txHash: "0xaa",
      logIndex: 3,
      blockNumber: 42000000,
      from: "0xsender",
      to: "0xreceiver",
      tokenId: null,
      quantity: 1000000000000000000n,
    });
    expect(t.blockTime.toISOString()).toBe("2025-02-01T00:00:00.000Z");
  });

  it("extracts token_id for ERC-721 and quantity 1", () => {
    const t = normalizeBlockscoutTransfer("ronkeverse_nft", "erc721", {
      block_number: 43000000,
      timestamp: "2025-03-01T00:00:00.000000Z",
      transaction_hash: "0xBB",
      log_index: 0,
      from: { hash: "0xA" },
      to: { hash: "0xB" },
      token_type: "ERC-721",
      total: { token_id: "4430" },
    })!;
    expect(t.tokenId).toBe("4430");
    expect(t.quantity).toBe(1n);
  });

  it("flags mint and drops zero-value ERC-20 legs", () => {
    const mint = normalizeBlockscoutTransfer("ronke_token", "erc20", erc20Item({ from: { hash: ZERO_ADDRESS } }))!;
    expect(mint.isMint).toBe(true);
    expect(normalizeBlockscoutTransfer("ronke_token", "erc20", erc20Item({ total: { value: "0" } }))).toBeNull();
  });
});

describe("BlockscoutProvider.fetchTransfers pagination", () => {
  it("follows next_page_params until exhausted", async () => {
    const fetchImpl = (async (input: string) => {
      const url = new URL(String(input));
      const idx = url.searchParams.get("index");
      if (!idx) {
        return json({ items: [erc20Item({ transaction_hash: "0x1" })], next_page_params: { index: 5, block_number: 41999999 } });
      }
      return json({ items: [erc20Item({ transaction_hash: "0x2" })], next_page_params: null });
    }) as unknown as FetchImpl;
    const bs = new BlockscoutProvider({ fetchImpl, rateDelayMs: 0 });
    const out = [];
    for await (const t of bs.fetchTransfers(RONKE)) out.push(t.txHash);
    expect(out).toEqual(["0x1", "0x2"]);
  });
});

describe("RoninDataClient with Blockscout source", () => {
  it("fetchNewTransfers stops once it reaches the cursor (DESC + early stop)", async () => {
    // DESC pages: blocks 300, 200, then 100 (<= cursor 150 -> stop before yielding 100)
    const pages = [
      { items: [erc20Item({ block_number: 300, transaction_hash: "0x300" })], next_page_params: { index: 1, block_number: 250 } },
      { items: [erc20Item({ block_number: 200, transaction_hash: "0x200" })], next_page_params: { index: 2, block_number: 150 } },
      { items: [erc20Item({ block_number: 100, transaction_hash: "0x100" })], next_page_params: null },
    ];
    let call = 0;
    const fetchImpl = (async () => json(pages[call++])) as unknown as FetchImpl;
    const client = new RoninDataClient({ blockscout: new BlockscoutProvider({ fetchImpl, rateDelayMs: 0 }) });
    const out = [];
    for await (const t of client.fetchNewTransfers("ronke_token", 150, "blockscout")) out.push(t.blockNumber);
    expect(out).toEqual([300, 200]); // 100 is <= 150, stream stops
  });
});
