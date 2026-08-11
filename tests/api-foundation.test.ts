import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalJson, versionOf, API_VERSION } from "@/lib/api/version";
import { ok, fail, preflight, CACHE, apiMeta } from "@/lib/api/respond";
import { isRonName, parseAddressList, resolveParam } from "@/lib/api/address";

/**
 * Shared module doubles. `vi.mock` is hoisted above the imports, so the mutable
 * state it closes over has to come from `vi.hoisted` (the repo's other suites
 * mock `next/navigation` the same way).
 */
const H = vi.hoisted(() => ({
  /** Rows the faked `sql` tagged template returns; mutated per test. */
  rows: [] as Record<string, unknown>[],
  /** DATABASE_URL configured? Flip to model the 503 path. */
  dbConfigured: true,
  getMetaState: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getSql: () => (H.dbConfigured ? () => Promise.resolve([...H.rows]) : null),
}));

vi.mock("@/lib/queries", () => ({ getMetaState: H.getMetaState }));

// ── version ──────────────────────────────────────────────────────────

describe("lib/api/version", () => {
  it("serializes object keys in a stable order regardless of literal order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("preserves array order (arrays are ordered data, not keyed)", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("handles nesting, null, and undefined-valued keys", () => {
    expect(canonicalJson({ a: { d: null, c: [1, { f: 2, e: 3 }] } })).toBe(
      '{"a":{"c":[1,{"e":3,"f":2}],"d":null}}',
    );
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("is stable for the same config and prefixed with the api version", () => {
    const cfg = { ronke: { holdWeight: 150 } };
    expect(versionOf(cfg)).toBe(versionOf(cfg));
    expect(versionOf(cfg).startsWith(`${API_VERSION}-`)).toBe(true);
  });

  it("CHANGES when any weight changes - the whole point of deriving it", () => {
    expect(versionOf({ ronke: { holdWeight: 150 } })).not.toBe(
      versionOf({ ronke: { holdWeight: 151 } }),
    );
  });

  it("does NOT change when only key order changes", () => {
    expect(versionOf({ a: 1, b: 2 })).toBe(versionOf({ b: 2, a: 1 }));
  });
});

// ── respond ──────────────────────────────────────────────────────────

const META = { as_of: "2026-08-06T07:00:00.000Z", api_version: "v1", score_version: "v1-abcd1234" };

describe("lib/api/respond", () => {
  it("wraps success as { data, meta } with a cacheable s-maxage", async () => {
    const res = ok({ score: 10 }, { meta: META, ttl: CACHE.score });
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain(`s-maxage=${CACHE.score}`);
    expect(cc).toContain("stale-while-revalidate=");
    expect(cc).toContain("public");
    expect(await res.json()).toEqual({ data: { score: 10 }, meta: META });
  });

  it("never caches errors - a blip must not be pinned to the CDN", async () => {
    const res = fail("invalid_address", "nope", 400);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "invalid_address", message: "nope" } });
  });

  it("sets permissive CORS on success, error, and preflight alike", () => {
    for (const res of [ok(null, { meta: META, ttl: 60 }), fail("internal", "x", 500), preflight()]) {
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
    expect(preflight().status).toBe(204);
    expect(preflight().headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("omits Vary: Origin so the CDN keeps one entry, not one per origin", () => {
    expect(ok(null, { meta: META, ttl: 60 }).headers.get("Vary")).toBeNull();
  });

  it("declares a distinct, non-zero TTL for every data class", () => {
    const ttls = Object.values(CACHE);
    expect(ttls.every((t) => t > 0)).toBe(true);
    expect(CACHE.nft).toBeGreaterThan(CACHE.score); // static rarity outlives nightly scores
    expect(CACHE.meta).toBeLessThan(CACHE.score); // freshness surfaces staleness fastest
  });
});

describe("apiMeta", () => {
  it("reports the rebuild timestamp as as_of, with the version strings", async () => {
    H.getMetaState.mockResolvedValue({
      lastSyncAt: "2026-08-06T07:05:00.000Z",
      lastRebuildAt: "2026-08-06T07:10:00.000Z",
      backfillComplete: true,
      revealedSupply: 6969,
    });
    const meta = await apiMeta({ population: 6100 });
    // as_of tracks the REBUILD, not the sync: scores are only correct after the
    // rebuild step, so the sync timestamp would overstate freshness.
    expect(meta.as_of).toBe("2026-08-06T07:10:00.000Z");
    expect(meta.api_version).toBe("v1");
    expect(meta.score_version).toMatch(/^v1-[0-9a-f]{8}$/);
    expect(meta.population).toBe(6100);
  });

  it("returns as_of null (not a crash) before the first rebuild", async () => {
    H.getMetaState.mockResolvedValue({
      lastSyncAt: null,
      lastRebuildAt: null,
      backfillComplete: false,
      revealedSupply: null,
    });
    expect((await apiMeta()).as_of).toBeNull();
  });
});

// ── address ──────────────────────────────────────────────────────────

const ADDR = "0x36175b2c13e39de1a79583fa3476d124dc8dfb70";

describe("isRonName", () => {
  it("accepts a real name and rejects a bare suffix", () => {
    expect(isRonName("ronke.ron")).toBe(true);
    expect(isRonName(".ron")).toBe(false);
    expect(isRonName("ronke")).toBe(false);
  });
});

describe("resolveParam", () => {
  beforeEach(() => {
    H.rows.length = 0;
    H.dbConfigured = true;
  });

  it("normalizes a checksummed address to lowercase", async () => {
    const res = await resolveParam(ADDR.toUpperCase().replace("0X", "0x"));
    expect(res).toEqual({ ok: true, address: ADDR, name: null });
  });

  it("accepts a URL-encoded param", async () => {
    expect(await resolveParam(encodeURIComponent(ADDR))).toMatchObject({ ok: true, address: ADDR });
  });

  it("rejects a malformed address with invalid_address", async () => {
    expect(await resolveParam("0xnope")).toMatchObject({ ok: false, code: "invalid_address" });
    expect(await resolveParam("")).toMatchObject({ ok: false, code: "invalid_address" });
  });

  it("resolves a .ron name from the rns_names cache", async () => {
    H.rows.push({ address: ADDR });
    expect(await resolveParam("RONKE.RON")).toEqual({ ok: true, address: ADDR, name: "ronke.ron" });
  });

  it("returns name_not_resolved for an uncached name, explaining why", async () => {
    const res = await resolveParam("ghost.ron");
    expect(res).toMatchObject({ ok: false, code: "name_not_resolved" });
    expect((res as { message: string }).message).toContain("nightly sync");
  });

  it("returns not_configured rather than throwing when the DB is absent", async () => {
    H.dbConfigured = false;
    expect(await resolveParam("ronke.ron")).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("resolves an address without touching the DB at all", async () => {
    H.dbConfigured = false; // would fail if the address path queried
    expect(await resolveParam(ADDR)).toMatchObject({ ok: true, address: ADDR });
  });

  it("never reaches for the live on-chain resolver on this path", () => {
    // Guard against a future refactor reintroducing an RPC call per request:
    // that would put a rate-limited third-party dependency on every cache miss.
    // Checked against imports, not raw text - the module's own doc comment
    // names resolveNameLive to explain why it is deliberately absent.
    const imports = readFileSync("lib/api/address.ts", "utf8")
      .split("\n")
      .filter((line) => /^\s*(import|export .* from|.*\brequire\()/.test(line))
      .join("\n");
    expect(imports).not.toContain("rns");
    expect(imports).not.toContain("ronin");
    expect(imports).not.toContain("viem");
  });
});

describe("parseAddressList", () => {
  const B = "0x1111111111111111111111111111111111111111";
  const C = "0x2222222222222222222222222222222222222222";

  it("parses, lowercases, and returns a sorted deduped query set", () => {
    const res = parseAddressList(`${C},${B},${C}`, 50);
    expect(res).toMatchObject({ ok: true, requested: [C, B, C], unique: [B, C] });
  });

  it("rejects the whole request on one bad address rather than dropping it", () => {
    // Silently returning 2 of 3 would read as "that wallet scored zero".
    expect(parseAddressList(`${B},garbage,${C}`, 50)).toMatchObject({
      ok: false,
      code: "invalid_address",
    });
  });

  it("rejects an empty list", () => {
    expect(parseAddressList("", 50)).toMatchObject({ ok: false, code: "invalid_address" });
    expect(parseAddressList(null, 50)).toMatchObject({ ok: false, code: "invalid_address" });
  });

  it("enforces the cap instead of truncating", () => {
    const many = Array.from({ length: 51 }, (_, i) => `0x${String(i).padStart(40, "0")}`).join(",");
    expect(parseAddressList(many, 50)).toMatchObject({ ok: false, code: "too_many_addresses" });
  });

  it("rejects .ron names in batch (documented limitation)", () => {
    const res = parseAddressList(`${B},ronke.ron`, 50);
    expect(res).toMatchObject({ ok: false, code: "invalid_address" });
    expect((res as { message: string }).message).toContain(".ron");
  });

  it("tolerates whitespace and trailing commas", () => {
    expect(parseAddressList(` ${B} , ${C} ,`, 50)).toMatchObject({ ok: true, unique: [B, C] });
  });
});
