/**
 * Read-only data access over the derived snapshot tables (KTD-7: the Vercel app
 * never calls the chain or rebuilds - it only reads Neon). Every function
 * degrades gracefully when DATABASE_URL is unset (getSql() -> null), returning
 * empty view models so the UI shows a clean pre-data state instead of crashing.
 */

import { getSql } from "@/db/client";
import { CONTRACTS, ASSETS, bestBucket } from "@/config/contracts";
import type { Asset } from "@/config/contracts";
import type { DiamondBucket } from "@/config/contracts";
import { toWholeTokens } from "@/lib/format";

export interface MetaState {
  lastSyncAt: string | null;
  lastRebuildAt: string | null;
  backfillComplete: boolean;
  revealedSupply: number | null;
}

export async function getMetaState(): Promise<MetaState> {
  const sql = getSql();
  if (!sql) return { lastSyncAt: null, lastRebuildAt: null, backfillComplete: false, revealedSupply: null };
  const rows = await sql`SELECT key, value FROM meta`;
  const m = new Map(rows.map((r) => [r.key as string, r.value as string]));
  return {
    lastSyncAt: m.get("last_sync_at") ?? null,
    lastRebuildAt: m.get("last_rebuild_at") ?? null,
    backfillComplete: m.get("backfill_complete") === "true",
    revealedSupply: m.has("revealed_supply") ? Number(m.get("revealed_supply")) : null,
  };
}

export interface OverviewData {
  holderCount: number;
  whaleCount: number;
  supplyHeld: string; // raw base units (string)
  diamondPct: number; // 0..1 share of current holders in diamond bucket
  diamondDistribution: Record<DiamondBucket, number>;
  neverSoldPct: number; // 0..1 of current holders
  series: { date: string; holderCount: number; supplyHeld: string; gini: number }[];
}

export async function getOverview(asset: Asset): Promise<OverviewData> {
  const empty: OverviewData = {
    holderCount: 0,
    whaleCount: 0,
    supplyHeld: "0",
    diamondPct: 0,
    diamondDistribution: { paper: 0, regular: 0, diamond: 0 },
    neverSoldPct: 0,
    series: [],
  };
  const sql = getSql();
  if (!sql) return empty;

  const holders = await sql`
    SELECT count(*)::int AS n,
           coalesce(sum(CASE WHEN balance > 0 THEN balance ELSE token_count END), 0)::text AS supply
    FROM holder_balances WHERE asset = ${asset} AND is_current_holder = true
  `;
  const dist = await sql`
    SELECT m.diamond_bucket AS bucket, count(*)::int AS n,
           sum(CASE WHEN m.never_sold THEN 1 ELSE 0 END)::int AS never_sold
    FROM holder_metrics m
    JOIN holder_balances b ON b.asset = m.asset AND b.address = m.address AND b.is_current_holder = true
    WHERE m.asset = ${asset}
    GROUP BY m.diamond_bucket
  `;
  const distribution: Record<DiamondBucket, number> = { paper: 0, regular: 0, diamond: 0 };
  let total = 0;
  let neverSold = 0;
  for (const r of dist) {
    distribution[r.bucket as DiamondBucket] = Number(r.n);
    total += Number(r.n);
    neverSold += Number(r.never_sold);
  }
  const whales = await sql`
    SELECT coalesce(whale_count, 0)::int AS n FROM snapshot_daily
    WHERE asset = ${asset} ORDER BY date DESC LIMIT 1
  `;
  const series = await sql`
    SELECT date::text AS date, holder_count, supply_held::text AS supply_held, gini
    FROM snapshot_daily WHERE asset = ${asset} ORDER BY date ASC
  `;
  const holderCount = Number(holders[0]?.n ?? 0);
  return {
    holderCount,
    whaleCount: Number(whales[0]?.n ?? 0),
    supplyHeld: String(holders[0]?.supply ?? "0"),
    diamondPct: total > 0 ? distribution.diamond / total : 0,
    diamondDistribution: distribution,
    neverSoldPct: total > 0 ? neverSold / total : 0,
    series: series.map((r) => ({
      date: r.date as string,
      holderCount: Number(r.holder_count),
      supplyHeld: String(r.supply_held),
      gini: Number(r.gini),
    })),
  };
}

// ── Market data (E6) ─────────────────────────────────────────────────

/** $RONKE market snapshot from GeckoTerminal (low-liquidity DEX quote). */
export interface TokenMarketView {
  priceUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  fetchedAt: string | null;
}

export async function getTokenMarket(asset: Asset = "ronke_token"): Promise<TokenMarketView | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT snapshot, fetched_at::text AS fetched_at
    FROM market_snapshots WHERE source = 'geckoterminal' AND asset = ${asset}
  `;
  if (rows.length === 0) return null;
  const s = (rows[0].snapshot as Record<string, unknown>) ?? {};
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    priceUsd: n(s.priceUsd),
    volume24hUsd: n(s.volume24hUsd),
    liquidityUsd: n(s.liquidityUsd),
    marketCapUsd: n(s.marketCapUsd),
    fdvUsd: n(s.fdvUsd),
    fetchedAt: (rows[0].fetched_at as string | null) ?? null,
  };
}

// ── Supply / burn stats (Burn tracker) ───────────────────────────────

/**
 * Token supply picture derived from the transfer_events ledger, in whole
 * tokens. Both tokens burn via transfers to the dead address (verified
 * on-chain 2026-07-09), so ledger mints/burns reconstruct supply exactly:
 * minted = the one genesis mint (1B RONKE / 21M RONKESTR), burned = sum of
 * is_burn rows, circulating = minted - burned.
 */
export interface SupplyStats {
  /** Whole tokens ever minted (= the token's total supply). */
  minted: number;
  /** Whole tokens sent to burn addresses, forever out of circulation. */
  burned: number;
  /** minted - burned. */
  circulating: number;
  /** 0..1 share of minted supply that is burned. */
  burnedPct: number;
}

/** Pure: raw base-unit mint/burn sums -> whole-token supply view. */
export function supplyStatsFrom(mintedRaw: bigint, burnedRaw: bigint, asset: Asset): SupplyStats {
  const minted = toWholeTokens(mintedRaw, asset);
  const burned = toWholeTokens(burnedRaw, asset);
  const circulating = toWholeTokens(mintedRaw - burnedRaw, asset);
  return { minted, burned, circulating, burnedPct: minted > 0 ? burned / minted : 0 };
}

/**
 * Read-time aggregate over the flagged mint/burn rows (a few hundred per
 * token). The outer `AND (is_mint OR is_burn)` is load-bearing: it makes the
 * query predicate imply transfer_events_supply_idx's partial predicate so the
 * planner uses the index instead of scanning the whole asset partition.
 */
export async function getSupplyStats(asset: Asset): Promise<SupplyStats | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT
      coalesce(sum(quantity) FILTER (WHERE is_mint), 0)::text AS minted,
      coalesce(sum(quantity) FILTER (WHERE is_burn), 0)::text AS burned
    FROM transfer_events
    WHERE asset = ${asset} AND (is_mint OR is_burn)
  `;
  const big = (v: unknown) => BigInt(String(v ?? "0").split(".")[0] || "0");
  return supplyStatsFrom(big(rows[0]?.minted), big(rows[0]?.burned), asset);
}

export interface MarketCapDisplay {
  valueUsd: number | null;
  /** True when derived as price x circulating because the source had no cap. */
  computed: boolean;
}

/**
 * Market cap for display. GeckoTerminal only reports market_cap_usd for
 * CoinGecko-listed tokens ($RONKE yes, RONKESTR no - verified 2026-07-09), so
 * when the source is null we compute price x circulating (minted - burned)
 * from our own ledger and flag it so the UI can label the sourcing honestly.
 */
export function displayMarketCap(
  market: TokenMarketView | null | undefined,
  supply: SupplyStats | null | undefined,
): MarketCapDisplay {
  if (market?.marketCapUsd != null) return { valueUsd: market.marketCapUsd, computed: false };
  if (market?.priceUsd != null && supply != null && supply.circulating > 0) {
    return { valueUsd: market.priceUsd * supply.circulating, computed: true };
  }
  return { valueUsd: null, computed: false };
}

/** Ronkeverse on-chain market stats, in whole WRON (all venues). */
export interface NftMarketView {
  volume24hWron: number;
  volume7dWron: number;
  sales24h: number;
  totalSales: number;
  lastSaleWron: number | null;
  lastSaleAt: string | null;
  avgPrice30dWron: number | null;
}

const WRON_DIVISOR = 1e18;
const wholeWron = (raw: unknown): number => Number(raw ?? 0) / WRON_DIVISOR;

export async function getNftMarket(): Promise<NftMarketView | null> {
  const sql = getSql();
  if (!sql) return null;
  const agg = await sql`
    SELECT
      coalesce(sum(price_wron) FILTER (WHERE block_time > now() - interval '24 hours'), 0)::text AS vol24,
      coalesce(sum(price_wron) FILTER (WHERE block_time > now() - interval '7 days'), 0)::text AS vol7,
      count(*) FILTER (WHERE block_time > now() - interval '24 hours')::int AS sales24,
      count(*)::int AS total,
      avg(price_wron) FILTER (WHERE block_time > now() - interval '30 days')::text AS avg30
    FROM nft_sales WHERE asset = 'ronkeverse_nft'
  `;
  const total = Number(agg[0]?.total ?? 0);
  if (total === 0) return null;
  const last = await sql`
    SELECT price_wron::text AS p, block_time::text AS t
    FROM nft_sales WHERE asset = 'ronkeverse_nft' ORDER BY block_time DESC LIMIT 1
  `;
  return {
    volume24hWron: wholeWron(agg[0]?.vol24),
    volume7dWron: wholeWron(agg[0]?.vol7),
    sales24h: Number(agg[0]?.sales24 ?? 0),
    totalSales: total,
    lastSaleWron: last[0]?.p != null ? wholeWron(last[0].p) : null,
    lastSaleAt: (last[0]?.t as string | null) ?? null,
    avgPrice30dWron: agg[0]?.avg30 != null ? wholeWron(agg[0].avg30) : null,
  };
}

/** Ecosystem-wide stats for the landing strip (E7). */
export interface EcosystemStats {
  ronkeHolders: number;
  ronkePriceUsd: number | null;
  ronkestrHolders: number;
  ronkestrPriceUsd: number | null;
  ronkeverseHolders: number;
  ronkeverse7dVolWron: number | null;
  ratedWallets: number;
  totalBadges: number;
}

export async function getEcosystemStats(): Promise<EcosystemStats> {
  const empty: EcosystemStats = {
    ronkeHolders: 0,
    ronkePriceUsd: null,
    ronkestrHolders: 0,
    ronkestrPriceUsd: null,
    ronkeverseHolders: 0,
    ronkeverse7dVolWron: null,
    ratedWallets: 0,
    totalBadges: 0,
  };
  const sql = getSql();
  if (!sql) return empty;
  const holders = await sql`
    SELECT asset, count(*)::int AS n
    FROM holder_balances WHERE is_current_holder = true GROUP BY asset
  `;
  const byAsset = new Map(holders.map((r) => [r.asset as string, Number(r.n)]));
  const badges = await sql`
    SELECT count(*)::int AS total, count(DISTINCT address)::int AS wallets FROM wallet_badges
  `;
  const [token, ronkestr, nft] = await Promise.all([
    getTokenMarket("ronke_token"),
    getTokenMarket("ronkestr_token"),
    getNftMarket(),
  ]);
  return {
    ronkeHolders: byAsset.get("ronke_token") ?? 0,
    ronkePriceUsd: token?.priceUsd ?? null,
    ronkestrHolders: byAsset.get("ronkestr_token") ?? 0,
    ronkestrPriceUsd: ronkestr?.priceUsd ?? null,
    ronkeverseHolders: byAsset.get("ronkeverse_nft") ?? 0,
    ronkeverse7dVolWron: nft?.volume7dWron ?? null,
    ratedWallets: Number(badges[0]?.wallets ?? 0),
    totalBadges: Number(badges[0]?.total ?? 0),
  };
}

// ── Ronke Score (S-series) ───────────────────────────────────────────

export interface ScoreLeaderboardRow {
  address: string;
  name: string | null;
  score: number;
  /** Competition rank; null until the first post-migration derive. */
  rank: number | null;
  percentile: number | null;
  ronkeSubscore: number;
  ronkestrSubscore: number;
  nftSubscore: number;
  bodyTypesHeld: number;
  bodyTypesTotal: number;
}

/** Global Ronke Score leaderboard (asset-agnostic). */
export async function getScoreLeaderboard(page = 0, pageSize = 50): Promise<ScoreLeaderboardRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT s.address, s.score, s.ronke_subscore, s.ronkestr_subscore, s.nft_subscore,
           s.body_types_held, s.body_types_total, s.rank, s.percentile,
           coalesce(al.label, n.name) AS name
    FROM wallet_scores s
    LEFT JOIN rns_names n ON n.address = s.address
    LEFT JOIN address_labels al ON al.address = s.address
    ORDER BY s.score DESC, s.address ASC
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `;
  return rows.map((r) => ({
    address: r.address as string,
    name: (r.name as string | null) ?? null,
    score: Number(r.score),
    rank: r.rank == null ? null : Number(r.rank),
    percentile: r.percentile == null ? null : Number(r.percentile),
    ronkeSubscore: Number(r.ronke_subscore),
    ronkestrSubscore: Number(r.ronkestr_subscore),
    nftSubscore: Number(r.nft_subscore),
    bodyTypesHeld: Number(r.body_types_held),
    bodyTypesTotal: Number(r.body_types_total),
  }));
}

export interface WalletScore {
  score: number;
  rank: number | null;
  /** 0-100 within the scored population; null until the first post-migration derive. */
  percentile: number | null;
  ronkeSubscore: number;
  ronkestrSubscore: number;
  nftSubscore: number;
  ronkeHolding: number;
  ronkeDuration: number;
  ronkeDiamondMult: number;
  ronkestrHolding: number;
  ronkestrDuration: number;
  ronkestrDiamondMult: number;
  nftHolding: number;
  nftDuration: number;
  nftDiamondMult: number;
  collectorPoints: number;
  bodyTypesHeld: number;
  bodyTypesTotal: number;
  oneOfOnePoints: number;
  oneOfOneCount: number;
}

/** Total wallets carrying a non-zero Ronke Score - the percentile denominator. */
export async function getScoredPopulation(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql`SELECT count(*)::int AS n FROM wallet_scores`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * One wallet's Ronke Score + breakdown + global rank, for the profile.
 *
 * Rank and percentile are persisted by deriveScores (one sort at rebuild time)
 * rather than recomputed per request. The `count(*)` fallback below exists only
 * for the window between deploying the migration and the next nightly rebuild,
 * when the new columns are still NULL for every row; it reproduces the exact
 * pre-migration semantics so the profile never shows a blank rank.
 */
export async function getWalletScore(address: string): Promise<WalletScore | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT score, ronke_subscore, ronkestr_subscore, nft_subscore,
           ronke_holding, ronke_duration, ronke_diamond_mult,
           ronkestr_holding, ronkestr_duration, ronkestr_diamond_mult,
           nft_holding, nft_duration, nft_diamond_mult,
           collector_points, body_types_held, body_types_total,
           oneofone_points, oneofone_count, rank, percentile
    FROM wallet_scores WHERE address = ${address}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  let rank = r.rank == null ? null : Number(r.rank);
  let percentile = r.percentile == null ? null : Number(r.percentile);
  if (rank == null) {
    const [aboveRow, popRow] = await Promise.all([
      sql`SELECT count(*)::int AS above FROM wallet_scores WHERE score > ${Number(r.score)}`,
      sql`SELECT count(*)::int AS n FROM wallet_scores`,
    ]);
    rank = Number(aboveRow[0]?.above ?? 0) + 1;
    const population = Number(popRow[0]?.n ?? 0);
    // Same 2-decimal rounding rankScores applies, so a wallet read during this
    // transitional window reports the same precision it will after the rebuild.
    const raw = population > 0 ? (100 * (population - rank)) / population : 0;
    percentile = Math.round(raw * 100) / 100;
  }
  return {
    score: Number(r.score),
    rank,
    percentile,
    ronkeSubscore: Number(r.ronke_subscore),
    ronkestrSubscore: Number(r.ronkestr_subscore),
    nftSubscore: Number(r.nft_subscore),
    ronkeHolding: Number(r.ronke_holding),
    ronkeDuration: Number(r.ronke_duration),
    ronkeDiamondMult: Number(r.ronke_diamond_mult),
    ronkestrHolding: Number(r.ronkestr_holding),
    ronkestrDuration: Number(r.ronkestr_duration),
    ronkestrDiamondMult: Number(r.ronkestr_diamond_mult),
    nftHolding: Number(r.nft_holding),
    nftDuration: Number(r.nft_duration),
    nftDiamondMult: Number(r.nft_diamond_mult),
    collectorPoints: Number(r.collector_points),
    bodyTypesHeld: Number(r.body_types_held),
    bodyTypesTotal: Number(r.body_types_total),
    oneOfOnePoints: Number(r.oneofone_points),
    oneOfOneCount: Number(r.oneofone_count),
  };
}

/**
 * Many wallets' scores in ONE query, for the public batch endpoint.
 *
 * The whole point of the batch route is that a caller checking 50 wallets costs
 * one round-trip, not 50 - so this must stay a single `= ANY` lookup. Returns a
 * Map keyed by lowercased address; absent addresses are simply missing from it
 * (callers fill the zeroed shape, since "not in wallet_scores" means "scored
 * zero", not "unknown wallet").
 */
export async function getWalletScoresBatch(
  addresses: string[],
): Promise<Map<string, WalletScore>> {
  const out = new Map<string, WalletScore>();
  if (addresses.length === 0) return out;
  const sql = getSql();
  if (!sql) return out;
  const rows = await sql`
    SELECT address, score, ronke_subscore, ronkestr_subscore, nft_subscore,
           ronke_holding, ronke_duration, ronke_diamond_mult,
           ronkestr_holding, ronkestr_duration, ronkestr_diamond_mult,
           nft_holding, nft_duration, nft_diamond_mult,
           collector_points, body_types_held, body_types_total,
           oneofone_points, oneofone_count, rank, percentile
    FROM wallet_scores WHERE address = ANY(${addresses})
  `;
  for (const r of rows) {
    out.set(r.address as string, {
      score: Number(r.score),
      rank: r.rank == null ? null : Number(r.rank),
      percentile: r.percentile == null ? null : Number(r.percentile),
      ronkeSubscore: Number(r.ronke_subscore),
      ronkestrSubscore: Number(r.ronkestr_subscore),
      nftSubscore: Number(r.nft_subscore),
      ronkeHolding: Number(r.ronke_holding),
      ronkeDuration: Number(r.ronke_duration),
      ronkeDiamondMult: Number(r.ronke_diamond_mult),
      ronkestrHolding: Number(r.ronkestr_holding),
      ronkestrDuration: Number(r.ronkestr_duration),
      ronkestrDiamondMult: Number(r.ronkestr_diamond_mult),
      nftHolding: Number(r.nft_holding),
      nftDuration: Number(r.nft_duration),
      nftDiamondMult: Number(r.nft_diamond_mult),
      collectorPoints: Number(r.collector_points),
      bodyTypesHeld: Number(r.body_types_held),
      bodyTypesTotal: Number(r.body_types_total),
      oneOfOnePoints: Number(r.oneofone_points),
      oneOfOneCount: Number(r.oneofone_count),
    });
  }
  return out;
}

/** One row of the full-dump endpoint: the minimum a role-gating bot needs. */
export interface CompactScore {
  address: string;
  score: number;
  rank: number | null;
  percentile: number | null;
}

/**
 * Every scored wallet, compact, for the public full-dump endpoint.
 *
 * Deliberately four columns. A Discord bot re-checking its whole membership
 * needs address + standing and nothing else; including sub-scores and the
 * points breakdown would roughly quadruple a response that is already the
 * largest this API serves.
 *
 * `arrayMode` for the same reason `readEvents` uses it (commit c83fceb): at
 * several thousand rows the repeated JSON key names are a meaningful share of
 * the bytes Neon ships us, and this is the one read where row count is
 * unbounded by a caller-supplied limit.
 *
 * `cap` is a safety valve, not a paging mechanism - it exists so that if the
 * scored population ever grows an order of magnitude this degrades visibly
 * (via the returned `complete` flag) instead of quietly serving a huge payload.
 */
export async function getAllScoresCompact(
  cap: number,
): Promise<{ rows: CompactScore[]; complete: boolean }> {
  const sql = getSql();
  if (!sql) return { rows: [], complete: true };
  // Column order is load-bearing: arrayMode returns positional rows.
  const raw = (await sql.query(
    `SELECT address, score, rank, percentile
     FROM wallet_scores
     ORDER BY score DESC, address ASC
     LIMIT $1`,
    [cap + 1], // one extra row is how we detect "there were more"
    { arrayMode: true },
  )) as unknown[][];

  const complete = raw.length <= cap;
  const rows = (complete ? raw : raw.slice(0, cap)).map((r) => ({
    address: r[0] as string,
    score: Number(r[1]),
    rank: r[2] == null ? null : Number(r[2]),
    percentile: r[3] == null ? null : Number(r[3]),
  }));
  return { rows, complete };
}

export interface HolderRow {
  address: string;
  /** Primary .ron name (E4), or null. */
  name: string | null;
  balance: string;
  tokenCount: number;
  holdingDurationDays: number;
  diamondBucket: DiamondBucket;
  neverSold: boolean;
}

export interface HoldersData {
  gini: number;
  top10Pct: number;
  histogram: { label: string; count: number }[];
  holders: HolderRow[];
}

export async function getHolders(asset: Asset, limit = 100): Promise<HoldersData> {
  const sql = getSql();
  if (!sql) return { gini: 0, top10Pct: 0, histogram: [], holders: [] };
  const latest = await sql`
    SELECT gini, top10_pct FROM snapshot_daily WHERE asset = ${asset}
    ORDER BY date DESC LIMIT 1
  `;
  const rows = await sql`
    SELECT b.address, b.balance::text AS balance, b.token_count,
           coalesce(m.holding_duration_days, 0) AS dur,
           coalesce(m.diamond_bucket, 'paper') AS bucket,
           coalesce(m.never_sold, false) AS never_sold,
           coalesce(al.label, n.name) AS name
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
    LEFT JOIN rns_names n ON n.address = b.address
    LEFT JOIN address_labels al ON al.address = b.address
    WHERE b.asset = ${asset} AND b.is_current_holder = true
    ORDER BY (CASE WHEN b.balance > 0 THEN b.balance ELSE b.token_count END) DESC
    LIMIT ${limit}
  `;
  return {
    gini: Number(latest[0]?.gini ?? 0),
    top10Pct: Number(latest[0]?.top10_pct ?? 0),
    histogram: [],
    holders: rows.map((r) => ({
      address: r.address as string,
      name: (r.name as string | null) ?? null,
      balance: String(r.balance),
      tokenCount: Number(r.token_count),
      holdingDurationDays: Number(r.dur),
      diamondBucket: r.bucket as DiamondBucket,
      neverSold: r.never_sold as boolean,
    })),
  };
}

export interface LeaderboardRow extends HolderRow {
  weightedDurationDays: number;
}

export async function getLeaderboard(
  asset: Asset,
  page = 0,
  pageSize = 50,
): Promise<LeaderboardRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const orderExpr = sql`(CASE WHEN b.balance > 0 THEN b.balance ELSE b.token_count END) DESC`;
  const rows = await sql`
    SELECT b.address, b.balance::text AS balance, b.token_count,
           coalesce(m.holding_duration_days, 0) AS dur,
           coalesce(m.weighted_duration_days, 0) AS wdur,
           coalesce(m.diamond_bucket, 'paper') AS bucket,
           coalesce(m.never_sold, false) AS never_sold,
           coalesce(al.label, n.name) AS name
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
    LEFT JOIN rns_names n ON n.address = b.address
    LEFT JOIN address_labels al ON al.address = b.address
    WHERE b.asset = ${asset} AND b.is_current_holder = true
    ORDER BY ${orderExpr}
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `;
  return rows.map((r) => ({
    address: r.address as string,
    name: (r.name as string | null) ?? null,
    balance: String(r.balance),
    tokenCount: Number(r.token_count),
    holdingDurationDays: Number(r.dur),
    weightedDurationDays: Number(r.wdur),
    diamondBucket: r.bucket as DiamondBucket,
    neverSold: r.never_sold as boolean,
  }));
}

export interface WalletHeldToken {
  tokenId: string;
  rarityRank: number | null;
  imageUrl: string | null;
  /** 'standard' (ranked) vs the two 1/1 buckets - 1/1s show a tier label, not a rank. */
  tier: "standard" | "community_1of1" | "official_1of1";
}

/**
 * Per-asset holding breakdown so the profile can report duration / diamond
 * bucket / first-buy PER asset - an aggregate "held for 10 mo" is ambiguous
 * across three different assets.
 */
export interface WalletAssetHolding {
  asset: Asset;
  label: string;
  /** Raw balance base units (tokens); "0" for NFTs. */
  balance: string;
  /** NFT count; 0 for tokens. */
  tokenCount: number;
  /** Currently holding a positive amount of this asset. */
  isHeld: boolean;
  holdingDurationDays: number;
  diamondBucket: DiamondBucket | null;
  firstAcquiredAt: string | null;
  neverSold: boolean;
  everPaperSold: boolean;
}

export interface WalletData {
  address: string;
  /** Primary .ron name (E4), or null. */
  name: string | null;
  ronkeBalance: string;
  ronkestrBalance: string;
  ronkeverseCount: number;
  holdingDurationDays: number;
  diamondBucket: DiamondBucket | null;
  neverSold: boolean;
  everPaperSold: boolean;
  firstAcquiredAt: string | null;
  /** Per-asset breakdown ($RONKE, RonkeStr, Ronkeverse), in that order. */
  assetHoldings: WalletAssetHolding[];
  heldTokens: WalletHeldToken[];
  everHeld: boolean;
}

export async function getWallet(address: string): Promise<WalletData> {
  const empty: WalletData = {
    address,
    name: null,
    ronkeBalance: "0",
    ronkestrBalance: "0",
    ronkeverseCount: 0,
    holdingDurationDays: 0,
    diamondBucket: null,
    neverSold: false,
    everPaperSold: false,
    firstAcquiredAt: null,
    assetHoldings: [],
    heldTokens: [],
    everHeld: false,
  };
  const sql = getSql();
  if (!sql) return empty;
  const balances = await sql`
    SELECT asset, balance::text AS balance, token_count,
           first_acquired_at::text AS first_acquired_at
    FROM holder_balances WHERE address = ${address}
  `;
  const metrics = await sql`
    SELECT asset, holding_duration_days, diamond_bucket, never_sold, ever_paper_sold
    FROM holder_metrics WHERE address = ${address}
  `;
  const nameRow = await sql`
    SELECT coalesce(al.label, n.name) AS name
    FROM (SELECT ${address}::text AS address) a
    LEFT JOIN rns_names n ON n.address = a.address
    LEFT JOIN address_labels al ON al.address = a.address
  `;
  const name = (nameRow[0]?.name as string | null) ?? null;
  if (balances.length === 0 && metrics.length === 0) return { ...empty, name };

  let ronkeBalance = "0";
  let ronkestrBalance = "0";
  let ronkeverseCount = 0;
  let firstAcquiredAt: string | null = null;
  for (const r of balances) {
    if (r.asset === "ronke_token") ronkeBalance = String(r.balance);
    else if (r.asset === "ronkestr_token") ronkestrBalance = String(r.balance);
    else ronkeverseCount = Number(r.token_count);
    const fa = r.first_acquired_at as string | null;
    if (fa && (firstAcquiredAt === null || fa < firstAcquiredAt)) firstAcquiredAt = fa;
  }
  let holdingDurationDays = 0;
  let diamondBucket: DiamondBucket | null = null;
  let neverSold = true;
  let everPaperSold = false;
  for (const r of metrics) {
    holdingDurationDays = Math.max(holdingDurationDays, Number(r.holding_duration_days));
    // Best bucket across the wallet's assets. The metrics SELECT has no ORDER BY,
    // so this has to be order-independent (see bestBucket).
    diamondBucket = bestBucket(diamondBucket, r.diamond_bucket as DiamondBucket);
    neverSold = neverSold && (r.never_sold as boolean);
    everPaperSold = everPaperSold || (r.ever_paper_sold as boolean);
  }

  // Per-asset breakdown: merge the balance + metric rows keyed by asset so each
  // asset reports its own duration / diamond bucket / first buy.
  const balanceByAsset = new Map<string, (typeof balances)[number]>();
  for (const r of balances) balanceByAsset.set(r.asset as string, r);
  const metricByAsset = new Map<string, (typeof metrics)[number]>();
  for (const r of metrics) metricByAsset.set(r.asset as string, r);
  const assetHoldings: WalletAssetHolding[] = ASSETS.map((asset) => {
    const b = balanceByAsset.get(asset);
    const m = metricByAsset.get(asset);
    const balance = String(b?.balance ?? "0");
    const tokenCount = Number(b?.token_count ?? 0);
    const isHeld = asset === "ronkeverse_nft" ? tokenCount > 0 : BigInt(balance.split(".")[0] || "0") > 0n;
    return {
      asset,
      label: CONTRACTS[asset].label,
      balance,
      tokenCount,
      isHeld,
      holdingDurationDays: Number(m?.holding_duration_days ?? 0),
      diamondBucket: (m?.diamond_bucket as DiamondBucket | undefined) ?? null,
      firstAcquiredAt: (b?.first_acquired_at as string | null) ?? null,
      neverSold: (m?.never_sold as boolean | undefined) ?? false,
      everPaperSold: (m?.ever_paper_sold as boolean | undefined) ?? false,
    };
  });

  const held = await sql`
    SELECT l.token_id, r.rarity_rank, r.image_url, r.tier
    FROM holder_lots l
    LEFT JOIN token_rarity r ON r.token_id = l.token_id
    WHERE l.address = ${address} AND l.asset = 'ronkeverse_nft' AND l.token_id IS NOT NULL
    ORDER BY r.rarity_rank ASC NULLS LAST
  `;
  return {
    address,
    name,
    ronkeBalance,
    ronkestrBalance,
    ronkeverseCount,
    holdingDurationDays,
    diamondBucket,
    neverSold,
    everPaperSold,
    firstAcquiredAt,
    assetHoldings,
    heldTokens: held.map((r) => ({
      tokenId: String(r.token_id),
      rarityRank: r.rarity_rank == null ? null : Number(r.rarity_rank),
      imageUrl: (r.image_url as string | null) ?? null,
      tier: ((r.tier as string) ?? "standard") as WalletHeldToken["tier"],
    })),
    everHeld: true,
  };
}

export interface WalletHistoryPoint {
  date: string;
  balance: number;
}

export interface WalletHistory {
  ronke: WalletHistoryPoint[];
  ronkestr: WalletHistoryPoint[];
  ronkeverse: WalletHistoryPoint[];
}

/**
 * A wallet's balance over time for each asset, reconstructed from the
 * transfer_events log (the append-only source of truth). We fold signed
 * quantities (in = +, out = -) into a running balance; quantity is base units
 * for tokens (converted to whole units) and 1 per NFT (a running count). A final
 * "today" point extends the line to now so a long-time holder reads as a flat
 * line rather than stopping at their last transfer.
 */
async function seriesFor(
  sql: NonNullable<ReturnType<typeof getSql>>,
  asset: Asset,
  address: string,
  decimals: number | null,
  now: Date,
): Promise<WalletHistoryPoint[]> {
  const rows = await sql`
    SELECT block_time::text AS block_time, from_address, to_address, quantity::text AS quantity
    FROM transfer_events
    WHERE asset = ${asset} AND (from_address = ${address} OR to_address = ${address})
    ORDER BY block_time ASC, id ASC
    LIMIT 20000
  `;
  if (rows.length === 0) return [];

  const divisor = decimals != null ? 10 ** decimals : 1;
  let cum = 0n;
  const raw: WalletHistoryPoint[] = [];
  for (const r of rows) {
    const qty = BigInt(String(r.quantity).split(".")[0] || "0");
    if (r.to_address === address) cum += qty;
    if (r.from_address === address) cum -= qty;
    raw.push({ date: String(r.block_time).slice(0, 10), balance: Number(cum) / divisor });
  }
  // Collapse to one point per day (keep the last balance that day), then extend
  // to today so flat holders still render a line to the present.
  const byDay = new Map<string, number>();
  for (const p of raw) byDay.set(p.date, p.balance);
  const points = [...byDay.entries()].map(([date, balance]) => ({ date, balance }));
  const today = now.toISOString().slice(0, 10);
  if (points.length > 0 && points[points.length - 1].date !== today) {
    points.push({ date: today, balance: points[points.length - 1].balance });
  }
  // Downsample for rendering (keep first + last), so a very active wallet stays light.
  const MAX = 400;
  if (points.length <= MAX) return points;
  const step = (points.length - 1) / (MAX - 1);
  const sampled: WalletHistoryPoint[] = [];
  for (let i = 0; i < MAX; i++) sampled.push(points[Math.round(i * step)]);
  return sampled;
}

export async function getWalletHistory(address: string, now = new Date()): Promise<WalletHistory> {
  const sql = getSql();
  const empty: WalletHistory = { ronke: [], ronkestr: [], ronkeverse: [] };
  if (!sql) return empty;
  const [ronke, ronkestr, ronkeverse] = await Promise.all([
    seriesFor(sql, "ronke_token", address, CONTRACTS.ronke_token.decimals ?? 18, now),
    seriesFor(sql, "ronkestr_token", address, CONTRACTS.ronkestr_token.decimals ?? 18, now),
    seriesFor(sql, "ronkeverse_nft", address, null, now),
  ]);
  return { ronke, ronkestr, ronkeverse };
}

export interface WalletBadge {
  badgeKey: string;
  tier: number | null;
  context: Record<string, unknown>;
}

export async function getWalletBadges(address: string): Promise<WalletBadge[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT badge_key, tier, context FROM wallet_badges WHERE address = ${address}
  `;
  return rows.map((r) => ({
    badgeKey: r.badge_key as string,
    tier: r.tier == null ? null : Number(r.tier),
    context: (r.context as Record<string, unknown>) ?? {},
  }));
}

export interface RarityRow {
  tokenId: string;
  rarityRank: number;
  infoContentScore: number;
  imageUrl: string | null;
}

export async function getRarityLeaderboard(
  page = 0,
  pageSize = 60,
  traitFilter?: { traitType: string; value: string },
): Promise<RarityRow[]> {
  const sql = getSql();
  if (!sql) return [];
  // rarity_rank IS NOT NULL is standard-tokens-only (1/1s are null-ranked and
  // shown in their own buckets), so the standard grid stays a clean 1..N ladder.
  const rows = traitFilter
    ? await sql`
        SELECT r.token_id, r.rarity_rank, r.info_content_score, r.image_url
        FROM token_rarity r
        JOIN nft_traits t ON t.token_id = r.token_id
        WHERE t.trait_type = ${traitFilter.traitType} AND t.value = ${traitFilter.value}
          AND r.rarity_rank IS NOT NULL
        ORDER BY r.rarity_rank ASC LIMIT ${pageSize} OFFSET ${page * pageSize}
      `
    : await sql`
        SELECT token_id, rarity_rank, info_content_score, image_url
        FROM token_rarity WHERE rarity_rank IS NOT NULL
        ORDER BY rarity_rank ASC LIMIT ${pageSize} OFFSET ${page * pageSize}
      `;
  return rows.map((r) => ({
    tokenId: String(r.token_id),
    rarityRank: Number(r.rarity_rank),
    infoContentScore: Number(r.info_content_score),
    imageUrl: (r.image_url as string | null) ?? null,
  }));
}

export type OneOfOneTier = "community_1of1" | "official_1of1";

export interface OneOfOneToken {
  tokenId: string;
  imageUrl: string | null;
  /** The showcase name for the piece (e.g. the community artist's title). */
  name: string | null;
}

/**
 * All tokens in a 1/1 bucket (community or official), for the rarity showcase
 * sections. Ordered by token_id. The `name` is the piece's distinctive trait
 * value ("Community 1/1" trait for community pieces), null for official 1/1s.
 */
export async function getOneOfOneBucket(tier: OneOfOneTier): Promise<OneOfOneToken[]> {
  const sql = getSql();
  if (!sql) return [];
  const nameTrait = tier === "community_1of1" ? "Community 1/1" : null;
  const rows = await sql`
    SELECT r.token_id, r.image_url, nt.value AS name
    FROM token_rarity r
    LEFT JOIN nft_traits nt
      ON nt.token_id = r.token_id AND nt.trait_type = ${nameTrait}
    WHERE r.tier = ${tier}
    ORDER BY r.token_id::bigint ASC
  `;
  return rows.map((r) => ({
    tokenId: String(r.token_id),
    imageUrl: (r.image_url as string | null) ?? null,
    name: (r.name as string | null) ?? null,
  }));
}

export interface OneOfOneCounts {
  community: number;
  official: number;
}

/**
 * How many 1/1s exist in each bucket, for the rarity-page tab labels. Cheap
 * (a single grouped count) so it can be fetched on every view without pulling
 * the token rows themselves.
 */
export async function getOneOfOneCounts(): Promise<OneOfOneCounts> {
  const sql = getSql();
  if (!sql) return { community: 0, official: 0 };
  const rows = await sql`
    SELECT tier, count(*)::int AS n FROM token_rarity
    WHERE tier IN ('community_1of1', 'official_1of1')
    GROUP BY tier
  `;
  let community = 0;
  let official = 0;
  for (const r of rows) {
    if (r.tier === "community_1of1") community = Number(r.n);
    else if (r.tier === "official_1of1") official = Number(r.n);
  }
  return { community, official };
}

export interface DailyToken {
  tokenId: string;
  rarityRank: number | null;
  imageUrl: string;
}

/**
 * "Today's Random Ronke" for the hero. Deterministic per `seed` (pass the day,
 * e.g. "2026-07-06") so it's stable for the day and rotates daily, while still
 * looking random. Only picks tokens that actually have an image. Null when no
 * ranked/imaged tokens exist yet (DB empty), so the caller can fall back.
 */
export async function getDailyRandomToken(seed: string): Promise<DailyToken | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT token_id, rarity_rank, image_url
    FROM token_rarity
    WHERE image_url IS NOT NULL AND image_url <> ''
    ORDER BY md5(token_id || ${seed})
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    tokenId: String(r.token_id),
    rarityRank: r.rarity_rank == null ? null : Number(r.rarity_rank),
    imageUrl: String(r.image_url),
  };
}

export interface TokenDetail {
  tokenId: string;
  rarityRank: number | null;
  tier: "standard" | "community_1of1" | "official_1of1";
  infoContentScore: number;
  imageUrl: string | null;
  traits: { traitType: string; value: string; probability: number }[];
  /** Current holder of this token (from holder_lots), with .ron name if any. */
  owner: { address: string; name: string | null } | null;
}

export async function getToken(tokenId: string): Promise<TokenDetail | null> {
  const sql = getSql();
  if (!sql) return null;
  const rarity = await sql`
    SELECT token_id, rarity_rank, tier, info_content_score, image_url
    FROM token_rarity WHERE token_id = ${tokenId}
  `;
  if (rarity.length === 0) return null;
  const traits = await sql`
    SELECT t.trait_type, t.value, coalesce(s.probability, 0) AS probability
    FROM nft_traits t
    LEFT JOIN trait_stats s ON s.trait_type = t.trait_type AND s.value = t.value
    WHERE t.token_id = ${tokenId}
    ORDER BY probability ASC
  `;
  // Current owner: the wallet holding this token in holder_lots, with the
  // curated label (e.g. "RonkeStrategy wallet") or .ron name.
  const ownerRows = await sql`
    SELECT l.address, coalesce(al.label, n.name) AS name
    FROM holder_lots l
    LEFT JOIN rns_names n ON n.address = l.address
    LEFT JOIN address_labels al ON al.address = l.address
    WHERE l.asset = 'ronkeverse_nft' AND l.token_id = ${tokenId}
    LIMIT 1
  `;
  const owner = ownerRows[0]
    ? { address: ownerRows[0].address as string, name: (ownerRows[0].name as string | null) ?? null }
    : null;
  const r = rarity[0];
  return {
    tokenId: String(r.token_id),
    rarityRank: r.rarity_rank == null ? null : Number(r.rarity_rank),
    tier: ((r.tier as string) ?? "standard") as TokenDetail["tier"],
    infoContentScore: Number(r.info_content_score),
    imageUrl: (r.image_url as string | null) ?? null,
    traits: traits.map((t) => ({
      traitType: t.trait_type as string,
      value: t.value as string,
      probability: Number(t.probability),
    })),
    owner,
  };
}

export interface TraitDistribution {
  traitType: string;
  values: { value: string; count: number; probability: number }[];
}

export async function getTraitDistribution(): Promise<TraitDistribution[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT trait_type, value, count, probability FROM trait_stats
    WHERE trait_type <> '_trait_count'
    ORDER BY trait_type ASC, count DESC
  `;
  const map = new Map<string, TraitDistribution>();
  for (const r of rows) {
    const tt = r.trait_type as string;
    const d = map.get(tt) ?? { traitType: tt, values: [] };
    d.values.push({ value: r.value as string, count: Number(r.count), probability: Number(r.probability) });
    map.set(tt, d);
  }
  return [...map.values()];
}
