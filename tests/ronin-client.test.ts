import { describe, it, expect } from "vitest";
import {
  MoralisProvider,
  MoralisCuError,
  MoralisAuthError,
  normalizeTransfer,
} from "@/lib/ronin/moralis";
import { BlockscoutProvider } from "@/lib/ronin/blockscout";
import { RoninDataClient } from "@/lib/ronin/client";
import { contractFor, ZERO_ADDRESS, DEAD_ADDRESS } from "@/config/contracts";
import type { FetchImpl } from "@/lib/ronin/moralis";

const RONKE = contractFor("ronke_token");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a fake fetch that serves cursor-paginated pages by URL cursor param. */
function pagedFetch(pages: Record<string, unknown>): FetchImpl {
  return (async (input: string) => {
    const url = new URL(String(input));
    const cursor = url.searchParams.get("cursor") ?? "start";
    return jsonResponse(pages[cursor]);
  }) as unknown as FetchImpl;
}

const erc20Row = (over: Record<string, unknown> = {}) => ({
  transaction_hash: "0xAA",
  log_index: 1,
  block_number: 42000000,
  block_timestamp: "2025-02-01T00:00:00.000Z",
  from_address: "0xSENDER",
  to_address: "0xRECEIVER",
  value: "1000000000000000000",
  possible_spam: false,
  ...over,
});

describe("MoralisProvider.fetchTransfers", () => {
  it("follows the cursor until exhausted and yields every row once", async () => {
    const fetchImpl = pagedFetch({
      start: {
        result: [
          erc20Row({ transaction_hash: "0x1", log_index: 0 }),
          erc20Row({ transaction_hash: "0x1", log_index: 1 }),
        ],
        cursor: "page2",
      },
      page2: {
        result: [erc20Row({ transaction_hash: "0x2", log_index: 0 })],
        cursor: null,
      },
    });
    const p = new MoralisProvider({ apiKey: "k", fetchImpl, rateDelayMs: 0 });
    const out = [];
    for await (const t of p.fetchTransfers(RONKE)) out.push(t);
    expect(out).toHaveLength(3);
    expect(out.map((t) => `${t.txHash}:${t.logIndex}`)).toEqual([
      "0x1:0",
      "0x1:1",
      "0x2:0",
    ]);
  });

  it("surfaces a CU-budget 401 distinct from a bad-key 401", async () => {
    const cuFetch = (async () =>
      jsonResponse({ message: "Total included usage exceeded" }, 401)) as unknown as FetchImpl;
    const pCu = new MoralisProvider({ apiKey: "k", fetchImpl: cuFetch, rateDelayMs: 0 });
    await expect(async () => {
      for await (const _ of pCu.fetchTransfers(RONKE)) void _;
    }).rejects.toBeInstanceOf(MoralisCuError);

    const badFetch = (async () =>
      jsonResponse({ message: "Token is invalid format" }, 401)) as unknown as FetchImpl;
    const pBad = new MoralisProvider({ apiKey: "k", fetchImpl: badFetch, rateDelayMs: 0 });
    await expect(async () => {
      for await (const _ of pBad.fetchTransfers(RONKE)) void _;
    }).rejects.toBeInstanceOf(MoralisAuthError);
  });

  it("filters spam and zero-value legs", async () => {
    const fetchImpl = pagedFetch({
      start: {
        result: [
          erc20Row({ transaction_hash: "0xok", value: "5" }),
          erc20Row({ transaction_hash: "0xspam", possible_spam: true }),
          erc20Row({ transaction_hash: "0xzero", value: "0" }),
        ],
        cursor: null,
      },
    });
    const p = new MoralisProvider({ apiKey: "k", fetchImpl, rateDelayMs: 0 });
    const out = [];
    for await (const t of p.fetchTransfers(RONKE)) out.push(t);
    expect(out).toHaveLength(1);
    expect(out[0].txHash).toBe("0xok");
  });
});

describe("normalizeTransfer", () => {
  it("flags mint (from == zero) and burn (to == dead)", () => {
    const mint = normalizeTransfer("ronke_token", "erc20", {
      ...erc20Row(),
      from_address: ZERO_ADDRESS,
    })!;
    expect(mint.isMint).toBe(true);
    expect(mint.isBurn).toBe(false);

    const burn = normalizeTransfer("ronke_token", "erc20", {
      ...erc20Row(),
      to_address: DEAD_ADDRESS,
    })!;
    expect(burn.isBurn).toBe(true);
    expect(burn.from).toBe("0xsender"); // lowercased
  });

  it("drops ERC-1155 rows from an ERC-721 asset", () => {
    const row = normalizeTransfer("ronkeverse_nft", "erc721", {
      transaction_hash: "0x1",
      log_index: 0,
      block_number: 1,
      block_timestamp: "2025-02-01T00:00:00.000Z",
      from_address: "0xa",
      to_address: "0xb",
      token_id: "5",
      amount: "1",
      contract_type: "ERC1155",
    });
    expect(row).toBeNull();
  });

  it("carries token_id and quantity 1 for an ERC-721 transfer", () => {
    const row = normalizeTransfer("ronkeverse_nft", "erc721", {
      transaction_hash: "0x1",
      log_index: 0,
      block_number: 1,
      block_timestamp: "2025-02-01T00:00:00.000Z",
      from_address: "0xA",
      to_address: "0xB",
      token_id: "4430",
      amount: "1",
      contract_type: "ERC721",
    })!;
    expect(row.tokenId).toBe("4430");
    expect(row.quantity).toBe(1n);
  });
});

describe("RoninDataClient dedup", () => {
  it("dedupes duplicate (txHash, logIndex) across pages", async () => {
    const fetchImpl = pagedFetch({
      start: {
        result: [erc20Row({ transaction_hash: "0xd", log_index: 3 })],
        cursor: "p2",
      },
      p2: {
        result: [erc20Row({ transaction_hash: "0xd", log_index: 3 })],
        cursor: null,
      },
    });
    const moralis = new MoralisProvider({ apiKey: "k", fetchImpl, rateDelayMs: 0 });
    const client = new RoninDataClient({ moralis });
    const out = [];
    for await (const t of client.fetchTransfers("ronke_token")) out.push(t);
    expect(out).toHaveLength(1);
  });
});

describe("BlockscoutProvider fallback", () => {
  it("returns holder rows in the normalized OwnerRow shape", async () => {
    let page = 0;
    const fetchImpl = (async () => {
      page += 1;
      if (page === 1) {
        return jsonResponse({
          result: [
            { address: "0xHOLDER1", value: "100" },
            { address: "0xHOLDER2", value: "50" },
          ],
        });
      }
      return jsonResponse({ result: [] });
    }) as unknown as FetchImpl;
    const bs = new BlockscoutProvider({ fetchImpl });
    const rows = [];
    for await (const r of bs.fetchOwners(RONKE)) rows.push(r);
    expect(rows).toEqual([
      { address: "0xholder1", balance: 100n, tokenCount: undefined },
      { address: "0xholder2", balance: 50n, tokenCount: undefined },
    ]);
  });
});
