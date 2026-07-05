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
  raw           JSONB,
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
  rarity_rank       INTEGER,                                -- 1 = rarest (OpenRarity)
  trait_freq_score  DOUBLE PRECISION NOT NULL DEFAULT 0,   -- cross-check
  trait_freq_rank   INTEGER,                                -- cross-check
  method_version    TEXT,
  image_url         TEXT
);

CREATE INDEX IF NOT EXISTS token_rarity_rank_idx
  ON token_rarity (rarity_rank);

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
-- Key/value meta: sync + rebuild timestamps, flags.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
