---
title: "feat: Public Ronke Score API for third-party builders"
type: feat
status: completed
date: 2026-08-06
---

# feat: Public Ronke Score API for third-party builders

## Summary

Expose the Ronke Score (and the holder data behind it) as a versioned, public, read-only HTTP API at `/api/v1/*` so anyone building a Ronke game, bot, Discord tool, or site can gate content, award perks, and render leaderboards off a wallet's standing in the ecosystem. The API serves the same nightly-rebuilt `wallet_scores` snapshot the site serves, but through a stable contract (envelope, `as_of`, `score_version`, rank + percentile + population) that survives the founder's ongoing score retunes, and behind CDN caching so third-party traffic does not land on Neon.

## Problem Frame

The Ronke Score already exists and is trustworthy: `lib/score/compute.ts` is a pure, unit-tested engine; `lib/score/derive.ts` persists a full breakdown per wallet into `wallet_scores` during the nightly `sync.yml` rebuild; `config/score.ts` and `config/scoreExplainer.ts` are the single source of truth for weights and plain-English methodology. But it is reachable only by a human loading `ronkeverse` pages. A builder who wants "hold 50k $RONKE or a 1/1 to unlock this dungeon" has to reimplement the whole ledger.

Today the repo has exactly one API route - `app/api/score-inputs/[address]/route.ts` - and it was built for the on-site score simulator, not for third parties. It is `force-dynamic` (never cached), returns an internal `ScoreInput` shape that mirrors engine internals rather than a public contract, resolves `.ron` names through a live on-chain RPC call on the request path, and has no CORS headers, no rate limiting, and no versioning. It is a fine internal endpoint and a bad public one.

Three constraints shape everything below:

1. **Neon egress is already tight.** The nightly rebuild alone consumes ~3.11 GB/month against a 5 GB allowance (commit `c83fceb` cut it from ~6.85 GB). Uncached third-party traffic reading Neon per request is the single biggest risk this feature introduces, and it degrades the *site*, not just the API.
2. **The data is a daily snapshot, not live.** `wallet_scores` is rebuilt only by `sync.yml` at 07:00 UTC (Vercel serves reads only, KTD-7). Any API contract must state freshness explicitly rather than imply real-time.
3. **The score is still being tuned.** minRonke, rarity exponents, the duration curve, and the 1/1 bonus have all moved in the last month. The raw integer stays the number the community actually reads and talks about, so it leads the response - but its absolute magnitude is not a durable gate. `rank` is, it is already how holders talk ("I'm #47"), and it is already on the site, so it ships alongside rather than replacing the score.

---

## Requirements

**Core**

- R1. A third party can fetch one wallet's Ronke Score, sub-scores, full breakdown, rank, percentile, and the population the rank is out of, from a single public GET, using either a `0x` address or a `.ron` name.
- R2. A third party can fetch many wallets' scores in one request (game servers checking a lobby, Discord bots syncing roles).
- R3. Responses state their own freshness (`as_of`) and score version, so an integrator can detect a stale or retuned score without guessing.
- R4. A wallet with no score is a valid, successful response (`score: 0`, `found: false`), not a 404 - `deriveScores` deliberately drops zero-score wallets, so "absent from the table" means "scored zero", not "unknown address".
- R5. Beyond the score, builders can read the underlying holdings a game would actually want: token balances, held NFT token IDs with rarity/tier/traits, and earned badges.
- R6. Builders can read the scoring rules themselves (weights, gates, plain-English explainer) from the API, so a game can show "here's how to rank up" without hardcoding a copy of `config/score.ts` that drifts.

**Operational**

- R7. Third-party traffic is absorbed by the CDN, not by Neon. A cold wallet lookup is at most one indexed single-row query; a warm one is zero.
- R8. Cross-origin browser calls work (CORS), so a static game front-end can call the API directly.
- R9. Abuse or a runaway integrator cannot exhaust the Neon egress allowance or take the site down.
- R10. The API is versioned under `/api/v1/` with a documented breaking-change policy.

**Docs**

- R11. A public developer page on the site documents every endpoint with copy-paste examples and the freshness/versioning caveats, generated from the same source as the implementation where practical.

**Non-regression**

- R12. The existing site, the score simulator's `/api/score-inputs/[address]` endpoint, the sync pipeline, and the nightly rebuild are unaffected.
- R13. Test suite stays green; new modules follow the pure-function + `tests/fakedb.ts` fixture conventions.

---

## Key Technical Decisions

- **KTD-1 - Cache at the CDN, never hit Neon on a warm request.** Every public GET sets an explicit `Cache-Control: public, s-maxage=<ttl>, stale-while-revalidate=<long>` header rather than using `force-dynamic`. Because `wallet_scores` only changes once a day at 07:00 UTC, TTLs can be aggressive (score/leaderboard 15 min, config/meta 60 min, NFT rarity 24 h) with a multi-hour `stale-while-revalidate` so an expired entry still serves instantly while it revalidates. This makes the steady-state Neon cost of the API roughly *one query per endpoint per TTL window*, independent of how many games call it. Explicit headers are chosen over Next's `revalidate` export because they are what Vercel's edge cache actually honors and they are legible to integrators inspecting responses.
- **KTD-2 - Persist `rank` and `percentile` on `wallet_scores` during the nightly derive.** `getWalletScore()` today issues a second `SELECT count(*) FROM wallet_scores WHERE score > $1` per lookup - a full-table aggregate on every profile view, and unacceptable per API request. `deriveScores()` already holds every score in memory before insert; sorting there and writing competition rank (`1 + count of strictly-higher scores`, identical semantics to today's query) plus percentile costs nothing and turns the API's hot path into a single primary-key row read. The site's `getWalletScore()` then reads the column instead of recomputing, which is a strict improvement for the site too.
- **KTD-3 - `rank` is the headline stable primitive; `score` stays first-class; `percentile` ships as a free derived convenience; named tier bands are NOT part of v1.** Expose `score`, `rank`, `population`, and `percentile`, and let each game define its own bands.

  Rationale, in order. The retune problem is real: the July calibration moved #1 from 17,133 to 8,830, so a game gating on `score > 5000` would have silently emptied out. But the fix the community already understands is **rank**, not percentile - the site displays it, holders talk in it, and it survives a retune for the same reason percentile does. Percentile was reached for reflexively; rank is the better default because it is the ecosystem's existing language, and it costs a builder nothing to learn.

  Be precise about what rank actually protects: after a retune the *membership* of the top 100 still shuffles (the July pass demoted NFT whales and promoted balanced holders). What rank guarantees is that the *size* of a gated group stays what the game intended, instead of collapsing to zero or ballooning to everyone. That is the catastrophic failure mode; churn within the band is not.

  `percentile` still ships, because it is one division off `rank` and `population` and it does one thing rank cannot: it self-adjusts to community growth. A game gating on `rank <= 100` gets progressively harsher if holders go from 6k to 60k; `percentile >= 99` does not. Docs lead with rank and mention percentile as the growth-proof option.

  A canonical `tier` string solves nothing either field does not already solve; it only imposes one opinion about band count and naming inside every consumer's product, and games have genuinely different needs (a tournament wants top 100, a Discord wants 3 roles, an RPG wants 6). Adding a `tier` field later is additive and non-breaking; removing one is breaking, so ship the primitives and add sugar only on demand.
- **KTD-4 - Rank is denominator-independent; only `percentile` depends on the population choice, which demotes that question from blocking to cosmetic.** Zero-score wallets all sit tied at the bottom, so including or excluding them changes nobody's rank - `rank` is identical either way. Only `percentile` moves. `deriveScores` skips wallets scoring <= 0, so the published denominator is "wallets with a non-zero Ronke Score" (~6.1k), not "all addresses that ever held" (~8k $RONKE holders) and not "all wallets on Ronin". The response carries `population` next to `percentile` so integrators can see the denominator rather than infer it. A zero-score wallet returns `percentile: 0` and `rank: null`. Because the docs steer builders to rank first (KTD-3), a later change to the denominator would touch only the minority of integrations that opted into percentile - it is no longer a launch-blocking decision.
- **KTD-5 - `.ron` resolution reads the cache, never the chain.** `resolveNameLive()` performs an on-chain call through the public Ronin RPC. Putting that on a public request path invites rate-limit failures and turns a cache miss into a multi-second response. The API resolves names from the `rns_names` table (already populated during sync, already reverse-resolved for holders) and returns `404 name_not_resolved` for a `.ron` name absent from the cache, with a documented note that names resolve within one sync of first appearing. Forward-resolution of arbitrary names stays a site-only capability.
- **KTD-6 - A single response envelope and error shape for every endpoint.** `{ data, meta: { as_of, score_version, api_version, population? } }` on success; `{ error: { code, message } }` with machine-readable `code` values on failure. Envelope construction, CORS headers, cache headers, and address normalization live in one `lib/api/` module used by every route, so a new endpoint cannot forget a header. Error codes are a documented enum (`invalid_address`, `name_not_resolved`, `too_many_addresses`, `not_configured`, `internal`), never free-text.
- **KTD-7 - Batch is a cacheable GET with a sorted-address canonical form, not a POST.** `GET /api/v1/scores?addresses=0xa,0xb,...` capped at 50 addresses stays CDN-cacheable, which matters more than elegance: a Discord bot polling the same guild's 40 wallets hits cache every time. The handler lowercases and sorts addresses before querying so `?addresses=b,a` and `?addresses=a,b` produce the same DB work (the cache key still differs; document that clients should sort for best hit rate). A single `WHERE address = ANY($1)` query serves the batch. A POST variant for >50 addresses is deferred to the API-key phase (U7).
- **KTD-8 - `score_version` is a config-derived hash, bumped automatically.** Rather than a hand-maintained constant that someone forgets to bump after editing a weight, derive `score_version` from a stable hash of `SCORE_CONFIG` (e.g. `v1-<8 hex chars>`), computed once at module load. Any retune therefore changes the version automatically, and an integrator can cheaply detect "the rules moved" by comparing the string. Publish the current config at `/api/v1/config` alongside it.
- **KTD-9 - Keyless in v1; API keys and per-key limits deferred behind a flag.** With KTD-1 caching, the marginal Neon cost of an anonymous public API is near zero, and requiring keys on day one is the fastest way to get zero integrations. Protection in v1 is: CDN caching, a hard `addresses` cap, no unbounded pagination (leaderboard `limit` <= 100), and Vercel Firewall rate-limit rules configured in the dashboard (no code, no new dependency). An `api_keys` table plus per-key quotas becomes worthwhile only if someone needs uncached or high-volume access - U7 sketches it so the v1 contract does not have to change to add it.
- **KTD-10 - No new tables for reads; reuse the derived tables the site already reads.** Holdings, badges, NFT rarity, and traits all have existing query functions in `lib/queries.ts`. The API layer adapts those to public shapes (snake_case, documented field names, no internal column leakage) rather than adding a parallel data path that can drift from the site.

---

## Assumptions

Each is cheap to revisit before implementation; none blocks starting U1.

- A1. **No canonical tier bands in v1** (KTD-3, founder decision 2026-08-06). Games build their own bands on `rank` / `score` / `percentile`. Revisit only if the founder wants the Ronke Score to read as one ecosystem-wide status symbol with consistent naming across games, or if integrators actually ask for it.
- A2. **Percentile-over-scored-population** is the default denominator, and is no longer a blocking decision (KTD-4 - rank is unaffected by the choice). For the record if it is ever revisited: percentile is `100 * (population - rank) / population`, so a LARGER denominator raises everyone's percentile at the same rank (rank 610 is 90.0 out of 6,100 but 92.4 out of 8,000), meaning counting zero-score holders makes a given percentile EASIER to reach. Scored-only is the stricter "ranked among people who have a score" reading; all-holders is the more generous "ranked among the whole community" reading. Exact all-holder population across the three assets still needs a query; ~6,100 scored vs ~8,003 $RONKE holders are the known figures.
- A3b. **Raw `score` stays a first-class, prominently documented field** (founder note 2026-08-06: the community reads and talks about the raw score, not percentile). It is what holders recognize, so it leads the response and appears in every docs example. The retune caveat is attached to it rather than used as a reason to bury it.
- A3. **Public, keyless, unauthenticated reads are acceptable.** All exposed data is already public on-chain and already rendered on public site pages; there is no PII. If the founder wants integrations *registered* for relationship reasons rather than technical ones, that is U7 and it changes nothing about the v1 shapes.
- A4. **`ronkeverse.<domain>` is the API host** - the API ships on the existing Vercel project rather than a separate deployment, so it inherits the same domain, deploy pipeline, and Neon connection. A dedicated `api.` subdomain is a DNS/rewrite decision, not an architecture one, and can be added later without changing paths.
- A5. **A tiny JS/TS client is wanted but not on the critical path.** Copy-paste `fetch` examples in the docs unblock every integrator; a published npm package is follow-up work.

---

## Implementation Units

### U1. Persisted rank and percentile

- **Goal:** Every scored wallet carries its rank and percentile as columns, computed once nightly; `getWalletScore()` stops issuing a per-request `count(*)`.
- **Requirements:** R1, R7
- **Dependencies:** none
- **Files:** `db/schema.sql`, `lib/score/derive.ts`, `lib/queries.ts`, `tests/score-derive.test.ts`, `tests/schema.test.ts`
- **Approach:** Add two idempotent single-line `ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS` statements to `db/schema.sql` (`rank INTEGER`, `percentile DOUBLE PRECISION`) - one statement per line with no embedded `;` or `--`, per `db/migrate.ts`'s naive splitter, matching how the RonkeStr and 1/1 columns were added. In `deriveScores()`, restructure the existing loop to collect `{ address, result }` pairs, sort descending by score, assign competition rank (equal scores share the lower rank; rank = 1 + number of strictly-higher scores, identical to today's query semantics), compute `percentile = 100 * (population - rank) / population`, then build the insert rows. Extend the `insertMany` column list accordingly. Finally, change `getWalletScore()` to read the persisted `rank` and drop the second query, and add `percentile` to `WalletScore`.
- **Patterns to follow:** the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` block already in `db/schema.sql`; pure-function-plus-test split of `lib/score/compute.ts` vs `derive.ts`; `tests/fakedb.ts`.
- **Test scenarios:**
  - Rank assignment: three wallets scoring 100, 100, 50 get ranks 1, 1, 3 (competition ranking) - matches what the current `count(*) WHERE score > n` query returns for each.
  - Percentile: top wallet of 100 is ~99, bottom is 0; single-wallet population does not divide by zero; ties share a percentile (they share a rank).
  - `deriveScores` persists rank/percentile and the existing invariant `score = sum(subscores)` (±1 rounding) still holds.
  - `getWalletScore` returns the same `rank` value as before the change for a fixture population (regression guard on the swap from computed to persisted).
  - Migration idempotency: running migrations twice leaves one copy of each column (`tests/schema.test.ts` pattern).
- **Verification:** unit tests green; after a manually triggered `sync.yml`, spot-check that the live #1 wallet has `rank = 1` and `percentile` ~99.98, and that a mid-pack wallet's persisted rank equals the old computed rank.

### U2. API foundation: envelope, headers, address resolution, error codes

- **Goal:** One shared module every `/api/v1/*` route uses, so envelope, CORS, cache headers, and error shapes cannot drift between endpoints.
- **Requirements:** R3, R6, R8, R10, KTD-6
- **Dependencies:** none (independent of U1)
- **Files:** `lib/api/respond.ts` (new), `lib/api/address.ts` (new), `lib/api/version.ts` (new), `tests/api-respond.test.ts` (new), `tests/api-address.test.ts` (new)
- **Approach:** `respond.ts` exports `ok(data, { meta, ttl, swr })` and `fail(code, message, status)`, both returning `NextResponse` with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Cache-Control` built from the TTL arguments, and `Vary: Origin`. It also exports a shared `OPTIONS` handler for preflight. `meta` always carries `as_of` (from `getMetaState().lastRebuildAt`), `api_version: "v1"`, and `score_version`. `version.ts` computes `score_version` as `v1-<hash>` over a canonical JSON serialization of `SCORE_CONFIG` (KTD-8) using `node:crypto`, memoized at module load. `address.ts` exports `resolveParam(input)` returning a discriminated result: a normalized `0x` address (via existing `normalizeAddress`), or a cache-resolved `.ron` name (single `SELECT address FROM rns_names WHERE name = $1`), or a typed failure - never touching the chain (KTD-5). Error codes are a `const` union so routes cannot invent strings.
- **Patterns to follow:** existing `app/api/score-inputs/[address]/route.ts` for param decoding and the DB-not-configured 503 path; `lib/format.ts` `normalizeAddress`.
- **Test scenarios:**
  - `ok()` sets `Cache-Control: public, s-maxage=900, stale-while-revalidate=...` and `Access-Control-Allow-Origin: *`; `fail()` sets `Cache-Control: no-store` (never cache an error).
  - `meta.as_of` reflects `last_rebuild_at`, and is `null` (not omitted, not a crash) when meta is empty.
  - `score_version` is stable across calls and *changes* when a `SCORE_CONFIG` weight changes (the whole point of KTD-8) - assert by hashing two fixture configs.
  - `resolveParam`: checksummed `0x` input lowercases; a malformed address returns `invalid_address`; `foo.ron` present in `rns_names` resolves; `foo.ron` absent returns `name_not_resolved`; no RPC module is imported on this path (guard against a future refactor reintroducing the live call).
  - `OPTIONS` preflight returns 204 with the CORS headers.
- **Verification:** unit tests green; `curl -i` against a dev route shows the expected headers.

### U3. Score endpoints - single and batch

- **Goal:** `GET /api/v1/score/{addressOrName}` and `GET /api/v1/scores?addresses=...` return the public score contract.
- **Requirements:** R1, R2, R4, R7, KTD-7
- **Dependencies:** U1, U2
- **Files:** `app/api/v1/score/[address]/route.ts` (new), `app/api/v1/scores/route.ts` (new), `lib/api/score-view.ts` (new), `tests/api-score.test.ts` (new)
- **Approach:** `score-view.ts` holds a pure `toPublicScore(walletScore | null, address, name)` mapping the internal `WalletScore` to the documented public shape - snake_case keys, explicit `found` flag, zeroed body when the wallet is absent (R4). Shape:
  ```
  { address, name, found, score, rank, percentile, population,
    subscores: { ronke, ronkestr, nft },
    breakdown: { ronke_holding, ronke_duration, ronke_diamond_mult,
                 ronkestr_holding, ronkestr_duration, ronkestr_diamond_mult,
                 nft_holding, nft_duration, nft_diamond_mult,
                 collector_points, body_types_held, body_types_total,
                 oneofone_points, oneofone_count } }
  ```
  The single route resolves the param via `resolveParam`, then one `getWalletScore`-shaped read. The batch route parses `addresses` (comma-separated, cap 50 - over the cap returns `too_many_addresses` 400 rather than silently truncating), rejects the whole request on any malformed address (fail fast beats a partially-valid result), lowercases + sorts + dedupes, and issues one `WHERE address = ANY($1)` query, returning results in the requested order with absent wallets filled by the same zeroed shape. `.ron` names are not accepted in batch (documented) - it keeps the query single-shot and cacheable. Both use `ttl: 900`. `population` comes from a cached `SELECT count(*) FROM wallet_scores` (memoized per request; it is the same for every row).
- **Patterns to follow:** `getWalletScore()` / `getScoreLeaderboard()` in `lib/queries.ts`; the existing score-inputs route's structure.
- **Test scenarios:**
  - Known wallet returns `found: true` with score, rank, percentile, population, and every breakdown key present.
  - Unknown-but-valid wallet returns 200 with `found: false, score: 0, percentile: 0, rank: null` - explicitly not a 404 (R4). `rank` is null rather than `population + 1` because an unscored wallet is not ranked at all, and a fake rank would corrupt any game's banding math.
  - `.ron` name in the cache resolves and echoes `name`; uncached name returns 404 `name_not_resolved`.
  - Malformed address returns 400 `invalid_address`.
  - Batch: 3 addresses, one unknown, returns 3 entries in request order with the unknown zeroed; 51 addresses returns `too_many_addresses`; duplicate addresses collapse to one query but the response still mirrors the request list; `?addresses=` empty returns `invalid_address`.
  - Batch issues exactly one score query regardless of address count (assert against the fake DB's call log - this is the whole reason batch exists).
  - DB unconfigured returns 503 `not_configured`, not a 500.
- **Verification:** dev-server `curl` of a known live wallet matches the on-site RonkeScoreCard values exactly (engine parity, the same check the score simulator passed); batch of 50 returns in one round trip.

### U4. Ecosystem endpoints - leaderboard, config, stats, meta

- **Goal:** The supporting reads a game or bot needs around the score.
- **Requirements:** R3, R6
- **Dependencies:** U2, U3
- **Files:** `app/api/v1/leaderboard/route.ts`, `app/api/v1/config/route.ts`, `app/api/v1/stats/route.ts`, `app/api/v1/meta/route.ts` (all new), `tests/api-ecosystem.test.ts` (new)
- **Approach:**
  - `leaderboard`: `?limit` (default 25, max 100) + `?offset` (max 5,000) over `getScoreLeaderboard`, now including rank/percentile. Hard caps prevent a scraper from paging the whole table repeatedly at Neon's expense (R9).
  - `config`: serialize `SCORE_CONFIG` + `DIAMOND_THRESHOLDS` + `score_version` + the `scoreExplainer` prose, so a game can render "how to rank up" from the live rules (R6, KTD-8). TTL 3600.
  - `stats`: adapt `getEcosystemStats()` - holder counts, supply/burn stats, market tiles - as the "state of the Ronkeverse" read.
  - `meta`: `as_of`, `score_version`, `population`, `next_expected_sync` (07:00 UTC), and the contract addresses from `config/contracts.ts`, so an integrator can verify they are pointed at the right chain data. TTL 300. This doubles as a health check.
- **Test scenarios:**
  - `limit=1000` clamps to 100 rather than erroring or honoring it; `offset` beyond cap returns 400; negative values return 400.
  - Leaderboard rows carry rank/percentile and are ordered by score desc with the same tiebreak as the site (`score DESC, address ASC`).
  - `config` output round-trips the real `SCORE_CONFIG` values (guard against a hand-copied duplicate drifting) and its `score_version` matches `/meta`'s.
  - `stats` degrades to nulls rather than 500 when a market snapshot is missing (mirrors the BurnCard's `.catch(null)` convention).
  - Every endpoint's `Cache-Control` TTL matches the documented table.
- **Verification:** live `curl` of each; `/api/v1/config` values match `config/score.ts` by inspection.

### U5. Holdings and NFT endpoints

- **Goal:** The raw material a game needs to render or gate on actual assets, not just the composite number.
- **Requirements:** R5
- **Dependencies:** U2
- **Files:** `app/api/v1/wallet/[address]/route.ts`, `app/api/v1/nft/[tokenId]/route.ts` (new), `lib/api/wallet-view.ts` (new), `tests/api-wallet.test.ts` (new)
- **Approach:** `wallet` adapts `getWallet()` + `getWalletBadges()` into a public shape: per-asset `{ balance_whole, balance_raw, token_count, first_acquired_at, duration_days, diamond_bucket, never_sold }`, held NFT token IDs with `{ token_id, rarity_rank, tier, image_url }`, and earned badges as `{ key, label, tier }`. Balances are returned both as a decimal string (`balance_raw`, exact base units - never a JSON number at 1e27 scale) and a `balance_whole` float for convenience; document that `balance_raw` is authoritative. `nft/{tokenId}` adapts `getToken()` - traits, rarity rank, tier, image, current owner - TTL 86400 since rarity is static post-reveal.
- **Test scenarios:**
  - Wallet with all three assets returns all three; wallet with only NFTs returns zeroed token entries rather than omitting keys (stable shape for typed clients).
  - `balance_raw` for a 1e27-scale balance is a lossless string; `balance_whole` is a number.
  - Unknown wallet returns 200 with empty holdings and `found: false`.
  - Unknown token ID returns 404 `not_found`; token ID out of the 1..6969 range returns 400 `invalid_token_id`.
  - A 1/1 token returns `tier: "community_1of1"` with `rarity_rank: null` (the deliberate null-rank bucketing), not rank 0.
- **Verification:** live `curl` of a known 1/1 holder matches the on-site wallet page.

### U6. Developer documentation page and OpenAPI spec

- **Goal:** A builder can integrate without asking anyone a question.
- **Requirements:** R11
- **Dependencies:** U3, U4, U5
- **Files:** `app/developers/page.tsx` (new), `app/components/DeveloperDocsView.tsx` (new), `public/openapi.json` or `app/api/v1/openapi.json/route.ts` (new), `config/apps.ts`, `app/components/EcosystemNav.tsx`, `tests/developers-page.test.tsx` (new)
- **Approach:** A page in the site's design system listing every endpoint with method, path, params, a real example response, and copy-paste `fetch` / `curl` snippets. Lead with the three things integrators get wrong: **(a)** data is a daily snapshot rebuilt at 07:00 UTC - do not poll it every minute; **(b)** prefer `rank` for gates - raw `score` works and is what the community talks in, but its absolute magnitude shifts on every retune, so a `score >` threshold needs revisiting when `score_version` changes (percentile is offered as the growth-proof third option); **(c)** absent wallet means score zero, not error. Include a worked example: "gate a dungeon on the top 100 by rank, and name your own tiers for your own game" in ~10 lines, since v1 ships no canonical bands (KTD-3) and the docs are where that expectation gets set. Serve an OpenAPI 3.1 document from the same route constants so the spec cannot drift from the handlers. Link from the ecosystem nav and add a Developers entry to `config/apps.ts`. Reuse `config/scoreExplainer.ts` for the methodology section rather than restating it.
- **Test scenarios:**
  - Page renders every documented endpoint path, and each path string matches an actual route file (a test that walks `app/api/v1/**/route.ts` and asserts one-to-one coverage - this is the drift guard).
  - The freshness and versioning caveats are present in the rendered output (they are the load-bearing copy).
  - OpenAPI document parses as valid JSON and lists the same paths.
  - Nav highlights the Developers section without breaking `sectionFor()` for existing routes.
- **Verification:** page renders in dev; paste each snippet into a terminal and confirm it works against the deployed API.

### U7. Rate limiting and API keys (phase 2, deferred behind demand)

- **Goal:** A lever to pull if an integrator needs uncached/high-volume access or someone abuses the open endpoints.
- **Requirements:** R9
- **Dependencies:** U3
- **Files:** `db/schema.sql`, `lib/api/keys.ts` (new), `app/api/v1/scores/route.ts` (POST branch)
- **Approach:** Not built in v1 (KTD-9). Configure Vercel Firewall rate-limit rules on `/api/v1/*` in the dashboard first - no code, no dependency, and with KTD-1 caching it is likely sufficient indefinitely. If keys become necessary: an `api_keys (key_hash, label, owner, tier, created_at, revoked_at)` table, `Authorization: Bearer` checked in `lib/api/keys.ts`, keyed requests bypassing the address cap and unlocking a POST batch of up to 500. Design the v1 responses now so adding this changes no existing shape - it only relaxes limits.
- **Verification:** n/a until triggered. Track `/api/v1/*` request volume and Neon egress for the first month after launch, and revisit if either moves.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- A published `@ronkeverse/score` npm client (A5) - docs snippets first, package when there are integrators to serve.
- Webhooks / push notification on score change after each nightly rebuild ("tell my game when a player's tier changes") - genuinely useful for Discord role sync, but needs subscription storage and delivery retries.
- A cache-purge call from `sync.yml` after the rebuild, so fresh scores appear immediately at 07:00 rather than within one TTL. Small and worth doing once the API is live and TTLs are proven.
- Canonical tier bands (KTD-3, A1). Justified only if the founder wants one consistent status vocabulary across every Ronke game (so "Diamond in the Ronkeverse" means one thing everywhere) or if integrators ask. Implementation would be a `TIER_CONFIG` in `config/score.ts`, a pure `tierFor(percentile)`, and one additive `tier` field - roughly a day, and non-breaking whenever it lands.
- Historical score series (`/api/v1/score/{address}/history`) - `snapshot_daily` is asset-level, not per-wallet, so this needs a new derived table.
- Signed score attestations for trustless on-chain consumption.
- API keys and quotas (U7).

### Non-goals

- No writes. The API is strictly read-only; nothing a third party sends can change the ledger, scores, or labels.
- No change to the score engine, weights, gates, or diamond semantics. This exposes the score; it does not retune it.
- No canonical tier bands or opinionated status vocabulary (KTD-3). Games define their own bands on percentile.
- No real-time or on-chain reads on the request path. Freshness is the nightly rebuild, and the API says so.
- No separate deployment, database, or read replica (A4).
- No forward `.ron` resolution over RPC (KTD-5).

---

## Risks & Dependencies

- **Neon egress remains the sharp edge.** KTD-1 makes the steady state nearly free, but a bug that sets `no-store` or `force-dynamic` on a hot route silently reverts the API to per-request Neon reads and could burn the remaining ~1.9 GB/month headroom in days. U2's header tests are the guard, and the first month needs an actual eye on Neon's usage graph. Worth adding a cheap alert.
- **Score retunes will move raw-score gates.** Mitigated by shipping `rank` as a first-class field (KTD-3), auto-bumping `score_version` (KTD-8), and leading the docs with the warning (U6) - but not eliminated, and the community's habit of reading raw scores means builders will reach for `score >` anyway. Two things reduce the blast radius: the docs' first code block gates on rank, and a retune should be announced (see the support-commitment risk below). Note what rank does and does not buy: after a retune the membership of the top 100 still shuffles, but the group stays 100 people instead of collapsing to zero or ballooning - the size guarantee is the point, not stability of membership. The founder should expect that once games gate on this, retuning the score has a downstream blast radius it does not have today. That is a real, permanent cost of publishing the API, and it is worth deciding now whether score changes get a heads-up window for integrators.
- **The API implies a support commitment.** Publishing `/api/v1/` is a promise not to break it. The breaking-change policy (new major path, old version kept for a stated window) should be written on the docs page from day one rather than negotiated later.
- **`rns_names` coverage is partial.** Only addresses reverse-resolved during sync are cached, so `.ron` lookups will miss for names that have never held a Ronke asset. Documented as a known limitation; the `0x` path is always available.
- **Zero-score wallets are invisible in `wallet_scores`.** R4/KTD-4 handle this in the contract, but any future query that treats the table as "all holders" will undercount. Worth a comment at the `DELETE FROM wallet_scores` site in `derive.ts`.
- **Branch state.** The repo currently sits on `perf/rebuild-egress` (clean tree, one commit past `main`'s merge point). U1 touches `lib/score/derive.ts` and `lib/queries.ts`; start from `main` after that branch merges to avoid a conflict in `queries.ts`.

---

## Sources & Research

- Existing API surface: `app/api/score-inputs/[address]/route.ts` - the repo's only route handler, `force-dynamic`, no CORS/cache/version, live RPC name resolution.
- Score engine and persistence: `lib/score/compute.ts` (pure, tested), `lib/score/derive.ts` (`assembleScoreInputForWallet`, `deriveScores`, zero-score skip at the `DELETE`/insert boundary), `config/score.ts`, `config/scoreExplainer.ts`.
- Read layer: `lib/queries.ts` - `getWalletScore` (two queries incl. a `count(*)` rank), `getScoreLeaderboard`, `getWallet`, `getWalletBadges`, `getToken`, `getEcosystemStats`, `getSupplyStats`, `getMetaState`.
- Schema: `db/schema.sql` - `wallet_scores` (PK `address`, `wallet_scores_score_idx`), `rns_names`, `holder_metrics`, `holder_lots`, `token_rarity` (`tier`, null rank for 1/1s), `meta`.
- Pipeline and freshness: `.github/workflows/sync.yml` - migrate + sync + rebuild daily at 07:00 UTC, `workflow_dispatch` for manual runs; KTD-7 (Vercel serves reads only).
- Egress constraint: commit `c83fceb` - rebuild egress 228 MB -> 103.7 MB per run, ~6.85 -> ~3.11 GB/month against a 5 GB allowance.
- Score tuning history (why percentile has to ship alongside the raw score): memory `project_ronke_analytics.md` - PR #7 calibration moved #1 from 17,133 to 8,830; 1/1 bonus 500 -> 235; duration curve 1.25 -> 1.15/mo; minRonke 100k -> 50k.
- Conventions: `db/migrate.ts` naive statement splitter (one DDL statement per line, no inline `;`/`--`); `tests/fakedb.ts` + `tests/helpers.ts`; prior plans in `docs/plans/`.
