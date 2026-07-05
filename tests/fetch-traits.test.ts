import { describe, it, expect } from "vitest";
import { fetchTraits } from "@/scripts/fetch-traits";
import type { MoralisProvider, MoralisAttribute } from "@/lib/ronin/moralis";
import type { Sql } from "@/db/client";

/** A fake tagged-template sql that records every query, returns []. */
function fakeSql() {
  const calls: { text: string }[] = [];
  const sql = ((strings: TemplateStringsArray, ...vals: unknown[]) => {
    calls.push({ text: strings.join("?") });
    return Promise.resolve([] as unknown[]);
  }) as unknown as Sql;
  return { sql, calls };
}

/** A fake provider streaming a fixed set of tokens. */
function fakeProvider(
  tokens: { tokenId: string; attributes: MoralisAttribute[]; imageUrl: string | null }[],
): MoralisProvider {
  return {
    async *fetchCollectionMetadata() {
      for (const t of tokens) yield t;
    },
  } as unknown as MoralisProvider;
}

const attr = (trait_type: string, value: string): MoralisAttribute => ({
  trait_type,
  value,
  display_type: null,
});

describe("fetchTraits (U10)", () => {
  it("counts revealed supply and flags unrevealed tokens for resync", async () => {
    const { sql } = fakeSql();
    const provider = fakeProvider([
      { tokenId: "1", attributes: [attr("Background", "Pink"), attr("Body", "Ronke")], imageUrl: "ipfs://1" },
      { tokenId: "2", attributes: [attr("Background", "Blue")], imageUrl: "ipfs://2" },
      { tokenId: "3", attributes: [], imageUrl: null }, // unrevealed
    ]);
    const res = await fetchTraits(sql, provider, new Date("2026-07-05T00:00:00Z"));
    expect(res.revealedSupply).toBe(2);
    expect(res.unrevealed).toBe(1);
  });

  it("writes an nft_traits upsert for each normalized trait", async () => {
    const { sql, calls } = fakeSql();
    const provider = fakeProvider([
      { tokenId: "1", attributes: [attr("Background", "Pink"), attr("Body", "Ronke")], imageUrl: null },
    ]);
    await fetchTraits(sql, provider, new Date("2026-07-05T00:00:00Z"));
    const inserts = calls.filter((c) => c.text.includes("INSERT INTO nft_traits"));
    expect(inserts).toHaveLength(2);
    // meta + rarity persistence also ran
    expect(calls.some((c) => c.text.includes("token_rarity"))).toBe(true);
    expect(calls.some((c) => c.text.includes("revealed_supply") || c.text.includes("meta"))).toBe(true);
  });
});
