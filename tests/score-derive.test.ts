import { describe, it, expect } from "vitest";
import type { Sql } from "@/db/client";
import { assembleScoreInputs } from "@/lib/score/derive";

/**
 * Purpose-built fake `sql` for assembleScoreInputs (U5). Matches the specific
 * SELECTs the assembler issues by distinctive substrings and returns fixture
 * rows shaped like Neon. Keeps the RonkeStr assembly honest without a live DB.
 */
function makeScoreFakeDb(fixtures: {
  ronkeBalances?: { address: string; balance: string }[];
  ronkestrBalances?: { address: string; balance: string }[];
  metrics?: {
    asset: string;
    address: string;
    weighted_duration_days: number;
    never_sold: boolean;
    ever_paper_sold: boolean;
  }[];
}): Sql {
  return ((strings: TemplateStringsArray) => {
    const text = strings.join("§");
    if (text.includes("FROM token_rarity")) return Promise.resolve([{ n: 0 }]);
    if (text.includes("FROM nft_traits")) return Promise.resolve([{ n: 0 }]);
    if (text.includes("'ronke_token'") && text.includes("holder_balances"))
      return Promise.resolve(fixtures.ronkeBalances ?? []);
    if (text.includes("'ronkestr_token'") && text.includes("holder_balances"))
      return Promise.resolve(fixtures.ronkestrBalances ?? []);
    if (text.includes("FROM holder_metrics")) return Promise.resolve(fixtures.metrics ?? []);
    return Promise.resolve([]);
  }) as unknown as Sql;
}

const WHOLE = (n: number) => (BigInt(n) * 10n ** 18n).toString();

describe("assembleScoreInputs (RonkeStr)", () => {
  it("maps RonkeStr balances to ronkestrBalanceWhole with 18-decimal scaling", async () => {
    const sql = makeScoreFakeDb({
      ronkestrBalances: [{ address: "0xaaa", balance: WHOLE(5_000) }],
    });
    const map = await assembleScoreInputs(sql);
    expect(map.get("0xaaa")?.ronkestrBalanceWhole).toBe(5_000);
    // A non-holder never appears in the RonkeStr balance map.
    expect(map.get("0xbbb")).toBeUndefined();
  });

  it("routes holder_metrics three ways with no cross-contamination", async () => {
    const sql = makeScoreFakeDb({
      metrics: [
        { asset: "ronke_token", address: "0xw", weighted_duration_days: 10, never_sold: true, ever_paper_sold: false },
        { asset: "ronkestr_token", address: "0xw", weighted_duration_days: 20, never_sold: false, ever_paper_sold: true },
        { asset: "ronkeverse_nft", address: "0xw", weighted_duration_days: 30, never_sold: true, ever_paper_sold: false },
      ],
    });
    const map = await assembleScoreInputs(sql);
    const w = map.get("0xw")!;
    expect(w.ronkeHold?.durationDays).toBe(10);
    expect(w.ronkestrHold?.durationDays).toBe(20);
    expect(w.ronkestrHold?.everPaperSold).toBe(true);
    expect(w.nftHold?.durationDays).toBe(30);
  });

  it("leaves ronkestrHold null for a wallet with no RonkeStr metrics", async () => {
    const sql = makeScoreFakeDb({
      metrics: [
        { asset: "ronke_token", address: "0xr", weighted_duration_days: 42, never_sold: true, ever_paper_sold: false },
      ],
    });
    const map = await assembleScoreInputs(sql);
    expect(map.get("0xr")?.ronkestrHold).toBeNull();
    expect(map.get("0xr")?.ronkestrBalanceWhole).toBe(0);
  });
});
