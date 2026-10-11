CREATE TABLE collection_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('friends', 'fc', 'party')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  invite_hash TEXT NOT NULL UNIQUE,
  invite_expires_at INTEGER NOT NULL
);
CREATE INDEX collection_groups_owner ON collection_groups(owner_id);
CREATE INDEX collection_groups_expiry ON collection_groups(expires_at);
CREATE TABLE collection_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES collection_groups(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lodestone_id TEXT NOT NULL,
  share_collections INTEGER NOT NULL CHECK (share_collections IN (0, 1)),
  share_wishlist INTEGER NOT NULL CHECK (share_wishlist IN (0, 1)),
  joined_at INTEGER NOT NULL,
  UNIQUE (group_id, account_id),
  UNIQUE (group_id, lodestone_id)
);
CREATE INDEX collection_members_account ON collection_members(account_id);
