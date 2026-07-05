/**
 * U13 - Provider capability spike (throwaway probe, not production code).
 *
 * Converts the unverified provider assumptions (KTD-4/5/8; R1/R2/R3/R6) into
 * recorded facts before U3/U4/U10 build on them. Against the two real contracts
 * on chain=ronin, it hits each contract-scoped Moralis endpoint once, records
 * the exact response shape to tests/fixtures/, estimates full-history volume,
 * probes the L2-migration boundary, and fetches one token's trait metadata.
 *
 * Output: tests/fixtures/*.json (consumed by U3 tests) plus a printed summary
 * to paste into docs/plans/provider-spike-findings.md.
 *
 * Run: MORALIS_API_KEY=... npm run probe
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { CONTRACTS, MIGRATION_BLOCK, RONIN_CHAIN_PARAM } from "@/config/contracts";
import { moralisApiKey } from "@/config/env";

const BASE = "https://deep-index.moralis.io/api/v2.2";
const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures");

async function get(path: string, params: Record<string, string>) {
  const url = new URL(BASE + path);
  url.searchParams.set("chain", RONIN_CHAIN_PARAM);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "X-API-Key": moralisApiKey(), accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function save(name: string, data: unknown) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(resolve(FIXTURE_DIR, name), JSON.stringify(data, null, 2));
  console.log(`  wrote tests/fixtures/${name}`);
}

async function main() {
  const token = CONTRACTS.ronke_token.address;
  const nft = CONTRACTS.ronkeverse_nft.address;
  const findings: string[] = [];

  console.log("== ERC-20 transfers (first page) ==");
  const erc20Transfers = await get(`/erc20/${token}/transfers`, { limit: "100" });
  save("erc20-transfers.json", erc20Transfers);
  findings.push(
    `ERC-20 /erc20/{addr}/transfers -> HTTP ${erc20Transfers.status}, ` +
      `page rows: ${(erc20Transfers.body?.result ?? []).length}, ` +
      `cursor present: ${!!erc20Transfers.body?.cursor}`,
  );

  console.log("== NFT transfers (first page) ==");
  const nftTransfers = await get(`/nft/${nft}/transfers`, { limit: "100" });
  save("nft-transfers.json", nftTransfers);
  findings.push(
    `NFT /nft/{addr}/transfers -> HTTP ${nftTransfers.status}, ` +
      `page rows: ${(nftTransfers.body?.result ?? []).length}`,
  );

  console.log("== ERC-20 owners (first page) ==");
  const erc20Owners = await get(`/erc20/${token}/owners`, { limit: "100" });
  save("erc20-owners.json", erc20Owners);
  findings.push(
    `ERC-20 /erc20/{addr}/owners -> HTTP ${erc20Owners.status}, ` +
      `rows: ${(erc20Owners.body?.result ?? []).length}`,
  );

  console.log("== NFT owners (first page) ==");
  const nftOwners = await get(`/nft/${nft}/owners`, { limit: "100" });
  save("nft-owners.json", nftOwners);
  findings.push(
    `NFT /nft/{addr}/owners -> HTTP ${nftOwners.status}, ` +
      `rows: ${(nftOwners.body?.result ?? []).length}`,
  );

  console.log("== One NFT token metadata (traits on Ronin?) ==");
  const firstTokenId = nftTransfers.body?.result?.[0]?.token_id ?? "1";
  const meta = await get(`/nft/${nft}/${firstTokenId}`, { normalizeMetadata: "true" });
  save("nft-token-metadata.json", meta);
  const attrs = meta.body?.normalized_metadata?.attributes ?? [];
  findings.push(
    `NFT metadata token ${firstTokenId} -> HTTP ${meta.status}, ` +
      `normalized attributes: ${attrs.length} ` +
      `(if 0, R6 tokenURI+IPFS fallback is required)`,
  );

  console.log("== L2 migration continuity probe ==");
  const pre = await get(`/nft/${nft}/transfers`, {
    limit: "5",
    to_block: String(MIGRATION_BLOCK - 1),
  });
  const post = await get(`/nft/${nft}/transfers`, {
    limit: "5",
    from_block: String(MIGRATION_BLOCK),
  });
  save("continuity-pre.json", pre);
  save("continuity-post.json", post);
  const preRows = (pre.body?.result ?? []).length;
  const postRows = (post.body?.result ?? []).length;
  findings.push(
    `Continuity: pre-migration (<${MIGRATION_BLOCK}) rows=${preRows}, ` +
      `post-migration (>=${MIGRATION_BLOCK}) rows=${postRows}. ` +
      (preRows === 0
        ? "GO/NO-GO: pre-L2 history MISSING from Moralis -> Blockscout legacy path REQUIRED."
        : "Pre-L2 history present in Moralis -> single-pass backfill viable."),
  );

  console.log("\n===== FINDINGS (paste into provider-spike-findings.md) =====");
  for (const f of findings) console.log("- " + f);
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
