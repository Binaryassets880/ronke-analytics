/**
 * Canonical configuration for the two Ronke assets on Ronin.
 *
 * Addresses, chain params, the L2-migration block constant, and the
 * diamond-hands thresholds live here (config, not secrets). API keys and the
 * Neon connection string come from the environment - see `.env.example`.
 *
 * Mirrors the crypto-books "secrets in env, addresses in config" split so a
 * contract-address correction (R1) is a one-line edit here.
 */

export type Asset = "ronke_token" | "ronkestr_token" | "ronkeverse_nft";

export interface ContractConfig {
  /** Internal asset key used as the partition key across every table. */
  asset: Asset;
  /** Lowercased canonical 0x contract address on Ronin. */
  address: string;
  /** Token standard. */
  standard: "erc20" | "erc721";
  /** Human label for the UI. */
  label: string;
  /** ERC-20 decimals (undefined for NFTs). */
  decimals?: number;
}

/**
 * Ronin chain param for Moralis EVM API v2.2. Chain id 2020 was preserved
 * across the OP Stack L2 migration, so a single param spans both eras.
 */
export const RONIN_CHAIN_PARAM = "ronin";

/**
 * Ronin migrated from a standalone sidechain to an OP Stack L2 on
 * 2026-05-12 at this block. Chain id 2020 and block height stayed
 * continuous, so history keys on block_number across the boundary.
 * KTD-4: this is the named stitch constant.
 */
export const MIGRATION_BLOCK = 55_577_490;

/** The L2 migration date (2026-05-12), used for the OG/Early badge cutoff. */
export const MIGRATION_DATE = new Date("2026-05-12T00:00:00.000Z");

/**
 * $RONKE (ERC-20), RonkeStr / Ronke Strategy (ERC-20), and Ronkeverse (ERC-721).
 * R1: spot-confirm on app.roninchain.com before trusting for production;
 * a correction is a single edit here.
 */
export const CONTRACTS: Record<Asset, ContractConfig> = {
  ronke_token: {
    asset: "ronke_token",
    address: "0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb",
    standard: "erc20",
    label: "$RONKE",
    decimals: 18,
  },
  ronkestr_token: {
    asset: "ronkestr_token",
    address: "0x404533a09bf281199ce6b0ef60b7eff7123ff8dc",
    standard: "erc20",
    label: "RonkeStr",
    decimals: 18,
  },
  ronkeverse_nft: {
    asset: "ronkeverse_nft",
    address: "0x810b6d1374ac7ba0e83612e7d49f49a13f1de019",
    standard: "erc721",
    label: "Ronkeverse",
  },
};

export const ASSETS: Asset[] = ["ronke_token", "ronkestr_token", "ronkeverse_nft"];

/**
 * Ronkeverse tokenURI base (confirmed via on-chain tokenURI(id) over Ronin RPC):
 * per-token metadata JSON lives at `${base}/${tokenId}`. Fetched directly for
 * rarity because Moralis only indexed ~29% of the collection (R6). One edit if
 * the collection ever re-hosts.
 */
export const RONKEVERSE_METADATA_BASE =
  "https://ronkeverse.s3.us-east-2.amazonaws.com/metadata/ronkeverse_metadata";

export function contractFor(asset: Asset): ContractConfig {
  return CONTRACTS[asset];
}

export function assetForAddress(address: string): Asset | null {
  const lower = address.toLowerCase();
  for (const asset of ASSETS) {
    if (CONTRACTS[asset].address === lower) return asset;
  }
  return null;
}

/**
 * Diamond-hands thresholds (KTD-6). Days, plus the sell-tolerance fraction.
 *
 * `diamondBucket` matches the Diamond Hands badge engine (2026-07-07): diamond =
 * never made a significant sell AND non-dust position AND held >= diamondDays;
 * paper = paper-handed behavior or a fresh (< regularDays) position; regular =
 * everything else. `paperSellWindowDays` is the behavioral window: a significant
 * sell within this many days of acquiring flags `ever_paper_sold`.
 *
 * `sellTolerancePct`: a genuine sell of LESS than this fraction of the wallet's
 * holdings at that moment is a trim - it consumes units but keeps never-sold
 * status and the holding clock. A sell of this fraction or more is significant:
 * it breaks never-sold AND resets the holding clock on everything still held.
 *
 * Kept here so they can be tuned without touching analytics code.
 */
export const DIAMOND_THRESHOLDS = {
  /** >= this many days (and < diamondDays) is "regular". */
  regularDays: 7,
  /** >= this many days is "diamond". */
  diamondDays: 30,
  /** Selling within < this many days of acquiring flags ever_paper_sold. */
  paperSellWindowDays: 1,
  /** Sells below this fraction of current holdings are forgiven trims. */
  sellTolerancePct: 0.1,
} as const;

export type DiamondBucket = "paper" | "regular" | "diamond";

/** The three buckets ordered worst to best. */
export const DIAMOND_BUCKET_RANK: Record<DiamondBucket, number> = {
  paper: 0,
  regular: 1,
  diamond: 2,
};

/**
 * Best of two buckets, for collapsing a multi-asset wallet's per-asset buckets
 * into one wallet-level badge. Order-independent by construction: the previous
 * merge kept whichever row arrived first and only ever upgraded to `diamond`,
 * so a wallet holding one `paper` asset and one `regular` asset was badged on
 * the arbitrary row order of an unordered SELECT.
 */
export function bestBucket(
  current: DiamondBucket | null,
  next: DiamondBucket,
): DiamondBucket {
  if (current === null) return next;
  return DIAMOND_BUCKET_RANK[next] > DIAMOND_BUCKET_RANK[current] ? next : current;
}

/** Zero address = mint source / burn sink. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/** Common "dead" burn sink. */
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

export function isBurnAddress(address: string): boolean {
  const a = address.toLowerCase();
  return a === ZERO_ADDRESS || a === DEAD_ADDRESS;
}
