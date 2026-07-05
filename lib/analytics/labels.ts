/**
 * Address-label model + sell/holder exclusion rules (KTD-6, R4).
 *
 * Load-bearing: mislabeling directly corrupts diamond-hands and concentration
 * numbers. The policy lives in the address_labels flags (excludeFromHolders,
 * countsAsSell); this module just applies them. Mirrors the crypto-books
 * known_addresses label/exclusion pattern.
 */

import { isBurnAddress } from "@/config/contracts";

export type LabelCategory =
  | "cex"
  | "bridge"
  | "staking"
  | "game"
  | "contract"
  | "burn"
  | "team"
  | "lp";

export interface AddressLabel {
  address: string; // lowercased 0x
  label: string;
  category: LabelCategory;
  /** Exclude from holder counts / concentration (contracts, burn, CEX). */
  excludeFromHolders: boolean;
  /** Does an outbound transfer TO this address count as a genuine sell? */
  countsAsSell: boolean;
  note?: string;
}

/**
 * Curated starter set of known Ronin infrastructure. Confident entries only -
 * an unknown address defaults to a normal external wallet (counts as holder,
 * outbound counts as sell). Ronkeverse-specific staking/game contracts are a
 * known curation gap (see seed-labels.ts) - add them here or via DB edit; until
 * then such moves are conservatively treated as sells.
 */
export const SEED_LABELS: AddressLabel[] = [
  {
    address: "0x0000000000000000000000000000000000000000",
    label: "Zero address (mint/burn)",
    category: "burn",
    excludeFromHolders: true,
    countsAsSell: false,
  },
  {
    address: "0x000000000000000000000000000000000000dead",
    label: "Dead burn address",
    category: "burn",
    excludeFromHolders: true,
    countsAsSell: false,
  },
  {
    address: "0x75ae353997242927c701d4d6c2722ebef43fd2d3",
    label: "RONKE/WRON pool (Katana LP)",
    category: "lp",
    excludeFromHolders: true,
    countsAsSell: true, // selling into the pool is a real sell
    note: "GeckoTerminal RONKE/WRON pool; appears as counterparty in RONKE transfers.",
  },
  {
    address: "0x7d0556d55ca1a92708681e2e231733ebd922597d",
    label: "Katana Router (Ronin DEX)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
  {
    address: "0xfff9ce5f71ca6178d3beecedb61e7eff1602950e",
    label: "AXS Staking Pool (ERC20StakingPool)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false, // staking deposit retains ownership, not a disposal
  },
  {
    address: "0x545edb750eb8769c868429be9586f5857a768758",
    label: "Ronin Staking (validator RON rewards)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false,
  },
  {
    address: "0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3",
    label: "Axie Marketplace V3 (Market Gateway Proxy)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
  {
    address: "0x3ef234bc2a04d86f6041e419458d9acbd077f2c1",
    label: "Mavis Marketplace Collection Offer Proxy",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
  {
    address: "0x0000000000000068f116a894984e2db1123eb395",
    label: "OpenSea Marketplace (Seaport 1.6)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
];

/** Applies label policy to transfers and holder membership. */
export class Labels {
  private map: Map<string, AddressLabel>;

  constructor(rows: AddressLabel[] = []) {
    this.map = new Map(rows.map((r) => [r.address.toLowerCase(), r]));
  }

  get(address: string): AddressLabel | undefined {
    return this.map.get(address.toLowerCase());
  }

  /** True if the address should not be counted as a holder (contract/burn/CEX). */
  excludeFromHolders(address: string): boolean {
    const a = address.toLowerCase();
    if (isBurnAddress(a)) return true;
    return this.get(a)?.excludeFromHolders ?? false;
  }

  /**
   * True if this counterparty holds units on the wallet's behalf (staking /
   * bridge / team). Moving units to/from such an address is NOT an acquisition
   * or a disposal - the wallet retains ownership - so the behavioral FIFO
   * engine neither creates nor consumes a lot, and the diamond clock is
   * preserved (KTD-6: "does not reset diamond status").
   */
  isRetainOwnership(address: string): boolean {
    const label = this.get(address);
    if (!label) return false;
    return (
      label.category === "staking" ||
      label.category === "bridge" ||
      label.category === "team"
    );
  }

  /**
   * Classify an outbound transfer as a genuine sell (KTD-6):
   *  - not a self-move (from == to),
   *  - not to a burn address,
   *  - if the destination is labeled, honor its countsAsSell flag
   *    (staking/bridge/game/team seed to false),
   *  - an unlabeled external wallet counts as a sell.
   */
  isSell(from: string, to: string): boolean {
    const f = from.toLowerCase();
    const t = to.toLowerCase();
    if (f === t) return false;
    if (isBurnAddress(t)) return false;
    const label = this.get(t);
    if (label) return label.countsAsSell;
    return true;
  }
}
