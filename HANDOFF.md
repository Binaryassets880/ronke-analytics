# Ronke Analytics - handoff

Absolute path: `C:\dev\claude\ronke-analytics`
Last updated: 2026-08-11

## What this is

Public analytics + ecosystem site for $RONKE, RonkeStr, and Ronkeverse on Ronin.
Next.js 16 + React 19 + Neon Postgres, deployed on Vercel. Vercel serves READS
ONLY; all ingestion and the nightly rebuild run off-Vercel in the `sync.yml`
GitHub Action (KTD-7). See `README.md` for the pipeline rules and `CLAUDE.md`
for conventions.

## Current state

`main` is live and healthy. Work in progress sits on **`feat/public-score-api`**
(built 2026-08-11, **not merged, not deployed**).

### feat/public-score-api - public Ronke Score API

Plan: `docs/plans/2026-08-06-001-feat-ronke-score-public-api-plan.md` (status
`completed` for units U1-U6; U7 deliberately deferred).

Eight public, keyless, CDN-cached, read-only endpoints under `/api/v1`, plus a
generated OpenAPI document and a `/developers` docs page:

| Endpoint | Cache |
|---|---|
| `GET /api/v1/score/{addressOrName}` | 15 min |
| `GET /api/v1/scores?addresses=` (batch, max 50) | 15 min |
| `GET /api/v1/leaderboard?limit=&offset=` | 15 min |
| `GET /api/v1/wallet/{addressOrName}` | 15 min |
| `GET /api/v1/nft/{tokenId}` | 24 h |
| `GET /api/v1/config` | 1 h |
| `GET /api/v1/stats` | 15 min |
| `GET /api/v1/meta` | 5 min |
| `GET /api/v1/openapi.json` | 1 h |

Verified live against the production Neon DB on 2026-08-11: all endpoints 200,
`rank`/`percentile` populate, error paths return their documented codes, CORS
preflight 204. 348 tests green, `tsc` clean, `next build` clean.

## THE DEPLOY GOTCHA - read before merging

**`npm run migrate` MUST run before this branch is deployed.** The read path now
selects `wallet_scores.rank` and `wallet_scores.percentile`. If Vercel serves the
new code against a database without those columns, every score query errors and
the leaderboard + wallet profile pages break.

Two safe orders:

1. Run `npm run migrate` manually (already done against production on
   2026-08-11 - the columns exist now), then merge. This is the current state,
   so **merging is safe as things stand**.
2. Or trigger `gh workflow run sync.yml`, which runs `migrate` before `sync`.

`rank`/`percentile` were also populated by a manual `npm run rebuild` on
2026-08-11, so they are non-null in production today.

Secondary note: between a migration and the next rebuild the columns are NULL.
`getWalletScore()` falls back to the old `count(*)` rank for that window so the
wallet profile never shows a blank rank. The **leaderboard has no such fallback**
and would show `rank: null` until the next rebuild. Transient by design; harmless
now that a rebuild has run.

## What is NOT done

- Not merged, no PR opened, not deployed.
- **U7 (API keys + rate limits) deliberately not built.** Protection today is CDN
  caching, a 50-address batch cap, and capped leaderboard pagination. If abuse
  appears, add Vercel Firewall rate-limit rules on `/api/v1/*` in the dashboard
  first - no code needed. The `api_keys` sketch is in the plan.
- **No canonical tier bands**, by founder decision (2026-08-06). Games define
  their own bands on `rank` / `percentile`. Adding a `tier` field later is
  additive and non-breaking.
- Two open founder decisions, neither blocking:
  1. Whether score retunes get an announcement window for integrators. Whatever
     is chosen belongs on the `/developers` page.
  2. Percentile denominator is currently "wallets with a non-zero score"
     (~6,199). Alternative is "all current holders". Note `rank` is unaffected
     either way, which is why this stopped being launch-blocking.

## How to restart

```bash
cd C:\dev\claude\ronke-analytics
npm install
npm test                 # 348 tests
npm run dev              # port 3000 by default; another app often squats it
```

A long-running dev server for this repo often sits on port 3001, and a separate
app was on 3000 on 2026-08-11 - start with `npm run dev -- --port 3002` if the
default is taken.

Live smoke test (needs `DATABASE_URL` in `.env`):

```bash
curl -s http://localhost:3002/api/v1/meta
```

## Egress budget - the thing to watch

Neon's transfer allowance is 5 GB/month and the nightly rebuild already uses
~3.11 GB of it. The whole API design assumes CDN caching absorbs third-party
traffic (see KTD-1 in the plan). The failure mode is silent: an endpoint that
loses its `Cache-Control` header (or gains `force-dynamic`) still works
perfectly and just starts reading Neon per request. `lib/api/respond.ts` is the
single chokepoint and `tests/api-foundation.test.ts` guards the headers. Watch
Neon usage for the first month after launch.

## Key files

- `lib/api/respond.ts` - envelope, CORS, cache headers, error codes. Every route.
- `lib/api/address.ts` - address/.ron resolution. Never touches the chain.
- `lib/api/version.ts` - `score_version` derived by hashing `SCORE_CONFIG`.
- `lib/api/score-view.ts`, `lib/api/wallet-view.ts` - internal -> public shapes.
- `config/apiDocs.ts` - the ONE endpoint catalog. Docs page, OpenAPI doc, and a
  drift test all read it; the test walks `app/api/v1/**/route.ts` and fails if
  the catalog and the filesystem disagree in either direction.
- `lib/score/derive.ts` - `rankScores()` assigns competition rank + percentile.
