import { describe, it, expect, vi, beforeEach } from "vitest";
import { toPublicScore } from "@/lib/api/score-view";
import type { WalletScore } from "@/lib/queries";

const H = vi.hoisted(() => ({
  getWalletScore: vi.fn(),
  getWalletScoresBatch: vi.fn(),
  getScoredPopulation: vi.fn(),
  getMetaState: vi.fn(),
  resolveParam: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  getWalletScore: H.getWalletScore,
  getWalletScoresBatch: H.getWalletScoresBatch,
  getScoredPopulation: H.getScoredPopulation,
  getMetaState: H.getMetaState,
}));
vi.mock("@/lib/api/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/address")>()),
  resolveParam: H.resolveParam,
}));

const { GET: getScore } = await import("@/app/api/v1/score/[address]/route");
const { GET: getScores, MAX_ADDRESSES } = await import("@/app/api/v1/scores/route");

const A = "0x36175b2c13e39de1a79583fa3476d124dc8dfb70";
const B = "0x1111111111111111111111111111111111111111";
const C = "0x2222222222222222222222222222222222222222";

const SCORE: WalletScore = {
  score: 4820,
  rank: 312,
  percentile: 94.9,
  ronkeSubscore: 1200,
  ronkestrSubscore: 620,
  nftSubscore: 3000,
  ronkeHolding: 900,
  ronkeDuration: 300,
  ronkeDiamondMult: 1,
  ronkestrHolding: 500,
  ronkestrDuration: 120,
  ronkestrDiamondMult: 0.6,
  nftHolding: 1500,
  nftDuration: 800,
  nftDiamondMult: 1,
  collectorPoints: 450,
  bodyTypesHeld: 3,
  bodyTypesTotal: 10,
  oneOfOnePoints: 235,
  oneOfOneCount: 1,
};

const params = (address: string) => ({ params: Promise.resolve({ address }) });
const req = (qs = "") => new Request(`https://ronkeverse.test/api/v1/scores${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  H.getScoredPopulation.mockResolvedValue(6100);
  H.getMetaState.mockResolvedValue({
    lastSyncAt: "2026-08-06T07:00:00.000Z",
    lastRebuildAt: "2026-08-06T07:10:00.000Z",
    backfillComplete: true,
    revealedSupply: 6969,
  });
  H.resolveParam.mockResolvedValue({ ok: true, address: A, name: null });
});

// ── the pure mapper ──────────────────────────────────────────────────

describe("toPublicScore", () => {
  it("maps every internal field onto the documented snake_case contract", () => {
    const p = toPublicScore(SCORE, A, "ronke.ron");
    expect(p).toMatchObject({
      address: A,
      name: "ronke.ron",
      found: true,
      score: 4820,
      rank: 312,
      percentile: 94.9,
      subscores: { ronke: 1200, ronkestr: 620, nft: 3000 },
    });
    expect(p.breakdown.oneofone_count).toBe(1);
    expect(p.breakdown.body_types_total).toBe(10);
    expect(p.breakdown.ronkestr_diamond_mult).toBe(0.6);
  });

  it("zeroes an unscored wallet but keeps every key, so clients stay typed", () => {
    const p = toPublicScore(null, B);
    expect(p).toMatchObject({ found: false, score: 0, rank: null, percentile: null });
    expect(Object.keys(p.breakdown)).toEqual(Object.keys(toPublicScore(SCORE, A).breakdown));
    expect(Object.values(p.breakdown).every((v) => v === 0)).toBe(true);
  });

  it("distinguishes unranked (null) from genuine last place (0)", () => {
    // Collapsing these would corrupt any game's banding math.
    expect(toPublicScore(null, B).percentile).toBeNull();
    expect(toPublicScore({ ...SCORE, rank: 6100, percentile: 0 }, A).percentile).toBe(0);
  });
});

// ── GET /api/v1/score/{address} ──────────────────────────────────────

describe("GET /api/v1/score/{address}", () => {
  it("returns the score with population and freshness in meta", async () => {
    H.getWalletScore.mockResolvedValue(SCORE);
    const res = await getScore(new Request("https://x.test"), params(A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ found: true, score: 4820, rank: 312 });
    expect(body.meta).toMatchObject({
      population: 6100,
      as_of: "2026-08-06T07:10:00.000Z",
      api_version: "v1",
    });
  });

  it("is CDN-cacheable - the header that keeps third-party load off Neon", async () => {
    H.getWalletScore.mockResolvedValue(SCORE);
    const res = await getScore(new Request("https://x.test"), params(A));
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    expect(res.headers.get("Cache-Control")).not.toContain("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 200 found:false for an unknown wallet, NOT 404", async () => {
    H.getWalletScore.mockResolvedValue(null);
    const res = await getScore(new Request("https://x.test"), params(B));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ found: false, score: 0, rank: null });
  });

  it("echoes a resolved .ron name", async () => {
    H.resolveParam.mockResolvedValue({ ok: true, address: A, name: "ronke.ron" });
    H.getWalletScore.mockResolvedValue(SCORE);
    expect((await getScore(new Request("https://x.test"), params("ronke.ron"))).status).toBe(200);
    const body = await (await getScore(new Request("https://x.test"), params("ronke.ron"))).json();
    expect(body.data.name).toBe("ronke.ron");
  });

  it("maps resolution failures onto documented codes and statuses", async () => {
    H.resolveParam.mockResolvedValue({ ok: false, code: "invalid_address", message: "bad" });
    expect((await getScore(new Request("https://x.test"), params("nope"))).status).toBe(400);

    H.resolveParam.mockResolvedValue({ ok: false, code: "name_not_resolved", message: "no" });
    expect((await getScore(new Request("https://x.test"), params("ghost.ron"))).status).toBe(404);

    H.resolveParam.mockResolvedValue({ ok: false, code: "not_configured", message: "no db" });
    const res = await getScore(new Request("https://x.test"), params(A));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
  });

  it("returns a 500 envelope rather than leaking a stack on a query failure", async () => {
    H.getWalletScore.mockRejectedValue(new Error("neon exploded"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getScore(new Request("https://x.test"), params(A));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("neon exploded");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ── GET /api/v1/scores (batch) ───────────────────────────────────────

describe("GET /api/v1/scores", () => {
  it("returns results in request order, zeroing the ones with no score", async () => {
    H.getWalletScoresBatch.mockResolvedValue(new Map([[C, SCORE]]));
    const res = await getScores(req(`?addresses=${B},${C}`));
    const { data } = await res.json();
    expect(data.count).toBe(2);
    expect(data.scores.map((s: { address: string }) => s.address)).toEqual([B, C]);
    expect(data.scores[0]).toMatchObject({ found: false, score: 0 });
    expect(data.scores[1]).toMatchObject({ found: true, score: 4820 });
  });

  it("issues exactly ONE score query regardless of address count", async () => {
    // This is the entire reason the batch endpoint exists.
    H.getWalletScoresBatch.mockResolvedValue(new Map());
    const many = Array.from({ length: MAX_ADDRESSES }, (_, i) => `0x${String(i).padStart(40, "0")}`);
    await getScores(req(`?addresses=${many.join(",")}`));
    expect(H.getWalletScoresBatch).toHaveBeenCalledTimes(1);
    expect(H.getWalletScoresBatch.mock.calls[0][0]).toHaveLength(MAX_ADDRESSES);
  });

  it("queries a deduped set but still mirrors duplicates back to the caller", async () => {
    H.getWalletScoresBatch.mockResolvedValue(new Map([[B, SCORE]]));
    const res = await getScores(req(`?addresses=${B},${B}`));
    expect(H.getWalletScoresBatch.mock.calls[0][0]).toEqual([B]);
    expect((await res.json()).data.scores).toHaveLength(2);
  });

  it("rejects over the cap instead of silently truncating", async () => {
    const many = Array.from({ length: MAX_ADDRESSES + 1 }, (_, i) =>
      `0x${String(i).padStart(40, "0")}`,
    );
    const res = await getScores(req(`?addresses=${many.join(",")}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("too_many_addresses");
    expect(H.getWalletScoresBatch).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed list", async () => {
    expect((await getScores(req())).status).toBe(400);
    expect((await getScores(req("?addresses="))).status).toBe(400);
    const res = await getScores(req(`?addresses=${B},garbage`));
    expect((await res.json()).error.code).toBe("invalid_address");
  });

  it("carries population in meta once, not repeated per row", async () => {
    H.getWalletScoresBatch.mockResolvedValue(new Map());
    const body = await (await getScores(req(`?addresses=${B}`))).json();
    expect(body.meta.population).toBe(6100);
    expect(body.data.scores[0]).not.toHaveProperty("population");
  });
});
