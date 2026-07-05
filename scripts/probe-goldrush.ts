/**
 * GoldRush (Covalent) capability probe - verify it has Ronin PRE-L2 history
 * before building the client on it. Throwaway, like the U13 Moralis spike.
 *
 * Checks:
 *  1. Which chain identifier works for Ronin (ronin-mainnet vs 2020).
 *  2. token_holders_v2 (current holders - sanity).
 *  3. log events for the RONKE contract in a PRE-L2 block range - the decisive
 *     test: does GoldRush return transfers from before block 55,577,490?
 *
 * Run: GOLDRUSH_API_KEY=... npm run probe:goldrush
 */

import { requireEnv } from "@/config/env";
import { CONTRACTS } from "@/config/contracts";

const KEY = requireEnv("GOLDRUSH_API_KEY", "Get a free key at https://goldrush.dev");
const BASE = "https://api.covalenthq.com/v1";
const RONKE = CONTRACTS.ronke_token.address;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  // 1. Which chain id works?
  let chain = "";
  for (const candidate of ["ronin-mainnet", "2020"]) {
    const { status, body } = await get(`${BASE}/${candidate}/tokens/${RONKE}/token_holders_v2/?page-size=1`);
    console.log(`chain "${candidate}" -> holders HTTP ${status}${body?.error ? ` (${body.error_message})` : ""}`);
    if (status === 200 && !body?.error) {
      chain = candidate;
      const items = body?.data?.items ?? [];
      console.log(`  current holders sample: ${items.length} row(s); total_count=${body?.data?.pagination?.total_count ?? "n/a"}`);
      if (items[0]) console.log(`  holder shape:`, Object.keys(items[0]).join(","));
      break;
    }
  }
  if (!chain) {
    console.log("Could not resolve a working Ronin chain id on GoldRush. Stopping.");
    return;
  }

  // 2. PRE-L2 log events for RONKE (blocks well before MIGRATION_BLOCK).
  const url =
    `${BASE}/${chain}/events/address/${RONKE}/` +
    `?starting-block=42800000&ending-block=42805000&page-size=10&topics=${TRANSFER_TOPIC}`;
  const { status, body } = await get(url);
  console.log(`\nPRE-L2 events (blocks 42.80M-42.805M) -> HTTP ${status}`);
  if (body?.error) {
    console.log(`  error: ${body.error_message}`);
    return;
  }
  const items = body?.data?.items ?? [];
  console.log(`  returned ${items.length} log event(s) in that pre-L2 range`);
  if (items[0]) {
    const it = items[0];
    console.log(`  item keys: ${Object.keys(it).join(",")}`);
    console.log(`  block: ${it.block_height}, tx: ${it.tx_hash}, log_index: ${it.log_offset ?? it.log_index}`);
    console.log(`  decoded present: ${!!it.decoded}; decoded name: ${it.decoded?.name}`);
    if (it.decoded?.params) console.log(`  decoded params: ${it.decoded.params.map((p: any) => `${p.name}=${p.value}`).join(", ")}`);
    console.log(`  raw topics: ${(it.raw_log_topics || []).length}, has raw_log_data: ${!!it.raw_log_data}`);
    console.log(`  pagination: ${JSON.stringify(body?.data?.pagination)}`);
    console.log(`\n  => PRE-L2 COVERAGE CONFIRMED: GoldRush has Ronin history before the L2 migration.`);
  } else {
    console.log(`  => No pre-L2 events returned - GoldRush may also lack pre-L2 Ronin data. Investigate before building.`);
  }
}

main().catch((e) => {
  console.error("GoldRush probe failed:", e);
  process.exit(1);
});
