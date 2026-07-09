---
title: "feat: Burn tracker for RONKE and RONKESTR plus RONKESTR market cap"
type: feat
status: active
date: 2026-07-09
deepened: 2026-07-09
---

# feat: Burn tracker for RONKE and RONKESTR plus RONKESTR market cap

## Summary

Add a burn tracker to the Ronkeverse analytics section: one card per token ($RONKE and $RONKESTR) showing a big "% Burned" headline, a "Burned vs Total Supply" progress bar, and three stat tiles (Circulating Supply, Burned Forever, Deflation Rate), matching the founder's design mock. Also surface RONKESTR market cap, which GeckoTerminal does not provide (verified `market_cap_usd: null` live on 2026-07-09), by computing price x circulating supply with an honest sourcing label.

## Problem Frame

The site already ingests every burn - all three providers flag `is_mint` (from == zero address) and `is_burn` (to in {zero, dead}) on `transfer_events`, and burn addresses are label-excluded from holder counts - but nothing in the UI shows burned supply, circulating supply, or deflation rate. Separately, the Market Cap tile on `/overview?asset=ronkestr` renders a dash today because GeckoTerminal returns null market cap for tokens without a CoinGecko listing.

---

## Requirements

**Burn tracker**

- R1. The analytics section shows, for each of $RONKE and $RONKESTR: percent burned as a headline, burned amount, total supply, circulating supply, and deflation rate, with a burned-vs-total progress bar, in the site's design system (per the mock).
- R2. Burn figures derive from the `transfer_events` ledger via the existing `is_burn` / `is_mint` flags, and reconcile with on-chain burn-address balances as of the last sync (verified: RONKE ledger burned 130,605,432.04 equals on-chain dead + zero balances exactly).
- R3. Circulating supply is defined as total minted minus total burned (mock semantics: RONKE 869.4M = 1B - 130.6M; RONKESTR 16.5M = 21M - 4.5M).

**Market cap**

- R4. RONKESTR market cap is visible on the analytics section. When GeckoTerminal's `market_cap_usd` is null, show computed market cap = DEX price x circulating supply, labeled as computed; when GeckoTerminal provides a value (RONKE does), keep it.

**Non-regression**

- R5. The NFT asset view, existing routes, and the sync pipeline are unaffected; no rebuild changes required.
- R6. Test suite stays green (currently 32 files, 208 passed + 1 skipped); new modules follow the pure-function + fixture conventions.

---

## Key Technical Decisions

- **KTD-1 - Burn stats come from the ledger, not RPC.** Aggregate `SUM(quantity) FILTER (WHERE is_burn)` and `FILTER (WHERE is_mint)` per token asset from `transfer_events`. Rationale: the repo's core principle is "everything recomputed from transfer_events"; the ledger was live-verified to match on-chain burn balances exactly for RONKE; no new provider dependency, no Vercel-side chain calls (README KTD-7). Freshness is the nightly sync, consistent with every other number on the site. `config/contracts.ts` `isBurnAddress()` remains the only burn definition - no ad-hoc address matching in new code.
- **KTD-2 - Read-time aggregate, not a new rebuild-derived table.** Add `getSupplyStats(asset)` to `lib/queries.ts`, mirroring the `getNftMarket()` idiom (live aggregate over an indexed table). Only ~520 burn rows + 1 mint row per token qualify, but the filter scans the asset partition (~560K rows for RONKE), so add a partial index (`WHERE is_mint OR is_burn`) via idempotent one-line DDL in `db/schema.sql`. Zero rebuild changes; nothing new to keep in sync.
- **KTD-3 - Total supply from mint events; no config constant, no `totalSupply()` RPC.** Each token has exactly one mint event summing to precisely 1,000,000,000 (RONKE) and 21,000,000 (RONKESTR) - verified live in Neon. On-chain `totalSupply()` stays at the minted amount for both tokens (burns are dead-address transfers, not supply-reducing `_burn`), so ledger-minted equals on-chain total.
- **KTD-4 - RONKESTR market cap = computed circulating market cap, labeled.** GeckoTerminal returns `market_cap_usd: null` and `fdv_usd` ~ $20,048 for RONKESTR (probe 2026-07-09). Computed price x circulating is preferred over an FDV fallback because we have exact circulating supply and it is consistent with the burn story (FDV ignores the 21.47% burned). Keep GeckoTerminal's value whenever non-null (RONKE: ~$246.7K). Follow the market layer's honesty convention: label the computed value (e.g. "price x circulating") the way price is labeled "DEX price - low liquidity". Also expose `fdvUsd` in `TokenMarketView` (`lib/queries.ts` currently drops it even though it is parsed and stored).
- **KTD-5 - Placement: dedicated `/burn` page with both token cards stacked, plus fixing the existing Overview Market Cap tile.** The mock shows both tokens at once; `/overview` is asset-scoped via `?asset=`, so a both-tokens section there would break its IA. A new `app/burn/page.tsx` in the analytics section (sub-nav entry alongside Overview/Holders/etc.) renders the two cards exactly like the mock. The RONKESTR market cap fix (KTD-4) lands on the existing Market tile grid in `app/components/OverviewView.tsx` so it also benefits `/overview?asset=ronkestr`.
- **KTD-6 - Burn accent color as a design-system token.** Add a burn/flame accent (red-to-orange, per the mock's headline and bar gradient) as CSS vars in `app/globals.css` next to `--accent` / `--diamond`, so components read vars per the rebrand convention.

---

## Assumptions

Made without blocking (background session); each is cheap to revisit before implementation.

- A1. **Placement** = dedicated `/burn` page showing both tokens stacked (mock fidelity), rather than an asset-scoped section inside `/overview`. If the founder prefers everything on `/overview`, U3 swaps to a section in `OverviewView` gated `!isNft` showing the selected asset's card only.
- A2. **Market cap definition** for RONKESTR = price x circulating (not FDV). FDV remains available (`fdvUsd` now exposed) if the founder prefers it.
- A3. **Freshness**: nightly-sync staleness (up to ~24h; RONKESTR ledger currently trails on-chain burns by ~16.9K tokens burned since last sync) is acceptable, matching every other stat on the site. If near-real-time is wanted later, `refreshMarket` could be extended with a best-effort `balanceOf(dead)` read - deferred.
- A4. **Card copy** follows the mock ("Ronke Token", "NFTStrategy Token" subtitles, "Burned Forever", "Deflation Rate" tile labels); subtitles live with the card config so they are one-line edits.
- A5. **"Deflation Rate" = cumulative percent burned**, intentionally the same number as the card headline - the mock itself shows "13.06% Burned" in both places, so the tile is read as emphasis, not a distinct metric. If the founder instead means a time-windowed burn velocity (e.g. percent burned per month), U1 needs an additional time-windowed aggregate (the ledger has per-event timestamps, so this is scope-able) and the tile copy changes - confirm before building U2 if in doubt.

---

## Implementation Units

### U1. Supply stats data layer

- **Goal:** `getSupplyStats(asset)` returns `{ minted, burned, circulating, burnedPct }` in whole tokens for token assets, fast.
- **Requirements:** R2, R3
- **Dependencies:** none
- **Files:** `lib/queries.ts`, `db/schema.sql`, `tests/supply.test.ts`
- **Approach:** Single SQL aggregate over `transfer_events` with outer predicate `WHERE asset = $1 AND (is_mint OR is_burn)` and `FILTER (WHERE is_mint)` / `FILTER (WHERE is_burn)` splitting mint vs burn within the qualifying rows. The `AND (is_mint OR is_burn)` clause is load-bearing: Postgres only chooses a partial index when the query predicate provably implies the index predicate, so an outer `WHERE asset = $1` alone (the shape `getNftMarket()` uses) would full-scan the asset partition and leave the index unused. Convert base units to whole tokens with the existing `toWholeTokens(raw, asset)` from `lib/format.ts` (values exceed JS safe integers in base units - keep the sum in SQL numeric/text and convert once, following how existing queries handle 1e18 quantities). Add partial index DDL to `db/schema.sql` as one idempotent single-line statement (no embedded `;` or `--`, per `db/migrate.ts`'s naive splitter): `CREATE INDEX IF NOT EXISTS transfer_events_supply_idx ON transfer_events (asset) WHERE is_mint OR is_burn;`. Also add `fdvUsd` to `TokenMarketView` in `getTokenMarket()` (one-line, parsed value already stored in the jsonb).
- **Patterns to follow:** `getNftMarket()` read-time aggregate in `lib/queries.ts`; `tests/fakedb.ts` + `tests/helpers.ts` transfer factory (already defaults `isBurn: isBurnAddress(to)`); idempotent-migration assertions in `tests/schema.test.ts`.
- **Test scenarios:**
  - Happy path: fixture events (one mint of 1,000, burns totaling 130) yield minted 1,000, burned 130, circulating 870, burnedPct 0.13.
  - Edge: asset with a mint but zero burns yields burnedPct 0 (no division error); asset with no rows yields nulls/zeros, not NaN.
  - Edge: transfers to a normal (non-burn) address are not counted as burns (only `is_burn` rows qualify).
  - Edge: base-unit magnitudes at RONKE scale (1e27 total base units) survive without float precision loss in the returned whole-token values.
  - Migration: running migrations twice leaves a single `transfer_events_supply_idx` (idempotency, schema.test.ts pattern).
  - `getTokenMarket` view now includes `fdvUsd` from a stored snapshot fixture; still null-safe on empty snapshot.
- **Verification:** unit tests green; a manual spot-check of `getSupplyStats("ronke_token")` against live Neon returns burned ~130,605,432 and burnedPct ~0.1306; an `EXPLAIN` on the aggregate shows an index scan on `transfer_events_supply_idx` (not a seq scan of the asset partition). RONKESTR reconciliation: after the next nightly sync, re-probe the on-chain dead balance and assert `getSupplyStats("ronkestr_token").burned` matches it modulo burns newer than the sync cursor - the ~16.9K-token ledger-vs-chain gap observed on 2026-07-09 is presumed sync lag but was not proven the way RONKE's exact match was. If the gap persists across a sync, treat it as dropped burn events and repair the ledger before shipping the RONKESTR card.

### U2. BurnCard component

- **Goal:** Pure presentational per-token burn card matching the mock: header (symbol + subtitle left, big % Burned headline right), labeled progress bar ("Burned: X SYMBOL" / "Total Supply: Y SYMBOL"), three stat tiles (Circulating Supply, Burned Forever, Deflation Rate).
- **Requirements:** R1
- **Dependencies:** U1 (consumes its view type)
- **Files:** `app/components/BurnCard.tsx`, `app/components/StatTile.tsx`, `app/globals.css`, `lib/format.ts`, `tests/burn-card.test.tsx`
- **Approach:** `rv-card` chrome; headline uses `.mono` large bold in the new burn accent var; progress bar reuses the `.rv-meter` pattern (taller variant, red-to-orange gradient fill per the mock; add a modifier class rather than restyling the shared 6px meter used by leaderboards) and carries `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` and an `aria-label` composed from the "Burned: X / Total Supply: Y" text - the existing `.rv-meter` usage in `LeaderboardView` is a bare decorative div, so copying it verbatim would ship a screen-reader-silent bar. Tiles reuse `StatTile`, which today has no way to color the value (fixed classes on `{label, value, sub, hint, hero}`): add an optional `valueClassName` prop defaulting to current styling (zero change for existing callers) and pass the burn-accent class for the Burned Forever and Deflation Rate tiles. Tile grid is `grid-cols-1 sm:grid-cols-3` (column count is an explicit per-section decision in this codebase, e.g. OverviewView's `grid-cols-2 sm:grid-cols-4`), and the header stacks the headline below the symbol/subtitle on narrow widths. Formatters: `formatCompact` for amounts; `formatPct` currently renders one decimal (`toFixed(1)` - "13.1%"), so extend it with an optional fraction-digits parameter (`formatPct(share, digits = 1)`, existing call sites unchanged) and have BurnCard call `formatPct(burnedPct, 2)` to match the mock's "13.06%". Rendered purely from props so it tests without network (repo convention).
- **Test scenarios:**
  - Renders headline "13.06%" (formatPct(0.1306, 2)) and all three tile values from props (869.4M, 130.6M, 13.06% via formatCompact/formatPct).
  - `formatPct` default behavior unchanged: `formatPct(0.1306)` still returns "13.1%" (guards the shared call sites in Overview/Holders/TokenDetail views).
  - Bar fill element carries `width: 13.06%` (or equivalent style) derived from burnedPct, and the bar exposes `role="progressbar"` with `aria-valuenow` 13 (rounded) and an accessible name.
  - `StatTile` without `valueClassName` renders exactly as before (existing-caller regression guard); with it, the class lands on the value element.
  - Null/missing supply stats render dashes, not NaN, and the bar clamps to 0.
  - burnedPct 1 (fully burned) clamps the bar to 100% without overflow.
- **Verification:** component tests green; visual check against the mock in dev.

### U3. Burn page and nav wiring

- **Goal:** `/burn` renders the $RONKE card above the $RONKESTR card, reachable from the analytics sub-nav.
- **Requirements:** R1, R5
- **Dependencies:** U1, U2
- **Files:** `app/burn/page.tsx`, `app/components/BurnView.tsx`, `app/components/Nav.tsx`, `tests/burn-page.test.tsx`
- **Approach:** Server component with `export const dynamic = "force-dynamic"` (site convention), `Promise.all` over `getSupplyStats` + `getTokenMarket` for both token assets, passing props to a pure `BurnView` that stacks two `BurnCard`s. Nav wiring is minimal (verified against current code): `sectionFor()` in `app/components/EcosystemNav.tsx` already returns the analytics section ("rating") for every path that is not `/`, `/resources`, or `/apps`, so `/burn` needs no `sectionFor` change. Add `{ href: "/burn", label: "Burn", assetScoped: false }` to `LINKS` in `app/components/Nav.tsx`, inserted after Leaderboard and before Rarity (supply stats are a secondary view; the primary analytics tabs keep their positions). Gotcha: `NavInner`'s `showToggle` currently hides the asset toggle only for `/rarity`; `/burn` shows both tokens, so exclude it the same way (the toggle is meaningless there). Degraded state: when one asset's stats are null, render a card-shaped `rv-card` block with that token's symbol and the line "Burn data temporarily unavailable" in place of the headline/bar/tiles, so the placeholder is specified rather than improvised.
- **Test scenarios:**
  - `BurnView` renders two cards, RONKE first, RONKESTR second, each with its own symbol labels.
  - One asset's stats null (e.g. query degraded) still renders the other card plus a graceful placeholder - page never 500s on partial data.
  - `sectionFor("/burn")` resolves to "rating" (guards against a future sectionFor refactor demoting the page); sub-nav includes a Burn link; asset toggle hidden on `/burn` (mirror the `/rarity` behavior).
- **Verification:** dev-server smoke: `/burn` 200 with live DB, both cards populated, nav highlight correct; existing route tests untouched and green.

### U4. RONKESTR market cap surfacing

- **Goal:** Market Cap is visible for RONKESTR wherever token market tiles render, using GeckoTerminal's value when present and computed price x circulating when null.
- **Requirements:** R4, R5
- **Dependencies:** U1
- **Files:** `app/overview/page.tsx`, `app/components/OverviewView.tsx`, `lib/format.ts` (only if a small helper is warranted), `tests/overview.test.tsx`
- **Approach:** Overview page already fetches `getTokenMarket(asset)`; also fetch `getSupplyStats(asset)` for token assets and derive `displayMarketCap = market.marketCapUsd ?? (market.priceUsd != null && supply.circulating != null ? market.priceUsd * supply.circulating : null)`, passing both the value and a `computed` flag so the tile can label it (StatTile `sub`/`hint`, e.g. "price x circulating"). Keep the derivation in one small pure function so it is unit-testable. Market cap renders ONLY on the Overview Market tile grid - the `/burn` cards stay three-tile per the mock and do not show market cap, so this unit touches no U3 files.
- **Test scenarios:**
  - GeckoTerminal `marketCapUsd` non-null (RONKE case): tile shows that value, no computed label.
  - `marketCapUsd` null + price and circulating present (RONKESTR case): tile shows price x circulating with the computed label.
  - `marketCapUsd` null + price null (market snapshot missing): tile shows a dash, no crash.
  - Circulating null (supply query degraded): falls back to dash rather than multiplying by undefined.
- **Verification:** `/overview?asset=ronkestr` shows a real Market Cap (~$15-16K at current price) instead of a dash; `/overview?asset=ronke` unchanged; tests green.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Burned-over-time chart (the ledger has full burn history with timestamps; a daily-burn series or cumulative chart is a natural follow-up but needs a chart precedent decision).
- Burn percent on the ecosystem landing "at a glance" strip (`getEcosystemStats` currently surfaces prices only).
- Near-real-time burn freshness via a best-effort `balanceOf(dead)` read in `refreshMarket` (A3).
- Seeding the repo's first `docs/solutions/` entries (supply-derivation recipe, market-cap-fallback convention) after this lands - flagged by the learnings pass as an uncaptured runbook.

### Non-goals

- No changes to holder counts, scores, badges, or diamond semantics (burn addresses are already correctly excluded).
- No new provider or API key; no RPC calls added to the serving layer.
- No burn display for the NFT asset (6 burned NFTs are not the story this feature tells).

---

## Risks & Dependencies

- **Nightly staleness is visible in the numbers.** RONKESTR's ledger currently trails on-chain burns by ~16.9K tokens - presumed burns since the last sync, but unproven (RONKE's exact ledger-vs-chain match is verified; RONKESTR's is not yet). U1's verification step settles this after the next nightly sync; if the gap persists, it is a dropped-events bug, not staleness. Residual staleness of up to ~24h is low impact - consistent with the whole site - but worth a tooltip if users compare against explorers (the existing `InfoTip` on `StatTile` covers this).
- **GeckoTerminal shape drift.** Already mitigated by the market layer's null-on-drift parsing; the computed-mcap fallback also happens to make the RONKESTR tile resilient to GeckoTerminal never adding a market cap.
- **Partial index on a large table.** `CREATE INDEX` (non-concurrent) on ~560K rows via `npm run migrate` is a brief lock on Neon; acceptable at this table size, and consistent with how prior indexes were added.
- **Branch state.** The repo currently sits on `feat/score-calculator` (PR #11 open); this work starts from main on its own branch once that merges, or from main directly - it touches none of the same files except possibly `lib/queries.ts`.

---

## Sources & Research

- On-chain probes (2026-07-09, `api.roninchain.com/rpc`): RONKE `totalSupply()` = 1,000,000,000; `balanceOf(0x000000000000000000000000000000000000dEaD)` = 130,602,947.97; `balanceOf(0x0)` = 2,484.07 (13.06% burned). RONKESTR `totalSupply()` = 21,000,000; dead balance = 4,509,289.39 (21.47%). Both match the design mock's numbers.
- GeckoTerminal probes (2026-07-09): RONKESTR `market_cap_usd: null`, `fdv_usd` ~ $20,048, price ~ $0.000955; RONKE `market_cap_usd` ~ $246,656.
- Live Neon aggregates: ronke_token 520 burn events summing 130,605,432.04 (exact match with on-chain dead + zero) and one mint of exactly 1B; ronkestr_token 519 burn events summing 4,492,376.39 and one mint of exactly 21M.
- Burn/mint flags: `db/schema.sql` (`is_mint`, `is_burn`), set by `lib/ronin/moralis.ts`, `lib/ronin/blockscout.ts`, `lib/ronin/goldrush.ts` via `isBurnAddress()` / `ZERO_ADDRESS` in `config/contracts.ts`.
- UI precedents: `.rv-meter` bar (`app/globals.css`, used in `app/components/LeaderboardView.tsx`), Diamond Hands hero card (`app/components/OverviewView.tsx`), `app/components/StatTile.tsx`, formatters in `lib/format.ts`.
- Prior plans: `docs/plans/2026-07-05-001-feat-ronke-analytics-dashboard-plan.md` (KTD-2/3/7 pipeline rules), `docs/plans/2026-07-06-002-feat-ronkestr-asset-and-score-plan.md` (asset-generic conventions, market layer).
