CREATE TABLE group_roster_previews (
  group_id TEXT PRIMARY KEY REFERENCES collection_groups(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE group_public_characters (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES collection_groups(id) ON DELETE CASCADE,
  lodestone_id TEXT NOT NULL,
  name TEXT NOT NULL,
  home_world TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('friends','fc')),
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  checked_at INTEGER,
  next_check_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id,lodestone_id)
);
