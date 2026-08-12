# Ronke Analytics - handoff

Absolute path: `C:\dev\claude\ronke-analytics`
Last updated: 2026-08-11

## What this is

Public analytics + ecosystem site for $RONKE, RonkeStr, and Ronkeverse on Ronin.
Next.js 16 + React 19 + Neon Postgres, deployed on Vercel. Vercel serves READS
ONLY; all ingestion and the nightly rebuild run off-Vercel in the `sync.yml`
GitHub Action (KTD-7). See `README.md` for the pipeline rules and `CLAUDE.md`
for conventions.

## Where this lives (verified 2026-08-11)

Both homes moved recently. Anything older than 2026-08-11 that names a host is
probably wrong.

| Thing | Where | Notes |
|---|---|---|
| GitHub repo | `Binaryassets880/ronke-analytics` | Transferred FROM `StoryLaneMedia`. The old path redirects, which makes stale links look like they still work. |
| Vercel project | **BinaryAssets' projects** (`binaryassets-projects`), **Hobby plan** | `https://vercel.com/binaryassets-projects/ronke-analytics` |
| Production URL | `https://ronke-analytics.vercel.app` | Last production deploy 2026-07-20 (ref `37f0f35`). |
| Database | Neon (see `.env` `DATABASE_URL`) | Unchanged by the moves. |
| Nightly sync | GitHub Action `sync.yml` on the repo above | Needs `DATABASE_URL` + `MORALIS_API_KEY` secrets to exist on the NEW repo. |

Two gotchas that cost a session to rediscover:

1. **The `StoryLaneMedia` account has READ only on the repo and cannot push.**
   Verified: `git push --dry-run` returns
   `remote: Permission to Binaryassets880/ronke-analytics.git denied to StoryLaneMedia` (403).
   No fork exists. To land work: either get collaborator access on
   `Binaryassets880/ronke-analytics`, or fork and open a cross-repo PR (how PR
   #13 was done). If forking, confirm the Vercel bot still comments a preview -
   fork PRs are not always built.
2. **Local `.vercel/repo.json` is STALE.** It is gitignored (local only) and
   still points at the old `storylanemedias-projects` org id
   (`team_bFBgsVo1bpGhL9DR9qinBN7Q`), written 2026-07-06. Running `vercel`
   commands from this folder will target the wrong account. Re-link with
   `vercel link` against `binaryassets-projects` before trusting any CLI output.
   Same trap in reverse: Vercel bot Inspect URLs on PRs #12-#14 say
   `storylanemedias-projects` because they predate the move.

### Hobby plan - what it changes

The project sits on Vercel's **Hobby** tier, which invalidates the abuse-control
plan written before this was known (see the plan's KTD-9):

- **Vercel Firewall custom rate-limit rules are a Pro+ feature and are NOT
  available here.** That was the documented "if abuse appears, add dashboard
  rate limits" fallback. It does not exist. The real controls on Hobby are the
  ones already in the code: CDN caching, the 50-address batch cap, capped
  leaderboard pagination, and `MAX_ROWS` on the dump. If abuse becomes real the
  options are upgrade to Pro, or build the `api_keys` table (U7).
- Usage caps are shared with every other route. Observed 2026-08-11 (last 30
  days): Edge Requests 60K/1M, Function Invocations 48K/1M, Fast Origin Transfer
  105.59 MB/10 GB, Fluid Active CPU 18m55s/4h. Comfortable headroom today.
- This makes the caching design load-bearing twice over: a CDN hit is served at
  the edge and does **not** invoke a function, so caching protects the 1M
  invocation budget as well as Neon's transfer allowance.

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
| `GET /api/v1/scores/all` (full dump, ~6,200 rows) | 15 min |
| `GET /api/v1/leaderboard?limit=&offset=` | 15 min |
| `GET /api/v1/wallet/{addressOrName}` | 15 min |
| `GET /api/v1/nft/{tokenId}` | 24 h |
| `GET /api/v1/config` | 1 h |
| `GET /api/v1/stats` | 15 min |
| `GET /api/v1/meta` | 5 min |
| `GET /api/v1/openapi.json` | 1 h |

Verified live against the production Neon DB on 2026-08-11: all endpoints 200,
`rank`/`percentile` populate, error paths return their documented codes, CORS
preflight 204. 358 tests green, `tsc` clean, `next build` clean.

`/api/v1/scores/all` exists because a Discord role bot re-checking its whole
membership should not page. It returns 6,199 rows in 617 KB raw / **179 KB
gzipped** in ~230 ms, four fields per row (address, score, rank, percentile).
`MAX_ROWS` (50,000, ~8x current population) is a visible-degradation valve, not
paging: if it ever trips, `complete: false` appears in the response and that is
the signal to add keyset pagination rather than raise the number.

Coverage note worth keeping (probed live 2026-08-11): **every** current
Ronkeverse NFT holder is scored - zero exceptions, and all 1,236 single-NFT
wallets score ~220+. The only current holders absent from `wallet_scores` are
3,063 $RONKE dust wallets, the largest holding 0.0075 of one token. So the dump
is complete for role gating but is NOT a holder census.

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
