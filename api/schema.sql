-- Britto D1 schema. Idempotent: safe to run again. Money is integer paise; times are ms.

CREATE TABLE IF NOT EXISTS products (
  key             TEXT PRIMARY KEY,          -- 'amazon:B09X5DK382'
  store           TEXT NOT NULL,
  pid             TEXT NOT NULL,
  url             TEXT NOT NULL,             -- tracking params removed
  title           TEXT,
  image           TEXT,
  created_at      INTEGER NOT NULL,
  last_checked_at INTEGER,                   -- last SUCCESSFUL read: the price is known up to here
  last_attempt_at INTEGER,                   -- last try, successful or not (drives the schedule)
  fail_count      INTEGER NOT NULL DEFAULT 0,
  last_status     TEXT,                      -- ExtractStatus or a fetch error code
  -- Denormalised from the latest point and the sale check, so lists need no history reads.
  price           INTEGER,
  mrp             INTEGER,
  in_stock        INTEGER,
  usual_price     INTEGER,
  real_pct        REAL,
  sale_status     TEXT,
  watchers        INTEGER NOT NULL DEFAULT 0,  -- active alerts (S3)
  views           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS products_due    ON products (store, last_attempt_at);
CREATE INDEX IF NOT EXISTS products_deals  ON products (sale_status, real_pct);
CREATE INDEX IF NOT EXISTS products_recent ON products (created_at);
CREATE INDEX IF NOT EXISTS products_views  ON products (views);

-- A row only when price, M.R.P. or stock state CHANGES (see core/history.ts isChange).
CREATE TABLE IF NOT EXISTS prices (
  key      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  price    INTEGER,
  mrp      INTEGER,
  in_stock INTEGER NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('server', 'extension')),
  PRIMARY KEY (key, at)
) WITHOUT ROWID;

-- Title search. External-content FTS5 kept in step by triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  title, content = 'products', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS products_fts_insert AFTER INSERT ON products BEGIN
  INSERT INTO products_fts (rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER IF NOT EXISTS products_fts_update AFTER UPDATE OF title ON products BEGIN
  INSERT INTO products_fts (products_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
  INSERT INTO products_fts (rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER IF NOT EXISTS products_fts_delete AFTER DELETE ON products BEGIN
  INSERT INTO products_fts (products_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
END;

-- Fixed-window rate limits. bucket = '<action>:<hashed client>:<window start>'.
CREATE TABLE IF NOT EXISTS rate (
  bucket  TEXT PRIMARY KEY,
  count   INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

-- Extension reports that are HELD (a 40%+ move awaiting a second, independent reporter;
-- core/trust.ts). One row per product per reporter (a hashed network address). Swept after 48 h.
CREATE TABLE IF NOT EXISTS reports (
  key      TEXT NOT NULL,
  reporter TEXT NOT NULL,
  at       INTEGER NOT NULL,
  price    INTEGER,
  mrp      INTEGER,
  in_stock INTEGER NOT NULL,
  PRIMARY KEY (key, reporter)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS reports_at ON reports (at);

-- ---- Alerts (S3). Nobody has a password: an OWNER is either a browser (it holds a random
-- device token; we keep only its SHA-256) or a Telegram chat, or both once linked.
CREATE TABLE IF NOT EXISTS owners (
  id            TEXT PRIMARY KEY,           -- random, never shown
  token_hash    TEXT UNIQUE,                -- SHA-256 of the browser's device token; NULL for Telegram-only
  telegram_chat INTEGER UNIQUE,             -- private chat id, once linked
  created_at    INTEGER NOT NULL
);

-- One alert per owner, product and kind (setting a new target replaces the old one).
-- State columns mirror core/types.ts AlertState; core/alerts.ts decides, edge-triggered.
CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  key           TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('below', 'drop', 'in_stock')),
  target        INTEGER,                    -- 'below': paise
  pct           REAL,                       -- 'drop': percent
  armed         INTEGER NOT NULL,
  base_price    INTEGER,
  last_fired_at INTEGER,
  last_message  TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (owner, key, kind)
);
CREATE INDEX IF NOT EXISTS alerts_key ON alerts (key);

-- Browser push subscriptions (Web Push). The endpoint is the push service's URL for one
-- browser; p256dh/auth are that browser's public key and secret, used to encrypt.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_owner ON push_subs (owner);

-- One-time codes that link a Telegram chat to a browser ("Connect Telegram"). Hashed, 15 min.
CREATE TABLE IF NOT EXISTS link_codes (
  code_hash TEXT PRIMARY KEY,
  owner     TEXT NOT NULL,
  expires   INTEGER NOT NULL
);

-- Small settings the Worker learns at run time (the Telegram bot's username, webhook state).
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- ---- Readers as data (P3, BLUEPRINT §6.3 / §20).
-- A D1 HOT-FIX for a store's reader: the newest row for a store and device that passes
-- validateReader replaces the bundled readers/<store>.<device>.json, with no deploy and no
-- client release. Written only by scripts/publish-reader.mjs after a fixture dry-run.
CREATE TABLE IF NOT EXISTS reader_configs (
  store      TEXT NOT NULL,
  device     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  json       TEXT NOT NULL,
  PRIMARY KEY (store, device, created_at)
) WITHOUT ROWID;

-- Every reader version the Worker has served or used, and when it first did: a store that
-- breaks can be lined up against the config change that came just before.
CREATE TABLE IF NOT EXISTS config_log (
  version       TEXT PRIMARY KEY,           -- '<store>.<device>.r<revision>.<content hash>'
  store         TEXT NOT NULL,
  device        TEXT NOT NULL,
  origin        TEXT NOT NULL,              -- 'bundled' | 'd1'
  first_seen_at INTEGER NOT NULL
);

-- Reader health: how readings turned out, counted per hour. No page content, no client id.
CREATE TABLE IF NOT EXISTS reader_health (
  hour           INTEGER NOT NULL,          -- start of the hour, ms
  store          TEXT NOT NULL,
  source         TEXT NOT NULL,             -- 'server' | 'extension' | 'app'
  config_version TEXT NOT NULL,
  reader_version TEXT NOT NULL,             -- 'worker', or the client's version
  outcome        TEXT NOT NULL,             -- priced | unavailable | blocked | unrecognised | a fetch error
  n              INTEGER NOT NULL,
  PRIMARY KEY (hour, store, source, config_version, reader_version, outcome)
) WITHOUT ROWID;

-- ---- Offers on the store's page (P8, BLUEPRINT §15).
-- What the store's own page showed (bank offers, cashback), as read by OUR server only: offer
-- text sent by a client is never stored or shown to anyone else. One row per product, replaced
-- on every server read whose reader reads offers; removed when the page shows none.
CREATE TABLE IF NOT EXISTS product_offers (
  key  TEXT PRIMARY KEY,
  at   INTEGER NOT NULL,
  json TEXT NOT NULL                         -- [{title, text, count}] from core/interpret.ts readOffers
);
