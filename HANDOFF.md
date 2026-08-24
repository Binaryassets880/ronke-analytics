# Ronke Analytics - handoff

Absolute path: `C:\dev\claude\ronke-analytics`
Last updated: 2026-08-24

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

1. **`StoryLaneMedia` push access: RESOLVED 2026-08-11.** It was READ-only after
   the transfer (`git push` returned 403); `StoryLaneMedia` has since been added
   as a collaborator and `viewerPermission` is now `WRITE`, confirmed by a
   successful `git push --dry-run`. Note for anyone re-checking this: the repo is
   a **personal** repo, so GitHub shows no read/write role dropdown - the single
   "Collaborator" level already includes push. Absence of a role selector is not
   a sign that access is incomplete.
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

## This site is embedded in ronkeverse.com (verified 2026-08-12)

`ronkeverse.com` is the main Ronke site, owned and hosted by someone else
(Brian). Our production deployment is **iframed** into it. Verified by
inspecting the live page, because the details matter more than the description:

- `ronkeverse.com/score` renders
  `<iframe src="https://ronke-analytics.vercel.app/#ronke-score">`. It points at
  **production**, so a merge to `main` changes ronkeverse.com the moment Vercel
  deploys. There is no staging step on his side.
- His tab bar maps `?tab=X` to our routes:
  `/score?tab=leaderboard` -> `ronke-analytics.vercel.app/leaderboard`. The tab
  list is **hardcoded on his side**: analytics, leaderboard, rarity, resources.
  Anything not in that list is unreachable from ronkeverse.com - which is
  already true of our `/apps` page today.
- **He clips our top nav.** The iframe is `position: absolute; top: -59px`
  inside an `overflow: hidden` wrapper, which hides our `EcosystemNav` so his
  own tab bar replaces it. Consequence: adding a nav link here is invisible on
  ronkeverse.com. Only he can add a tab.

### Two things this couples us to

1. **NEVER enable Vercel Deployment Protection for Production.** The iframe is
   an anonymous cross-origin request. If production is SSO-gated it returns a
   302 to `vercel.com/sso-api` and **ronkeverse.com/score breaks for everyone**.
   Preview-only protection is fine (and is the default). This is easy to trip by
   flipping the setting to "Standard Protection" while thinking about previews.
2. **His `-59px` crop is pinned to our header height.** Changing the height of
   `EcosystemNav` shifts his layout and leaves a sliver of our nav visible, or
   eats into content. Verified for the API branch: header is 67px on desktop
   both before and after adding the Developers link, because the nav is
   `overflow-x-auto` and scrolls horizontally instead of wrapping - extra items
   never add height. Any future nav restyle needs a heads-up to him.

### What that means for the API

Nothing. The API is a plain cross-origin HTTP endpoint with `Access-Control-Allow-Origin: *`;
developers call `ronke-analytics.vercel.app/api/v1/...` directly and never touch
ronkeverse.com. No DNS work, no involvement from Brian, no embed impact. The
only open question is cosmetic: whether to serve it from a branded host
(`api.ronkeverse.com`), which would need him to add a DNS record and the domain
added to the Vercel project. Decide that BEFORE publicising the base URL - it is
the one thing that hurts to change after integrations exist.

## Current state

`main` is live and healthy. The public score API is **MERGED AND DEPLOYED**
(PR #15, 2026-08-12, merge commit `6ecd40a`).

The paper-hands clock-reset fix is **MERGED AND DEPLOYED** (PR #17, 2026-08-14,
merge commit `f719dd0`) and production Neon has been rebuilt on the merged code.
Code and database are back in sync, so the nightly `sync.yml` is safe to let
run. See the 2026-08-14 `LOG.md` entry for the rebuild numbers and
`C:\dev\claude\DECISIONS.md` for the two-clock model behind it.

### Hand tiers are LIVE and settled. Verified through a nightly, 2026-08-24.

PRs #19 through #24 are merged. Production Neon is migrated, seeded (38 labels)
and rebuilt on the merged engine, and `sync.yml` ran at 07:48 UTC on `main` and
**re-derived the same tiers** - which is the check that this is genuinely
finished rather than resting on a hand-run rebuild. No work in progress.

Deploy verified: `/`, `/leaderboard`, `/holders`, the wallet page and
`/api/v1/*` all 200, and the response still carries no `X-Frame-Options`, so
the ronkeverse.com embed works.

Live tier split among wallets holding something:

| asset | diamond | regular | paper |
|---|---|---|---|
| ronkeverse_nft | 1,082 | 594 | 155 |
| ronke_token | 710 | 2,615 | 4,694 |
| ronkestr_token | 106 | 74 | 48 |

**Canary wallet.** `0x9f8bc9c10d6c344fd089ac27ec1cab694dd864f8`
(`nibbles208.ron`) is the wallet the whole redesign came from: 188 Ronkeverse
acquired, 99 sold, 89 held. Its correct answer is `regular`, `never_sold false`,
peak 27%, 0 episodes - sold steadily, never dumped, not diamond. Re-check it
after any change to the engine. Before this work it read `diamond` with
`never_sold true`.

### What shipped 2026-08-23

1. **PR #19 - MERGED.** Fixed the order-dependent wallet-level bucket merge in
   `getWallet()`; 320 wallets were badged `paper` that should read `regular`.
   Read path only, so it took effect on deploy with no rebuild.
2. **PR #20 - MERGED AND APPLIED.** Grew `SEED_LABELS` 21 -> 38, evidence per
   entry in its `note`. Both `npm run seed-labels` and `npm run rebuild` have
   been run, so it is fully in effect: 5,761 transfers by 210 wallets no longer
   count as sales, and five contracts stopped ranking as holders.
3. **PR #21 - MERGED AND DEPLOYED.** Rolling 30-day let-go rate, a 50% paper
   line, a 5-NFT position floor, and redemption (serve 30/60/90/180 clean days
   AND hold 50% of your highest-ever pre-dump position). Points the score
   multiplier and both hand badges at the tier, closing the 8,248-row
   badge/multiplier disagreement, and adds the hover/tap popover on the profile
   badge.
4. **PR #22 - MERGED.** Docs.
5. **PR #23 - MERGED AND REBUILT.** The profile prints `never_sold` as a "Never
   sold" pill, and #21 had redefined that flag as "no dumping episode" without
   touching the label - so the canary wallet, 99 sales out of 188, wore it.
   Both flags now mean what their names say. See `CLAUDE.md` for the contract.
6. **PR #24 - MERGED.** The tier popover rendered token figures in raw base
   units (`6.972e+22 of 9.179e+24 tokens`). Read path only.

**Both #23 and #24 were found by the owner opening the live page after being
told the work was done.** The derived data was correct in every check; the
rendering was not. `CLAUDE.md` opens with this because it is the most expensive
habit to relearn.

### Known limits of the tier model - say these out loud, do not rediscover them

- **Self-transfers are unresolvable.** Moving NFTs between two wallets the same
  person owns is indistinguishable from a sale without price data. The paper
  population carries a false-positive rate because of it. No label list fixes
  this; only price or an explicit wallet-linking feature would.
- **Wallets holding nothing still read `paper`.** The proposal called for them
  to be untiered, which needs a fourth `diamond_bucket` value and is a breaking
  change for `/api/v1` consumers. Deliberately deferred, not forgotten.
- **Four known ways to game it**, in practical order: inflate the window
  denominator from a wallet you control; bleed just under 50% every 31 days;
  split across wallets and dump all but one; have a staking or bridge contract
  release to a third party, which records no sale at all. All are still harder
  than the old rule, which required no cleverness whatsoever.
- **The token side moved more than the NFT side in absolute terms.** $RONKE went
  3,055 -> 2,615 regular. The redesign was argued in NFT terms but applies to
  both assets, and nobody asked for that half.

Live verification, 2026-08-14: `/leaderboard` 200, and
`/api/v1/wallet/0x75cd5bddd1d7066fd22899b5b3c514d7386f33a5` returns
`diamond_bucket: "regular"` with `ever_paper_sold: false` on both $RONKE and
Ronkeverse - previously both read `"paper"` / `true`.

Live production verification, 2026-08-12: all endpoints 200, CDN cache
MISS -> HIT -> HIT, `/llms.txt` and `/developers` serving, `rank`/`percentile`
populated (`as_of` 13:17:03, 6,194 scored wallets), and the ronkeverse.com
iframe still loads (`ronke-analytics.vercel.app/leaderboard` 200, no
`X-Frame-Options`, no redirect).

### Post-merge gotcha that DID fire (worth knowing for any similar change)

Immediately after merge the leaderboard and full dump returned `rank: null`.
Cause: that morning's 08:08 nightly sync had run with **pre-merge** code, whose
`deriveScores` does `DELETE FROM wallet_scores` then re-inserts WITHOUT the new
columns - so the columns existed but were empty. The single-wallet endpoint
looked fine the whole time because `getWalletScore` falls back to the old
`count(*)`; the leaderboard and dump have no such fallback, which is what
exposed it.

Fix was one `gh workflow run sync.yml --ref main`, which reran migrate + sync +
rebuild on the merged code. **Any future deploy that lands between two nightly
runs should trigger the workflow rather than waiting**, or the derived columns
stay stale until 07:00 UTC.

Second-order effect seen at the same time: `/scores/all` kept serving `null`
ranks for several minutes AFTER the rebuild, because its 1 h cache still held
the pre-rebuild copy while `/meta` (5 min) had already refreshed. That is
exactly the skew the documented re-check pattern guards against - a bot must
compare the DUMP's own `meta.as_of`, not `/meta`'s. Live confirmation the guard
is necessary.

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
| `GET /llms.txt` (site root, `text/plain`) | 1 h |

`/llms.txt` is the AI-assistant entry point: the whole reference as one
plain-markdown document (~15 KB) a developer can paste into Claude or an agent
can fetch. Generated by `lib/api/llms-txt.ts` from the same `config/apiDocs.ts`
catalog as the docs page and the OpenAPI doc, so the three cannot disagree. It
self-describes per origin, so the preview and production copies each carry their
own base URL. It lives at the site root, NOT under `/api/v1`, because that is
where tooling looks - so the `app/api/v1/**` drift test does not cover it;
`tests/api-llms-txt.test.ts` does.

**Docs tone (founder decision 2026-08-12):** the docs state facts and hand over
`score`, `rank`, and `percentile` - they do NOT tell developers which to gate on.
The earlier "Gate on rank, not on a raw score threshold" framing was removed
because retunes now require community agreement and prescribing integration
design overstepped. Tests in `tests/developers-page.test.tsx` and
`tests/api-llms-txt.test.ts` assert the prescriptive phrasing stays gone.

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

### Preview verification (PR #15, 2026-08-12) - PASSED

Tested on the real Vercel edge, not just locally:

- **CDN caching CONFIRMED.** `x-vercel-cache` goes MISS -> HIT -> HIT on every
  one of the ten endpoints. This was the one thing not verifiable locally and
  the only result that could have blocked the merge: the whole cost model
  assumes the CDN absorbs third-party traffic instead of Neon.
- Note Vercel rewrites the client-facing header to `Cache-Control: public,
  max-age=0` - it consumes `s-maxage` at the edge and does not forward it. That
  is expected; `x-vercel-cache: HIT` is the proof, not the header text.
- Full dump over the wire: 612,966 B raw, **151,668 B brotli**, 0.15 s.
- Data parity: top wallet `score 8013, rank 1, percentile 99.98`, subscores sum
  to the total.
- Error paths all return documented codes: `invalid_address` 400,
  `name_not_resolved` 404, `invalid_token_id` 400, `invalid_param` 400.
- CORS preflight 204 with `Access-Control-Allow-Origin: *`.
- `/developers` renders.

**Deployment Protection was disabled to run this.** Preview deployments are
SSO-gated by default (302 to `vercel.com/sso-api`), which bounces anonymous
requests before they reach the API. If it has been re-enabled since, that is
why a preview curl returns 302 - it is not an API fault. Production is not
gated.

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
