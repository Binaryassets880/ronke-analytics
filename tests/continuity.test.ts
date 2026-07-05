import { describe, it, expect } from "vitest";
import { MoralisProvider, type FetchImpl } from "@/lib/ronin/moralis";
import { RoninDataClient } from "@/lib/ronin/client";
import { assertContinuity, ContinuityError } from "@/lib/ronin/continuity";
import { MIGRATION_BLOCK } from "@/config/contracts";

const PRE = { txHash: "0xpre", blockNumber: 42878820 }; // < MIGRATION_BLOCK (real fixture block)
const POST = { txHash: "0xpost", blockNumber: 57885401 }; // >= MIGRATION_BLOCK (real fixture block)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const nftRow = (hash: string, block: number) => ({
  transaction_hash: hash,
  log_index: 0,
  block_number: block,
  block_timestamp: "2025-02-25T00:00:00.000Z",
  from_address: "0xa",
  to_address: "0xb",
  token_id: "1",
  amount: "1",
  contract_type: "ERC721",
});

/**
 * Fake fetch keyed on paging ORDER (no block filters - Moralis 425s on those):
 * ASC pages from genesis yield the pre-migration tx; DESC pages from the tip
 * yield the post-migration tx.
 */
function continuityFetch(opts: { includePre: boolean }): FetchImpl {
  return (async (input: string) => {
    const url = new URL(String(input));
    const order = url.searchParams.get("order");
    if (order === "DESC") {
      return jsonResponse({ result: [nftRow(POST.txHash, POST.blockNumber)], cursor: null });
    }
    return jsonResponse({
      result: opts.includePre ? [nftRow(PRE.txHash, PRE.blockNumber)] : [],
      cursor: null,
    });
  }) as unknown as FetchImpl;
}

function clientWith(fetchImpl: FetchImpl): RoninDataClient {
  return new RoninDataClient({
    moralis: new MoralisProvider({ apiKey: "k", fetchImpl, rateDelayMs: 0 }),
  });
}

describe("assertContinuity", () => {
  it("passes when both the pre- and post-migration transfers return", async () => {
    const client = clientWith(continuityFetch({ includePre: true }));
    const res = await assertContinuity(client, "ronkeverse_nft", { pre: PRE, post: POST });
    expect(res).toEqual({ preFound: true, postFound: true });
  });

  it("raises (does not silently proceed) when pre-L2 history is missing", async () => {
    const client = clientWith(continuityFetch({ includePre: false }));
    await expect(
      assertContinuity(client, "ronkeverse_nft", { pre: PRE, post: POST }),
    ).rejects.toBeInstanceOf(ContinuityError);
  });

  it("rejects fixtures on the wrong side of MIGRATION_BLOCK", async () => {
    const client = clientWith(continuityFetch({ includePre: true }));
    await expect(
      assertContinuity(client, "ronkeverse_nft", {
        pre: { txHash: "0xbad", blockNumber: MIGRATION_BLOCK + 1 },
        post: POST,
      }),
    ).rejects.toBeInstanceOf(ContinuityError);
  });
});
