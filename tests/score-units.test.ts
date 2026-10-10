import { describe, it, expect } from "vitest";
import type { Sql } from "@/db/client";
import { computeScore, type ScoreInput } from "@/lib/score/compute";
import { assembleScoreInputs } from "@/lib/score/derive";
import { readUnitHoldings, refreshUnitHoldings } from "@/lib/units/snapshot";
import { toPublicScore } from "@/lib/api/score-view";
import { SCORE_CONFIG as C } from "@/config/score";
import type { WalletScore } from "@/lib/queries";

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  ronkeBalanceWhole: 0,
  ronkeHold: null,
  ronkestrBalanceWhole: 0,
  ronkestrHold: null,
  nftRarityFactors: [],
  nftHold: null,
  bodyTypesHeld: 0,
  bodyTypesTotal: 10,
  oneOfOneCount: 0,
  ...over,
});

describe("units sub-score (computeScore)", () => {
  it("leaves a wallet without units exactly where it was", () => {
    const w = base({ ronkeBalanceWhole: 123_456, nftRarityFactors: [0.4, 0.7], bodyTypesHeld: 2 });
    const before = computeScore(w);
    const after = computeScore({ ...w, unitsCount: 0 });
    expect(after.score).toBe(before.score);
    expect(after.unitsSubscore).toBe(0);
    expect(after.score).toBe(after.ronkeSubscore + after.ronkestrSubscore + after.nftSubscore);
  });

  it("pays 25 * n^0.6 - the values the founder signed off on", () => {
    const pts = (n: number) => computeScore(base({ unitsCount: n })).unitsSubscore;
    expect(pts(1)).toBe(25);
    expect(pts(5)).toBe(66);
    expect(pts(20)).toBe(151);
    expect(pts(30)).toBe(192);
  });

  it("caps the counted units at maxCount", () => {
    const r = computeScore(base({ unitsCount: 80 }));
    expect(r.unitsSubscore).toBe(computeScore(base({ unitsCount: C.units.maxCount })).unitsSubscore);
    expect(r.breakdown.unitsCount).toBe(80);
    expect(r.breakdown.unitsCounted).toBe(C.units.maxCount);
  });

  it("adds the units on top of the other sub-scores, nothing else moves", () => {
    const w = base({ ronkeBalanceWhole: 1_000_000, nftRarityFactors: [0.9] });
    const a = computeScore(w), b = computeScore({ ...w, unitsCount: 7 });
    expect(b.score - a.score).toBe(b.unitsSubscore);
    expect(b.ronkeSubscore).toBe(a.ronkeSubscore);
    expect(b.nftSubscore).toBe(a.nftSubscore);
  });

  it("ignores junk counts", () => {
    expect(computeScore(base({ unitsCount: -3 })).unitsSubscore).toBe(0);
    expect(computeScore(base({ unitsCount: 2.9 })).breakdown.unitsCount).toBe(2);
  });
});

function fakeDb(units: { address: string; units_count: number; units_total?: number }[] | Error): Sql {
  return ((strings: TemplateStringsArray) => {
    const text = strings.join("§");
    if (text.includes("FROM unit_holdings")) return units instanceof Error ? Promise.reject(units) : Promise.resolve(units);
    if (text.includes("FROM token_rarity") || text.includes("FROM nft_traits")) return Promise.resolve([{ n: 0 }]);
    return Promise.resolve([]);
  }) as unknown as Sql;
}

describe("units holding bonus (computeScore)", () => {
  const hold = (n: number) => computeScore(base({ unitsTotal: n })).breakdown.unitsHoldPoints;

  it("starts at 100 units and pays the founder's option B", () => {
    expect(hold(99)).toBe(0);
    expect(hold(100)).toBe(30);
    expect(hold(200)).toBe(45);
    expect(hold(500)).toBe(79);
    expect(hold(1000)).toBe(119);
  });

  it("counts at most holdMaxCount units", () => {
    expect(hold(5000)).toBe(hold(C.units.holdMaxCount));
    expect(computeScore(base({ unitsTotal: 5000 })).breakdown.unitsHeld).toBe(5000);
  });

  it("stacks with the level-10 bonus inside the units sub-score", () => {
    const r = computeScore(base({ unitsCount: 21, unitsTotal: 740 }));
    expect(r.breakdown.unitsHoldPoints).toBe(Math.round(30 * Math.pow(7.4, 0.6)));
    expect(r.unitsSubscore).toBe(Math.round(25 * Math.pow(21, 0.6) + 30 * Math.pow(7.4, 0.6)));
    expect(r.score).toBe(r.unitsSubscore);
  });

  it("leaves level-10-only wallets exactly as before", () => {
    expect(computeScore(base({ unitsCount: 7, unitsTotal: 99 })).unitsSubscore).toBe(80);
  });
});

describe("assembleScoreInputs (units)", () => {
  it("brings a units-only wallet into the table", async () => {
    const map = await assembleScoreInputs(fakeDb([{ address: "0xunits", units_count: 4, units_total: 120 }]));
    expect(map.get("0xunits")?.unitsCount).toBe(4);
    expect(map.get("0xunits")?.unitsTotal).toBe(120);
    expect(computeScore(map.get("0xunits")!).score).toBe(Math.round(25 * Math.pow(4, 0.6) + 30 * Math.pow(1.2, 0.6)));
  });

  it("scores no units when the table is not there yet, instead of failing", async () => {
    const map = await assembleScoreInputs(fakeDb(new Error('relation "unit_holdings" does not exist')));
    expect(map.size).toBe(0);
  });

  it("does not swallow other database errors", async () => {
    await expect(assembleScoreInputs(fakeDb(new Error("connection reset")))).rejects.toThrow("connection reset");
  });
});

describe("refreshUnitHoldings", () => {
  const recorder = () => {
    const seen: string[] = [];
    const sql = Object.assign(
      ((strings: TemplateStringsArray) => { seen.push(strings.join("?")); return Promise.resolve([]); }) as unknown as Sql,
      { query: (q: string) => { seen.push(q); return Promise.resolve([]); } },
    );
    return { sql: sql as Sql, seen };
  };

  it("keeps yesterday's rows when the chain read fails", async () => {
    const { sql, seen } = recorder();
    const ok = await refreshUnitHoldings(sql, { read: () => Promise.reject(new Error("rpc down")) });
    expect(ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("replaces the rows after a good read", async () => {
    const { sql, seen } = recorder();
    const ok = await refreshUnitHoldings(sql, { read: () => Promise.resolve(new Map([["0xa", { unitsCount: 2, maxLevel: 12, unitsTotal: 150 }]])) });
    expect(ok).toBe(true);
    expect(seen[0]).toContain("INSERT INTO unit_holdings");
    expect(seen[0]).toContain("ON CONFLICT (address) DO UPDATE");
    expect(seen[0]).toContain("units_total");
    expect(seen[1]).toContain("DELETE FROM unit_holdings WHERE NOT");
  });
});

describe("readUnitHoldings", () => {
  // Five units: ids 1..5 at levels 3, 10, 40, 12, 9. #2, #3 and #5 belong to a player,
  // #4 sits in a marketplace contract, #1 is a small holder's only (low) unit.
  const levels: Record<string, number> = { "1": 3, "2": 10, "3": 40, "4": 12, "5": 9 };
  const owner: Record<string, string> = { "1": "0xsmall", "2": "0xPlayer", "3": "0xplayer", "4": "0xMarket", "5": "0xPLAYER" };
  const client = {
    readContract: async () => 5n,
    multicall: async ({ contracts }: { contracts: { functionName: string; args: [bigint] }[] }) =>
      contracts.map((c) => {
        const i = String(c.args[0]);
        if (c.functionName === "tokenByIndex") return BigInt(Number(i) + 1);
        if (c.functionName === "getUnitFullData") return [5, 0, levels[i], 0, 0, 0, 0, 0];
        return owner[i];
      }),
    getCode: async ({ address }: { address: string }) => (address === "0xmarket" ? "0x6080" : undefined),
  };

  it("counts level 10+ per wallet, case-insensitive, and leaves contracts out", async () => {
    const map = await readUnitHoldings(client as never);
    expect([...map.keys()]).toEqual(["0xplayer"]);
    expect(map.get("0xplayer")).toEqual({ unitsCount: 2, maxLevel: 40, unitsTotal: 3 });
    // 1 low unit earns nothing, so the wallet is not stored at all
    expect(map.has("0xsmall")).toBe(false);
  });
});

describe("public API shape", () => {
  it("adds subscores.units and the unit counts without touching the old keys", () => {
    const s = { score: 100, rank: 1, percentile: 99, ronkeSubscore: 10, ronkestrSubscore: 0, nftSubscore: 24,
      ronkeHolding: 0, ronkeDuration: 0, ronkeDiamondMult: 0, ronkestrHolding: 0, ronkestrDuration: 0, ronkestrDiamondMult: 0,
      nftHolding: 0, nftDuration: 0, nftDiamondMult: 0, collectorPoints: 0, bodyTypesHeld: 0, bodyTypesTotal: 10,
      oneOfOnePoints: 0, oneOfOneCount: 0, unitsSubscore: 66, unitsCount: 5, unitsCounted: 5, unitsHeld: 40, unitsHoldPoints: 0, stakingSubscore: 0, stakingTokens: 0, stakingMult: 0 } as WalletScore;
    const p = toPublicScore(s, "0xa");
    expect(p.subscores).toEqual({ ronke: 10, ronkestr: 0, nft: 24, units: 66, staking: 0 });
    expect(p.breakdown.units_count).toBe(5);
    expect(p.breakdown.units_held).toBe(40);
    expect(p.breakdown.units_hold_points).toBe(0);
    expect(toPublicScore(null, "0xb").subscores.units).toBe(0);
  });
});
