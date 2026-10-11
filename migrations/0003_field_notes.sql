CREATE TABLE field_catalogs (
  kind TEXT PRIMARY KEY,
  payload TEXT,
  fetched_at INTEGER,
  next_check_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE field_collections (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lodestone_id TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  checked_at INTEGER,
  next_check_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, lodestone_id)
);
-- Keep goals across XIVAuth's replacement of character rows during refresh.
-- Every read/write also checks the account's currently authorized characters.
CREATE TABLE field_goals (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lodestone_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, lodestone_id, kind, item_id)
);
