/**
 * The single catalog of public API endpoints.
 *
 * Three consumers read this and nothing else: the /developers page, the
 * generated OpenAPI document, and a test that walks `app/api/v1/**\/route.ts`
 * and asserts the catalog and the filesystem agree in both directions. That
 * test is the reason this file exists - hand-written API docs drift the moment
 * someone adds a route, and stale docs on a public API are worse than none.
 *
 * Copy here is deliberately blunt about the three things integrators get wrong:
 * daily freshness, retune-shifting scores, and absent-means-zero.
 */

export const API_BASE = "/api/v1";

export interface ApiParam {
  name: string;
  in: "path" | "query";
  required: boolean;
  description: string;
  schema: { type: "string" | "integer"; minimum?: number; maximum?: number; default?: number };
}

export interface ApiEndpoint {
  /** Path relative to API_BASE, OpenAPI-style (`/score/{address}`). */
  path: string;
  /** Route file under app/, relative to the repo root. Asserted to exist. */
  file: string;
  summary: string;
  description: string;
  params: ApiParam[];
  /** Seconds this response is cached at the CDN. */
  cacheSeconds: number;
  /** Trimmed example response, shown verbatim in the docs. */
  example: unknown;
}

const ADDRESS_PARAM: ApiParam = {
  name: "address",
  in: "path",
  required: true,
  description:
    "A 0x wallet address, or a .ron name that has been seen by the nightly sync. " +
    "Names that have never held a Ronke asset are not resolvable - use the address.",
  schema: { type: "string" },
};

export const ENDPOINTS: ApiEndpoint[] = [
  {
    path: "/score/{address}",
    file: "app/api/v1/score/[address]/route.ts",
    summary: "One wallet's Ronke Score",
    description:
      "Score, sub-scores, full points breakdown, rank, and percentile for a single wallet. " +
      "A wallet with no score returns 200 with found:false and score 0 - not a 404 - because " +
      "wallets scoring zero are never stored.",
    params: [ADDRESS_PARAM],
    cacheSeconds: 900,
    example: {
      data: {
        address: "0x36175b2c13e39de1a79583fa3476d124dc8dfb70",
        name: "ronke.ron",
        found: true,
        score: 4820,
        rank: 312,
        percentile: 94.9,
        subscores: { ronke: 1200, ronkestr: 620, nft: 3000 },
        breakdown: { collector_points: 450, oneofone_count: 1, "…": "…" },
      },
      meta: {
        as_of: "2026-08-06T07:10:00.000Z",
        api_version: "v1",
        score_version: "v1-3f9a2c11",
        population: 6112,
      },
    },
  },
  {
    path: "/scores",
    file: "app/api/v1/scores/route.ts",
    summary: "Many wallets' scores in one request",
    description:
      "Batch lookup for up to 50 addresses. Results come back in the order you asked, " +
      "including duplicates, so you can zip them onto your request list. Use this instead " +
      "of looping the single endpoint - it is one database round-trip and one cache entry.",
    params: [
      {
        name: "addresses",
        in: "query",
        required: true,
        description:
          "Comma-separated 0x addresses, max 50. .ron names are not accepted here. " +
          "Sort them for the best cache hit rate. One malformed address rejects the whole " +
          "request rather than silently returning fewer results.",
        schema: { type: "string" },
      },
    ],
    cacheSeconds: 900,
    example: {
      data: {
        scores: [
          { address: "0x1111…", found: true, score: 4820, rank: 312, percentile: 94.9 },
          { address: "0x2222…", found: false, score: 0, rank: null, percentile: null },
        ],
        count: 2,
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", population: 6112, "…": "…" },
    },
  },
  {
    path: "/scores/all",
    file: "app/api/v1/scores/all/route.ts",
    summary: "Every scored wallet, in one response",
    description:
      "The whole scored set, compact - address, score, rank, percentile. Built for periodic " +
      "re-checks (pruning roles from members who sold) where you need to see everyone at once. " +
      "Roughly 6,200 rows today. Check the complete flag rather than assuming a 200 means you " +
      "got everything. Wallets with no score are absent, not listed with score 0 - the same " +
      "meaning as found:false on the single-wallet endpoint. Every current Ronkeverse NFT " +
      "holder is included. Cached for an hour rather than 15 minutes - the data only changes " +
      "once a day, and this is the one response where a cache miss is expensive. Read " +
      "meta.as_of off this response to know exactly which rebuild you are holding; do not " +
      "assume it matches what /meta reported, since the two are cached separately.",
    params: [],
    cacheSeconds: 3600,
    example: {
      data: {
        scores: [
          { address: "0xf0229d…", score: 8012, rank: 1, percentile: 99.98 },
          { address: "0xfeae9f…", score: 6590, rank: 2, percentile: 99.97 },
        ],
        count: 6199,
        complete: true,
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", population: 6199, "…": "…" },
    },
  },
  {
    path: "/leaderboard",
    file: "app/api/v1/leaderboard/route.ts",
    summary: "Top wallets by Ronke Score",
    description:
      "Ranked entries with score, rank, percentile, and sub-scores. limit and offset are " +
      "hard-capped; exceeding either is a 400 rather than a silent clamp, so you never page " +
      "against a truncated window without knowing it.",
    params: [
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Rows to return, 1-100.",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      {
        name: "offset",
        in: "query",
        required: false,
        description: "Rows to skip, max 5000.",
        schema: { type: "integer", minimum: 0, maximum: 5000, default: 0 },
      },
    ],
    cacheSeconds: 900,
    example: {
      data: {
        entries: [
          {
            address: "0x1111…",
            name: "ronke.ron",
            score: 8830,
            rank: 1,
            percentile: 99.98,
            subscores: { ronke: 3200, ronkestr: 1100, nft: 4530 },
          },
        ],
        count: 1,
        limit: 25,
        offset: 0,
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", population: 6112, "…": "…" },
    },
  },
  {
    path: "/wallet/{address}",
    file: "app/api/v1/wallet/[address]/route.ts",
    summary: "What a wallet actually holds",
    description:
      "Per-asset balances and holding behaviour, held Ronkeverse token IDs with rarity, and " +
      "earned badges. Use balance_raw (exact base units, a string) for anything numeric - " +
      "balance_whole is a convenience float and is lossy at large balances.",
    params: [ADDRESS_PARAM],
    cacheSeconds: 900,
    example: {
      data: {
        address: "0x36175b2c13e39de1a79583fa3476d124dc8dfb70",
        found: true,
        holdings: [
          {
            asset: "ronke_token",
            label: "$RONKE",
            balance_raw: "1500000000000000000000000000",
            balance_whole: 1500000000,
            token_count: 0,
            is_held: true,
            duration_days: 210,
            diamond_bucket: "diamond",
            never_sold: true,
          },
        ],
        nfts: [{ token_id: "777", rarity_rank: null, tier: "community_1of1", image_url: null }],
        badges: [{ key: "diamond_hands", tier: null, context: {} }],
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", "…": "…" },
    },
  },
  {
    path: "/nft/{tokenId}",
    file: "app/api/v1/nft/[tokenId]/route.ts",
    summary: "One Ronkeverse token",
    description:
      "Rarity rank, tier, traits with collection-wide probability, image, and current owner. " +
      "1/1 tokens carry a tier and a null rarity_rank on purpose - they sit outside the " +
      "standard 1..N rarity ladder rather than at the top of it.",
    params: [
      {
        name: "tokenId",
        in: "path",
        required: true,
        description: "Ronkeverse token id, 1-6969.",
        schema: { type: "integer", minimum: 1, maximum: 6969 },
      },
    ],
    cacheSeconds: 86_400,
    example: {
      data: {
        token_id: "42",
        rarity_rank: 31,
        tier: "standard",
        traits: [{ trait_type: "Body", value: "GoldRonke", probability: 0.0102 }],
        owner: { address: "0x1111…", name: "ronke.ron" },
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", "…": "…" },
    },
  },
  {
    path: "/config",
    file: "app/api/v1/config/route.ts",
    summary: "The live scoring rules",
    description:
      "Weights, curves, gates, diamond thresholds, and the plain-English explainer, " +
      "serialized from the config the scorer actually runs. Render your \"how to rank up\" " +
      "copy from this rather than hardcoding a copy that goes stale on the next retune.",
    params: [],
    cacheSeconds: 3600,
    example: {
      data: {
        score: { ronke: { holdWeight: 150 }, gate: { minRonke: 50000 }, "…": "…" },
        diamond_thresholds: { diamondDays: 30, sellTolerancePct: 0.1, "…": "…" },
        explainer: { headline: "How the Ronke Score works", "…": "…" },
      },
      meta: { score_version: "v1-3f9a2c11", "…": "…" },
    },
  },
  {
    path: "/stats",
    file: "app/api/v1/stats/route.ts",
    summary: "State of the Ronkeverse",
    description:
      "Holder counts, DEX prices, supply and burn figures per token, NFT volume, and badge " +
      "totals. Market and supply fields degrade to null rather than failing the request.",
    params: [],
    cacheSeconds: 900,
    example: {
      data: {
        ronke_token: {
          holders: 8003,
          price_usd: 0.00029,
          supply: { minted: 1000000000, circulating: 869394568, burned_pct: 0.1306 },
        },
        ronkeverse_nft: { holders: 1200, volume_7d_wron: 415 },
      },
      meta: { as_of: "2026-08-06T07:10:00.000Z", "…": "…" },
    },
  },
  {
    path: "/meta",
    file: "app/api/v1/meta/route.ts",
    summary: "Freshness, versions, and indexed contracts",
    description:
      "When the data was last rebuilt, how many wallets are scored, the rebuild schedule, and " +
      "the exact contract addresses this API indexes. Doubles as a health check.",
    params: [],
    cacheSeconds: 300,
    example: {
      data: {
        as_of: "2026-08-06T07:10:00.000Z",
        scored_population: 6112,
        rebuild_schedule_utc: "0 7 * * *",
        chain: "ronin",
        contracts: [
          {
            asset: "ronke_token",
            label: "$RONKE",
            address: "0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb",
            standard: "erc20",
            decimals: 18,
          },
        ],
      },
      meta: { "…": "…" },
    },
  },
];

/** Documented error codes, with what each one means for a caller. */
export const ERROR_REFERENCE: { code: string; status: number; meaning: string }[] = [
  { code: "invalid_address", status: 400, meaning: "Not a 0x address (or not a .ron name)." },
  { code: "invalid_param", status: 400, meaning: "A query parameter was malformed or over its cap." },
  { code: "invalid_token_id", status: 400, meaning: "Token id outside 1-6969." },
  {
    code: "name_not_resolved",
    status: 404,
    meaning: "That .ron name is not in our cache. Use the 0x address.",
  },
  { code: "too_many_addresses", status: 400, meaning: "Batch request over the 50-address cap." },
  { code: "not_found", status: 404, meaning: "No such indexed Ronkeverse token." },
  { code: "not_configured", status: 503, meaning: "Server-side database not configured." },
  { code: "internal", status: 500, meaning: "Something failed our side. Retry." },
];

/**
 * The three caveats every integrator needs before writing a line of code. These
 * lead the docs page - they are not footnotes, because each one produces a bug
 * that looks like an API fault from the outside.
 */
export const CAVEATS = [
  {
    title: "The data is a daily snapshot",
    body:
      "Everything here is rebuilt once a day at 07:00 UTC and does not change in between. " +
      "meta.as_of tells you which rebuild you are looking at. A player who buys $RONKE will " +
      "not see their score move until the next rebuild, so do not poll this every minute and " +
      "do not treat it as live chain state.",
  },
  {
    title: "Gate on rank, not on a raw score threshold",
    body:
      "score is the number your community recognises, so it leads every response. But its " +
      "absolute size shifts whenever the weights are retuned - one past calibration moved the " +
      "top wallet from 17,133 to 8,830, which would have quietly emptied any \"score > 5000\" " +
      "gate. rank survives that: the top 100 is always 100 people. Use percentile instead if " +
      "your gate should also hold as the holder base grows. meta.score_version changes on " +
      "every retune, so you can detect one.",
  },
  {
    title: "A wallet with no score is not an error",
    body:
      "Wallets scoring zero are never stored, so an unknown wallet returns 200 with " +
      "found:false, score 0, and rank null. Treat that as \"no standing yet\", not as a " +
      "failure - otherwise every new player sees an error screen. rank is null rather than " +
      "last place, because unranked and genuinely-last are different facts.",
  },
];
