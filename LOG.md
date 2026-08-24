# Ronke Analytics - session log

Append-only. Newest entry at the bottom.

## [2026-08-11] Public Ronke Score API (v1) - built on `feat/public-score-api`

- Added eight public, keyless, CDN-cached, read-only endpoints under `/api/v1`
  (score, batch scores, leaderboard, wallet, nft, config, stats, meta) plus a
  generated `openapi.json` and a `/developers` docs page. New: `lib/api/*`,
  `app/api/v1/**`, `config/apiDocs.ts`, `app/components/DeveloperDocsView.tsx`,
  `app/developers/page.tsx`.
- Persisted `rank` + `percentile` on `wallet_scores` (`db/schema.sql`,
  `lib/score/derive.ts` `rankScores()`), which also removes the per-request
  `count(*)` the wallet profile used to run for rank. Read path keeps a fallback
  for the window before the first post-migration rebuild.
- Shipped NO tier bands, per founder decision: `rank`/`percentile` are the
  public primitives and games define their own bands. Raw `score` stays
  first-class because it is what the community reads.
- Applied `npm run migrate` and `npm run rebuild` against production Neon so the
  new columns exist and are populated. **A deploy without the migration breaks
  the score queries** - see `HANDOFF.md`.
- Fixed an interop bug found in live smoke testing: `first_acquired_at` was
  emitting Postgres's `2025-01-25 13:38:44+00` (not ISO 8601, and rejected by
  `Date` in stricter engines). Now normalized to ISO in `lib/api/wallet-view.ts`.
- 348 tests green (was 327), `tsc` clean, `next build` clean, all endpoints
  verified live against production data.
- Touched: `db/schema.sql`, `lib/score/derive.ts`, `lib/queries.ts`,
  `config/apps.ts`, `app/components/EcosystemNav.tsx`, `tests/score-derive.test.ts`,
  `tests/schema.test.ts`, `tests/score-ui.test.tsx`, plus the new files above and
  `tests/api-{foundation,score,ecosystem,wallet}.test.ts`,
  `tests/developers-page.test.tsx`. Docs: `PLAN.md`, `HANDOFF.md`, `LOG.md`,
  `docs/plans/2026-08-06-001-feat-ronke-score-public-api-plan.md`.

## [2026-08-11] Full-dump endpoint + percentile precision fix

- Added `GET /api/v1/scores/all` for the periodic re-check use case (a Discord
  role bot pruning members who sold shouldn't page 50 at a time). Compact
  four-field rows, one `arrayMode` query, cached 15 min. Live: 6,199 rows,
  617 KB raw / 179 KB gzipped, ~230 ms. `MAX_ROWS` 50,000 is a
  visible-degradation valve exposed as `complete: false`, not paging.
  New: `app/api/v1/scores/all/route.ts`, `getAllScoresCompact()` in
  `lib/queries.ts`, `tests/api-scores-all.test.ts`.
- Rounded `percentile` to 2 decimals in `rankScores()` (and in the read-time
  fallback, so both agree during the pre-rebuild window). The raw quotient
  carried ~14 decimals of false precision - one rank step is 0.016 points at the
  current population - and it shipped in every response and every dump row.
  Cut the dump from 695 KB to 617 KB. Ran `npm run rebuild` to persist.
- Docs: added the re-check pattern to `/developers` (watch `meta.as_of`, only
  re-check when it changes; the rebuild is daily so faster polling buys nothing).
  The catalog drift test picked the new route up automatically.
- 358 tests green, `tsc` clean, `next build` clean.
- Touched: `lib/queries.ts`, `lib/score/derive.ts`, `config/apiDocs.ts`,
  `app/components/DeveloperDocsView.tsx`, `tests/score-derive.test.ts`,
  `HANDOFF.md`, `LOG.md`, plus the new files above.

## [2026-08-11] Pre-PR review fixes on the full-dump endpoint

- `MAX_ROWS` 50,000 -> 25,000. At the measured ~100 bytes/row the old cap
  implied a ~5 MB response, past Vercel's 4.5 MB function response limit - the
  valve would have thrown a platform error BEFORE it could report the
  `complete: false` it exists to report. 25,000 is ~4x current population and
  ~2.5 MB. Test now asserts both bounds.
- Dump cache 15 min -> 1 h (new `CACHE.bulk`). A continuously-polled dump at
  15 min is ~1.2 GB/month of Neon egress against ~1.9 GB of headroom; at an
  hour it is ~310 MB. Costs no freshness - the data changes once a day.
- Fixed a race in the documented re-check pattern: `/meta` and `/scores/all`
  are cached separately, so a bot could see a fresh `as_of` from `/meta` and
  then receive a still-stale dump. The snippet now trusts the dump's own
  `meta.as_of` and skips the tick when they disagree.
- Verified no site regression from persisted rank: `/leaderboard` 200, wallet
  profile renders RONKE SCORE 8,013 / RANK #1 off the new column.
- 358 tests green, `tsc` clean, `next build` clean.
- Touched: `app/api/v1/scores/all/route.ts`, `lib/api/respond.ts`,
  `config/apiDocs.ts`, `app/components/DeveloperDocsView.tsx`,
  `tests/api-scores-all.test.ts`, `LOG.md`.

## [2026-08-11] Located the deployment; corrected the abuse-control plan

Not a code change - a state correction. Both homes for this project moved
recently and nothing recorded where to.

- **GitHub** is `Binaryassets880/ronke-analytics` (transferred from
  `StoryLaneMedia`; the old path redirects, so stale links look healthy).
  The `StoryLaneMedia` account now has READ only and **cannot push** - verified
  by `git push --dry-run` returning 403. No fork exists.
- **Vercel** is `binaryassets-projects` (BinaryAssets' projects), **Hobby**
  plan, production `ronke-analytics.vercel.app`, last deploy 2026-07-20.
  Found via GitHub's deployment records after the CLI and dashboard both showed
  it absent from `storylanemedias-projects`.
- Vercel bot Inspect URLs on PRs #12-#14 still say `storylanemedias-projects`
  because they predate the move, and local `.vercel/repo.json` (gitignored)
  still points at the old org id. Both are traps; re-link before trusting the
  CLI from this folder.
- **Corrected KTD-9 in the API plan.** It named Vercel Firewall dashboard
  rate-limit rules as the no-code abuse escalation. Firewall custom rules are
  Pro+, so on Hobby that path does not exist - the in-code caps (CDN caching,
  50-address batch cap, capped leaderboard paging, `MAX_ROWS`) are the only
  controls. Escalation is now "upgrade to Pro, or build U7".
- Also noted: on Hobby an edge cache HIT is served without invoking a function,
  so the KTD-1 caching design protects the 1M/month invocation budget as well as
  Neon egress. Usage at 2026-08-11: Edge Requests 60K/1M, Function Invocations
  48K/1M, Fast Origin Transfer 105.59 MB/10 GB.
- Touched: `HANDOFF.md`, `LOG.md`,
  `docs/plans/2026-08-06-001-feat-ronke-score-public-api-plan.md`.

## [2026-08-12] PR #15 opened; preview verified on the Vercel edge

- Pushed `feat/public-score-api` and opened PR #15. Preview built Ready.
- **CDN caching confirmed** - `x-vercel-cache` MISS -> HIT -> HIT on all ten
  endpoints. This was the only unverifiable-locally risk and the sole
  merge-blocker criterion; it passed. Vercel rewrites the client-facing header
  to `max-age=0` (it consumes `s-maxage` at the edge), so `x-vercel-cache` is
  the signal, not the header text.
- Full dump over the wire: 612,966 B raw -> 151,668 B brotli, 0.15 s.
- Data parity, all documented error codes, and CORS preflight verified against
  production data through the preview. `/developers` renders.
- Gotcha found: preview deployments are SSO-gated by default (302 to
  `vercel.com/sso-api`), which silently bounces anonymous API tests. Had to
  disable Deployment Protection to run the check. Production is not gated.
- Also confirmed unrelated to the move: `sync.yml` secrets survived the repo
  transfer (11 of last 12 nightly runs succeeded; the 2026-08-04 failure was a
  transient `Blockscout HTTP 500`, self-recovered, no data loss).
- Touched: `HANDOFF.md`, `LOG.md`.

## [2026-08-12] /llms.txt + docs reframed from instruction to disclosure

- Added `GET /llms.txt` (site root, `text/plain`, 1 h cache): the whole API
  reference as one plain-markdown doc for devs building with an AI assistant.
  ~15 KB / 444 lines - small enough to paste into a chat. Generated by
  `lib/api/llms-txt.ts` from `config/apiDocs.ts`, the same catalog behind the
  docs page and `openapi.json`, so all three stay in sync. Self-describes per
  origin (preview and production each carry their own base URL). Lives outside
  `/api/v1` because that is where tooling looks, so the api-v1 drift test does
  not cover it - `tests/api-llms-txt.test.ts` does.
- **Removed the prescriptive framing** per founder decision: retunes now require
  community agreement, and telling devs which field to gate on overstepped. The
  "Gate on rank, not on a raw score threshold" caveat became "Score magnitudes
  can move; score_version tells you when" - states the fact, hands over all three
  fields, stops. Same reframe applied to `/api/v1/config` notes, the OpenAPI
  description, the docs-page policy bullet, and the quick-start snippet. Tests
  assert the old phrasing stays gone.
- Verified live on the preview: `/llms.txt` 200, `text/plain`, `x-vercel-cache:
  HIT`, correct base URL, zero prescriptive matches; docs page shows the new
  heading and links `/llms.txt`.
- 368 tests green, `tsc` clean, `next build` clean.
- Touched: `config/apiDocs.ts`, `app/api/v1/config/route.ts`,
  `app/api/v1/openapi.json/route.ts`, `app/components/DeveloperDocsView.tsx`,
  `tests/developers-page.test.tsx`, `HANDOFF.md`, `LOG.md`, plus new
  `lib/api/llms-txt.ts`, `app/llms.txt/route.ts`, `tests/api-llms-txt.test.ts`.

## [2026-08-12] Mapped the ronkeverse.com embed before merging

Inspected the live embed rather than relying on its description. Findings now
in HANDOFF.md; nothing in the API branch changed as a result.

- `ronkeverse.com/score` iframes **production** (`ronke-analytics.vercel.app`),
  so a merge changes the public site as soon as Vercel deploys.
- His tab bar maps `?tab=X` to our routes and the tab list is hardcoded
  (analytics, leaderboard, rarity, resources). `/apps` is already unreachable
  from ronkeverse.com; `/developers` will be too until he adds a tab.
- He clips our nav: iframe `position:absolute; top:-59px` in an
  `overflow:hidden` wrapper. So nav links we add are invisible in the embed.
- **Do not enable Vercel Deployment Protection for Production** - the iframe is
  an anonymous cross-origin request and would get the SSO 302, breaking
  ronkeverse.com/score. Preview-only is fine. Worth care because we disabled
  protection for the cache test and may re-enable it.
- Verified our header stays 67px on desktop with the added Developers link (nav
  is `overflow-x-auto`, scrolls instead of wrapping), so his -59px crop is
  unaffected by this branch.
- API needs no DNS work and no action from him: cross-origin with CORS `*`.
  Open cosmetic question is whether to serve from `api.ronkeverse.com`, which
  should be settled before the base URL is publicised.
- Touched: `HANDOFF.md`, `LOG.md`.

## [2026-08-12] PR #15 MERGED - public score API live in production

- Merged PR #15 (9 commits) as `6ecd40a`; branch deleted. Vercel deployed to
  `ronke-analytics.vercel.app`.
- Production verified: all endpoints 200, cache MISS -> HIT -> HIT, `/llms.txt`
  (14.5 KB, `text/plain`) and `/developers` serving, dump 6,194 rows complete.
- **The documented transitional gotcha fired.** Right after merge the
  leaderboard and dump returned `rank: null`: that morning's 08:08 nightly sync
  had run on pre-merge code, which `DELETE`s and re-inserts `wallet_scores`
  without the new columns. Single-wallet reads looked fine throughout thanks to
  the `count(*)` fallback, which is exactly why the leaderboard was the tell.
  Fixed with `gh workflow run sync.yml --ref main` (migrate + sync + rebuild on
  merged code, completed success). Lesson recorded in HANDOFF: a deploy landing
  between nightly runs should trigger the workflow, not wait for 07:00 UTC.
- Also observed live: `/scores/all` served stale `null` ranks for minutes after
  the rebuild because its 1 h cache outlived `/meta`'s 5 min. That is the exact
  skew the documented re-check pattern guards against - confirms the guard is
  needed, not theoretical.
- Embed unaffected: `ronke-analytics.vercel.app/leaderboard` returns 200 with no
  `X-Frame-Options` and no redirect, so ronkeverse.com/score still renders.
- Touched: `HANDOFF.md`, `LOG.md`.

## [2026-08-12] Removed the score-retune caveat from the docs

- Founder decision: retunes now require community agreement, and the section
  read as telling developers how to design their own gating. Removed entirely
  rather than reworded (an earlier pass had softened it from instruction to
  disclosure; this drops it).
- Gone from all four places it rendered: the `CAVEATS` block (which feeds both
  `/developers` and `/llms.txt`), `notes.stability` on `/api/v1/config`, the
  OpenAPI `info.description`, and the docs-page policy bullet.
- **Kept:** `score_version` as a documented field in the Meta schema and in the
  example responses. Describing a field that exists is not an advisory, and
  removing it would leave an undocumented key in every response.
- Tests now assert the advisory stays gone (no `/retune/i`, no `17,133`) rather
  than asserting its content, so it cannot creep back in.
- 370 tests green, `tsc` clean, `next build` clean.
- Touched: `config/apiDocs.ts`, `app/api/v1/config/route.ts`,
  `app/api/v1/openapi.json/route.ts`, `app/components/DeveloperDocsView.tsx`,
  `tests/developers-page.test.tsx`, `tests/api-llms-txt.test.ts`,
  `tests/api-ecosystem.test.ts`, `LOG.md`.

## [2026-08-14] Fixed the paper-hands clock-reset bug and rebuilt

- **Bug:** a significant sell (10%+) re-dates every surviving lot/token to the
  sell moment so the "held for" clock stays honest. That same reset date was
  then used as the acquisition date for the NEXT sell's paper-hands check, so
  any second significant sell within 24h of a first was automatically flagged
  `ever_paper_sold`, no matter how long the position had genuinely been held.
  Found via wallet `0x75cd5bddd1d7066fd22899b5b3c514d7386f33a5`, which sold two
  Ronkeverse NFTs 2m36s apart; the second was #5199, held since 2025-05-23.
- **Fix:** every lot (ERC-20) and owned token (ERC-721) now carries two dates.
  `acquiredAt` is the display clock and still resets; `trueAcquiredAt` records
  genuine custody and never resets. The paper window measures against
  `trueAcquiredAt`. Both asset paths were affected, not just the NFT one.
- Rebuilt production Neon. 1,597 `ever_paper_sold` flags cleared, 0 newly set.
  560 buckets moved paper -> regular. 777 of 6,189 scores changed, **every one
  upward, none down**; median +0.13%, and for the 475 scored wallets that
  actually had a flag cleared the median is +6.65% (max +48.5%, from the 0.3x
  paper multiplier becoming 0.6x). Top-50 leaderboard membership unchanged.
- 375 tests green (4 new regression tests, both paths), `tsc` clean.
- Touched: `lib/analytics/diamond.ts`, `tests/diamond.test.ts`, `HANDOFF.md`,
  `LOG.md`, `C:\dev\claude\DECISIONS.md`.

## [2026-08-14] Merged the paper-hands fix and rebuilt on merged code

- Merged PR #17 (`f719dd0`). The branch was cut fresh off `origin/main` because
  the local branch (`docs/drop-retune-caveat`) had already shipped as PR #16 and
  `main` had moved on.
- Reran `npm run rebuild` against production Neon on the merged code. Output is
  **identical** to the pre-merge rebuild: same bucket counts on all three
  assets, `ever_paper_sold` 29,734 both times, top score 8,017. The only
  movement was total score 3,355,137 -> 3,355,177 across 6,189 wallets, which is
  `asOf` advancing ten minutes. Confirms the rebuild is deterministic.
- Live production check: `/leaderboard` 200, and the public wallet endpoint for
  `0x75cd...33a5` (godfather.ron) now returns `diamond_bucket: "regular"` /
  `ever_paper_sold: false` on both assets.
- Touched: `HANDOFF.md`, `LOG.md`.

## [2026-08-23] Fixed the order-dependent wallet-level diamond bucket merge

- `getWallet()` collapsed a wallet's per-asset `diamond_bucket` rows with
  `if (!diamondBucket || r.diamond_bucket === "diamond")`, which kept whichever
  row arrived first and only ever upgraded to `diamond`. The metrics `SELECT`
  has no `ORDER BY`, so a wallet holding one `paper` asset and one `regular`
  asset was badged on arbitrary row order. Replaced with a ranked
  `bestBucket(current, next)` helper (paper 0 < regular 1 < diamond 2), so the
  merge is order-independent by construction.
- Measured against production Neon: 670 wallets are exposed to the bug (mixed
  `regular` + `paper`, no `diamond`), and **320 of them were badged wrong**.
  All 320 move `paper` -> `regular`; `diamond` is unchanged at 1,806 because the
  old code already special-cased it. Surfaces in the wallet OG share card,
  `/api/v1/wallet/[address]`, and the wallet page.
- 377 tests green (3 new in `tests/config.test.ts` covering single-asset,
  every two-bucket order, and all six three-bucket permutations), `tsc` clean.
  `npm run lint` fails on an eslintrc config-schema error that predates this
  change - confirmed by stashing the diff and re-running.
- Found during an independent audit of the proposed diamond/regular/paper tier
  redesign (rolling 30-day let-go rate + redemption). That redesign is NOT
  implemented; only this pre-existing merge bug was fixed.
- Touched: `config/contracts.ts`, `lib/queries.ts`, `tests/config.test.ts`,
  `HANDOFF.md`, `LOG.md`.

## [2026-08-23] Expanded address_labels - closed most of the R4 curation gap

- `SEED_LABELS` 21 -> 38. Candidates were ranked out of `transfer_events` by
  distinct counterparties, then each was tested for contract code via the Ronin
  explorer `/api/v2/addresses/{hash}`. Of the 60 busiest unlabeled addresses,
  **only 14 hold code**; the other 46 are ordinary active traders and were
  deliberately left alone. Two of the 14 are EIP-7702 delegated EOAs, which
  report `is_contract: true` but are people, so they were also left alone.
- Classification evidence, all recorded in each entry's `note`:
  - **Same-transaction pass-through** (measured over our own `transfer_events`)
    separates routers from everything else. Katana AggregateRouter, KyberSwap
    MetaAggregationRouterV2, AffiliateRouter, PermissionedRouter, LiFiDiamond
    and two unnamed contracts are all 100% pass-through holding nothing.
  - **Inbound method names** from the explorer identified the rest: Scatter
    (`disperseToken`), ClickTile (`createGame`/`cashOut`), the Katana V3
    position manager (`collect`/`increaseLiquidity`/`mint`), and a mystery-pack
    vault (`openMysteryPack`/`sellBackNFT`).
  - **NFT round-trip rate** (what share of deposits return to the depositing
    wallet) separates custody from disposal. `0x22e8eccc` returns 385 of 410
    deposits to the same wallet (94%), median 24.5h held, 27 depositors - it is
    custody, and today all 410 deposits score as sales.
- Measured effect if seeded and rebuilt: **5,761 transfers by 210 wallets stop
  counting as sales** (5,348 RONKE, 3 RONKESTR, 410 Ronkeverse). Another 73,066
  transfers stay sales but their venue stops ranking as a holder. Five addresses
  that currently rank as holders drop out, including one holding 498,946 RONKE
  and one holding 8 Ronkeverse.
- Corrected a wrong note: `0x7cf0fb64` was described on the `0xca562117` entry
  as an "aggregate router". Its inbound calls are `collect`/`increaseLiquidity`/
  `mint`, so it is the Katana V3 position manager. Labeled `lp` with
  `countsAsSell: false` - providing liquidity keeps the wallet's exposure,
  unlike swapping into a pool, which the existing pool entries already treat as
  a sale.
- Left unlabeled ON PURPOSE and documented in `scripts/seed-labels.ts`: plain
  wallets, EIP-7702 EOAs, CEX deposit addresses (Ronin exposes no tag source),
  and three token-side contracts whose purpose could not be established
  (`0x14bb374e`, `0xf0107aa0`, `0x5078cb39`).
- 383 tests green (9 new in `tests/labels.test.ts`, including an invariant that any
  entry forgiving a sale must record why - which caught two pre-existing staking
  entries with no note), `tsc` clean. **Not seeded to production** - `npm run seed-labels`
  plus a rebuild is still required for any of this to affect displayed metrics.
- Touched: `lib/analytics/labels.ts`, `scripts/seed-labels.ts`,
  `tests/labels.test.ts`, `HANDOFF.md`, `LOG.md`.

## [2026-08-23] Hand tiers: rolling-window rule shipped to production data

- Replaced the per-transfer bucket test with a rolling 30-day "let-go rate"
  shared by both assets (`lib/analytics/tiers.ts`). The old rule asked "is this
  ONE transfer 10% of your bag?", which for an NFT collapsed into "do you hold
  ten or fewer?" - so any larger wallet sold its collection with `sell_count`
  stuck at 0. One wallet sold 407 Ronkeverse and still read `diamond`.
- Tiers: lifetime peak under 10% = diamond (permanent once lost); a window at
  or above 50% opens a dumping episode = paper; everything else = regular.
  An episode is served by BOTH 30/60/90/180 clean days AND currently holding
  50% of the largest position ever taken into a dump. Re-checked every rebuild,
  so selling back below the line returns a wallet to paper immediately.
- Two guards from the modelling: the rebuild target is the HIGHEST pre-dump
  position (against the latest, `0xa8da6b89` 76 -> 16 would read "recovered"
  holding a fifth of what it started with), and dumps out of a position under
  5 units do not brand a wallet (17,546 crossings came from a position of one).
- The score multiplier and both hand badges now read the tier, closing the
  8,248 rows where badge and multiplier disagreed. Post-rebuild check: 0 rows
  with `never_sold` false but bucket diamond, 0 with `ever_paper_sold` true but
  bucket not paper.
- **Applied to production**: `npm run migrate` (6 new `holder_metrics` columns),
  `npm run seed-labels` (38), `npm run rebuild`. Live result among wallets
  holding something:

  | asset | before | after |
  |---|---|---|
  | ronkeverse_nft | 1,112 / 465 / 256 | 1,083 / 593 / 156 |
  | ronke_token | 714 / 3,055 / 4,250 | 710 / 2,612 / 4,694 |
  | ronkestr_token | 107 / 78 / 44 | 106 / 75 / 47 |

  `nibbles208.ron` (`0x9f8bc9c1`), the wallet that started this: Ronkeverse
  `diamond` -> `regular`, peak 27%, score 4,583 -> 4,317, rank 10 -> 13.
- 394 tests, `tsc` and `next build` clean. PR #21 open with the engine + the
  hover/tap tier popover.
- Touched: `config/contracts.ts`, `config/badges.ts`, `lib/analytics/tiers.ts`
  (new), `lib/analytics/diamond.ts`, `lib/analytics/types.ts`,
  `lib/analytics/rebuild.ts`, `lib/badges/derive.ts`, `lib/queries.ts`,
  `lib/score/compute.ts`, `lib/score/derive.ts`, `db/schema.sql`,
  `app/components/TierBadge.tsx` (new), `app/components/WalletView.tsx`,
  five test files, `HANDOFF.md`, `LOG.md`.

## [2026-08-23] Two display fixes on top of the tier ship, both found on the page

Both were caught by the owner opening the live wallet page after being told the
work was done. The derived data was correct in every check; the rendering was
not. Recorded here because the failure mode matters more than either bug.

- **PR #23 - flags that contradicted their own labels.** The profile prints
  `never_sold` as a "Never sold" pill. The tier work had redefined that flag as
  "has no dumping episode on record" and left the label alone, so
  `0x9f8bc9c1` - 99 sales out of 188 - sat badged `Regular` next to a pill
  saying it had never sold. The exact credibility problem the tier work existed
  to remove, one element to the left. Both flags now mean what their names say:
  `never_sold` is `peak_sell_rate === 0`, `ever_paper_sold` is
  `episode_count > 0` (permanent; redemption clears the tier, not this). On the
  card, "Never sold" appears only for a wallet that has disposed of nothing;
  anything else states the fact instead ("Worst month: let go of 27%"). "Never
  paper-handed" became "Never dumped", with "Dumped before" when the record
  exists. The `never_paper_handed` badge follows the same move.
- **PR #24 - raw base units in the popover.** The engine counts in each asset's
  own units, so a $RONKE wallet serving a sentence read `Holding 6.972e+22 of
  9.179e+24 tokens`. Scaled at the query layer via an exported `toDisplayUnits`,
  pinned with tests. Also clamps the displayed peak to 1 (float accumulation
  produced `1.0000000000000002`).
- Rebuilt after #23 (both flags are stored columns). #24 is read-path only.
- 397 tests, `tsc` and `next build` clean. Verified on the rendered page this
  time, not the database: the Ronkeverse card now reads `Regular` /
  "Worst month: let go of 27%" / "Never dumped", and "Never sold" survives only
  on RonkeStr, whose peak really is 0.
- Touched: `lib/analytics/diamond.ts`, `lib/badges/derive.ts`, `lib/queries.ts`,
  `app/components/WalletView.tsx`, `tests/diamond.test.ts`,
  `tests/badges.test.ts`, `tests/format.test.ts`.

## [2026-08-24] Nightly confirms code and data are in sync

- `sync.yml` ran 07:48 UTC on merged `main` and re-derived the same tiers, which
  is the check that the rollout is genuinely finished rather than resting on a
  hand-run rebuild. Ronkeverse 1,082 / 594 / 155, $RONKE 710 / 2,615 / 4,694,
  RonkeStr 106 / 74 / 48 - within a few wallets of yesterday's figures, the
  drift being a day of real transfers.
- Canary `0x9f8bc9c1` (`nibbles208.ron`) still reads `regular`,
  `never_sold false`, peak 27%, 0 episodes. Worth re-checking after any future
  change to the engine: it is the wallet the whole redesign came from, and its
  correct answer is "sold steadily, never dumped, not diamond".
- Added `CLAUDE.md` (the project had none) with the conventions that have
  already cost a session: verify the rendered page not the database, renaming a
  column's meaning renames it on screen, the three-file rule for adding a
  `holder_metrics` column, deploy order, the 07:00 UTC revert risk, and how to
  identify an address without inventing one.
- Touched: `CLAUDE.md` (new), `HANDOFF.md`, `LOG.md`,
  `C:\dev\claude\DECISIONS.md`.
