import { describe, it, expect } from "vitest";
import { fetchTraits } from "@/scripts/fetch-traits";
import type { MoralisProvider, MoralisAttribute } from "@/lib/ronin/moralis";
import type { Sql } from "@/db/client";

/** Stateful fake sql: serves the token-id list, records nft_traits inserts, and
 *  reads them back so rarity + revealedSupply compute correctly. */
function fakeSql(tokenIds: string[]) {
  const nftTraits: { token_id: string; trait_type: string; value: string; display_type: string }[] = [];
  const calls: { text: string }[] = [];
  const handle = (text: string): unknown[] => {
    if (text.includes("FROM transfer_events")) return tokenIds.map((id) => ({ token_id: id }));
    if (text.includes("SELECT DISTINCT token_id FROM nft_traits"))
      return [...new Set(nftTraits.map((t) => t.token_id))].map((id) => ({ token_id: id }));
    if (text.includes("SELECT token_id, trait_type, value, display_type FROM nft_traits"))
      return nftTraits.map((t) => ({ ...t }));
    return [];
  };
  const fn = (strings: TemplateStringsArray, ..._v: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text });
    return Promise.resolve(handle(text));
  };
  (fn as unknown as { query: unknown }).query = (text: string, params: unknown[] = []) => {
    calls.push({ text });
    if (text.includes("INSERT INTO nft_traits")) {
      for (let i = 0; i < params.length; i += 5) {
        nftTraits.push({
          token_id: String(params[i]),
          trait_type: String(params[i + 1]),
          value: String(params[i + 2]),
          display_type: String(params[i + 3]),
        });
      }
    }
    return Promise.resolve([]);
  };
  return { sql: fn as unknown as Sql, calls, nftTraits };
}

function fakeProvider(byToken: Record<string, MoralisAttribute[]>): MoralisProvider {
  return {
    async fetchTokenMetadata(_c: unknown, tokenId: string) {
      return { tokenId, attributes: byToken[tokenId] ?? [], imageUrl: `ipfs://${tokenId}` };
    },
  } as unknown as MoralisProvider;
}

const attr = (trait_type: string, value: string): MoralisAttribute => ({ trait_type, value, display_type: null });

describe("fetchTraits (U10, per-token)", () => {
  it("fetches per token, counts revealed supply, flags unrevealed, persists rarity", async () => {
    const { sql, calls, nftTraits } = fakeSql(["1", "2", "3"]);
    const provider = fakeProvider({
      "1": [attr("Background", "Pink"), attr("Body", "Ronke")],
      "2": [attr("Background", "Blue")],
      "3": [], // unrevealed
    });
    const res = await fetchTraits(sql, provider, new Date("2026-07-05T00:00:00Z"));
    expect(res.revealedSupply).toBe(2); // tokens 1 and 2 have traits
    expect(res.unrevealed).toBe(1); // token 3
    expect(nftTraits).toHaveLength(3); // 2 + 1 trait rows
    expect(calls.some((c) => c.text.includes("token_rarity"))).toBe(true); // rarity persisted
    expect(calls.some((c) => c.text.includes("meta"))).toBe(true);
  });

  it("resumes: skips token_ids already present in nft_traits", async () => {
    const { sql, nftTraits } = fakeSql(["1", "2"]);
    // Pretend token 1 was already fetched in a prior run.
    nftTraits.push({ token_id: "1", trait_type: "Background", value: "Pink", display_type: "string" });
    let calledFor: string[] = [];
    const provider = {
      async fetchTokenMetadata(_c: unknown, tokenId: string) {
        calledFor.push(tokenId);
        return { tokenId, attributes: [attr("Body", "Ronke")], imageUrl: null };
      },
    } as unknown as MoralisProvider;
    await fetchTraits(sql, provider, new Date("2026-07-05T00:00:00Z"));
    expect(calledFor).toEqual(["2"]); // token 1 skipped (already done)
  });
});
