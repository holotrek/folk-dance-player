import type { Migration } from '../migrate'

// Sync with Apple Music (sync spec §4). Columns instead of new `source` values: `source` has a CHECK
// constraint SQLite can't change without rebuilding the table, and it keeps saying where a row first
// came from; `apple_sync` says whether Music owns it now.
// files.apple_sync: NULL not synced, 'synced' follows Music, 'gone' Music no longer has it.
// files.removed_at: the soft delete; files.sync_baseline: JSON of the mapped values sync last wrote.
export const appleSync: Migration = {
  version: 4,
  name: 'apple-sync',
  sql: `
    ALTER TABLE files ADD COLUMN apple_sync TEXT
      CHECK (apple_sync IS NULL OR apple_sync IN ('synced', 'gone'));
    ALTER TABLE files ADD COLUMN removed_at TEXT;
    ALTER TABLE files ADD COLUMN sync_baseline TEXT;
    CREATE INDEX files_apple_sync ON files (apple_sync) WHERE apple_sync IS NOT NULL;

    CREATE TABLE playlist_folders (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES playlist_folders (id) ON DELETE CASCADE,
      apple_persistent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX playlist_folders_apple_persistent_id ON playlist_folders (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    ALTER TABLE playlists ADD COLUMN apple_sync INTEGER NOT NULL DEFAULT 0
      CHECK (apple_sync IN (0, 1));
    ALTER TABLE playlists ADD COLUMN folder_id INTEGER
      REFERENCES playlist_folders (id) ON DELETE SET NULL;
  `
}
