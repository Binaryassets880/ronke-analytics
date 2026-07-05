import { describe, it, expect } from "vitest";
import { GoldRushProvider, decodeTransferLog, TRANSFER_TOPIC } from "@/lib/ronin/goldrush";
import { contractFor, ZERO_ADDRESS } from "@/config/contracts";
import type { FetchImpl } from "@/lib/ronin/moralis";

const RONKE = contractFor("ronke_token");
const RVERSE = contractFor("ronkeverse_nft");
const addrTopic = (a: string) => "0x" + a.replace(/^0x/, "").padStart(64, "0");
const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const erc20Log = (over: Record<string, unknown> = {}) => ({
  block_height: 42800117,
  block_signed_at: "2025-02-22T19:25:12Z",
  tx_hash: "0xAA",
  log_offset: 49,
  raw_log_topics: [TRANSFER_TOPIC, addrTopic("0x1111"), addrTopic("0x2222")],
  raw_log_data: "0x00000000000000000000000000000000000000000000000000000000000003e8", // 1000
  ...over,
});

describe("decodeTransferLog", () => {
  it("decodes an ERC-20 Transfer from raw topics + data", () => {
    const t = decodeTransferLog(RONKE, erc20Log())!;
    expect(t).toMatchObject({
      txHash: "0xaa",
      logIndex: 49,
      blockNumber: 42800117,
      from: "0x0000000000000000000000000000000000001111",
      to: "0x0000000000000000000000000000000000002222",
      tokenId: null,
      quantity: 1000n,
    });
    expect(t.blockTime.toISOString()).toBe("2025-02-22T19:25:12.000Z");
  });

  it("decodes an ERC-721 Transfer with the indexed tokenId topic", () => {
    const t = decodeTransferLog(RVERSE, {
      block_height: 42878820,
      block_signed_at: "2025-02-25T13:00:34Z",
      tx_hash: "0xBB",
      log_offset: 46,
      raw_log_topics: [
        TRANSFER_TOPIC,
        addrTopic(ZERO_ADDRESS),
        addrTopic("0x4dbb"),
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      raw_log_data: "0x",
    })!;
    expect(t.tokenId).toBe("1");
    expect(t.quantity).toBe(1n);
    expect(t.isMint).toBe(true); // from == zero
  });

  it("drops non-Transfer logs (e.g. Approval) and zero-value ERC-20 legs", () => {
    expect(decodeTransferLog(RONKE, erc20Log({ raw_log_topics: [APPROVAL, addrTopic("0x1"), addrTopic("0x2")] }))).toBeNull();
    expect(decodeTransferLog(RONKE, erc20Log({ raw_log_data: "0x0" }))).toBeNull();
  });
});

describe("GoldRushProvider.fetchTransfers pagination + filtering", () => {
  it("paginates page-number until has_more is false and filters to Transfers", async () => {
    const pages = [
      {
        data: {
          items: [
            erc20Log({ tx_hash: "0x1" }),
            erc20Log({ tx_hash: "0xapp", raw_log_topics: [APPROVAL, addrTopic("0x1"), addrTopic("0x2")] }),
          ],
          pagination: { has_more: true },
        },
      },
      { data: { items: [erc20Log({ tx_hash: "0x2" })], pagination: { has_more: false } } },
    ];
    let call = 0;
    const fetchImpl = (async () => json(pages[call++])) as unknown as FetchImpl;
    const gr = new GoldRushProvider({ apiKey: "k", fetchImpl, rateDelayMs: 0 });
    const out = [];
    for await (const t of gr.fetchTransfers(RONKE, 42000000, 43000000)) out.push(t.txHash);
    expect(out).toEqual(["0x1", "0x2"]); // approval filtered out
  });
});
