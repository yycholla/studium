PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  selected_character_key TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE characters (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  persistent_key TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  name TEXT NOT NULL,
  home_world TEXT NOT NULL,
  data_center TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (account_id, persistent_key)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE TABLE oauth_flows (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_flows_expiry ON oauth_flows(expires_at);
