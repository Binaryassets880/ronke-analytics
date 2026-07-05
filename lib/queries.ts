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

export interface HolderRow {
  address: string;
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
           coalesce(m.never_sold, false) AS never_sold
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
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
           coalesce(m.never_sold, false) AS never_sold
    FROM holder_balances b
    LEFT JOIN holder_metrics m ON m.asset = b.asset AND m.address = b.address
    WHERE b.asset = ${asset} AND b.is_current_holder = true
    ORDER BY ${orderExpr}
    LIMIT ${pageSize} OFFSET ${page * pageSize}
  `;
  return rows.map((r) => ({
    address: r.address as string,
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
  if (balances.length === 0 && metrics.length === 0) return empty;

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
