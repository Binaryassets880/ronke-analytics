/**
 * Blockscout Ronin explorer provider (explorer.roninchain.com).
 *
 * Promoted from deferred fallback to the PRIMARY transfer source: unlike
 * Moralis, it has no per-day CU cap and its block-range paging works, so it can
 * pull the full history in one run (~2-3 pages/sec, free, no key). It is the
 * canonical Ronin index, so it inherently spans the pre/post L2 boundary.
 *
 * Uses the Blockscout v2 API: GET /api/v2/tokens/{addr}/transfers, paginated
 * DESC (newest first) via the opaque `next_page_params` object echoed back as
 * query params. Normalizes to the same NormalizedTransfer shape as Moralis so
 * everything downstream stays source-agnostic.
 */

import type { NormalizedTransfer, OwnerRow } from "@/lib/types";
import type { Asset, ContractConfig } from "@/config/contracts";
import { ZERO_ADDRESS, isBurnAddress } from "@/config/contracts";
import type { FetchImpl } from "./moralis";

const BASE_URL = "https://explorer.roninchain.com/api/v2";

export class BlockscoutError extends Error {}

export interface BlockscoutOptions {
  fetchImpl?: FetchImpl;
  baseUrl?: string;
  /** Pacing between calls (ms) - stay polite to a public instance. */
  rateDelayMs?: number;
}

/** Opaque pagination cursor Blockscout echoes as `next_page_params`. */
export type PageParams = Record<string, string | number> | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BlockscoutProvider {
  readonly source = "blockscout" as const;
  private fetchImpl: FetchImpl;
  private baseUrl: string;
  private rateDelayMs: number;
  private lastCallAt = 0;

  private static readonly TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
  private static readonly MAX_RETRIES = 5;

  constructor(opts: BlockscoutOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.rateDelayMs = opts.rateDelayMs ?? 250;
  }

  private async pace() {
    const wait = this.rateDelayMs - (Date.now() - this.lastCallAt);
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }

  private async getJson(path: string, params?: PageParams): Promise<any> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    }
    let lastErr = "";
    for (let attempt = 0; attempt <= BlockscoutProvider.MAX_RETRIES; attempt++) {
      await this.pace();
      const res = await this.fetchImpl(url.toString(), { headers: { accept: "application/json" } });
      if (res.status < 400) return res.json();
      lastErr = `HTTP ${res.status}`;
      if (BlockscoutProvider.TRANSIENT.has(res.status) && attempt < BlockscoutProvider.MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new BlockscoutError(`Blockscout ${lastErr}`);
    }
    throw new BlockscoutError(`Blockscout request failed after retries: ${lastErr}`);
  }

  /**
   * Stream all token transfers for a contract, newest first (DESC), paging via
   * next_page_params until exhausted. `startParams` resumes from a saved cursor.
   */
  async *fetchTransfers(
    contract: ContractConfig,
    startParams: PageParams = null,
  ): AsyncIterable<NormalizedTransfer> {
    let params: PageParams = startParams;
    for (;;) {
      const body = await this.getJson(`/tokens/${contract.address}/transfers`, params);
      for (const item of body?.items ?? []) {
        const t = normalizeBlockscoutTransfer(contract.asset, contract.standard, item);
        if (t) yield t;
      }
      const next = (body?.next_page_params ?? null) as PageParams;
      if (!next) return;
      params = next;
    }
  }

  /** Current holders via the v2 holders endpoint, normalized to OwnerRow. */
  async *fetchOwners(contract: ContractConfig): AsyncIterable<OwnerRow> {
    let params: PageParams = null;
    for (;;) {
      const body = await this.getJson(`/tokens/${contract.address}/holders`, params);
      for (const row of body?.items ?? []) {
        yield {
          address: String(row.address?.hash ?? "").toLowerCase(),
          balance: BigInt(row.value ?? "0"),
          tokenCount: contract.standard === "erc721" ? Number(row.value ?? 0) : undefined,
          isContract: row.address?.is_contract ?? undefined,
        };
      }
      const next = (body?.next_page_params ?? null) as PageParams;
      if (!next) return;
      params = next;
    }
  }
}

/** Normalize a Blockscout v2 transfer item. Returns null for rows to drop. */
export function normalizeBlockscoutTransfer(
  asset: Asset,
  standard: "erc20" | "erc721",
  item: any,
): NormalizedTransfer | null {
  const from = String(item?.from?.hash ?? "").toLowerCase();
  const to = String(item?.to?.hash ?? "").toLowerCase();
  if (!from || !to) return null;
  const total = item?.total ?? {};
  const quantity = standard === "erc20" ? BigInt(total.value ?? "0") : 1n;
  if (standard === "erc20" && quantity === 0n) return null;
  const tokenId = standard === "erc721" && total.token_id != null ? String(total.token_id) : null;
  return {
    asset,
    txHash: String(item?.transaction_hash ?? "").toLowerCase(),
    logIndex: Number(item?.log_index ?? 0),
    blockNumber: Number(item?.block_number ?? 0),
    blockTime: new Date(String(item?.timestamp)),
    from,
    to,
    tokenId,
    quantity,
    isMint: from === ZERO_ADDRESS,
    isBurn: isBurnAddress(to),
    raw: item,
  };
}
