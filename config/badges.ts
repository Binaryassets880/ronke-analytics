/**
 * Declarative wallet-badge definitions (KTD-9).
 *
 * Badges are derived from the snapshot tables the rebuild already produces
 * (holder_balances, holder_metrics, token_rarity, concentration output) - no
 * new chain calls. A new badge is a config entry here plus, when it needs one,
 * a predicate in lib/badges/derive.ts. No schema change.
 *
 * This file is the U1 stub: the shape and the v1 badge set. U14 wires the
 * predicates in derive.ts against these definitions.
 */

import type { Asset } from "./contracts";
import { DIAMOND_THRESHOLDS, MIGRATION_DATE } from "./contracts";

export type BadgeCategory =
  | "bag_size" // tiered by $RONKE balance
  | "collector" // tiered by Ronkeverse count
  | "holding_length" // tiered by current holding duration
  | "achievement"; // boolean predicates

/**
 * Which side of the ecosystem a badge belongs to, for the profile shelf (E5a).
 * - "ronke": derived purely from $RONKE holdings/behavior.
 * - "ronkeverse": derived purely from Ronkeverse holdings/behavior.
 * - "both": currently cross-asset (Ecosystem group). E5b will later split some
 *   of these into per-asset variants so each realm's badges are behaviorally
 *   exact; until then they render under "Ecosystem".
 */
export type BadgeRealm = "ronke" | "ronkeverse" | "both";

/** A single tier within a tiered badge. */
export interface BadgeTier {
  /** Tier index, 0-based, ascending in prestige. */
  tier: number;
  label: string;
  /** Minimum value (balance / count / days) to reach this tier. */
  min: number;
}

export interface BadgeDef {
  key: string;
  category: BadgeCategory;
  /** Which asset the badge reads from, when asset-scoped. */
  asset?: Asset;
  /** Which ecosystem realm the badge belongs to, for profile grouping (E5a). */
  realm: BadgeRealm;
  label: string;
  icon: string;
  description: string;
  /** Ordered ascending tiers, for tiered categories. Highest reached wins. */
  tiers?: BadgeTier[];
  /**
   * Predicate key resolved in lib/badges/derive.ts for achievement badges.
   * Tiered badges do not need one (the tier thresholds drive them).
   */
  predicate?: string;
}

export const BADGES: BadgeDef[] = [
  {
    key: "bag_size",
    category: "bag_size",
    asset: "ronke_token",
    realm: "ronke",
    label: "Bag Size",
    icon: "\u{1FAAA}", // 🪙
    description: "How much $RONKE this wallet holds.",
    tiers: [
      { tier: 0, label: "Shrimp", min: 1 },
      { tier: 1, label: "Holder", min: 100_000 },
      { tier: 2, label: "Believer", min: 1_000_000 },
      { tier: 3, label: "Whale", min: 10_000_000 },
      { tier: 4, label: "Leviathan", min: 100_000_000 },
    ],
  },
  {
    key: "collector",
    category: "collector",
    asset: "ronkeverse_nft",
    realm: "ronkeverse",
    label: "Collector",
    icon: "\u{1F5BC}", // 🖼
    description: "How many Ronkeverse NFTs this wallet holds.",
    tiers: [
      { tier: 0, label: "Owner", min: 1 },
      { tier: 1, label: "Collector", min: 3 },
      { tier: 2, label: "Curator", min: 10 },
      { tier: 3, label: "Patron", min: 25 },
    ],
  },
  {
    key: "holding_length",
    category: "holding_length",
    realm: "both",
    label: "Holding Length",
    icon: "\u{23F3}", // ⏳
    description: "How long this wallet has held its oldest position.",
    tiers: [
      { tier: 0, label: "30 Days", min: 30 },
      { tier: 1, label: "90 Days", min: 90 },
      { tier: 2, label: "180 Days", min: 180 },
      { tier: 3, label: "1 Year", min: 365 },
    ],
  },
  {
    key: "diamond_hands",
    category: "achievement",
    realm: "both",
    label: "Diamond Hands",
    icon: "\u{1F48E}", // 💎
    description: "Never sold since acquiring.",
    predicate: "never_sold",
  },
  {
    key: "never_paper_handed",
    category: "achievement",
    realm: "both",
    label: "Never Paper-handed",
    icon: "\u{1F9FB}", // 🧻 (crossed out in copy)
    description: "Never dumped a position within a day of buying it.",
    predicate: "never_paper_sold",
  },
  {
    key: "og_early",
    category: "achievement",
    realm: "both",
    label: "OG / Early",
    icon: "\u{1F331}", // 🌱
    description: "Held since before the Ronin L2 migration.",
    predicate: "og_early",
  },
  {
    key: "whale",
    category: "achievement",
    realm: "both",
    label: "Whale",
    icon: "\u{1F40B}", // 🐋
    description: "A top holder by concentration (top-N or >1% of supply).",
    predicate: "whale",
  },
  {
    key: "rarity_hunter",
    category: "achievement",
    realm: "ronkeverse",
    label: "Rarity Hunter",
    icon: "\u{1F3F9}", // 🏹
    description: "Holds a top-rarity Ronkeverse token.",
    predicate: "rarity_hunter",
  },
  {
    key: "dual_citizen",
    category: "achievement",
    realm: "both",
    label: "Dual Citizen",
    icon: "\u{1F91D}", // 🤝
    description: "Holds both $RONKE and Ronkeverse.",
    predicate: "dual_citizen",
  },
  {
    key: "accumulator",
    category: "achievement",
    realm: "ronke",
    label: "Accumulator",
    icon: "\u{1F4C8}", // 📈
    description: "Net-positive balance over the trailing window (stacking).",
    predicate: "accumulator",
  },
];

/** Whale threshold: a holder above this share of supply earns the Whale badge. */
export const WHALE_SUPPLY_SHARE = 0.01;
/** Rarity Hunter: holds a token within this top fraction of the collection. */
export const RARITY_HUNTER_TOP_FRACTION = 0.05;

export function badgeDef(key: string): BadgeDef | undefined {
  return BADGES.find((b) => b.key === key);
}

/**
 * Human-readable threshold for a tier, e.g. "Hold at least 100,000 $RONKE".
 * Drives the hover tooltips in the badge catalog so the pill labels (Shrimp,
 * Curator, ...) explain exactly what earns them.
 */
export function tierHint(def: BadgeDef, tier: BadgeTier): string {
  switch (def.category) {
    case "bag_size":
      return `Hold at least ${tier.min.toLocaleString()} $RONKE`;
    case "collector":
      return `Hold at least ${tier.min} Ronkeverse NFT${tier.min === 1 ? "" : "s"}`;
    case "holding_length":
      return `Hold your oldest position for ${tier.min}+ days`;
    default:
      return tier.label;
  }
}

/**
 * Exact threshold detail for the non-tiered (achievement) badges whose numbers
 * are otherwise hidden - surfaced as a hover tooltip in the catalog.
 */
export function badgeThresholdHint(def: BadgeDef): string | null {
  switch (def.key) {
    case "whale":
      return `Ranks among the top holders, or holds more than ${(WHALE_SUPPLY_SHARE * 100).toFixed(0)}% of supply.`;
    case "rarity_hunter":
      return `Holds a Ronkeverse token ranked in the rarest ${(RARITY_HUNTER_TOP_FRACTION * 100).toFixed(0)}% of the collection.`;
    case "diamond_hands":
      return `Never made a genuine sell since acquiring. Moves to staking, bridge, or games don't count as sells.`;
    case "never_paper_handed":
      return `Never sold a position within ${DIAMOND_THRESHOLDS.paperSellWindowDays} day of buying it.`;
    case "og_early":
      return `Held since before the Ronin L2 migration (${MIGRATION_DATE.toISOString().slice(0, 10)}).`;
    case "dual_citizen":
      return `Holds a positive balance of both $RONKE and at least one Ronkeverse NFT.`;
    case "accumulator":
      return `Net-positive $RONKE balance over the trailing window - stacking, not distributing.`;
    default:
      return null;
  }
}

/** Resolve the highest tier reached for a tiered badge, or null. */
export function highestTier(def: BadgeDef, value: number): BadgeTier | null {
  if (!def.tiers) return null;
  let reached: BadgeTier | null = null;
  for (const tier of def.tiers) {
    if (value >= tier.min) reached = tier;
  }
  return reached;
}
