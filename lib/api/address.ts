/**
 * Address / .ron resolution for the public API.
 *
 * IMPORTANT: this path never touches the chain. The site can afford
 * `resolveNameLive()` (an on-chain call through the public Ronin RPC) on a
 * single user-initiated search; a public API cannot. It would put a
 * multi-second, rate-limited third-party dependency on the hot path of every
 * cache miss, and a burst of traffic would exhaust the shared RPC quota and
 * take the site's own name lookups down with it.
 *
 * Instead we read `rns_names`, which the nightly sync already populates by
 * reverse-resolving every holder. Consequence, documented for integrators: a
 * name that has never held a Ronke asset is unresolvable here, and a newly
 * registered name resolves within one sync. Addresses always work.
 */

import { getSql } from "@/db/client";
import { normalizeAddress } from "@/lib/format";

export type ResolvedAddress =
  | { ok: true; address: string; name: string | null }
  | { ok: false; code: "invalid_address" | "name_not_resolved" | "not_configured"; message: string };

const NAME_SUFFIX = ".ron";

/** True for input that looks like a .ron name (not a bare suffix). */
export function isRonName(input: string): boolean {
  return input.endsWith(NAME_SUFFIX) && input.length > NAME_SUFFIX.length;
}

/**
 * Resolve a route param that is either a 0x address or a cached .ron name.
 *
 * Returns a discriminated result rather than throwing, so routes map failures
 * onto documented error codes instead of leaking a 500.
 */
export async function resolveParam(raw: string): Promise<ResolvedAddress> {
  const input = decodeURIComponent(raw ?? "").trim().toLowerCase();

  const address = normalizeAddress(input);
  if (address) return { ok: true, address, name: null };

  if (!isRonName(input)) {
    return {
      ok: false,
      code: "invalid_address",
      message: "Expected a 0x wallet address or a .ron name.",
    };
  }

  const sql = getSql();
  if (!sql) {
    return { ok: false, code: "not_configured", message: "Database not configured." };
  }

  const rows = await sql`SELECT address FROM rns_names WHERE name = ${input} LIMIT 1`;
  const found = rows[0]?.address as string | undefined;
  if (!found) {
    return {
      ok: false,
      code: "name_not_resolved",
      message:
        `No cached address for ${input}. Names are resolved during the nightly sync, ` +
        "so a name that has never held a Ronke asset is not available here. Use the 0x address.",
    };
  }
  return { ok: true, address: found.toLowerCase(), name: input };
}

/**
 * Parse the batch `addresses` param.
 *
 * Rejects the whole request on any malformed entry rather than silently dropping
 * it: a caller checking a lobby of 40 wallets must not get 39 results back and
 * assume the missing one scored zero. Names are not accepted - resolving each
 * would turn one query into N and defeat the point of batching.
 */
export function parseAddressList(
  raw: string | null,
  max: number,
):
  | { ok: true; requested: string[]; unique: string[] }
  | { ok: false; code: "invalid_address" | "too_many_addresses"; message: string } {
  const parts = (raw ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== "");

  if (parts.length === 0) {
    return {
      ok: false,
      code: "invalid_address",
      message: "Pass ?addresses= with one or more comma-separated 0x addresses.",
    };
  }
  if (parts.length > max) {
    return {
      ok: false,
      code: "too_many_addresses",
      message: `At most ${max} addresses per request; got ${parts.length}.`,
    };
  }

  const requested: string[] = [];
  for (const part of parts) {
    const address = normalizeAddress(part);
    if (!address) {
      return {
        ok: false,
        code: "invalid_address",
        message: `Not a valid 0x address: ${part}. .ron names are not supported in batch requests.`,
      };
    }
    requested.push(address);
  }

  // Sorted + deduped for the query; `requested` keeps the caller's order and
  // duplicates so the response mirrors the request one-for-one.
  const unique = [...new Set(requested)].sort();
  return { ok: true, requested, unique };
}
