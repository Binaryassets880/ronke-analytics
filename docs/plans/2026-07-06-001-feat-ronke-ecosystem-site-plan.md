---
title: "feat: Ronke ecosystem site - Ronke Rating analytics + Resources + Apps, market data, RNS, badge realms"
type: feat
status: completed
date: 2026-07-06
completed: 2026-07-06
completion_note: "All slices shipped: E1 nav, E2 Resources, E3 Apps (mixer/game removed per user), E4 RNS, E5a badge realms, E6 market (GeckoTerminal $RONKE + on-chain all-venue Ronkeverse volume; floor deferred), E7 landing (/ = landing, /overview = analytics). 158 tests green, live-validated. Open: domain undecided; composite Ronke Rating score + Ronkeverse floor + E5b per-asset metric split deferred."
origin: docs/plans/2026-07-05-001-feat-ronke-analytics-dashboard-plan.md (extends the shipped dashboard)
depth: medium
target_repo: ronke-analytics (C:\dev\claude\ronke-analytics)
---

# feat: Ronke ecosystem site

Evolve the shipped `ronke-analytics` dashboard into the **Ronke ecosystem site**
(candidate domain `ronke.tools`, not yet locked). The existing holder-analytics
app becomes one section - **Ronke Rating** - under a new ecosystem-level top nav
that also hosts **Ronke Resources** and **Ronke Apps**. Adds external market data
(GeckoTerminal for $RONKE price/volume, OpenSea for Ronkeverse floor/volume), RNS
`.ron` name resolution, a RONKE-vs-Ronkeverse split of the badge shelf, and a
newcomer-friendly landing experience.

**Target repo:** extends the existing project in place. All paths repo-relative
to `ronke-analytics`. The append-only ingest / off-Vercel rebuild / read-only
serving architecture (KTD-2, KTD-3, KTD-7 from the original plan) is unchanged;
every new data source plugs into the same GitHub-Action sync pipeline.

---

## Summary

1. **Ecosystem nav.** A top-level bar - `Ronke` · **Ronke Rating** · **Ronke Resources** · **Ronke Apps** - sits above the current analytics sub-nav (Overview / Holders / Ronk Rank / Rarity). The analytics app moves conceptually under "Ronke Rating"; existing routes keep working.
2. **Ronke Rating** is the umbrella name for the analytics section: wallet ratings (badges, diamond-hands, holdings), NFT ratings (rarity), and ecosystem stats. A single composite numeric "Ronke Rating" score is a natural future extension but **not** required for v1.
3. **Ronke Resources** - a trust + onboarding page: verified contract addresses (copy + explorer links), how/where to buy $RONKE, where to trade Ronkeverse, official socials, RNS explainer, and a plain-English glossary of every metric/badge.
4. **Ronke Apps** - a gallery of the games/tools (Ronkeverse game, Ronke Mixer, etc.) with art + "play/open" links out.
5. **Market data tiles.** $RONKE price / 24h volume / liquidity from GeckoTerminal (Katana Ronke/WRON pool); Ronkeverse floor / volume / listings from OpenSea. Pulled in the existing sync job into a new `market_snapshots` table, served as read-only tiles on the Overview + ecosystem landing strip.
6. **RNS names.** Reverse-resolve holder addresses to primary `.ron` names, cached in `rns_names` during sync; forward-resolve `name.ron` in the wallet search box. Display `ronke.ron` in place of `0xf98...` everywhere.
7. **Badge realms.** Every badge tagged with a realm (`ronke` / `ronkeverse` / `both`); the profile badge shelf regroups into **$RONKE**, **Ronkeverse**, and **Ecosystem** sections so it's clear which token/NFT each badge belongs to.
8. **Onboarding landing.** A hero using the existing Ronkeverse sprite art, an ecosystem stat strip, and a front-and-center "look up any wallet / .ron" search so a first-time visitor immediately gets the Ronke feel.

---

## Problem Frame

The dashboard currently reads as a single-purpose token/NFT holder tool. The user
is expanding Ronke into a full ecosystem brand (game + token + NFTs + tools) and
wants one site that (a) houses the analytics, (b) orients newcomers, and (c) links
the pieces together. Three forces:

- **The analytics engine is done and should not be disturbed.** This is additive: a nav layer, two static-ish pages, three read-only data feeds, and a badge-grouping change. No change to ingest/rebuild semantics.
- **External data is thin but real.** $RONKE is a low-liquidity DEX token (no first-class aggregator listing); Ronkeverse trades on OpenSea/Ronin. Both are reachable, but numbers must be framed honestly (see KTD-E3).
- **Newcomer comprehension.** A token dashboard full of jargon (Gini, diamond hands) bounces newcomers. The site needs a low-jargon front door and a glossary.

**Actors:** anonymous newcomers (land, get the vibe, look up a wallet), holders
(check their Ronke Rating + badges, flex), the owner (curates resources/app list,
runs sync). No viewer login (unchanged from v1).

---

## Scope Boundaries

### In scope
- Ecosystem top nav + `Ronke Rating` / `Ronke Resources` / `Ronke Apps` sections.
- `Ronke Resources` page: verified addresses, buy/trade links, socials, RNS explainer, metric/badge glossary.
- `Ronke Apps` page: card gallery linking out to Ronke games/tools.
- Market data: GeckoTerminal ($RONKE) + OpenSea (Ronkeverse) into `market_snapshots`, surfaced as Overview + landing tiles.
- RNS reverse (address -> primary `.ron`) cached in `rns_names`; forward (`name.ron` -> address) in wallet search.
- Badge realm tagging + regrouped profile shelf ($RONKE / Ronkeverse / Ecosystem).
- Landing hero + ecosystem stat strip + prominent wallet/.ron search, using existing sprite art.

### Deferred to follow-up
- A single composite numeric **Ronke Rating** score (weighted blend of bag size, holdings, diamond-hands, rarity, tenure). v1 uses "Ronke Rating" only as the section name; the composite score is a design exercise of its own (weights, gaming-resistance).
- Per-asset split of the currently cross-asset metrics (Diamond Hands, OG/Early, Whale, Holding Length) so each realm's badges are behaviorally exact. v1 does the UI realm-grouping (E5a); the metric split is E5b, sequenced after.
- $RONKE price *history* chart from GeckoTerminal OHLCV (v1 stores current snapshot only; history accrues going forward or via an OHLCV backfill later).
- Moralis floor-price as OpenSea backup (docs conflict on Ronin floor support - use OpenSea primary, revisit only if OpenSea proves unreliable).
- Domain-specific wiring (canonical URL, OG base) until a domain is locked.

### Non-goals
- Trading/swaps embedded in the site (link out only).
- Any change to the diamond-hands / rarity / concentration definitions.
- Auth / accounts.

---

## Key Technical Decisions

**KTD-E1: Ecosystem nav is a new layer above the existing app nav; routes are additive.** A new top bar renders `Ronke` (home) · Ronke Rating · Ronke Resources · Ronke Apps. The current `Nav` (Overview/Holders/Leaderboard/Rarity + asset toggle + search) becomes the **Ronke Rating sub-nav**, shown only within that section. Existing routes (`/`, `/holders`, `/leaderboard`, `/rarity`, `/wallet/[address]`, `/rarity/[tokenId]`) keep working; `/` becomes the ecosystem landing and the analytics overview moves to a clearly-linked home within Ronke Rating (or `/` stays the analytics overview with the landing hero prepended - decided in E1). No route is deleted, so no OG/share links break.

**KTD-E2: Resources + Apps are content-config-driven, not hardcoded JSX.** `config/resources.ts` (addresses, buy/trade links, socials, glossary entries) and `config/apps.ts` (app cards: title, blurb, art path, url) drive the two pages, mirroring the `config/badges.ts` / `config/contracts.ts` pattern already in the repo. Adding a link or an app is a config edit. Contract addresses on the Resources page are imported from `config/contracts.ts` (single source of truth) - never re-typed.

**KTD-E3: Market data is a sync-pulled snapshot in `market_snapshots`, served read-only, and labeled honestly.** A new `lib/market/geckoterminal.ts` and `lib/market/opensea.ts` are called by `scripts/sync.ts` (off-Vercel, existing cron) and upsert the latest snapshot per source into `market_snapshots(source, asset, snapshot, fetched_at)` (jsonb payload + typed accessors). Vercel reads the latest row; no market API call in a request handler (same rule as chain data, KTD-7). $RONKE liquidity is ~$11-17K and 24h volume a few hundred dollars, so the UI labels it **"DEX price - low liquidity"** and shows liquidity alongside price so the number is read as directional. GeckoTerminal needs no key (~30 req/min); OpenSea needs a free `OPENSEA_API_KEY` (new optional env var; tiles degrade gracefully to "unavailable" if unset).

**KTD-E4: RNS resolution is server-side contract reads, cached in `rns_names`; never resolved live on render.** There is no hosted RNS HTTP API - resolution is ENS-style on-chain reads via `@roninnetwork/rnsjs` (or direct resolver calls) over a Ronin RPC. `scripts/sync.ts` reverse-resolves current-holder addresses (bounded set, incremental: only new/changed holders) into `rns_names(address, name, resolved_at)`. The serving layer joins `rns_names` for display. Forward resolution (`name.ron` in wallet search) is the one allowed live call, on an explicit user search, with a fallback to treating input as a raw address. Requires a `RONIN_RPC_URL` env var (public RPC acceptable; a keyed RPC if rate limits bite).

**KTD-E5: Badges gain a `realm` field; the shelf regroups by realm, then (later) metrics split per-asset.** `config/badges.ts` `BadgeDef` gains `realm: "ronke" | "ronkeverse" | "both"`. `BadgeShelf` groups by realm first (sections `$RONKE`, `Ronkeverse`, `Ecosystem`), category second. **E5a (now):** pure tagging + regrouping, no analytics change - fast, high visual payoff. **E5b (deferred):** the currently cross-asset predicates (`never_sold`, `og_early`, `whale`, `holding_length`) are split per-asset in `lib/badges/derive.ts` + `assembleAggregates` so, e.g., a wallet can be 💎 on $RONKE and 🧻 on Ronkeverse. E5b is a moderate change to the aggregate shape and its tests; it is explicitly sequenced after E5a ships.

**KTD-E6: Onboarding leads with interaction and art, not prose.** The landing renders (1) a sprite-art hero + one-line "what is Ronke", (2) a live ecosystem stat strip (holders, $RONKE price, Ronkeverse floor, badges earned), (3) a prominent "look up any wallet or .ron" search, (4) a full badge gallery incl. locked badges ("collect them all"). Reuses existing components (`StatTile`, `WalletSearch`, badge rendering) and the existing sprite assets from the game repos.

---

## Unit-of-Work Breakdown

Each `E`-unit is an independently shippable slice. Suggested order: E1 -> E4 -> E5a -> E6(market) -> E7(landing). E2/E3 (Resources/Apps pages) can land any time after E1.

### E1 - Ecosystem nav + section framing
- New `app/components/EcosystemNav.tsx` (top bar) + refactor `Nav.tsx` into the Ronke Rating sub-nav.
- Decide `/` framing: ecosystem landing with analytics overview linked, vs. overview + hero prepended. Keep all existing routes.
- Update `app/layout.tsx` to render the ecosystem nav globally; sub-nav only within Ronke Rating.
- Rename user-facing "Ronke Analytics" -> "Ronke Rating" for the section; keep repo name.
- Tests: nav renders all sections + active state; existing route tests still green.

### E2 - Ronke Resources page (`app/resources/page.tsx`)
- `config/resources.ts`: contract addresses (from `config/contracts.ts`), buy $RONKE (Katana pool link), trade Ronkeverse (OpenSea/Ronin), socials, RNS explainer, glossary.
- Copy-to-clipboard address rows + Ronin explorer links.
- Glossary component reused by tooltips elsewhere.

### E3 - Ronke Apps page (`app/apps/page.tsx`)
- `config/apps.ts`: app cards (Ronkeverse game, Ronke Mixer, others), art path + outbound url.
- Card gallery using existing card styling.

### E4 - RNS name caching + display
- `lib/rns/resolve.ts` (reverse + forward via rnsjs/direct reads), `db/schema.sql` add `rns_names`, migration.
- `scripts/sync.ts`: reverse-resolve current holders incrementally into `rns_names`.
- Serving: join names in holder table, leaderboard, wallet page; `WalletSearch` accepts `name.ron`.
- New env: `RONIN_RPC_URL`. Tests: forward/reverse resolution (mocked provider), search accepts `.ron`.

### E5a - Badge realm grouping (UI)
- Add `realm` to every `BadgeDef` in `config/badges.ts`.
- `BadgeShelf.tsx`: group by realm ($RONKE / Ronkeverse / Ecosystem) then category.
- Tests: shelf renders three realm sections with correct membership.

### E5b - Per-asset metric split (deferred, analytics)
- Split `never_sold` / `og_early` / `whale` / `holding_length` per asset in `derive.ts` + `assembleAggregates`.
- Migrate `WalletAggregate` shape + tests. Sequenced after E5a.

### E6 - Market data
- `lib/market/geckoterminal.ts` ($RONKE token + pool), `lib/market/opensea.ts` (Ronkeverse stats).
- `db/schema.sql` add `market_snapshots`, migration.
- `scripts/sync.ts`: fetch + upsert latest snapshot per source.
- Overview + landing `StatTile`s: $RONKE price/vol/liquidity (labeled low-liquidity), Ronkeverse floor/vol/listings.
- New env: `OPENSEA_API_KEY` (optional; graceful degrade). Tests: parsers against captured fixtures; tile renders with + without data.

### E7 - Onboarding landing
- Hero (sprite art + tagline + primary CTAs), ecosystem stat strip, prominent search, full badge gallery (locked + earned).
- Reuse `StatTile`, `WalletSearch`, badge components. Tests: landing renders stat strip + search + gallery.

---

## Confirmed external data sources (research 2026-07-06)

| Need | Verdict | Method |
|---|---|---|
| $RONKE price / 24h vol / liquidity | FEASIBLE (no key) | GeckoTerminal `GET /api/v2/networks/ronin/tokens/0xf988f63bf26c3ed3fbf39922149e3e7b1e5c27cb`. Pool = Ronke/WRON on Katana `0x75ae353997242927c701d4d6c2722ebef43fd2d3`. Live: price ~$0.00029, vol ~$648, liq ~$11K. Low liquidity => noisy. OHLCV per-pool available for future history. CoinGecko coin id = `ronke` ("Ronin Monke"). |
| Ronkeverse floor / vol / listings | FEASIBLE (free key) | OpenSea `GET /api/v2/collections/ronkeverse/stats`. Contract->slug: `/api/v2/chain/ronin/contract/0x810b6d1374ac7ba0e83612e7d49f49a13f1de019`. Live: floor 234.99 RON, 6,963 items, 1,867 owners. Backup: Moralis NFT Trades on Ronin (already integrated). Avoid Sky Mavis/Skynet (sunset). |
| RNS `.ron` resolve / reverse | FEASIBLE (contract reads) | `@roninnetwork/rnsjs` `getAddr`/`getName` over Ronin RPC. Registry `0x67c409dab0ee741a1b1be874bd1333234cfdbf44`, resolver `0xadb077d236d9e81fb24b96ae9cb8089ab9942d48`, reverse registrar `0xb8618a73cc08d2c4097d5c0e0f32fa4af4547e2f`. No HTTP API/subgraph - cache server-side. |

Pre-code checks: (a) confirm OpenSea `ronin` chain id + stats shape with a real key; (b) if ever using Moralis floor as backup, verify it returns a Ronin floor (docs conflict).

---

## Open questions
- **Domain** not locked (`ronke.tools` candidate). Branding kept domain-neutral until decided; canonical URL + OG base wired when locked.
- **Composite Ronke Rating score** - do we want a single number eventually, and if so, what weights + gaming-resistance? Deferred design exercise.
- **`/` framing** (E1) - landing-first vs. overview-with-hero. Decide at E1 start.
