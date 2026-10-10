import { describe, it, expect } from "vitest";
import type { Sql } from "@/db/client";
import { computeScore, type ScoreInput } from "@/lib/score/compute";
import { assembleScoreInputs } from "@/lib/score/derive";
import { readStakingHoldings, refreshStaking, termMultiplier } from "@/lib/staking/snapshot";
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
// The price the founder's table was drawn at (RONKE per RONKA, 2026-10-10).
const PRICE = 0.09666;
const pts = (tokens: number, mult: number) =>
  computeScore(base({ stakingTokens: tokens, stakingMult: mult, stakingPrice: PRICE })).stakingSubscore;

describe("RONKA staking points (computeScore)", () => {
  it("reproduces the table the founder signed off on", () => {
    // [RONKA, 30d x1, 90d x1.25, 180d x1.75, 1y x4]
    const table: [number, number, number, number, number][] = [
      [50_000, 17, 21, 30, 68],
      [100_000, 29, 37, 51, 117],
      [250_000, 53, 67, 93, 213],
      [500_000, 77, 96, 134, 306],
      [1_000_000, 103, 129, 180, 411],
      [2_500_000, 140, 175, 245, 560],
      [5_000_000, 169, 212, 296, 677],
      [10_000_000, 199, 249, 348, 796],
    ];
    for (const [t, a, b, c, d] of table) {
      expect([pts(t, 1), pts(t, 1.25), pts(t, 1.75), pts(t, 4)]).toEqual([a, b, c, d]);
    }
  });

  it("pays nothing below 50,000 RONKA and nothing past 10M", () => {
    expect(pts(49_999, 4)).toBe(0);
    expect(pts(25_000_000, 4)).toBe(pts(10_000_000, 4));
    const r = computeScore(base({ stakingTokens: 25_000_000, stakingMult: 4, stakingPrice: PRICE }));
    expect(r.breakdown.stakingCounted).toBe(C.staking.maxTokens);
    expect(r.breakdown.stakingTokens).toBe(25_000_000);
  });

  it("pays nothing without a price, so a missing price never invents points", () => {
    expect(computeScore(base({ stakingTokens: 1_000_000, stakingMult: 4 })).stakingSubscore).toBe(0);
  });

  it("adds on top and leaves non-stakers exactly as before", () => {
    const w = base({ ronkeBalanceWhole: 250_000, unitsCount: 3 });
    const a = computeScore(w);
    const b = computeScore({ ...w, stakingTokens: 1_000_000, stakingMult: 1, stakingPrice: PRICE });
    expect(b.score - a.score).toBe(b.stakingSubscore);
    expect(computeScore({ ...w, stakingPrice: PRICE }).score).toBe(a.score);
  });
});

describe("termMultiplier", () => {
  it("maps the lock dialog's terms, with slack for signing time", () => {
    const d = 86400;
    expect(termMultiplier((365 * d - 40) / d)).toBe(4); // 1y lock signed 40 s after the end was picked
    expect(termMultiplier(730)).toBe(4); // 2y counts as the top tier
    expect(termMultiplier(180)).toBe(1.75);
    expect(termMultiplier(90)).toBe(1.25);
    expect(termMultiplier(29.99)).toBe(1);
    expect(termMultiplier(20)).toBe(0); // shorter than any term
  });
});

describe("readStakingHoldings", () => {
  const RONKA = C.staking.token, OTHER = "0x000000000000000000000000000000000000beef";
  const NOW = 1_800_000_000, DAY = 86400, E18 = 10n ** 18n;
  const lock = (token: string, owner: string, amount: number, withdrawn: number, lockedAt: number, endTime: number) =>
    ({ token, owner, amount: BigInt(amount) * E18, withdrawn: BigInt(withdrawn) * E18, lockedAt: BigInt(lockedAt), startTime: BigInt(lockedAt), endTime: BigInt(endTime) });
  const locks = [
    lock(RONKA, "0xAlice", 1_000_000, 0, NOW - 10 * DAY, NOW - 10 * DAY + 365 * DAY), // 1y, running
    lock(RONKA, "0xalice", 1_000_000, 0, NOW - DAY, NOW - DAY + 30 * DAY), // 30d, running
    lock(RONKA, "0xBob", 2_000_000, 0, NOW - 100 * DAY, NOW - 10 * DAY), // ended: does not count
    lock(RONKA, "0xCarol", 600_000, 100_000, NOW - 20 * DAY, NOW - 20 * DAY + 180 * DAY), // vesting, 200k releasable
    lock(RONKA, "0xDave", 900_000, 0, NOW - DAY, NOW - DAY + 7 * DAY), // 7 days: too short
    lock(RONKA, "0xMarket", 500_000, 0, NOW - DAY, NOW + 89 * DAY), // a contract owns it
    lock(OTHER, "0xErin", 900_000, 0, NOW - DAY, NOW + 364 * DAY), // another coin
  ];
  const releasable = [0n, 0n, 2_000_000n * E18, 200_000n * E18, 0n, 0n, 0n];
  const client = {
    getBlock: async () => ({ timestamp: BigInt(NOW) }),
    readContract: async () => locks.map((_, i) => BigInt(i)),
    multicall: async ({ contracts }: { contracts: { functionName: string; args: [bigint] }[] }) =>
      contracts.map((c) => (c.functionName === "getLock" ? locks[Number(c.args[0])] : releasable[Number(c.args[0])])),
    getCode: async ({ address }: { address: string }) => (address === "0xmarket" ? "0x6080" : undefined),
  };

  it("counts running, still-locked RONKA per current owner with a token-weighted multiplier", async () => {
    const map = await readStakingHoldings(client as never);
    expect([...map.keys()].sort()).toEqual(["0xalice", "0xcarol"]);
    expect(map.get("0xalice")).toEqual({ tokens: 2_000_000, mult: (1_000_000 * 4 + 1_000_000 * 1) / 2_000_000 });
    expect(map.get("0xcarol")).toEqual({ tokens: 300_000, mult: 1.75 });
  });
});

describe("refreshStaking", () => {
  const recorder = () => {
    const seen: string[] = [];
    const sql = Object.assign(
      ((strings: TemplateStringsArray) => { seen.push(strings.join("?")); return Promise.resolve([]); }) as unknown as Sql,
      { query: (q: string) => { seen.push(q); return Promise.resolve([]); } },
    );
    return { sql: sql as Sql, seen };
  };

  it("keeps the previous rows when the chain read fails", async () => {
    const { sql, seen } = recorder();
    const ok = await refreshStaking(sql, { read: () => Promise.reject(new Error("rpc down")), price: () => Promise.resolve(0.1) });
    expect(ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("stores the day's price, upserts holdings, then drops stale wallets", async () => {
    const { sql, seen } = recorder();
    const ok = await refreshStaking(sql, {
      read: () => Promise.resolve(new Map([["0xa", { tokens: 100_000, mult: 4 }]])),
      price: () => Promise.resolve(0.09),
      today: "2026-10-10",
    });
    expect(ok).toBe(true);
    expect(seen[0]).toContain("INSERT INTO staking_prices");
    expect(seen[1]).toContain("INSERT INTO staking_holdings");
    expect(seen[2]).toContain("DELETE FROM staking_holdings WHERE NOT");
  });
});

describe("assembleScoreInputs (staking)", () => {
  const fakeDb = (holdings: { address: string; tokens: number; mult: number }[], prices: number[]): Sql =>
    ((strings: TemplateStringsArray) => {
      const text = strings.join("§");
      if (text.includes("FROM staking_holdings")) return Promise.resolve(holdings);
      if (text.includes("FROM staking_prices")) return Promise.resolve(prices.map((price) => ({ price })));
      if (text.includes("FROM token_rarity") || text.includes("FROM nft_traits")) return Promise.resolve([{ n: 0 }]);
      return Promise.resolve([]);
    }) as unknown as Sql;

  it("brings a staking-only wallet in, priced at the average of the stored days", async () => {
    const map = await assembleScoreInputs(fakeDb([{ address: "0xs", tokens: 1_000_000, mult: 4 }], [0.1, 0.09, 0.0933]));
    const w = map.get("0xs")!;
    expect(w.stakingTokens).toBe(1_000_000);
    expect(w.stakingPrice).toBeCloseTo((0.1 + 0.09 + 0.0933) / 3, 10);
    expect(computeScore(w).stakingSubscore).toBeGreaterThan(0);
  });

  it("scores nothing before the first price is stored", async () => {
    const map = await assembleScoreInputs(fakeDb([{ address: "0xs", tokens: 1_000_000, mult: 4 }], []));
    expect(computeScore(map.get("0xs")!).stakingSubscore).toBe(0);
  });
});

describe("public API shape", () => {
  it("adds subscores.staking and the lock figures", () => {
    const s = { score: 500, rank: 1, percentile: 99, ronkeSubscore: 0, ronkestrSubscore: 0, nftSubscore: 0,
      ronkeHolding: 0, ronkeDuration: 0, ronkeDiamondMult: 0, ronkestrHolding: 0, ronkestrDuration: 0, ronkestrDiamondMult: 0,
      nftHolding: 0, nftDuration: 0, nftDiamondMult: 0, collectorPoints: 0, bodyTypesHeld: 0, bodyTypesTotal: 10,
      oneOfOnePoints: 0, oneOfOneCount: 0, unitsSubscore: 0, unitsCount: 0, unitsCounted: 0, unitsHeld: 0, unitsHoldPoints: 0,
      stakingSubscore: 411, stakingTokens: 1_000_000.4, stakingMult: 4 } as WalletScore;
    const p = toPublicScore(s, "0xa");
    expect(p.subscores.staking).toBe(411);
    expect(p.breakdown.staking_tokens).toBe(1_000_000);
    expect(p.breakdown.staking_mult).toBe(4);
    expect(toPublicScore(null, "0xb").subscores.staking).toBe(0);
  });
});
