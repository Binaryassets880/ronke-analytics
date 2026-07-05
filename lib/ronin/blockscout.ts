/**
 * Blockscout Ronin explorer provider (free fallback).
 *
 * KTD-5: this is a to-be-built, endpoint-unconfirmed deliverable, gated on the
 * U13/continuity outcome. The U13 spike found Moralis DOES index pre-L2 history
 * (single-pass backfill is viable), so this path is NOT exercised in v1. It is
 * implemented to a normalized shape so it can be swapped in if Moralis ever
 * proves insufficient, but its response mapping is UNVERIFIED against live
 * Blockscout and must be re-probed before production use.
 *
 * API base: https://explorer.roninchain.com/api (module=token&action=getTokenHolders).
 */

import type { OwnerRow } from "@/lib/types";
import type { ContractConfig } from "@/config/contracts";
import type { FetchImpl } from "./moralis";

const BASE_URL = "https://explorer.roninchain.com/api";

export class BlockscoutError extends Error {}

export interface BlockscoutOptions {
  fetchImpl?: FetchImpl;
  baseUrl?: string;
}

export class BlockscoutProvider {
  readonly source = "blockscout" as const;
  private fetchImpl: FetchImpl;
  private baseUrl: string;

  constructor(opts: BlockscoutOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
  }

  /**
   * Current holders via `getTokenHolders`, normalized to the same OwnerRow
   * shape Moralis produces so downstream code is source-agnostic.
   */
  async *fetchOwners(contract: ContractConfig): AsyncIterable<OwnerRow> {
    let page = 1;
    const offset = 100;
    for (;;) {
      const url = new URL(this.baseUrl);
      url.searchParams.set("module", "token");
      url.searchParams.set("action", "getTokenHolders");
      url.searchParams.set("contractaddress", contract.address);
      url.searchParams.set("page", String(page));
      url.searchParams.set("offset", String(offset));
      const res = await this.fetchImpl(url.toString(), {
        headers: { accept: "application/json" },
      });
      if (res.status >= 400) throw new BlockscoutError(`Blockscout HTTP ${res.status}`);
      const body = await res.json();
      const rows: any[] = body?.result ?? [];
      if (rows.length === 0) return;
      for (const row of rows) {
        yield {
          address: String(row.address ?? row.owner_address ?? "").toLowerCase(),
          balance: BigInt(row.value ?? row.balance ?? "0"),
          tokenCount:
            contract.standard === "erc721" ? Number(row.value ?? 0) : undefined,
        };
      }
      if (rows.length < offset) return;
      page += 1;
    }
  }
}
