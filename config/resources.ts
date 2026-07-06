/**
 * Content config for the Ronke Resources page (E2, KTD-E2).
 *
 * Trust + onboarding surface: verified contract addresses (imported from
 * config/contracts.ts - the single source of truth, never re-typed), where to
 * buy/trade, official links, an RNS explainer, and a plain-English glossary of
 * every metric and badge. Adding an entry is a config edit here.
 *
 * NOTE: socials + a couple of links are marked TODO - fill with the real Ronke
 * handles/URLs. Everything renders gracefully whether or not they are set.
 */

import { CONTRACTS } from "./contracts";

/** Ronin explorer base for an address (token / NFT / wallet pages). */
export const RONIN_EXPLORER = "https://app.roninchain.com";
export function explorerTokenUrl(address: string): string {
  return `${RONIN_EXPLORER}/token/${address}`;
}
export function explorerAddressUrl(address: string): string {
  return `${RONIN_EXPLORER}/address/${address}`;
}

export interface AddressRow {
  label: string;
  address: string;
  standard: string;
  note?: string;
}

/** Verified contract addresses, sourced from config/contracts.ts. */
export const VERIFIED_ADDRESSES: AddressRow[] = [
  {
    label: CONTRACTS.ronke_token.label,
    address: CONTRACTS.ronke_token.address,
    standard: "ERC-20 · Ronin",
    note: "The $RONKE token contract. Always verify before swapping - never trust a random address.",
  },
  {
    label: CONTRACTS.ronkeverse_nft.label,
    address: CONTRACTS.ronkeverse_nft.address,
    standard: "ERC-721 · Ronin",
    note: "The Ronkeverse NFT collection contract.",
  },
];

export interface ResourceLink {
  label: string;
  href: string;
  blurb: string;
  /** Set false for links you still need to fill in (rendered as "coming soon"). */
  ready?: boolean;
}

/** Where to buy $RONKE, trade Ronkeverse, and view charts. */
export const MARKET_LINKS: ResourceLink[] = [
  {
    label: "Buy $RONKE (Katana DEX)",
    href: "https://katana.roninchain.com/#/swap",
    blurb: "Swap for $RONKE on Ronin's native DEX. The RONKE/WRON pool is the primary market.",
    ready: true,
  },
  {
    label: "$RONKE price chart (GeckoTerminal)",
    href: "https://www.geckoterminal.com/ronin/pools/0x75ae353997242927c701d4d6c2722ebef43fd2d3",
    blurb: "Live price, volume, and liquidity for the RONKE/WRON pool. Low liquidity - expect a jumpy chart.",
    ready: true,
  },
  {
    label: "Trade Ronkeverse (Ronin Market)",
    href: "https://marketplace.roninchain.com/collections/0x810b6d1374ac7ba0e83612e7d49f49a13f1de019",
    blurb: "Ronin's native marketplace - the primary venue for Ronkeverse sales.",
    ready: true,
  },
  {
    label: "Trade Ronkeverse (OpenSea)",
    href: "https://opensea.io/collection/ronkeverse",
    blurb: "Ronkeverse also trades on OpenSea. Overview volume counts sales across all venues.",
    ready: true,
  },
];

/** Official Ronke links. TODO: replace placeholders with real handles/URLs. */
export const OFFICIAL_LINKS: ResourceLink[] = [
  { label: "Website", href: "#", blurb: "Official Ronke site.", ready: false },
  { label: "X / Twitter", href: "#", blurb: "Announcements and community.", ready: false },
  { label: "Discord", href: "#", blurb: "Chat with the Ronke community.", ready: false },
];

/** RNS explainer shown on the Resources page. */
export const RNS_EXPLAINER = {
  title: "Ronin Name Service (.ron)",
  body:
    "RNS is Ronin's naming system - like ENS for Ethereum. A .ron name (e.g. ronke.ron) " +
    "points to a wallet address. When a wallet has one, Ronkeverse shows the readable .ron " +
    "name on leaderboards and profiles instead of a long 0x address, and you can look a wallet " +
    "up by its name.",
  ready: true,
};

export interface GlossaryEntry {
  term: string;
  definition: string;
}

/** Plain-English glossary for every metric and badge concept (E6/onboarding). */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Ronke Score",
    definition:
      "The analytics section of Ronkeverse - a wallet's holdings, badges, and behavior across $RONKE and Ronkeverse, plus collection-wide stats.",
  },
  {
    term: "Diamond hands",
    definition:
      "Held without ever selling since acquiring. Because $RONKE has no reliable price, this is behavioral (did units actually leave as a genuine sell), not profit-based.",
  },
  {
    term: "Paper hands",
    definition: "Sold a position within a day of buying it. The opposite of diamond hands.",
  },
  {
    term: "OG / Early",
    definition: "Held since before the Ronin L2 migration (May 12, 2026) - an early believer.",
  },
  {
    term: "Whale",
    definition: "A top holder - among the largest wallets, or holding more than 1% of supply.",
  },
  {
    term: "Concentration (Gini / whale share)",
    definition:
      "How evenly a token is spread across holders. A high Gini or whale share means a few wallets hold most of the supply.",
  },
  {
    term: "Rarity (OpenRarity)",
    definition:
      "How unusual a Ronkeverse NFT's trait combination is, ranked by the OpenRarity method. Lower rank = rarer.",
  },
  {
    term: "Dual Citizen",
    definition: "Holds both $RONKE and Ronkeverse - invested across the whole ecosystem.",
  },
  {
    term: "Floor price",
    definition: "The cheapest listed Ronkeverse NFT on the market right now (in RON).",
  },
  {
    term: "Liquidity",
    definition:
      "How much value sits in the DEX pool backing $RONKE. Low liquidity means the price moves a lot on small trades.",
  },
];
