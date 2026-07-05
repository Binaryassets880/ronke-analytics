/**
 * Moralis EVM API v2.2 provider for Ronin (chain=ronin), the primary source.
 *
 * Only the HTTP plumbing (headers, pacing, 401=CU-exhaustion handling) is
 * proven in crypto-books; the contract-scoped endpoints here are new and their
 * shapes were verified by the U13 spike (see provider-spike-findings.md).
 *
 * `fetchImpl` is injectable so tests drive it with recorded fixtures instead
 * of hitting the live API.
 */

import type { NormalizedTransfer, OwnerRow } from "@/lib/types";
import type { Asset, ContractConfig } from "@/config/contracts";
import { RONIN_CHAIN_PARAM, ZERO_ADDRESS, isBurnAddress } from "@/config/contracts";

const BASE_URL = "https://deep-index.moralis.io/api/v2.2";
const PAGE_SIZE = 100;

export class MoralisError extends Error {}
/** 401 due to CU-budget exhaustion (distinct from a bad key). */
export class MoralisCuError extends MoralisError {}
/** 401 due to an invalid/malformed key. */
export class MoralisAuthError extends MoralisError {}

export type FetchImpl = typeof fetch;

export interface MoralisOptions {
  apiKey: string;
  fetchImpl?: FetchImpl;
  baseUrl?: string;
  /** Pacing between calls (ms). 0 in tests. */
  rateDelayMs?: number;
}

export interface TransferQuery {
  fromBlock?: number;
  toBlock?: number;
  order?: "ASC" | "DESC";
}

/** Raw Moralis attribute as served in normalized_metadata. */
export interface MoralisAttribute {
  trait_type: string;
  value: string | number | boolean | null;
  display_type: string | null;
  count?: number;
  percentage?: number;
  rarity_label?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MoralisProvider {
  readonly source = "moralis" as const;
  private apiKey: string;
  private fetchImpl: FetchImpl;
  private baseUrl: string;
  private rateDelayMs: number;
  private lastCallAt = 0;

  constructor(opts: MoralisOptions) {
    if (!opts.apiKey) throw new MoralisError("MORALIS_API_KEY is empty");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.rateDelayMs = opts.rateDelayMs ?? 250;
  }

  private async pace() {
    const wait = this.rateDelayMs - (Date.now() - this.lastCallAt);
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  private async request(path: string, params: Record<string, string>): Promise<any> {
    await this.pace();
    const url = new URL(this.baseUrl + path);
    url.searchParams.set("chain", RONIN_CHAIN_PARAM);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.fetchImpl(url.toString(), {
      headers: { "X-API-Key": this.apiKey, accept: "application/json" },
    });
    if (res.status === 401) {
      // Moralis returns 401 for both a bad key AND CU-budget exhaustion on the
      // free tier. The body message disambiguates (crypto-books pattern).
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.message || j?.error || "";
      } catch {
        detail = "";
      }
      if (/usage exceeded|budget|rate limit/i.test(detail)) {
        throw new MoralisCuError(
          `Moralis CU budget exhausted: ${detail} (see https://admin.moralis.com/usage)`,
        );
      }
      throw new MoralisAuthError(`Moralis 401 (bad key?): ${detail || "unauthorized"}`);
    }
    if (res.status === 429) {
      throw new MoralisCuError("Moralis 429: rate limit / CU budget exceeded");
    }
    if (res.status >= 400) {
      throw new MoralisError(`Moralis HTTP ${res.status}`);
    }
    return res.json();
  }

  /** Stream normalized transfers for a contract, paginating via cursor. */
  async *fetchTransfers(
    contract: ContractConfig,
    query: TransferQuery = {},
  ): AsyncIterable<NormalizedTransfer> {
    const endpoint =
      contract.standard === "erc20"
        ? `/erc20/${contract.address}/transfers`
        : `/nft/${contract.address}/transfers`;
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        order: query.order ?? "ASC",
      };
      if (query.fromBlock != null) params.from_block = String(query.fromBlock);
      if (query.toBlock != null) params.to_block = String(query.toBlock);
      if (cursor) params.cursor = cursor;
      const body = await this.request(endpoint, params);
      for (const row of body?.result ?? []) {
        const t = normalizeTransfer(contract.asset, contract.standard, row);
        if (t) yield t;
      }
      cursor = body?.cursor || undefined;
    } while (cursor);
  }

  /** Stream current owners for a contract. */
  async *fetchOwners(contract: ContractConfig): AsyncIterable<OwnerRow> {
    const endpoint =
      contract.standard === "erc20"
        ? `/erc20/${contract.address}/owners`
        : `/nft/${contract.address}/owners`;
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = { limit: String(PAGE_SIZE) };
      if (cursor) params.cursor = cursor;
      const body = await this.request(endpoint, params);
      for (const row of body?.result ?? []) {
        yield normalizeOwner(contract.standard, row);
      }
      cursor = body?.cursor || undefined;
    } while (cursor);
  }

  /** Fetch one token's normalized trait metadata (U10). */
  async fetchTokenMetadata(
    contract: ContractConfig,
    tokenId: string,
  ): Promise<{ tokenId: string; attributes: MoralisAttribute[]; imageUrl: string | null }> {
    const body = await this.request(`/nft/${contract.address}/${tokenId}`, {
      normalizeMetadata: "true",
    });
    return {
      tokenId,
      attributes: (body?.normalized_metadata?.attributes ?? []) as MoralisAttribute[],
      imageUrl: body?.normalized_metadata?.image ?? body?.media?.original_media_url ?? null,
    };
  }

  /** Stream every token's normalized metadata for the collection (U10). */
  async *fetchCollectionMetadata(
    contract: ContractConfig,
  ): AsyncIterable<{ tokenId: string; attributes: MoralisAttribute[]; imageUrl: string | null }> {
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        normalizeMetadata: "true",
      };
      if (cursor) params.cursor = cursor;
      const body = await this.request(`/nft/${contract.address}`, params);
      for (const row of body?.result ?? []) {
        yield {
          tokenId: String(row.token_id),
          attributes: (row?.normalized_metadata?.attributes ?? []) as MoralisAttribute[],
          imageUrl: row?.normalized_metadata?.image ?? row?.media?.original_media_url ?? null,
        };
      }
      cursor = body?.cursor || undefined;
    } while (cursor);
  }
}

/** ISO timestamp -> Date. */
function parseTs(v: unknown): Date {
  return new Date(String(v));
}

/**
 * Normalize a Moralis transfer row. Returns null for rows that must be
 * filtered: spam, wrong contract type, and zero-quantity ERC-20 legs.
 */
export function normalizeTransfer(
  asset: Asset,
  standard: "erc20" | "erc721",
  row: any,
): NormalizedTransfer | null {
  if (row?.possible_spam === true) return null;
  if (standard === "erc721" && row?.contract_type && row.contract_type !== "ERC721") {
    return null; // ERC-1155 / non-721 rows are not this asset
  }
  const from = String(row.from_address ?? "").toLowerCase();
  const to = String(row.to_address ?? "").toLowerCase();
  const quantity =
    standard === "erc20"
      ? BigInt(row.value ?? "0")
      : BigInt(row.amount ?? "1");
  if (standard === "erc20" && quantity === 0n) return null; // no balance change
  return {
    asset,
    txHash: String(row.transaction_hash ?? "").toLowerCase(),
    logIndex: Number(row.log_index ?? 0),
    blockNumber: Number(row.block_number ?? 0),
    blockTime: parseTs(row.block_timestamp),
    from,
    to,
    tokenId: standard === "erc721" ? String(row.token_id) : null,
    quantity,
    isMint: from === ZERO_ADDRESS,
    isBurn: isBurnAddress(to),
    raw: row,
  };
}

export function normalizeOwner(standard: "erc20" | "erc721", row: any): OwnerRow {
  return {
    address: String(row.owner_address ?? "").toLowerCase(),
    balance: BigInt(row.balance ?? "0"),
    tokenCount: standard === "erc721" ? Number(row.balance ?? 0) : undefined,
    isContract: row.is_contract ?? undefined,
    label: row.owner_address_label ?? null,
  };
}
