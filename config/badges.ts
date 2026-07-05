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

export type BadgeCategory =
  | "bag_size" // tiered by $RONKE balance
  | "collector" // tiered by Ronkeverse count
  | "holding_length" // tiered by current holding duration
  | "achievement"; // boolean predicates

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
    label: "Diamond Hands",
    icon: "\u{1F48E}", // 💎
    description: "Never sold since acquiring.",
    predicate: "never_sold",
  },
  {
    key: "never_paper_handed",
    category: "achievement",
    label: "Never Paper-handed",
    icon: "\u{1F9FB}", // 🧻 (crossed out in copy)
    description: "Never dumped a position within a day of buying it.",
    predicate: "never_paper_sold",
  },
  {
    key: "og_early",
    category: "achievement",
    label: "OG / Early",
    icon: "\u{1F331}", // 🌱
    description: "Held since before the Ronin L2 migration.",
    predicate: "og_early",
  },
  {
    key: "whale",
    category: "achievement",
    label: "Whale",
    icon: "\u{1F40B}", // 🐋
    description: "A top holder by concentration (top-N or >1% of supply).",
    predicate: "whale",
  },
  {
    key: "rarity_hunter",
    category: "achievement",
    label: "Rarity Hunter",
    icon: "\u{1F3F9}", // 🏹
    description: "Holds a top-rarity Ronkeverse token.",
    predicate: "rarity_hunter",
  },
  {
    key: "dual_citizen",
    category: "achievement",
    label: "Dual Citizen",
    icon: "\u{1F91D}", // 🤝
    description: "Holds both $RONKE and Ronkeverse.",
    predicate: "dual_citizen",
  },
  {
    key: "accumulator",
    category: "achievement",
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

/** Resolve the highest tier reached for a tiered badge, or null. */
export function highestTier(def: BadgeDef, value: number): BadgeTier | null {
  if (!def.tiers) return null;
  let reached: BadgeTier | null = null;
  for (const tier of def.tiers) {
    if (value >= tier.min) reached = tier;
  }
  return reached;
}
