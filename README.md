# Ronke Analytics

A public holder-analytics dashboard for the **$RONKE** ERC-20 token and the
**Ronkeverse** ERC-721 collection on Ronin. Ingests full transfer history into
an append-only database, rebuilds derived holder snapshots on a schedule, and
surfaces holder distribution, concentration (Gini, whale share), diamond-hands
stats, new-vs-exiting holder trends, NFT rarity, and per-wallet badge profiles.

Inspired by [diamondhands.fly.dev](https://diamondhands.fly.dev/) and
[kongzboard.com](https://kongzboard.com/). Separate from `crypto-books` (which
answers "what do my wallets hold and what is my tax basis"); this answers "who
holds RONKE/Ronkeverse and how strong are their hands."

## Stack

- **Next.js 16** (App Router) + React 19, deployed on **Vercel** (read-only over Neon).
- **Neon Postgres** as the store (append-only `transfer_events` + derived snapshots).
- **Moralis** EVM API v2.2 (`chain=ronin`) as the primary data source, with a
  **Blockscout** Ronin explorer fallback (built only if Moralis proves insufficient).
- **Vitest** for tests.

## Architecture (KTD summary)

- **Append-only source of truth.** `transfer_events` is immutable and unique on
  `(asset, tx_hash, log_index)`. Everything the dashboard shows is recomputed
  from it, so metric definitions can change without re-pulling chain data.
- **Rebuild after every sync (KTD-3).** The scheduled sync appends events past a
  per-asset cursor and then rebuilds snapshots as its final step, so new activity
  never silently vanishes. `meta.last_rebuild_at` is surfaced in the UI.
- **Off-Vercel ingestion (KTD-7).** Backfill and the daily sync+rebuild run in a
  GitHub Action (`.github/workflows/sync.yml`) or locally, never in a request
  handler. Vercel serves reads only.
- **L2-migration aware (KTD-4).** `MIGRATION_BLOCK = 55,577,490` is a named stitch
  constant; a continuity assertion decides whether one Moralis pass spans the
  boundary or the legacy era needs Blockscout.
- **Behavioral diamond-hands (KTD-6).** RONKE is unpriced, so "diamond hands" is
  behavioral (did held units leave as a genuine sell), driven by an address-label
  table that excludes staking / bridge / game-internal / self moves.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and MORALIS_API_KEY

npm run migrate        # apply db/schema.sql to Neon (idempotent)
npm run seed-labels    # seed known Ronin infra addresses
npm run probe          # (U13) verify provider endpoints + record fixtures
npm run backfill       # one-time full-history pull (local, may span days)
npm run fetch-traits   # one-time Ronkeverse trait ingest + rarity compute
npm run dev            # Next.js dev server

npm test               # run the vitest suite
```

The daily append + rebuild runs via the `sync` GitHub Action (repo secrets
`DATABASE_URL`, `MORALIS_API_KEY`) or `npm run sync` locally.

## Scripts

| Script | Purpose |
|---|---|
| `db/migrate.ts` | Apply schema idempotently to Neon |
| `scripts/seed-labels.ts` | Seed `address_labels` with known Ronin infra |
| `scripts/probe-providers.ts` | (U13) provider capability spike, records fixtures |
| `scripts/backfill.ts` | One-time full-history pull (local) |
| `scripts/sync.ts` | Daily append past cursor + rebuild (scheduled worker) |
| `scripts/rebuild.ts` | Manual full rebuild after a metric-definition change |
| `scripts/fetch-traits.ts` | On-demand Ronkeverse trait ingest + rarity recompute |
