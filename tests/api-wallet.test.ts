import { describe, it, expect, vi, beforeEach } from "vitest";
import { toPublicWallet, toWholeNumber, toIso } from "@/lib/api/wallet-view";
import type { WalletData } from "@/lib/queries";

const H = vi.hoisted(() => ({
  getWallet: vi.fn(),
  getWalletBadges: vi.fn(),
  getToken: vi.fn(),
  getMetaState: vi.fn(),
  resolveParam: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  getWallet: H.getWallet,
  getWalletBadges: H.getWalletBadges,
  getToken: H.getToken,
  getMetaState: H.getMetaState,
}));
vi.mock("@/lib/api/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/address")>()),
  resolveParam: H.resolveParam,
}));

const { GET: getWalletRoute } = await import("@/app/api/v1/wallet/[address]/route");
const { GET: getNft, parseTokenId, MAX_TOKEN_ID } = await import(
  "@/app/api/v1/nft/[tokenId]/route"
);

const A = "0x36175b2c13e39de1a79583fa3476d124dc8dfb70";

/** 1.5 billion $RONKE in base units - past Number.MAX_SAFE_INTEGER. */
const HUGE = (1_500_000_000n * 10n ** 18n).toString();

const WALLET: WalletData = {
  address: A,
  name: null,
  ronkeBalance: HUGE,
  ronkestrBalance: "0",
  ronkeverseCount: 2,
  holdingDurationDays: 210,
  diamondBucket: "diamond",
  neverSold: true,
  everPaperSold: false,
  firstAcquiredAt: "2025-11-16T00:00:00.000Z",
  assetHoldings: [
    {
      asset: "ronke_token",
      label: "$RONKE",
      balance: HUGE,
      tokenCount: 0,
      isHeld: true,
      holdingDurationDays: 210,
      diamondBucket: "diamond",
      firstAcquiredAt: "2025-11-16T00:00:00.000Z",
      neverSold: true,
      everPaperSold: false,
    },
    {
      asset: "ronkestr_token",
      label: "RonkeStr",
      balance: "0",
      tokenCount: 0,
      isHeld: false,
      holdingDurationDays: 0,
      diamondBucket: null,
      firstAcquiredAt: null,
      neverSold: false,
      everPaperSold: false,
    },
    {
      asset: "ronkeverse_nft",
      label: "Ronkeverse",
      balance: "0",
      tokenCount: 2,
      isHeld: true,
      holdingDurationDays: 90,
      diamondBucket: "regular",
      firstAcquiredAt: "2026-05-01T00:00:00.000Z",
      neverSold: false,
      everPaperSold: false,
    },
  ],
  heldTokens: [
    { tokenId: "42", rarityRank: 31, imageUrl: "https://x/42.png", tier: "standard" },
    { tokenId: "777", rarityRank: null, imageUrl: null, tier: "community_1of1" },
  ],
  everHeld: true,
};

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  vi.clearAllMocks();
  H.getMetaState.mockResolvedValue({
    lastSyncAt: null,
    lastRebuildAt: "2026-08-06T07:10:00.000Z",
    backfillComplete: true,
    revealedSupply: 6969,
  });
  H.resolveParam.mockResolvedValue({ ok: true, address: A, name: null });
  H.getWallet.mockResolvedValue(WALLET);
  H.getWalletBadges.mockResolvedValue([
    { badgeKey: "diamond_hands", tier: null, context: { asset: "ronke_token" } },
    { badgeKey: "whale", tier: 2, context: {} },
  ]);
});

// ── the pure mapper ──────────────────────────────────────────────────

describe("toWholeNumber", () => {
  it("scales base units by the asset's decimals", () => {
    expect(toWholeNumber((5_000n * 10n ** 18n).toString(), "ronke_token")).toBe(5_000);
  });

  it("returns 0 for NFTs (no decimal balance) and for garbage input", () => {
    expect(toWholeNumber("0", "ronkeverse_nft")).toBe(0);
    expect(toWholeNumber("not-a-number", "ronke_token")).toBe(0);
  });
});

describe("toIso", () => {
  it("converts Neon's space-separated timestamp to ISO 8601", () => {
    // Neon returns "2025-01-25 13:38:44+00". V8 parses it; Safari and many
    // non-JS clients do not, so the public API must emit the standard form.
    expect(toIso("2025-01-25 13:38:44+00")).toBe("2025-01-25T13:38:44.000Z");
  });

  it("leaves an already-ISO value valid and passes null through", () => {
    expect(toIso("2026-08-06T07:10:00.000Z")).toBe("2026-08-06T07:10:00.000Z");
    expect(toIso(null)).toBeNull();
  });

  it("returns the original rather than null when it cannot parse", () => {
    // Dropping an unparseable value would lose data; surfacing it is safer.
    expect(toIso("not a date")).toBe("not a date");
  });
});

describe("toPublicWallet", () => {
  it("emits ISO 8601 acquisition timestamps", () => {
    const p = toPublicWallet(
      {
        ...WALLET,
        assetHoldings: [
          { ...WALLET.assetHoldings[0], firstAcquiredAt: "2025-01-25 13:38:44+00" },
        ],
      },
      [],
    );
    expect(p.holdings[0].first_acquired_at).toBe("2025-01-25T13:38:44.000Z");
  });

  it("keeps the exact balance as a string and offers a lossy convenience float", () => {
    const p = toPublicWallet(WALLET, []);
    const ronke = p.holdings.find((h) => h.asset === "ronke_token")!;
    // The string must survive byte-for-byte: 1.5e27 has no exact float form, so
    // a JSON number here would hand integrators a silently wrong balance.
    expect(ronke.balance_raw).toBe(HUGE);
    expect(typeof ronke.balance_raw).toBe("string");
    expect(ronke.balance_whole).toBeCloseTo(1_500_000_000, 0);
  });

  it("emits all three assets even when two are empty, for a stable key set", () => {
    const p = toPublicWallet(WALLET, []);
    expect(p.holdings.map((h) => h.asset)).toEqual([
      "ronke_token",
      "ronkestr_token",
      "ronkeverse_nft",
    ]);
    const str = p.holdings.find((h) => h.asset === "ronkestr_token")!;
    expect(str).toMatchObject({ is_held: false, balance_raw: "0", diamond_bucket: null });
  });

  it("maps held NFTs including the null-rank 1/1 bucket", () => {
    const p = toPublicWallet(WALLET, []);
    expect(p.nfts).toHaveLength(2);
    // A 1/1 is deliberately unranked - it must not surface as rank 0.
    expect(p.nfts[1]).toMatchObject({ token_id: "777", tier: "community_1of1", rarity_rank: null });
  });

  it("maps badges to key/tier/context", () => {
    const p = toPublicWallet(WALLET, [{ badgeKey: "og", tier: 1, context: { days: 230 } }]);
    expect(p.badges).toEqual([{ key: "og", tier: 1, context: { days: 230 } }]);
  });

  it("reports found:false for a wallet that never held anything", () => {
    const p = toPublicWallet({ ...WALLET, everHeld: false }, []);
    expect(p.found).toBe(false);
  });
});

// ── GET /api/v1/wallet/{address} ─────────────────────────────────────

describe("GET /api/v1/wallet/{address}", () => {
  it("returns holdings, nfts, and badges", async () => {
    const res = await getWalletRoute(new Request("https://x.test"), params({ address: A }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.holdings).toHaveLength(3);
    expect(data.nfts).toHaveLength(2);
    expect(data.badges.map((b: { key: string }) => b.key)).toEqual(["diamond_hands", "whale"]);
  });

  it("prefers the .ron name the caller resolved by", async () => {
    H.resolveParam.mockResolvedValue({ ok: true, address: A, name: "ronke.ron" });
    const res = await getWalletRoute(new Request("https://x.test"), params({ address: "ronke.ron" }));
    expect((await res.json()).data.name).toBe("ronke.ron");
  });

  it("returns 200 with found:false for a wallet that never held", async () => {
    H.getWallet.mockResolvedValue({ ...WALLET, everHeld: false });
    const res = await getWalletRoute(new Request("https://x.test"), params({ address: A }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.found).toBe(false);
  });

  it("maps an unresolved name to 404 and a bad address to 400", async () => {
    H.resolveParam.mockResolvedValue({ ok: false, code: "name_not_resolved", message: "x" });
    expect(
      (await getWalletRoute(new Request("https://x.test"), params({ address: "g.ron" }))).status,
    ).toBe(404);
    H.resolveParam.mockResolvedValue({ ok: false, code: "invalid_address", message: "x" });
    expect(
      (await getWalletRoute(new Request("https://x.test"), params({ address: "zz" }))).status,
    ).toBe(400);
  });
});

// ── GET /api/v1/nft/{tokenId} ────────────────────────────────────────

describe("parseTokenId", () => {
  it("accepts the valid range and rejects everything else", () => {
    expect(parseTokenId("1")).toBe(1);
    expect(parseTokenId(String(MAX_TOKEN_ID))).toBe(MAX_TOKEN_ID);
    for (const bad of ["0", String(MAX_TOKEN_ID + 1), "-1", "1.5", "abc", ""]) {
      expect(parseTokenId(bad), bad).toBeNull();
    }
  });
});

describe("GET /api/v1/nft/{tokenId}", () => {
  const TOKEN = {
    tokenId: "42",
    rarityRank: 31,
    tier: "official_1of1" as const,
    infoContentScore: 12.5,
    imageUrl: "https://x/42.png",
    traits: [{ traitType: "Body", value: "GoldRonke", probability: 0.01 }],
    owner: { address: A, name: "ronke.ron" },
  };

  it("returns rarity, traits, and owner", async () => {
    H.getToken.mockResolvedValue(TOKEN);
    const res = await getNft(new Request("https://x.test"), params({ tokenId: "42" }));
    const { data } = await res.json();
    expect(data).toMatchObject({ token_id: "42", tier: "official_1of1", rarity_rank: 31 });
    expect(data.traits[0]).toEqual({ trait_type: "Body", value: "GoldRonke", probability: 0.01 });
    expect(data.owner.address).toBe(A);
  });

  it("caches far longer than nightly score data (rarity is static)", async () => {
    H.getToken.mockResolvedValue(TOKEN);
    const res = await getNft(new Request("https://x.test"), params({ tokenId: "42" }));
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("rejects an out-of-range id with invalid_token_id, without querying", async () => {
    const res = await getNft(new Request("https://x.test"), params({ tokenId: "99999" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_token_id");
    expect(H.getToken).not.toHaveBeenCalled();
  });

  it("404s an in-range id that is not indexed - a real absence, not a zero", async () => {
    H.getToken.mockResolvedValue(null);
    const res = await getNft(new Request("https://x.test"), params({ tokenId: "6969" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
