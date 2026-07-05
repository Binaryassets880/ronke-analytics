# U13 Provider Capability Spike - Findings

Date: 2026-07-05. Source: live Moralis EVM API v2.2 (`chain=ronin`) against the
two real contracts. Fixtures recorded under `tests/fixtures/`. This resolves the
unverified provider assumptions behind KTD-4/5/8 and R1/R2/R3/R6 before U3/U4/U10
build on them.

## Contracts (R1)

| Asset | Address | Standard | Genesis block | Genesis date |
|---|---|---|---|---|
| $RONKE | `0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb` | ERC-20 | 41,986,352 | 2025-01-25 |
| Ronkeverse | `0x810b6d1374ac7ba0e83612e7d49f49a13f1de019` | ERC-721 | 42,878,820 | 2025-02-25 |

Both addresses return live data on Moralis `chain=ronin`. Latest observed block
~57.9M (2026-07-05).

## Endpoints confirmed (KTD-5)

All four contract-scoped endpoints return **HTTP 200** with data (100-row first pages):

- `GET /erc20/{addr}/transfers` - cursor pagination (`body.cursor`), `order` ASC/DESC.
- `GET /nft/{addr}/transfers` - cursor pagination, `order` ASC/DESC.
- `GET /erc20/{addr}/owners` - current holders with `balance` + `percentage_relative_to_total_supply`.
- `GET /nft/{addr}/owners` - current holders.

The corrected endpoint name `/nft/{addr}/owners` (not `unique-owners`) is confirmed.

### Response shapes (recorded in fixtures)

- **ERC-20 transfer row:** `block_number`, `block_timestamp`, `transaction_hash`,
  `log_index`, `from_address`, `to_address`, `value` (raw), `value_decimal`,
  `token_decimals`, `possible_spam`, `verified_contract`.
- **NFT transfer row:** `block_number`, `block_timestamp`, `transaction_hash`,
  `log_index`, `token_id`, `amount`, `contract_type` (`ERC721`), `from_address`,
  `to_address`, `possible_spam`, `verified_collection`.
- **ERC-20 owner row:** `owner_address`, `balance` (raw), `balance_formatted`,
  `is_contract`, `owner_address_label`, `percentage_relative_to_total_supply`.
  (Top owner is the dead burn address holding ~130.6M RONKE - confirms the
  address-label burn exclusion in U9 is load-bearing.)

## Migration continuity - GO/NO-GO: **GO** (R2)

**Moralis indexes pre-L2 sidechain history.** Both contracts' genesis transfers
(Jan/Feb 2025, blocks ~42M) are *before* `MIGRATION_BLOCK = 55,577,490`
(2026-05-12) and are returned by Moralis with `order=ASC`, status 200.

=> A **single Moralis pass over the full block range spans the L2 boundary**.
The KTD-4 continuity assertion is expected to pass; the Blockscout legacy-era
path stays a **deferred, unbuilt fallback** (KTD-5), not a required deliverable.

Recorded continuity fixtures (for U3's `continuity.test.ts`):
- **Pre-migration** transfer: block 42,878,820, tx
  `0x583d488b808c8f1cbb7d3b31154d807719109d4971c469ef6c4f7b262d0a51e6`, log_index 46.
- **Post-migration** transfer: block 57,885,401, tx
  `0xb6a3701ce4dddb253c37e8caf53f6f8e0c6a170eeed84e977a5058deb13651a9`, log_index 1.

Note: passing `from_block`/`to_block` with the default DESC order returned 0 rows
in the first naive probe; use `order=ASC` + cursor paging (or explicit
`from_block`+`to_block` bounds together) when range-scanning. Backfill should page
ASC from genesis via cursor rather than lean on one-sided block filters.

## Trait metadata (R6) - no IPFS fallback needed

`GET /nft/{addr}/{token_id}?normalizeMetadata=true` returns
`normalized_metadata.attributes` populated on Ronin (sample token had 6 traits:
Background, Body, Clothes, Mouth, Eyes, Hair - Headwear). Each attribute carries
`trait_type`, `value`, `display_type`, `count`, `percentage`, and `rarity_label`.

=> U10 can ingest traits directly from Moralis `normalized_metadata`; the
`tokenURI` + IPFS fallback is **not required** for v1. Moralis's per-trait
`count`/`percentage`/`rarity_label` serve as the cross-check for U11.

## CU / volume estimate (R3)

- ~5.5 months of history per asset (genesis Jan/Feb 2025 -> Jul 2026), blocks
  ~41.9M -> 57.9M. Transfer volume paginates at 100 rows/page with cursors.
- Backfill is the CU-heavy op and should run **locally, paging ASC via cursor**,
  writing to Neon with `ON CONFLICT DO NOTHING` so it is resumable across days if
  the free-tier CU budget (40k/day) is hit mid-run. The `owners` snapshot is cheap.
- Reuse the crypto-books 401 = "Total included usage exceeded" handling so CU
  exhaustion is diagnosable and the backfill can resume next day.

## Consequences for later units

- **U3:** normalize the recorded ERC-20/NFT transfer shapes above; page via
  `cursor`; filter `possible_spam`; `is_mint` = `from == 0x0`, `is_burn` =
  `to in {0x0, 0x..dead}`.
- **U4:** single-source (Moralis) backfill paging ASC from genesis; continuity
  assertion is a defensive check, not a branch we expect to take.
- **U10:** ingest `normalized_metadata.attributes` directly; store Moralis
  `count`/`percentage`/`rarity_label` as cross-check.
