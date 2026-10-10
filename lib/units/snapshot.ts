/**
 * PewPew units snapshot: level 10+ PewPewBarracks units per wallet.
 *
 * Read from the chain by the sync job BEFORE the rebuild (the rebuild itself
 * reads only derived tables), stored in `unit_holdings`, and turned into points
 * by deriveScores. The contract is ERC721Enumerable, so the whole set is
 * tokenByIndex -> getUnitFullData (level) -> ownerOf for the 10+ ones, all through
 * Multicall3: ~5.5k units is a few dozen RPC calls.
 *
 * All or nothing: any failed call aborts the read, and refreshUnitHoldings then
 * keeps yesterday's rows. A partial read would silently drop somebody's units.
 */

import { createPublicClient, fallback, http, parseAbi, type PublicClient } from "viem";
import { ronin } from "viem/chains";
import { insertMany, type Sql } from "@/db/client";
import { SCORE_CONFIG } from "@/config/score";

const ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getUnitFullData(uint256 tokenId) view returns (uint8 utype, uint32 xp, uint16 level, uint16 battles, uint16 wins, uint32 kills, uint32 mintedAt, uint32 lastBattleAt)",
]);

export interface UnitHolding {
  /** Level 10+ units held. */
  unitsCount: number;
  maxLevel: number;
  /** Units of any level held. */
  unitsTotal: number;
}

export function unitsClient(): PublicClient {
  const urls = (process.env.RONIN_RPC_URLS || "https://api.roninchain.com/rpc,https://ronin.gateway.tenderly.co")
    .split(",").map((u) => u.trim()).filter(Boolean);
  return createPublicClient({
    chain: ronin,
    transport: fallback(urls.map((u) => http(u, { retryCount: 3, retryDelay: 1500, timeout: 30_000 }))),
    batch: { multicall: { batchSize: 1024 * 24, wait: 0 } },
  }) as PublicClient;
}

/** Run read calls through Multicall3 in chunks; throws on any failure. */
async function many<T>(client: PublicClient, calls: { functionName: string; args: readonly unknown[] }[], chunk = 400): Promise<T[]> {
  const out: T[] = [];
  const address = SCORE_CONFIG.units.contract as `0x${string}`;
  for (let i = 0; i < calls.length; i += chunk) {
    const res = await client.multicall({
      contracts: calls.slice(i, i + chunk).map((c) => ({ address, abi: ABI, functionName: c.functionName, args: c.args })) as never,
      allowFailure: false,
    });
    out.push(...(res as T[]));
  }
  return out;
}

/**
 * Wallet (lowercase) -> its units: level 10+ count and total held. Only wallets
 * that earn something (a level 10+ unit, or holdMin units) are returned, and
 * contracts are left out.
 */
export async function readUnitHoldings(
  client: PublicClient = unitsClient(),
  log: (m: string) => void = () => {},
): Promise<Map<string, UnitHolding>> {
  const address = SCORE_CONFIG.units.contract as `0x${string}`;
  const supply = Number(await client.readContract({ address, abi: ABI, functionName: "totalSupply" }));
  if (!(supply > 0)) throw new Error(`units: totalSupply ${supply}`);
  const ids = await many<bigint>(client, Array.from({ length: supply }, (_, i) => ({ functionName: "tokenByIndex", args: [BigInt(i)] })));
  const data = await many<readonly [number, number, number, ...unknown[]]>(client, ids.map((id) => ({ functionName: "getUnitFullData", args: [id] })));
  const owners = await many<string>(client, ids.map((id) => ({ functionName: "ownerOf", args: [id] })));

  const all = new Map<string, UnitHolding>();
  ids.forEach((_, k) => {
    const w = owners[k].toLowerCase();
    const level = Number(data[k][2]);
    const h = all.get(w) ?? { unitsCount: 0, maxLevel: 0, unitsTotal: 0 };
    h.unitsTotal += 1;
    h.maxLevel = Math.max(h.maxLevel, level);
    if (level >= SCORE_CONFIG.units.minLevel) h.unitsCount += 1;
    all.set(w, h);
  });
  const map = new Map([...all].filter(([, h]) => h.unitsCount > 0 || h.unitsTotal >= SCORE_CONFIG.units.holdMin));
  // A marketplace or other contract holding units is not a player.
  for (const w of [...map.keys()]) {
    const code = await client.getCode({ address: w as `0x${string}` });
    if (code && code !== "0x") map.delete(w);
  }
  const high = [...map.values()].reduce((s, h) => s + h.unitsCount, 0);
  log(`units: ${supply} units, ${all.size} holders, ${map.size} wallets earn points (${high} units at level ${SCORE_CONFIG.units.minLevel}+)`);
  return map;
}

/**
 * Replace unit_holdings with a fresh read. On any read failure the old rows stay
 * and this returns false - the rebuild then scores units as of the last good read.
 */
export async function refreshUnitHoldings(
  sql: Sql,
  opts: { read?: () => Promise<Map<string, UnitHolding>>; log?: (m: string) => void } = {},
): Promise<boolean> {
  const log = opts.log ?? (() => {});
  let map: Map<string, UnitHolding>;
  try {
    map = await (opts.read ?? (() => readUnitHoldings(unitsClient(), log)))();
  } catch (err) {
    log(`units: chain read failed, keeping the previous unit_holdings - ${(err as Error).message}`);
    return false;
  }
  // Upsert first, then drop the wallets that no longer hold any: if the write fails
  // half-way, the table still holds every wallet's last known count, never nothing.
  await insertMany(sql, "unit_holdings", ["address", "units_count", "max_level", "units_total"],
    [...map].map(([a, h]) => [a, h.unitsCount, h.maxLevel, h.unitsTotal]),
    { conflict: "ON CONFLICT (address) DO UPDATE SET units_count = EXCLUDED.units_count, max_level = EXCLUDED.max_level, units_total = EXCLUDED.units_total, updated_at = now()" });
  await sql`DELETE FROM unit_holdings WHERE NOT (address = ANY(${[...map.keys()]}))`;
  log(`units: unit_holdings now ${map.size} wallets`);
  return true;
}
