/**
 * Ronin Name Service (.ron) resolution (E4, KTD-E4).
 *
 * RNS is ENS-compatible: a two-step read (registry -> resolver) using an
 * ENS-style namehash. There is no hosted RNS HTTP API, so resolution is
 * on-chain contract reads over a Ronin RPC. The orchestration (resolveName /
 * lookupName) is written against an injectable `RnsReader` so it is unit-testable
 * without a live RPC; `viemReader` is the thin production adapter.
 *
 * Reverse lookups are forward-verified (ENS best practice): a claimed primary
 * name is only trusted if it resolves back to the same address, so a wallet
 * can't spoof a reverse record it doesn't actually own.
 *
 * IMPORTANT (verified live against Ronin mainnet, chain id 2020): RNS is NOT a
 * drop-in ENS registry. The "RNS Unified" contract (0x67c4...bf44) is an ERC-721
 * whose `resolver(bytes32)` reverts - it exposes `ownerOf(uint256(node))`
 * instead. Resolution goes straight through the Public Resolver
 * (0xadb0...2d48), which does implement ENS-style `addr(bytes32)` and
 * `name(bytes32)`. Confirmed: addr(namehash("ronke.ron")) = 0x3617...fb70, and
 * name(reverseNode(0x3617...)) = "ronke.ron". An unset record REVERTS rather
 * than returning zero/"", so the reader tolerates reverts as "unset".
 *
 * Limitation: names that set a non-default (custom) resolver won't resolve via
 * this default-resolver path. Covering those requires an RNSUnified records
 * lookup and is deferred; the default resolver covers the common case.
 */

import {
  createPublicClient,
  http,
  namehash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ronin } from "viem/chains";

/** RNS Unified registry (ERC-721; owner lookup only, not used for resolution). */
export const RNS_REGISTRY: Address = "0x67c409dab0ee741a1b1be874bd1333234cfdbf44";
/** RNS Public Resolver on Ronin mainnet - the ENS-style addr/name resolver. */
export const RNS_PUBLIC_RESOLVER: Address = "0xadb077d236d9e81fb24b96ae9cb8089ab9942d48";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RESOLVER_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** ENS-style node for a name (TLD-agnostic, so `.ron` works). Pure. */
export function nodeForName(name: string): Hex {
  return namehash(name);
}

/** Reverse-record node: namehash("<addr-no-0x-lowercase>.addr.reverse"). Pure. */
export function reverseNode(address: string): Hex {
  const a = address.toLowerCase().replace(/^0x/, "");
  return namehash(`${a}.addr.reverse`);
}

/** True for the zero address (an unset resolver/addr). */
export function isZeroAddress(a: string | null | undefined): boolean {
  return !a || a.toLowerCase() === ZERO_ADDRESS;
}

/**
 * Minimal read surface RNS resolution needs. Injectable so the orchestration
 * below is testable with a fake, and the live path is a thin viem adapter.
 */
export interface RnsReader {
  /** registry.resolver(node) -> resolver address (zero if unset). */
  resolverOf(node: Hex): Promise<Address>;
  /** resolver.addr(node) -> address (zero if unset). */
  addrOf(resolver: Address, node: Hex): Promise<Address>;
  /** resolver.name(node) -> primary name string ("" if unset). */
  nameOf(resolver: Address, node: Hex): Promise<string>;
}

/** Forward: `name.ron` -> lowercased address, or null when unset. */
export async function resolveName(name: string, reader: RnsReader): Promise<string | null> {
  const node = nodeForName(name);
  const resolver = await reader.resolverOf(node);
  if (isZeroAddress(resolver)) return null;
  const addr = await reader.addrOf(resolver, node);
  return isZeroAddress(addr) ? null : addr.toLowerCase();
}

/**
 * Reverse: address -> primary `.ron` name, forward-verified, or null. The name
 * must resolve back to the same address to be trusted.
 */
export async function lookupName(address: string, reader: RnsReader): Promise<string | null> {
  const node = reverseNode(address);
  const resolver = await reader.resolverOf(node);
  if (isZeroAddress(resolver)) return null;
  const name = (await reader.nameOf(resolver, node))?.trim();
  if (!name) return null;
  const forward = await resolveName(name, reader);
  if (!forward || forward.toLowerCase() !== address.toLowerCase()) return null;
  return name;
}

// ── Live path (viem over Ronin RPC) ──────────────────────────────────

/** Ronin public client. Uses RONIN_RPC_URL when set, else the chain default. */
export function roninPublicClient(rpcUrl = process.env.RONIN_RPC_URL): PublicClient {
  return createPublicClient({ chain: ronin, transport: http(rpcUrl) });
}

/** Resolve a readContract promise, treating a revert (unset record) as `fallback`. */
async function tolerateRevert<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/**
 * viem-backed RnsReader. Resolution goes straight through the Public Resolver
 * (the RNS Unified registry is an ERC-721 and reverts on `resolver()`), so
 * `resolverOf` returns that fixed resolver and addr/name calls tolerate the
 * revert RNS emits for an unset record.
 */
export function viemReader(
  client: PublicClient,
  resolver: Address = RNS_PUBLIC_RESOLVER,
): RnsReader {
  return {
    resolverOf: async () => resolver,
    addrOf: (r, node) =>
      tolerateRevert(
        client.readContract({
          address: r,
          abi: RESOLVER_ABI,
          functionName: "addr",
          args: [node],
        }) as Promise<Address>,
        ZERO_ADDRESS as Address,
      ),
    nameOf: (r, node) =>
      tolerateRevert(
        client.readContract({
          address: r,
          abi: RESOLVER_ABI,
          functionName: "name",
          args: [node],
        }) as Promise<string>,
        "",
      ),
  };
}

/** Build a live reader from env/default RPC. */
export function defaultReader(rpcUrl?: string): RnsReader {
  return viemReader(roninPublicClient(rpcUrl));
}

/** Best-effort forward resolve via the live RPC. Returns null on any failure. */
export async function resolveNameLive(name: string, rpcUrl?: string): Promise<string | null> {
  try {
    return await resolveName(name, defaultReader(rpcUrl));
  } catch {
    return null;
  }
}
