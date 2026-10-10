/**
 * RONKA staking snapshot: RONKA still locked in the ronkeverse.fun TokenLocker, per
 * wallet, plus the day's RONKA/RONKE pool price.
 *
 * Read from the chain by the sync job BEFORE the rebuild (like lib/units/snapshot.ts),
 * stored in `staking_holdings` and `staking_prices`, and turned into points by
 * deriveScores. All or nothing: a failed read keeps yesterday's rows.
 *
 * What counts for a lock:
 *  - it is still running (endTime in the future) - an unlockable lock is not a commitment;
 *  - only the part not yet released (a vesting lock frees tokens day by day);
 *  - its length (endTime - lockedAt) of at least 30 days picks the multiplier;
 *  - its CURRENT owner, and never a contract.
 */

import { createPublicClient, fallback, http, parseAbi, type PublicClient } from "viem";
import { ronin } from "viem/chains";
import { insertMany, type Sql } from "@/db/client";
import { SCORE_CONFIG } from "@/config/score";

const LOCKER_ABI = parseAbi([
  "function lockIdsOfToken(address token) view returns (uint256[])",
  "function getLock(uint256 id) view returns ((address token, address owner, uint128 amount, uint128 withdrawn, uint64 lockedAt, uint64 startTime, uint64 endTime))",
  "function releasable(uint256 id) view returns (uint256)",
]);
// Katana V3's slot0 carries more fields than Uniswap's; the first two are all we need.
const POOL_ABI = parseAbi([
  "function token0() view returns (address)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick)",
]);

const S = SCORE_CONFIG.staking;
const DAY = 86400;

export interface StakingHolding {
  /** RONKA still locked across the wallet's running locks (whole tokens). */
  tokens: number;
  /** Token-weighted average term multiplier of those locks. */
  mult: number;
}

/** The multiplier for a lock of `days`, or 0 below the shortest term. */
export function termMultiplier(days: number): number {
  for (const [d, m] of S.terms) if (days >= d - S.termSlackDays) return m;
  return 0;
}

export function stakingClient(): PublicClient {
  const urls = (process.env.RONIN_RPC_URLS || "https://api.roninchain.com/rpc,https://ronin.gateway.tenderly.co")
    .split(",").map((u) => u.trim()).filter(Boolean);
  return createPublicClient({
    chain: ronin,
    transport: fallback(urls.map((u) => http(u, { retryCount: 3, retryDelay: 1500, timeout: 30_000 }))),
  }) as PublicClient;
}

/** RONKE per RONKA, from the pool's current price. */
export async function readStakingPrice(client: PublicClient = stakingClient()): Promise<number> {
  const pool = S.pool as `0x${string}`;
  const [token0, slot0] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0" }),
  ]);
  const p = (Number((slot0 as readonly [bigint, number])[0]) / 2 ** 96) ** 2; // token1 per token0, both 18 decimals
  const price = String(token0).toLowerCase() === S.token.toLowerCase() ? p : 1 / p;
  if (!(price > 0) || !Number.isFinite(price)) throw new Error(`staking: bad pool price ${price}`);
  return price;
}

/** Wallet (lowercase) -> its running RONKA locks. Contracts are left out. */
export async function readStakingHoldings(
  client: PublicClient = stakingClient(),
  log: (m: string) => void = () => {},
): Promise<Map<string, StakingHolding>> {
  const block = await client.getBlock();
  const now = Number(block.timestamp);
  const acc = new Map<string, { tokens: number; weighted: number }>();
  let running = 0;
  for (const lockerAddr of S.lockers) {
    const address = lockerAddr as `0x${string}`;
    const ids = (await client.readContract({ address, abi: LOCKER_ABI, functionName: "lockIdsOfToken", args: [S.token as `0x${string}`] })) as readonly bigint[];
    if (ids.length === 0) continue;
    const locks = await client.multicall({
      contracts: ids.map((id) => ({ address, abi: LOCKER_ABI, functionName: "getLock", args: [id] })) as never,
      allowFailure: false,
    }) as { token: string; owner: string; amount: bigint; withdrawn: bigint; lockedAt: bigint; startTime: bigint; endTime: bigint }[];
    const rel = await client.multicall({
      contracts: ids.map((id) => ({ address, abi: LOCKER_ABI, functionName: "releasable", args: [id] })) as never,
      allowFailure: false,
    }) as bigint[];
    locks.forEach((l, k) => {
      if (String(l.token).toLowerCase() !== S.token.toLowerCase()) return;
      if (Number(l.endTime) <= now) return; // ended: unlockable, not a commitment any more
      const still = l.amount - l.withdrawn - rel[k];
      if (still <= 0n) return;
      const m = termMultiplier((Number(l.endTime) - Number(l.lockedAt)) / DAY);
      if (m === 0) return;
      const tokens = Number(still) / 1e18;
      const w = String(l.owner).toLowerCase();
      const a = acc.get(w) ?? { tokens: 0, weighted: 0 };
      a.tokens += tokens;
      a.weighted += tokens * m;
      acc.set(w, a);
      running++;
    });
  }
  const map = new Map<string, StakingHolding>();
  for (const [w, a] of acc) map.set(w, { tokens: a.tokens, mult: a.weighted / a.tokens });
  for (const w of [...map.keys()]) {
    const code = await client.getCode({ address: w as `0x${string}` });
    if (code && code !== "0x") map.delete(w);
  }
  log(`staking: ${running} running RONKA locks, ${map.size} wallets`);
  return map;
}

/**
 * Store today's price and replace staking_holdings. On a failed read nothing is
 * written and false is returned - the rebuild then uses the last good rows.
 */
export async function refreshStaking(
  sql: Sql,
  opts: {
    read?: () => Promise<Map<string, StakingHolding>>;
    price?: () => Promise<number>;
    log?: (m: string) => void;
    today?: string;
  } = {},
): Promise<boolean> {
  const log = opts.log ?? (() => {});
  let map: Map<string, StakingHolding>;
  let price: number;
  try {
    const client = opts.read && opts.price ? null : stakingClient();
    [map, price] = await Promise.all([
      (opts.read ?? (() => readStakingHoldings(client!, log)))(),
      (opts.price ?? (() => readStakingPrice(client!)))(),
    ]);
  } catch (err) {
    log(`staking: chain read failed, keeping the previous rows - ${(err as Error).message}`);
    return false;
  }
  const day = opts.today ?? new Date().toISOString().slice(0, 10);
  await sql`INSERT INTO staking_prices (day, price) VALUES (${day}, ${price})
            ON CONFLICT (day) DO UPDATE SET price = EXCLUDED.price`;
  await insertMany(sql, "staking_holdings", ["address", "tokens", "mult"],
    [...map].map(([a, h]) => [a, h.tokens, h.mult]),
    { conflict: "ON CONFLICT (address) DO UPDATE SET tokens = EXCLUDED.tokens, mult = EXCLUDED.mult, updated_at = now()" });
  await sql`DELETE FROM staking_holdings WHERE NOT (address = ANY(${[...map.keys()]}))`;
  log(`staking: price ${price.toFixed(5)} RONKE/RONKA, staking_holdings now ${map.size} wallets`);
  return true;
}
