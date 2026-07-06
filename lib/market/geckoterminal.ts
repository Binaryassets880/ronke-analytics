/**
 * GeckoTerminal on-chain market data for $RONKE (E6, KTD-E3).
 *
 * $RONKE is not a first-class CoinGecko listing, but its Ronin DEX pool (Ronke /
 * WRON on Katana) is indexed by GeckoTerminal, which exposes price, 24h volume,
 * and liquidity with no API key (~30 req/min). Verified live against the token
 * endpoint. Liquidity is thin (~$11-17K) so callers label the price as a
 * low-liquidity DEX quote, not a clean market price.
 *
 * `fetchImpl` is injectable so tests drive it with a recorded fixture.
 */

import { CONTRACTS } from "@/config/contracts";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const RONIN_NETWORK = "ronin";

export interface TokenMarket {
  priceUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
}

export type FetchImpl = typeof fetch;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse the GeckoTerminal token payload into our typed shape. Pure. */
export function parseTokenMarket(body: unknown): TokenMarket {
  const attrs = (body as { data?: { attributes?: Record<string, unknown> } })?.data?.attributes ?? {};
  const vol = attrs.volume_usd as { h24?: unknown } | undefined;
  return {
    priceUsd: num(attrs.price_usd),
    volume24hUsd: num(vol?.h24),
    liquidityUsd: num(attrs.total_reserve_in_usd),
    marketCapUsd: num(attrs.market_cap_usd),
    fdvUsd: num(attrs.fdv_usd),
  };
}

/**
 * Fetch $RONKE market data from GeckoTerminal. Returns null on any failure
 * (network, rate limit, shape change) so the caller degrades gracefully to
 * "market data unavailable" rather than failing the whole sync.
 */
export async function fetchRonkeMarket(
  opts: { fetchImpl?: FetchImpl; address?: string } = {},
): Promise<TokenMarket | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const address = (opts.address ?? CONTRACTS.ronke_token.address).toLowerCase();
  const url = `${BASE_URL}/networks/${RONIN_NETWORK}/tokens/${address}`;
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return parseTokenMarket(await res.json());
  } catch {
    return null;
  }
}
