/**
 * On-chain NFT sale detection via WRON settlement legs (E6, KTD-E3).
 *
 * Ronkeverse sales settle on multiple venues - OpenSea Seaport (0x0000...eB395)
 * and Ronin's native marketplace (0x3b3adf...33fe3) - but ALL of them pay in
 * WRON (wrapped RON, 0xe514...bcd4). So instead of decoding each marketplace's
 * bespoke event, we read the WRON Transfer legs in a sale tx: a marketplace-
 * agnostic signal that captures every venue with no API key. This is why the
 * on-chain path beats OpenSea's stats (which see only Seaport sales).
 *
 * Gross price heuristic: sum WRON legs whose recipient is neither the buyer (a
 * change refund) nor the marketplace/escrow contract (the buyer->escrow hop).
 * What remains is seller proceeds + royalty + marketplace fee = the gross price
 * the buyer paid. Pure + unit-tested; the viem receipt adapter is thin.
 *
 * Known limitations (documented, acceptable for v1): a sale paid in native RON
 * or a non-WRON token emits no WRON Transfer leg and is missed; a bundle tx
 * moving multiple Ronkeverse tokens has its gross split evenly across them by
 * the indexer.
 */

import type { Address, Hex, TransactionReceipt } from "viem";

/** Wrapped RON - the payment token every Ronkeverse marketplace settles in. */
export const WRON_ADDRESS = "0xe514d9deb7966c8be0ca922de8a064264ea6bcd4";
/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface WronLeg {
  from: string;
  to: string;
  value: bigint;
}

/** Lowercased 20-byte address from a 32-byte indexed topic. */
function addrFromTopic(topic: Hex): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/** Extract WRON Transfer legs from a tx receipt's logs. */
export function wronLegsFromReceipt(receipt: TransactionReceipt): WronLeg[] {
  const legs: WronLeg[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== WRON_ADDRESS) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (log.topics.length < 3) continue;
    legs.push({
      from: addrFromTopic(log.topics[1] as Hex),
      to: addrFromTopic(log.topics[2] as Hex),
      value: BigInt(log.data === "0x" ? "0" : log.data),
    });
  }
  return legs;
}

/**
 * Gross sale price (in WRON base units) from the WRON legs of a sale tx.
 * Excludes legs paid back to the buyer (refunds) and legs into the marketplace
 * escrow (the buyer->escrow hop), leaving seller + royalty + fee = gross.
 */
export function grossSalePrice(
  legs: WronLeg[],
  opts: { buyer: string; marketplace?: string | null },
): bigint {
  const buyer = opts.buyer.toLowerCase();
  const marketplace = opts.marketplace?.toLowerCase() ?? "";
  let gross = 0n;
  for (const leg of legs) {
    const to = leg.to.toLowerCase();
    if (to === buyer) continue; // change / refund back to buyer
    if (marketplace && to === marketplace) continue; // buyer -> escrow hop
    gross += leg.value;
  }
  return gross;
}

export interface DetectedSale {
  priceWron: bigint;
  marketplace: string;
}

/**
 * Detect a WRON-settled sale from a receipt. `seller`/`buyer` come from the
 * Ronkeverse Transfer (from/to). Returns null when no WRON changed hands (not a
 * WRON sale - e.g. a plain wallet-to-wallet move, or a native-RON/other-token
 * sale we intentionally don't cover in v1).
 */
export function detectSale(
  receipt: TransactionReceipt,
  opts: { buyer: string },
): DetectedSale | null {
  const legs = wronLegsFromReceipt(receipt);
  if (legs.length === 0) return null;
  const marketplace = (receipt.to ?? "").toLowerCase();
  const priceWron = grossSalePrice(legs, { buyer: opts.buyer, marketplace });
  if (priceWron <= 0n) return null;
  return { priceWron, marketplace };
}
