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
