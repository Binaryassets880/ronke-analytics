import { describe, it, expect, vi, beforeEach } from "vitest";
import { SCORE_CONFIG } from "@/config/score";

const H = vi.hoisted(() => ({
  getScoreLeaderboard: vi.fn(),
  getScoredPopulation: vi.fn(),
  getEcosystemStats: vi.fn(),
  getSupplyStats: vi.fn(),
  getMetaState: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  getScoreLeaderboard: H.getScoreLeaderboard,
  getScoredPopulation: H.getScoredPopulation,
  getEcosystemStats: H.getEcosystemStats,
  getSupplyStats: H.getSupplyStats,
  getMetaState: H.getMetaState,
}));

const { GET: getLeaderboard, parseBounded, MAX_LIMIT, MAX_OFFSET, DEFAULT_LIMIT } = await import(
  "@/app/api/v1/leaderboard/route"
);
const { GET: getConfig } = await import("@/app/api/v1/config/route");
const { GET: getStats } = await import("@/app/api/v1/stats/route");
const { GET: getMeta, REBUILD_CRON_UTC } = await import("@/app/api/v1/meta/route");

const lbReq = (qs = "") => new Request(`https://ronkeverse.test/api/v1/leaderboard${qs}`);

const row = (n: number) => ({
  address: `0x${String(n).padStart(40, "0")}`,
  name: null,
  score: 1000 - n,
  rank: n + 1,
  percentile: 99 - n,
  ronkeSubscore: 1,
  ronkestrSubscore: 2,
  nftSubscore: 3,
  bodyTypesHeld: 1,
  bodyTypesTotal: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.getScoredPopulation.mockResolvedValue(6100);
  H.getMetaState.mockResolvedValue({
    lastSyncAt: "2026-08-06T07:00:00.000Z",
    lastRebuildAt: "2026-08-06T07:10:00.000Z",
    backfillComplete: true,
    revealedSupply: 6969,
  });
  H.getScoreLeaderboard.mockImplementation(async (_page: number, size: number) =>
    Array.from({ length: size }, (_, i) => row(i)),
  );
  H.getEcosystemStats.mockResolvedValue({
    ronkeHolders: 8003,
    ronkePriceUsd: 0.00029,
    ronkestrHolders: 230,
    ronkestrPriceUsd: 0.000715,
    ronkeverseHolders: 1200,
    ronkeverse7dVolWron: 415,
    ratedWallets: 6112,
    totalBadges: 20500,
  });
  H.getSupplyStats.mockResolvedValue({
    minted: 1_000_000_000,
    burned: 130_605_432,
    circulating: 869_394_568,
    burnedPct: 0.1306,
  });
});

// ── parseBounded ─────────────────────────────────────────────────────

describe("parseBounded", () => {
  it("falls back when absent or blank", () => {
    expect(parseBounded(null, { fallback: 25, max: 100, name: "limit" })).toEqual({
      ok: true,
      value: 25,
    });
    expect(parseBounded("  ", { fallback: 7, max: 100, name: "limit" })).toMatchObject({ value: 7 });
  });

  it("rejects non-integers, negatives, and over-max instead of clamping", () => {
    for (const bad of ["abc", "-1", "1.5", "1e3"]) {
      expect(parseBounded(bad, { fallback: 25, max: 100, name: "limit" }).ok).toBe(false);
    }
    // Silently clamping 1000 -> 100 would make a caller page wrongly and
    // conclude the leaderboard had ended.
    expect(parseBounded("1000", { fallback: 25, max: 100, name: "limit" })).toMatchObject({
      ok: false,
    });
  });

  it("accepts the boundary value", () => {
    expect(parseBounded("100", { fallback: 25, max: 100, name: "limit" })).toEqual({
      ok: true,
      value: 100,
    });
  });
});

// ── leaderboard ──────────────────────────────────────────────────────

describe("GET /api/v1/leaderboard", () => {
  it("returns default-sized entries carrying rank and percentile", async () => {
    const body = await (await getLeaderboard(lbReq())).json();
    expect(body.data.count).toBe(DEFAULT_LIMIT);
    expect(body.data.entries[0]).toMatchObject({ rank: 1, percentile: 99 });
    expect(body.data.entries[0].subscores).toEqual({ ronke: 1, ronkestr: 2, nft: 3 });
    expect(body.meta.population).toBe(6100);
  });

  it("honours limit and offset, returning exactly the requested window", async () => {
    const body = await (await getLeaderboard(lbReq("?limit=10&offset=5"))).json();
    expect(body.data.count).toBe(10);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(5);
    // Offset 5 must skip the first five rows, not restart at rank 1.
    expect(body.data.entries[0].rank).toBe(6);
  });

  it("handles an offset that is not a multiple of limit", async () => {
    const body = await (await getLeaderboard(lbReq("?limit=10&offset=7"))).json();
    expect(body.data.entries[0].rank).toBe(8);
    expect(body.data.count).toBe(10);
  });

  it("rejects over-cap limit and offset with invalid_param", async () => {
    for (const qs of [`?limit=${MAX_LIMIT + 1}`, `?offset=${MAX_OFFSET + 1}`, "?limit=0"]) {
      const res = await getLeaderboard(lbReq(qs));
      expect(res.status, qs).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_param");
    }
    expect(H.getScoreLeaderboard).not.toHaveBeenCalled();
  });

  it("is cacheable and CORS-enabled", async () => {
    const res = await getLeaderboard(lbReq());
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── config ───────────────────────────────────────────────────────────

describe("GET /api/v1/config", () => {
  it("serializes the REAL SCORE_CONFIG, not a hand-copied duplicate", async () => {
    const body = await (await getConfig()).json();
    expect(body.data.score).toEqual(JSON.parse(JSON.stringify(SCORE_CONFIG)));
    expect(body.data.score.gate.minRonke).toBe(SCORE_CONFIG.gate.minRonke);
  });

  it("publishes the diamond thresholds and the plain-English explainer", async () => {
    const body = await (await getConfig()).json();
    expect(body.data.diamond_thresholds.sellTolerancePct).toBeTypeOf("number");
    expect(body.data.explainer.factors.length).toBeGreaterThan(0);
  });

  it("states the freshness and population notes in-band", async () => {
    const body = await (await getConfig()).json();
    expect(body.data.notes.freshness).toContain("07:00 UTC");
    expect(body.data.notes.population).toContain("non-zero");
  });

  it("carries no retune advisory (founder decision 2026-08-12: removed)", async () => {
    const body = await (await getConfig()).json();
    expect(body.data.notes).not.toHaveProperty("stability");
    expect(JSON.stringify(body.data.notes)).not.toMatch(/retune/i);
  });

  it("carries a score_version matching the one /meta reports", async () => {
    const cfg = await (await getConfig()).json();
    const meta = await (await getMeta()).json();
    expect(cfg.meta.score_version).toBe(meta.meta.score_version);
  });

  it("caches longer than the nightly score data", async () => {
    const res = await getConfig();
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });
});

// ── stats ────────────────────────────────────────────────────────────

describe("GET /api/v1/stats", () => {
  it("reports holders, prices, and supply per asset", async () => {
    const body = await (await getStats()).json();
    expect(body.data.ronke_token).toMatchObject({ holders: 8003, price_usd: 0.00029 });
    expect(body.data.ronke_token.supply.burned_pct).toBeCloseTo(0.1306, 4);
    expect(body.data.ronkeverse_nft.volume_7d_wron).toBe(415);
    expect(body.data.badges.total_earned).toBe(20500);
  });

  it("degrades supply to null rather than 500ing the whole response", async () => {
    // Holder counts come from our own ledger and must survive a market outage.
    H.getSupplyStats.mockRejectedValue(new Error("index missing"));
    const res = await getStats();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ronke_token.supply).toBeNull();
    expect(body.data.ronke_token.holders).toBe(8003);
  });

  it("returns a 500 envelope when the ledger itself fails", async () => {
    H.getEcosystemStats.mockRejectedValue(new Error("neon down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getStats();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});

// ── meta ─────────────────────────────────────────────────────────────

describe("GET /api/v1/meta", () => {
  it("reports freshness, population, and the rebuild schedule", async () => {
    const body = await (await getMeta()).json();
    expect(body.data.as_of).toBe("2026-08-06T07:10:00.000Z");
    expect(body.data.scored_population).toBe(6100);
    expect(body.data.rebuild_schedule_utc).toBe(REBUILD_CRON_UTC);
  });

  it("publishes the indexed contracts so integrators can verify the assets", async () => {
    const body = await (await getMeta()).json();
    const addresses = body.data.contracts.map((c: { address: string }) => c.address);
    expect(addresses).toContain("0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb");
    expect(addresses).toContain("0x810b6d1374ac7ba0e83612e7d49f49a13f1de019");
    expect(body.data.chain).toBe("ronin");
    // Full addresses, never truncated - integrators paste these into explorers.
    for (const a of addresses) expect(a).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("uses the shortest TTL so staleness surfaces fastest", async () => {
    const res = await getMeta();
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
});
