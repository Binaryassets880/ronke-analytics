/**
 * Read-only data access over the derived snapshot tables (KTD-7: the Vercel app
 * never calls the chain or rebuilds - it only reads Neon). Every function
 * degrades gracefully when DATABASE_URL is unset (getSql() -> null), returning
 * empty view models so the UI shows a clean pre-data state instead of crashing.
 */

import { getSql } from "@/db/client";
import type { Asset } from "@/config/contracts";
import type { DiamondBucket } from "@/config/contracts";

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
  fetchedAt: string | null;
}

export async function getTokenMarket(): Promise<TokenMarketView | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT snapshot, fetched_at::text AS fetched_at
    FROM market_snapshots WHERE source = 'geckoterminal' AND asset = 'ronke_token'
  `;
  if (rows.length === 0) return null;
  const s = (rows[0].snapshot as Record<string, unknown>) ?? {};
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    priceUsd: n(s.priceUsd),
    volume24hUsd: n(s.volume24hUsd),
    liquidityUsd: n(s.liquidityUsd),
    marketCapUsd: n(s.marketCapUsd),
    fetchedAt: (rows[0].fetched_at as string | null) ?? null,
  };
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
  ronkeverseHolders: number;
  ronkeverse7dVolWron: number | null;
  ratedWallets: number;
  totalBadges: number;
}

export async function getEcosystemStats(): Promise<EcosystemStats> {
  const empty: EcosystemStats = {
    ronkeHolders: 0,
    ronkePriceUsd: null,
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
  const [token, nft] = await Promise.all([getTokenMarket(), getNftMarket()]);
  return {
    ronkeHolders: byAsset.get("ronke_token") ?? 0,
    ronkePriceUsd: token?.priceUsd ?? null,
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
  ronkeSubscore: number;
  nftSubscore: number;
  bodyTypesHeld: number;
  bodyTypesTotal: number;
}

/** Global Ronke Score leaderboard (asset-agnostic). */
export async function getScoreLeaderboard(page = 0, pageSize = 50): Promise<ScoreLeaderboardRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql`
    SELECT s.address, s.score, s.ronke_subscore, s.nft_subscore,
           s.body_types_held, s.body_types_total, n.name
    FROM wallet_scores s
    LEFT JOIN rns_names n ON n.address = s.address
    ORDER BY s.score DESC, s.address ASC
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `;
  return rows.map((r) => ({
    address: r.address as string,
    name: (r.name as string | null) ?? null,
    score: Number(r.score),
    ronkeSubscore: Number(r.ronke_subscore),
    nftSubscore: Number(r.nft_subscore),
    bodyTypesHeld: Number(r.body_types_held),
    bodyTypesTotal: Number(r.body_types_total),
  }));
}

export interface WalletScore {
  score: number;
  rank: number | null;
  ronkeSubscore: number;
  nftSubscore: number;
  ronkeHolding: number;
  ronkeDuration: number;
  ronkeDiamondMult: number;
  nftHolding: number;
  nftDuration: number;
  nftDiamondMult: number;
  collectorPoints: number;
  bodyTypesHeld: number;
  bodyTypesTotal: number;
}

/** One wallet's Ronke Score + breakdown + global rank, for the profile. */
export async function getWalletScore(address: string): Promise<WalletScore | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    SELECT score, ronke_subscore, nft_subscore, ronke_holding, ronke_duration,
           ronke_diamond_mult, nft_holding, nft_duration, nft_diamond_mult,
           collector_points, body_types_held, body_types_total
    FROM wallet_scores WHERE address = ${address}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rankRow = await sql`
    SELECT count(*)::int AS above FROM wallet_scores WHERE score > ${Number(r.score)}
  `;
  return {
    score: Number(r.score),
    rank: Number(rankRow[0]?.above ?? 0) + 1,
    ronkeSubscore: Number(r.ronke_subscore),
    nftSubscore: Number(r.nft_subscore),
    ronkeHolding: Number(r.ronke_holding),
    ronkeDuration: Number(r.ronke_duration),
    ronkeDiamondMult: Number(r.ronke_diamond_mult),
    nftHolding: Number(r.nft_holding),
    nftDuration: Number(r.nft_duration),
    nftDiamondMult: Number(r.nft_diamond_mult),
    collectorPoints: Number(r.collector_points),
    bodyTypesHeld: Number(r.body_types_held),
    bodyTypesTotal: Number(r.body_types_total),
  };
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
           n.name AS name
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
    LEFT JOIN rns_names n ON n.address = b.address
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
  by: "size" | "diamond",
  page = 0,
  pageSize = 50,
): Promise<LeaderboardRow[]> {
  const sql = getSql();
  if (!sql) return [];
  const orderExpr =
    by === "diamond"
      ? sql`coalesce(m.weighted_duration_days, 0) DESC`
      : sql`(CASE WHEN b.balance > 0 THEN b.balance ELSE b.token_count END) DESC`;
  const rows = await sql`
    SELECT b.address, b.balance::text AS balance, b.token_count,
           coalesce(m.holding_duration_days, 0) AS dur,
           coalesce(m.weighted_duration_days, 0) AS wdur,
           coalesce(m.diamond_bucket, 'paper') AS bucket,
           coalesce(m.never_sold, false) AS never_sold,
           n.name AS name
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
    LEFT JOIN rns_names n ON n.address = b.address
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
}

export interface WalletData {
  address: string;
  /** Primary .ron name (E4), or null. */
  name: string | null;
  ronkeBalance: string;
  ronkeverseCount: number;
  holdingDurationDays: number;
  diamondBucket: DiamondBucket | null;
  neverSold: boolean;
  everPaperSold: boolean;
  firstAcquiredAt: string | null;
  heldTokens: WalletHeldToken[];
  everHeld: boolean;
}

export async function getWallet(address: string): Promise<WalletData> {
  const empty: WalletData = {
    address,
    name: null,
    ronkeBalance: "0",
    ronkeverseCount: 0,
    holdingDurationDays: 0,
    diamondBucket: null,
    neverSold: false,
    everPaperSold: false,
    firstAcquiredAt: null,
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
  const nameRow = await sql`SELECT name FROM rns_names WHERE address = ${address}`;
  const name = (nameRow[0]?.name as string | null) ?? null;
  if (balances.length === 0 && metrics.length === 0) return { ...empty, name };

  let ronkeBalance = "0";
  let ronkeverseCount = 0;
  let firstAcquiredAt: string | null = null;
  for (const r of balances) {
    if (r.asset === "ronke_token") ronkeBalance = String(r.balance);
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
    if (!diamondBucket || r.diamond_bucket === "diamond") diamondBucket = r.diamond_bucket as DiamondBucket;
    neverSold = neverSold && (r.never_sold as boolean);
    everPaperSold = everPaperSold || (r.ever_paper_sold as boolean);
  }
  const held = await sql`
    SELECT l.token_id, r.rarity_rank, r.image_url
    FROM holder_lots l
    LEFT JOIN token_rarity r ON r.token_id = l.token_id
    WHERE l.address = ${address} AND l.asset = 'ronkeverse_nft' AND l.token_id IS NOT NULL
    ORDER BY r.rarity_rank ASC NULLS LAST
  `;
  return {
    address,
    name,
    ronkeBalance,
    ronkeverseCount,
    holdingDurationDays,
    diamondBucket,
    neverSold,
    everPaperSold,
    firstAcquiredAt,
    heldTokens: held.map((r) => ({
      tokenId: String(r.token_id),
      rarityRank: r.rarity_rank == null ? null : Number(r.rarity_rank),
      imageUrl: (r.image_url as string | null) ?? null,
    })),
    everHeld: true,
  };
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

export interface TokenDetail {
  tokenId: string;
  rarityRank: number | null;
  infoContentScore: number;
  imageUrl: string | null;
  traits: { traitType: string; value: string; probability: number }[];
}

export async function getToken(tokenId: string): Promise<TokenDetail | null> {
  const sql = getSql();
  if (!sql) return null;
  const rarity = await sql`
    SELECT token_id, rarity_rank, info_content_score, image_url
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
  const r = rarity[0];
  return {
    tokenId: String(r.token_id),
    rarityRank: r.rarity_rank == null ? null : Number(r.rarity_rank),
    infoContentScore: Number(r.info_content_score),
    imageUrl: (r.image_url as string | null) ?? null,
    traits: traits.map((t) => ({
      traitType: t.trait_type as string,
      value: t.value as string,
      probability: Number(t.probability),
    })),
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
