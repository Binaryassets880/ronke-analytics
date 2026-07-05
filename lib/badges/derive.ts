/**
 * Badge derivation engine (U14, KTD-9).
 *
 * Evaluates the declarative config/badges.ts definitions against the derived
 * snapshot tables (holder_balances, holder_metrics, token_rarity) - no chain
 * calls - and writes wallet_badges. Runs as the final step of rebuild() (cheap,
 * reads only derived tables). Idempotent + deterministic.
 *
 * The pure evaluator (`evaluateWallet`) is separated from DB assembly so it is
 * testable with hand-built aggregates.
 */

import type { Sql } from "@/db/client";
import {
  BADGES,
  highestTier,
  badgeDef,
  RARITY_HUNTER_TOP_FRACTION,
  WHALE_SUPPLY_SHARE,
} from "@/config/badges";
import { CONTRACTS, MIGRATION_DATE } from "@/config/contracts";

/** Everything the badge predicates need about one wallet, across both assets. */
export interface WalletAggregate {
  address: string;
  /** $RONKE balance in whole tokens (raw / 10^decimals). */
  ronkeBalanceWhole: number;
  /** Ronkeverse tokens held. */
  ronkeverseCount: number;
  /** Max current holding duration across assets (days). */
  holdingDurationDays: number;
  /** No genuine sell on any asset. */
  neverSold: boolean;
  /** Ever dumped within the paper-sell window on any asset. */
  everPaperSold: boolean;
  /** First acquired before the L2 migration. */
  ogEarly: boolean;
  /** Top-N / >1% supply holder on either asset. */
  isWhale: boolean;
  /** Holds a top-rarity Ronkeverse token. */
  hasTopRarity: boolean;
  /** Behavioral FIFO lot count (token) - >1 means repeated stacking. */
  lotCount: number;
}

export interface EarnedBadge {
  address: string;
  badgeKey: string;
  tier: number | null;
  context: Record<string, unknown>;
}

/** Pure: which badges this wallet earns. */
export function evaluateWallet(agg: WalletAggregate): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  const add = (badgeKey: string, tier: number | null, context: Record<string, unknown>) =>
    earned.push({ address: agg.address, badgeKey, tier, context });

  for (const def of BADGES) {
    switch (def.key) {
      case "bag_size": {
        const t = highestTier(def, agg.ronkeBalanceWhole);
        if (t) add(def.key, t.tier, { balance: agg.ronkeBalanceWhole, tierLabel: t.label });
        break;
      }
      case "collector": {
        const t = highestTier(def, agg.ronkeverseCount);
        if (t) add(def.key, t.tier, { count: agg.ronkeverseCount, tierLabel: t.label });
        break;
      }
      case "holding_length": {
        const t = highestTier(def, agg.holdingDurationDays);
        if (t) add(def.key, t.tier, { days: agg.holdingDurationDays, tierLabel: t.label });
        break;
      }
      case "diamond_hands":
        if (agg.neverSold) add(def.key, null, {});
        break;
      case "never_paper_handed":
        if (!agg.everPaperSold) add(def.key, null, {});
        break;
      case "og_early":
        if (agg.ogEarly) add(def.key, null, {});
        break;
      case "whale":
        if (agg.isWhale) add(def.key, null, {});
        break;
      case "rarity_hunter":
        if (agg.hasTopRarity) add(def.key, null, {});
        break;
      case "dual_citizen":
        if (agg.ronkeBalanceWhole > 0 && agg.ronkeverseCount > 0) add(def.key, null, {});
        break;
      case "accumulator":
        if (agg.neverSold && agg.lotCount > 1) add(def.key, null, { lots: agg.lotCount });
        break;
    }
  }
  return earned;
}

// ── DB assembly ──────────────────────────────────────────────────────

const TOKEN_DECIMALS = CONTRACTS.ronke_token.decimals ?? 18;

/** Assemble per-wallet aggregates from the derived tables and evaluate badges. */
export async function deriveBadges(sql: Sql): Promise<number> {
  const aggregates = await assembleAggregates(sql);
  await sql`DELETE FROM wallet_badges`;
  let count = 0;
  for (const agg of aggregates.values()) {
    for (const b of evaluateWallet(agg)) {
      await sql`
        INSERT INTO wallet_badges (address, badge_key, tier, context)
        VALUES (${b.address}, ${b.badgeKey}, ${b.tier}, ${JSON.stringify(b.context)})
        ON CONFLICT (address, badge_key) DO UPDATE
          SET tier = EXCLUDED.tier, context = EXCLUDED.context
      `;
      count += 1;
    }
  }
  return count;
}

export async function assembleAggregates(sql: Sql): Promise<Map<string, WalletAggregate>> {
  const map = new Map<string, WalletAggregate>();
  const ensure = (address: string): WalletAggregate => {
    let a = map.get(address);
    if (!a) {
      a = {
        address,
        ronkeBalanceWhole: 0,
        ronkeverseCount: 0,
        holdingDurationDays: 0,
        neverSold: true,
        everPaperSold: false,
        ogEarly: false,
        isWhale: false,
        hasTopRarity: false,
        lotCount: 0,
      };
      map.set(address, a);
    }
    return a;
  };

  // Current balances per asset.
  const balances = await sql`
    SELECT asset, address, balance, token_count, first_acquired_at
    FROM holder_balances WHERE is_current_holder = true
  `;
  const divisor = 10 ** TOKEN_DECIMALS;
  for (const r of balances) {
    const a = ensure(r.address as string);
    if (r.asset === "ronke_token") {
      a.ronkeBalanceWhole = Number(BigInt(r.balance as string)) / divisor;
    } else {
      a.ronkeverseCount = Number(r.token_count);
    }
    if (r.first_acquired_at && new Date(r.first_acquired_at as string) < MIGRATION_DATE) {
      a.ogEarly = true;
    }
  }

  // Metrics per asset: merge across assets.
  const metrics = await sql`
    SELECT address, holding_duration_days, never_sold, ever_paper_sold
    FROM holder_metrics
  `;
  for (const r of metrics) {
    const a = ensure(r.address as string);
    a.holdingDurationDays = Math.max(a.holdingDurationDays, Number(r.holding_duration_days));
    a.neverSold = a.neverSold && (r.never_sold as boolean);
    a.everPaperSold = a.everPaperSold || (r.ever_paper_sold as boolean);
  }

  // Whale sets per asset (top >1% of supply). Reuses concentration definition.
  for (const asset of ["ronke_token", "ronkeverse_nft"] as const) {
    const rows = await sql`
      SELECT address, balance, token_count FROM holder_balances
      WHERE asset = ${asset} AND is_current_holder = true
    `;
    const weights = rows.map((r) =>
      asset === "ronke_token"
        ? Number(BigInt(r.balance as string))
        : Number(r.token_count),
    );
    const total = weights.reduce((s, x) => s + x, 0);
    if (total > 0) {
      rows.forEach((r, i) => {
        if (weights[i] / total > WHALE_SUPPLY_SHARE) ensure(r.address as string).isWhale = true;
      });
    }
  }

  // Rarity Hunter: holds a token in the top fraction by OpenRarity rank.
  const revealed = await sql`SELECT count(*)::int AS n FROM token_rarity WHERE rarity_rank IS NOT NULL`;
  const revealedSupply = Number(revealed[0]?.n ?? 0);
  if (revealedSupply > 0) {
    const cutoff = Math.max(1, Math.ceil(revealedSupply * RARITY_HUNTER_TOP_FRACTION));
    const topTokens = await sql`
      SELECT token_id FROM token_rarity WHERE rarity_rank IS NOT NULL AND rarity_rank <= ${cutoff}
    `;
    const topSet = new Set(topTokens.map((r) => String(r.token_id)));
    const nftLots = await sql`
      SELECT address, token_id FROM holder_lots WHERE asset = 'ronkeverse_nft' AND token_id IS NOT NULL
    `;
    for (const r of nftLots) {
      if (topSet.has(String(r.token_id))) ensure(r.address as string).hasTopRarity = true;
    }
  }

  // Token lot counts for Accumulator.
  const lotCounts = await sql`
    SELECT address, count(*)::int AS n FROM holder_lots
    WHERE asset = 'ronke_token' AND quantity_remaining > 0
    GROUP BY address
  `;
  for (const r of lotCounts) ensure(r.address as string).lotCount = Number(r.n);

  return map;
}

/** Group a wallet's earned badges by category, for the profile UI (U15). */
export function groupByCategory(earned: EarnedBadge[]) {
  const groups: Record<string, EarnedBadge[]> = {};
  for (const b of earned) {
    const cat = badgeDef(b.badgeKey)?.category ?? "achievement";
    (groups[cat] ??= []).push(b);
  }
  return groups;
}
