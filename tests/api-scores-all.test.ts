import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  getAllScoresCompact: vi.fn(),
  getMetaState: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  getAllScoresCompact: H.getAllScoresCompact,
  getMetaState: H.getMetaState,
}));

const { GET, MAX_ROWS } = await import("@/app/api/v1/scores/all/route");

const row = (n: number) => ({
  address: `0x${String(n).padStart(40, "0")}`,
  score: 1000 - n,
  rank: n + 1,
  percentile: 99 - n,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.getMetaState.mockResolvedValue({
    lastSyncAt: null,
    lastRebuildAt: "2026-08-11T08:02:34.627Z",
    backfillComplete: true,
    revealedSupply: 6969,
  });
  H.getAllScoresCompact.mockResolvedValue({
    rows: [row(0), row(1), row(2)],
    complete: true,
  });
});

describe("GET /api/v1/scores/all", () => {
  it("returns every row with count and complete", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.count).toBe(3);
    expect(data.complete).toBe(true);
    expect(data.scores[0]).toEqual({
      address: "0x0000000000000000000000000000000000000000",
      score: 1000,
      rank: 1,
      percentile: 99,
    });
  });

  it("stays compact - exactly the four fields a role bot reads", async () => {
    // Adding sub-scores/breakdown here would roughly quadruple the largest
    // response this API serves; /score/{address} is the place for detail.
    const { data } = await (await GET()).json();
    expect(Object.keys(data.scores[0]).sort()).toEqual([
      "address",
      "percentile",
      "rank",
      "score",
    ]);
  });

  it("caches LONGER than per-wallet reads - a miss here costs ~450 KB of Neon egress", async () => {
    const { CACHE } = await import("@/lib/api/respond");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain(`s-maxage=${CACHE.bulk}`);
    expect(CACHE.bulk).toBeGreaterThan(CACHE.score);
    expect(res.headers.get("Cache-Control")).not.toContain("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("issues exactly one query - the whole point vs paging the batch endpoint", async () => {
    await GET();
    expect(H.getAllScoresCompact).toHaveBeenCalledTimes(1);
    expect(H.getAllScoresCompact).toHaveBeenCalledWith(MAX_ROWS);
  });

  it("flags truncation visibly instead of silently serving a partial set", async () => {
    H.getAllScoresCompact.mockResolvedValue({ rows: [row(0)], complete: false });
    const { data } = await (await GET()).json();
    expect(data.complete).toBe(false);
    expect(data.note).toContain("Truncated");
    expect(data.note).toContain("/api/v1/scores?addresses=");
  });

  it("omits the note entirely when the set is complete", async () => {
    const { data } = await (await GET()).json();
    expect(data).not.toHaveProperty("note");
  });

  it("handles an empty database without dividing or crashing", async () => {
    H.getAllScoresCompact.mockResolvedValue({ rows: [], complete: true });
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ count: 0, complete: true, scores: [] });
  });

  it("returns a 500 envelope, not a stack, when the query fails", async () => {
    H.getAllScoresCompact.mockRejectedValue(new Error("neon exploded"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("neon exploded");
  });

  it("sets the safety cap above the population but INSIDE Vercel's response limit", async () => {
    // ~6,200 scored wallets as of 2026-08-11, measured at ~100 bytes/row. The
    // cap must clear normal growth yet stay under Vercel's 4.5 MB function
    // response limit - otherwise the platform 500s before the valve can report
    // `complete: false`, which is the one thing it exists to do.
    const BYTES_PER_ROW = 100;
    const VERCEL_RESPONSE_LIMIT = 4.5 * 1024 * 1024;
    expect(MAX_ROWS).toBeGreaterThan(6_199 * 3);
    expect(MAX_ROWS * BYTES_PER_ROW).toBeLessThan(VERCEL_RESPONSE_LIMIT);
  });
});
