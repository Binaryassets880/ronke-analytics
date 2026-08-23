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
 * Curated set of known Ronin infrastructure. Confident entries only - an unknown
 * address defaults to a normal external wallet (counts as holder, outbound
 * counts as sell), so a wrong label is far more damaging than a missing one.
 * Every entry must be justified by evidence recorded in its `note`.
 *
 * Two things this list can never settle, both documented in seed-labels.ts: a
 * transfer between two wallets the same person owns is indistinguishable from a
 * sale without price data, and Ronin exposes no CEX deposit-address tags.
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
    countsAsSell: false,
    note: "Staking deposit retains ownership, so it is not a disposal. Category staking also makes the round trip a no-op for the holding clock.",
  },
  {
    address: "0x545edb750eb8769c868429be9586f5857a768758",
    label: "Ronin Staking (validator RON rewards)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Ronin validator staking. Delegating retains ownership; undelegating returns principal to the same wallet.",
  },
  {
    address: "0x5c9e9d11a6fbee98397e60238d986ea4991cb6f7",
    label: "Ronkeverse Staking Event #1 (incl. Halloween)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Staked RONKE + Ronkeverse NFTs 2025-08-29..2025-10-31; emits Staked/PoolUpdated; the Halloween burn/roll ran through it. 395 wallets, perfect round-trip.",
  },
  {
    address: "0x980d83fc6e2590c69a820e8ef4268fdc8b09fa6f",
    label: "Ronkeverse Staking Event #2 (winter)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Staked RONKE + RONKESTR + Ronkeverse NFTs 2025-12-02..2026-02-01; same contract family as event #1 (identical event topics). 67 wallets.",
  },
  {
    address: "0xb60f456ade104656829344d9a8e7e319d197a1ff",
    label: "RonkeStr Wager Game",
    category: "game",
    excludeFromHolders: true,
    countsAsSell: false, // wagering is not paper-handing; losses just leave silently
    note: "Users call createGame(...) with RONKESTR wagers; emits GameCreated.",
  },
  {
    address: "0x744b467ce265dbc5078b43036271aec378821b2d",
    label: "CoinFlipper",
    category: "game",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Ronin coin-flip gambling contract; heavy RONKE + RONKESTR wager volume.",
  },
  {
    address: "0x16bb753b48fbeac599a1a7a291b3f87aa3dbdf19",
    label: "RonkeStrategy wallet",
    category: "contract",
    excludeFromHolders: false, // intentionally stays in holder lists, displayed by name
    countsAsSell: true, // NFTBoughtByProtocol = the protocol pays sellers; a real sale
    note: "RonkeStr protocol treasury; buys Ronkeverse NFTs + RONKESTR. Keep ranked as a holder per owner request.",
  },
  {
    address: "0xca5621172f2e176031d699e0a0f701c029d7bac1",
    label: "RONKE Katana pool (V3)",
    category: "lp",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Emits Swap; reached via Katana aggregate router 0x7cf0fb64.",
  },
  {
    address: "0x93171ecace2f6b8be8dd09539f55fabe7f805af1",
    label: "RONKE/WRON Katana V3 pool",
    category: "lp",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "PoolCreated/Mint/IncreaseLiquidity observed at creation via team Safe.",
  },
  {
    address: "0x87b0acb34aa54cb51451050be73e9e31921154c2",
    label: "RONKESTR/WRON Katana pool",
    category: "lp",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Emits Sync/Swap/Mint for RONKESTR; live since RonkeStr launch 2025-11-19.",
  },
  {
    address: "0xf5042e6ffac5a625d4e7848e0b01373d8eb9e222",
    label: "RelayRouter (bridge/swap)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
  {
    address: "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f",
    label: "RelayRouterV3 (bridge/swap)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
  },
  {
    address: "0x6e4141d33021b52c91c28608403db4a0ffb50ec6",
    label: "Swap executor (aggregator)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Emits Exchange in KyberSwap-style aggregation routes.",
  },
  {
    address: "0xa54b0184d12349cf65281c6f965a74828ddd9e8f",
    label: "RONKE presale (MainProxy)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "buyTokensWithETH launchpad; all activity on launch day 2025-01-25.",
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

  // ── Added 2026-08-23, closing the R4 curation gap ──────────────────
  //
  // Every address below was confirmed to hold contract code via the Ronin
  // explorer (`/api/v2/addresses/{hash}` -> is_contract). Candidates were
  // ranked out of `transfer_events` by distinct counterparties, so these are
  // the addresses whose mislabeling moves the most wallets. Plain wallets with
  // high fan-out were deliberately NOT labeled - an active trader is not
  // infrastructure - and neither were EIP-7702 delegated EOAs, which report
  // as contracts but are individual people using smart wallets.
  //
  // "Pass-through" below means the contract received and sent the same asset
  // inside the same transaction, measured over our own transfer_events. A
  // router never rests on a balance; a custody contract does.

  // Swap routers and aggregators. Tokens enter and leave in the same tx, and
  // the contracts rest on no balance, so an outbound to one is a real sale.
  {
    address: "0x5f0acdd3ec767514ff1bf7e79949640bf94576bd",
    label: "Katana AggregateRouter",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified as AggregateRouter. Largest unlabeled counterparty in the dataset: 5,444 distinct wallets, 48,129 transactions, 100% pass-through, holds nothing.",
  },
  {
    address: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5",
    label: "MetaAggregationRouterV2 (KyberSwap)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified contract name. 2,249 distinct wallets, 100% pass-through. Pairs with the existing swap executor 0x6e4141d3.",
  },
  {
    address: "0x77f96cf7b98b963fb8a9b84787806d396d953b2b",
    label: "AffiliateRouter",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified contract name. 165 distinct wallets, 100% pass-through over 941 transactions.",
  },
  {
    address: "0xc05afc8c9353c1dd5f872eccfacd60fd5a2a9ac7",
    label: "PermissionedRouter",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified contract name. 100% pass-through over 188 transactions.",
  },
  {
    address: "0x452cf1b8597e6319cd21abd847312bf17e26d8d1",
    label: "LiFiDiamond (LI.FI bridge/swap aggregator)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified EIP-2535 diamond. 100% pass-through. Treated as a sale to match the existing RelayRouter entries - the wallet parts with the asset on Ronin either way.",
  },
  {
    address: "0xe377e13256002ab260e8ab59478652710a79ac5c",
    label: "Unnamed swap router",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Unverified and unnamed on the explorer, but behaviourally unambiguous: 3,097 distinct wallets, 5,875 in / 5,875 out, 100% same-transaction pass-through, holds nothing.",
  },
  {
    address: "0x8f10b468b06c6fd214b65f87778827f7d113f996",
    label: "Unnamed swap router",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Unverified and unnamed. 100% same-transaction pass-through over 1,286 transactions, holds nothing.",
  },

  // Liquidity provision, NOT a sale. The existing LP entries are the *pools*,
  // where a swap really is a sale. This is the position manager: minting or
  // topping up a position hands tokens over but keeps the wallet's exposure.
  {
    address: "0x7cf0fb64d72b733695d77d197c664e90d07cf45a",
    label: "Katana V3 NonfungiblePositionManager",
    category: "lp",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Inbound calls are collect / increaseLiquidity / multicall / mint, i.e. LP position management. Supersedes the description in the 0xca562117 note, which called this an aggregate router.",
  },

  // Bulk distribution. Loading a disperser is not a disposal, and receiving
  // out of one is an airdrop.
  {
    address: "0x5d518933351a0bc14b24b329b33b813565608769",
    label: "Scatter (bulk disperse)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Verified as Scatter; sampled inbound calls are disperseToken/disperseRON. 2,095 distinct wallets, 70 in / 2,580 out - a distributor, not a venue.",
  },

  // Games. Wagering is not paper-handing, matching CoinFlipper above.
  {
    address: "0xa9b7d87df126ae0b80b90ded3d481209e20eb3bf",
    label: "ClickTile game",
    category: "game",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "Verified as ClickTileERC20; inbound calls are createGame / markGameAsLost / cashOut. Holds a ~499k RONKE pot, so it is a house rather than a pass-through.",
  },

  // Ronkeverse NFT custody. Deposits come back to the SAME wallet 385 times
  // out of 410 (94%), median 24.5 hours in the contract, across 27 depositors.
  // Today every one of those deposits is scored as a sale.
  {
    address: "0x22e8ecccbc419cda1a6b2c6fca72ee2cb239f506",
    label: "Ronkeverse NFT custody (unidentified)",
    category: "staking",
    excludeFromHolders: true,
    countsAsSell: false,
    note: "IDENTIFIED BEHAVIOURALLY, NOT BY NAME - unverified and unnamed on the explorer. 410 NFT deposits, 410 returns, 94% back to the depositing wallet, median 24.5h held, 27 depositors, active 2025-06 to 2025-09. Confirm what it is before treating this label as settled.",
  },

  // Ronkeverse NFT venues. Deposits leave to a DIFFERENT wallet essentially
  // always, so the depositor really did part with the token.
  {
    address: "0x7962c19767f10df016f1f7154b5fe286e502e023",
    label: "Mystery pack vault",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Inbound calls are openMysteryPack / sellBackNFT / depositAssetsToPack. sellBackNFT is a genuine sale to the protocol. Still holds 8 Ronkeverse, so without this it ranks as a holder.",
  },
  {
    address: "0xf9333ebf0d47b26803a963fcbc27ddde11bb18b6",
    label: "NFT vault (BeaconProxy)",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified BeaconProxy; inbound calls include claimPendingNFTsFor / syncVaultStandardsForTiers. 90 in / 90 out, 0% returned to the depositor, only 2 depositors - protocol-operated, not user custody.",
  },
  {
    address: "0xc16af7ea967ef43a468b84f5003c7577b299ab6d",
    label: "RealmWalkers game",
    category: "game",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified as RealmWalkersRT. Unlike the token-wagering games above this one moves NFTs on to other wallets: 50 in / 50 out with 1 return to the depositor, so a deposit really is a disposal.",
  },
  {
    address: "0xdfda7f48a58618af138cb5c3582b5426bf418d0d",
    label: "RealmWalkers game (second contract)",
    category: "game",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Verified as RealmWalkersRT, same family as 0xc16af7ea. 14 in / 14 out, 0% returned to the depositor.",
  },
  {
    address: "0x644a6d2aa3abeec944c874260d64805ed262eb4c",
    label: "Unnamed Ronkeverse NFT venue",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Unverified EIP-1967 proxy. 100 NFTs in, 100 out, 0% returned to the depositor, 17 distinct wallets, active 2025-03 to 2025-05.",
  },
  {
    address: "0x7b2d268eea7f99520f7e968052fac76f52c73c7e",
    label: "Unnamed Ronkeverse NFT venue",
    category: "contract",
    excludeFromHolders: true,
    countsAsSell: true,
    note: "Unverified contract. 16 NFTs in, 16 out, 0% returned to the depositor, 25 distinct wallets.",
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
