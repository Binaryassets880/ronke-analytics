-- Ronke Analytics schema (Neon Postgres).
--
-- KTD-2: transfer_events is the append-only source of truth. Everything else
-- is derived and rebuildable from it. All DDL is idempotent (IF NOT EXISTS)
-- so db/migrate.ts can run it repeatedly.

-- ─────────────────────────────────────────────────────────────────────
-- Source of truth: append-only transfer/event log.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_events (
  id            BIGSERIAL PRIMARY KEY,
  asset         TEXT        NOT NULL,   -- 'ronke_token' | 'ronkeverse_nft'
  tx_hash       TEXT        NOT NULL,
  log_index     INTEGER     NOT NULL,
  block_number  BIGINT      NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  from_address  TEXT        NOT NULL,
  to_address    TEXT        NOT NULL,
  token_id      TEXT,                   -- NULL for ERC-20
  quantity      NUMERIC     NOT NULL DEFAULT 0,
  is_mint       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_burn       BOOLEAN     NOT NULL DEFAULT FALSE,
  -- NOTE: no `raw` payload column - persisting per-event provider JSON blew past
  -- Neon's free-tier storage cap (Blockscout inlines full NFT metadata). All
  -- analytics derive from the typed columns above.
  -- Idempotent appends: a re-pulled event collides here and is a no-op under
  -- INSERT ... ON CONFLICT DO NOTHING.
  CONSTRAINT transfer_events_uniq UNIQUE (asset, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS transfer_events_asset_block_idx
  ON transfer_events (asset, block_number);
CREATE INDEX IF NOT EXISTS transfer_events_asset_from_idx
  ON transfer_events (asset, from_address);
CREATE INDEX IF NOT EXISTS transfer_events_asset_to_idx
  ON transfer_events (asset, to_address);
CREATE INDEX IF NOT EXISTS transfer_events_asset_token_idx
  ON transfer_events (asset, token_id);

-- ─────────────────────────────────────────────────────────────────────
-- Per-asset ingestion cursor.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_cursor (
  asset       TEXT PRIMARY KEY,
  last_block  BIGINT      NOT NULL DEFAULT 0,
  source      TEXT        NOT NULL DEFAULT 'moralis',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- Address labels: excludes non-holder addresses and non-sell transfers.
-- Load-bearing for diamond-hands + concentration correctness (KTD-6, R4).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS address_labels (
  address              TEXT PRIMARY KEY,   -- lowercased 0x
  label                TEXT NOT NULL,
  category             TEXT NOT NULL,       -- cex|bridge|staking|game|contract|burn|team|lp
  exclude_from_holders BOOLEAN NOT NULL DEFAULT FALSE,
  counts_as_sell       BOOLEAN NOT NULL DEFAULT TRUE,
  note                 TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: current + historical holders (exited holders retained as
-- balance=0 / is_current_holder=false; the time series needs the full set).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_balances (
  asset             TEXT        NOT NULL,
  address           TEXT        NOT NULL,
  balance           NUMERIC     NOT NULL DEFAULT 0,  -- token units
  token_count       INTEGER     NOT NULL DEFAULT 0,  -- nft count
  first_acquired_at TIMESTAMPTZ,
  last_activity_at  TIMESTAMPTZ,
  is_current_holder BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (asset, address)
);

CREATE INDEX IF NOT EXISTS holder_balances_current_idx
  ON holder_balances (asset, is_current_holder);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: behavioral FIFO lots (token) / per-token holdings (nft).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_lots (
  id                 BIGSERIAL PRIMARY KEY,
  asset              TEXT        NOT NULL,
  address            TEXT        NOT NULL,
  token_id           TEXT,                 -- nft; NULL for token
  acquired_at        TIMESTAMPTZ NOT NULL,
  acquired_block     BIGINT      NOT NULL,
  quantity_remaining NUMERIC     NOT NULL
);

CREATE INDEX IF NOT EXISTS holder_lots_addr_idx
  ON holder_lots (asset, address);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: per-holder diamond-hands metrics.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_metrics (
  asset                 TEXT    NOT NULL,
  address               TEXT    NOT NULL,
  holding_duration_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  weighted_duration_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  diamond_bucket        TEXT    NOT NULL DEFAULT 'paper', -- paper|regular|diamond
  ever_paper_sold       BOOLEAN NOT NULL DEFAULT FALSE,
  never_sold            BOOLEAN NOT NULL DEFAULT FALSE,
  sell_count            INTEGER NOT NULL DEFAULT 0,
  pct_original_held     DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (asset, address)
);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: daily time series.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snapshot_daily (
  asset           TEXT    NOT NULL,
  date            DATE    NOT NULL,
  holder_count    INTEGER NOT NULL DEFAULT 0,
  gini            DOUBLE PRECISION NOT NULL DEFAULT 0,
  top10_pct       DOUBLE PRECISION NOT NULL DEFAULT 0,
  whale_count     INTEGER NOT NULL DEFAULT 0,
  new_holders     INTEGER NOT NULL DEFAULT 0,
  exited_holders  INTEGER NOT NULL DEFAULT 0,
  supply_held     NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (asset, date)
);

-- ─────────────────────────────────────────────────────────────────────
-- Ronkeverse trait metadata (refreshable; static after reveal).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nft_traits (
  token_id     TEXT NOT NULL,
  trait_type   TEXT NOT NULL,
  value        TEXT NOT NULL,
  display_type TEXT,                     -- string|number|date|bool
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, trait_type)
);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: per trait_type/value stats. Includes the synthetic
-- '_trait_count' trait_type per the OpenRarity Trait-Count heuristic.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trait_stats (
  trait_type   TEXT NOT NULL,
  value        TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  probability  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- count / revealed_supply
  rarity_label TEXT,
  PRIMARY KEY (trait_type, value)
);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: per-token rarity. OpenRarity is the user-facing ranking;
-- trait-frequency is an internal cross-check column (not user-facing v1).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_rarity (
  token_id          TEXT PRIMARY KEY,
  info_content_score DOUBLE PRECISION NOT NULL DEFAULT 0,  -- OpenRarity
  rarity_rank       INTEGER,                                -- 1 = rarest among STANDARD tokens; NULL for 1/1 buckets
  trait_freq_score  DOUBLE PRECISION NOT NULL DEFAULT 0,   -- cross-check
  trait_freq_rank   INTEGER,                                -- cross-check
  method_version    TEXT,
  image_url         TEXT
);
-- Rarity bucket: 'standard' | 'community_1of1' | 'official_1of1'. 1/1s are pulled
-- out of the standard 1..N ladder into their own showcase buckets.
ALTER TABLE token_rarity ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS token_rarity_rank_idx
  ON token_rarity (rarity_rank);
CREATE INDEX IF NOT EXISTS token_rarity_tier_idx
  ON token_rarity (tier);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: earned wallet badges (KTD-9). Rebuilt each run.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_badges (
  address    TEXT NOT NULL,
  badge_key  TEXT NOT NULL,
  tier       INTEGER,                    -- NULL for non-tiered badges
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  context    JSONB,                      -- e.g. the balance/rank that earned it
  PRIMARY KEY (address, badge_key)
);

CREATE INDEX IF NOT EXISTS wallet_badges_key_idx
  ON wallet_badges (badge_key);

-- ─────────────────────────────────────────────────────────────────────
-- Derived: Ronke Score per wallet (S-series). Combined score + per-asset
-- sub-scores + a stored breakdown so the profile explains it without recompute.
-- Rebuilt each run from derived tables (no chain calls), after badges.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_scores (
  address            TEXT PRIMARY KEY,
  score              INTEGER NOT NULL DEFAULT 0,
  ronke_subscore     INTEGER NOT NULL DEFAULT 0,
  nft_subscore       INTEGER NOT NULL DEFAULT 0,
  ronke_holding      INTEGER NOT NULL DEFAULT 0,
  ronke_duration     INTEGER NOT NULL DEFAULT 0,
  ronke_diamond_mult DOUBLE PRECISION NOT NULL DEFAULT 0,
  nft_holding        INTEGER NOT NULL DEFAULT 0,
  nft_duration       INTEGER NOT NULL DEFAULT 0,
  nft_diamond_mult   DOUBLE PRECISION NOT NULL DEFAULT 0,
  collector_points   INTEGER NOT NULL DEFAULT 0,
  body_types_held    INTEGER NOT NULL DEFAULT 0,
  body_types_total   INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_scores_score_idx ON wallet_scores (score DESC);

-- RonkeStr ($RONKE Strategy) sub-score columns. Added via ALTER (not baked into
-- the CREATE above) so existing wallet_scores tables gain them idempotently -
-- CREATE TABLE IF NOT EXISTS does not add columns to a table that already exists.
-- Mirrors the ronke_* column shapes exactly.
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS ronkestr_subscore INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS ronkestr_holding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS ronkestr_duration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS ronkestr_diamond_mult DOUBLE PRECISION NOT NULL DEFAULT 0;

-- One-of-one (1/1) flat bonus: points earned + count of 1/1s held (part of nft_subscore).
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS oneofone_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_scores ADD COLUMN IF NOT EXISTS oneofone_count INTEGER NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────
-- Market snapshots (E6): latest external market reading per source+asset.
-- $RONKE price/volume/liquidity from GeckoTerminal. Fetched off-Vercel during
-- sync (KTD-7), served read-only. jsonb payload keeps the shape flexible.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_snapshots (
  source     TEXT NOT NULL,       -- 'geckoterminal' | 'opensea' | ...
  asset      TEXT NOT NULL,       -- 'ronke_token' | 'ronkeverse_nft'
  snapshot   JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, asset)
);

-- ─────────────────────────────────────────────────────────────────────
-- On-chain NFT sales (E6). Marketplace-agnostic: derived from WRON settlement
-- legs so OpenSea Seaport AND Ronin-native marketplace sales are both captured
-- (OpenSea's own stats miss the latter). Volume is computed at read time.
-- price_wron is gross, in WRON base units (1e18). Bundle txs split evenly.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nft_sales (
  asset        TEXT        NOT NULL DEFAULT 'ronkeverse_nft',
  tx_hash      TEXT        NOT NULL,
  token_id     TEXT        NOT NULL,
  block_number BIGINT      NOT NULL,
  block_time   TIMESTAMPTZ NOT NULL,
  seller       TEXT        NOT NULL,
  buyer        TEXT        NOT NULL,
  price_wron   NUMERIC     NOT NULL DEFAULT 0,
  marketplace  TEXT,
  PRIMARY KEY (asset, tx_hash, token_id)
);

CREATE INDEX IF NOT EXISTS nft_sales_time_idx ON nft_sales (asset, block_time);

-- Cursor for the sale-indexer pass (last block scanned for WRON settlements).
CREATE TABLE IF NOT EXISTS nft_sales_cursor (
  asset      TEXT PRIMARY KEY,
  last_block BIGINT      NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- RNS (.ron) name cache (E4). Reverse-resolved during sync, served read-only.
-- name is NULL when a holder has no primary name (cached so we don't re-query
-- every run). resolved_at drives the freshness window.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rns_names (
  address     TEXT PRIMARY KEY,   -- lowercased 0x
  name        TEXT,               -- primary .ron name, or NULL if none
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────
-- Key/value meta: sync + rebuild timestamps, flags.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
