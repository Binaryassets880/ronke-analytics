/**
 * GoldRush (Covalent) provider - the PRE-L2 stitch source (KTD-4).
 *
 * Blockscout only indexes post-L2 history; Moralis has pre-L2 but is CU-capped.
 * GoldRush indexes Ronin's full history (including the pre-migration sidechain
 * era) under the legacy chain name "axie-mainnet", with native block-range
 * queries - so it can pull the pre-L2 era directly and resumably.
 *
 * Uses the log-events endpoint (/events/address/{contract}) over a block range,
 * paginated by page-number. Transfer logs are decoded from raw topics/data
 * (deterministic, no reliance on the provider's decoder). Normalizes to the
 * shared NormalizedTransfer shape.
 */

import type { NormalizedTransfer } from "@/lib/types";
import type { ContractConfig } from "@/config/contracts";
import { ZERO_ADDRESS, isBurnAddress } from "@/config/contracts";
import type { FetchImpl } from "./moralis";

const BASE_URL = "https://api.covalenthq.com/v1";
const RONIN_CHAIN = "axie-mainnet"; // Covalent's legacy name for Ronin (chain id 2020)
/** keccak256("Transfer(address,address,uint256)") - ERC-20 + ERC-721. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export class GoldRushError extends Error {}

export interface GoldRushOptions {
  apiKey: string;
  fetchImpl?: FetchImpl;
  baseUrl?: string;
  chain?: string;
  pageSize?: number;
  rateDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A 32-byte topic -> lowercased 0x address (last 20 bytes). */
function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

export class GoldRushProvider {
  readonly source = "goldrush" as const;
  private apiKey: string;
  private fetchImpl: FetchImpl;
  private baseUrl: string;
  private chain: string;
  private pageSize: number;
  private rateDelayMs: number;
  private lastCallAt = 0;

  private static readonly TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
  private static readonly MAX_RETRIES = 5;

  constructor(opts: GoldRushOptions) {
    if (!opts.apiKey) throw new GoldRushError("GOLDRUSH_API_KEY is empty");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.chain = opts.chain ?? RONIN_CHAIN;
    this.pageSize = opts.pageSize ?? 1000;
    this.rateDelayMs = opts.rateDelayMs ?? 250;
  }

  private async pace() {
    const wait = this.rateDelayMs - (Date.now() - this.lastCallAt);
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  private async getPage(
    contract: ContractConfig,
    startBlock: number,
    endBlock: number,
    pageNumber: number,
  ): Promise<any> {
    const url = new URL(`${this.baseUrl}/${this.chain}/events/address/${contract.address}/`);
    url.searchParams.set("starting-block", String(startBlock));
    url.searchParams.set("ending-block", String(endBlock));
    url.searchParams.set("page-size", String(this.pageSize));
    url.searchParams.set("page-number", String(pageNumber));
    let lastErr = "";
    for (let attempt = 0; attempt <= GoldRushProvider.MAX_RETRIES; attempt++) {
      await this.pace();
      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}`, accept: "application/json" },
      });
      if (res.status < 400) return res.json();
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error_message || "";
      } catch {
        detail = "";
      }
      lastErr = `HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
      if (GoldRushProvider.TRANSIENT.has(res.status) && attempt < GoldRushProvider.MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new GoldRushError(`GoldRush ${lastErr}`);
    }
    throw new GoldRushError(`GoldRush request failed after retries: ${lastErr}`);
  }

  /**
   * Stream normalized Transfer events for a contract over [startBlock, endBlock]
   * (inclusive), paginating page-number until exhausted. Non-Transfer logs
   * (Approval, etc.) are filtered out by topic0.
   */
  async *fetchTransfers(
    contract: ContractConfig,
    startBlock: number,
    endBlock: number,
  ): AsyncIterable<NormalizedTransfer> {
    let page = 0;
    for (;;) {
      const body = await this.getPage(contract, startBlock, endBlock, page);
      const items = body?.data?.items ?? [];
      for (const item of items) {
        const t = decodeTransferLog(contract, item);
        if (t) yield t;
      }
      if (!body?.data?.pagination?.has_more) return;
      page += 1;
    }
  }
}

/** Decode one GoldRush log item into a NormalizedTransfer, or null to drop it. */
export function decodeTransferLog(contract: ContractConfig, item: any): NormalizedTransfer | null {
  const topics: string[] = item?.raw_log_topics ?? [];
  if (topics[0] !== TRANSFER_TOPIC) return null; // not a Transfer log
  // ERC-721 Transfer has the tokenId indexed (4 topics); ERC-20 has 3.
  if (topics.length < 3) return null;
  const from = topicToAddress(topics[1]);
  const to = topicToAddress(topics[2]);
  const isNft = contract.standard === "erc721";

  let tokenId: string | null = null;
  let quantity: bigint;
  if (isNft) {
    if (topics.length < 4) return null; // need indexed tokenId
    tokenId = BigInt(topics[3]).toString();
    quantity = 1n;
  } else {
    quantity = BigInt(item?.raw_log_data ?? "0x0");
    if (quantity === 0n) return null;
  }

  return {
    asset: contract.asset,
    txHash: String(item?.tx_hash ?? "").toLowerCase(),
    logIndex: Number(item?.log_offset ?? 0),
    blockNumber: Number(item?.block_height ?? 0),
    blockTime: new Date(String(item?.block_signed_at)),
    from,
    to,
    tokenId,
    quantity,
    isMint: from === ZERO_ADDRESS,
    isBurn: isBurnAddress(to),
    raw: item,
  };
}
