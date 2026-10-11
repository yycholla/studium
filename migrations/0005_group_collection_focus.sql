ALTER TABLE collection_groups ADD COLUMN collection_focus TEXT NOT NULL DEFAULT 'all'
  CHECK (collection_focus IN ('all', 'mounts', 'minions', 'emotes', 'facewear'));
