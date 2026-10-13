import type { Migration } from '../migrate'

const now = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

// Frozen copy of FOLD_MAP (src/main/db/fts.ts) as of this migration: letters the FTS tokenizer
// doesn't fold. Released migrations never change; a later migration must rebuild songs_fts to
// change folding. schema.test.ts checks this list covers FOLD_MAP.
const FOLD: readonly (readonly [string, string])[] = [
  ['ı', 'i'],
  ['ł', 'l'],
  ['Ł', 'L'],
  ['ø', 'o'],
  ['Ø', 'O'],
  ['æ', 'ae'],
  ['Æ', 'AE'],
  ['œ', 'oe'],
  ['Œ', 'OE'],
  ['ß', 'ss'],
  ['ẞ', 'SS'],
  ['đ', 'd'],
  ['Đ', 'D'],
  ['ð', 'd'],
  ['Ð', 'D'],
  ['þ', 'th'],
  ['Þ', 'TH']
]

const fold = (expr: string): string =>
  FOLD.reduce((sql, [from, to]) => `replace(${sql}, '${from}', '${to}')`, expr)

const ftsValues = (row: 'new'): string =>
  [
    `${row}.id`,
    ...['title', 'teacher', 'choreographer', 'country', 'artist'].map((c) => fold(`${row}.${c}`))
  ].join(', ')

// Full v1 schema — spec §4. Three layers: local file facts (files), shareable song facts (songs),
// personal/local data (file_prefs, playlists, slide_cache).
export const initial: Migration = {
  version: 1,
  name: 'initial',
  sql: `
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      duration_ms INTEGER,
      content_hash TEXT,
      tag_title TEXT,
      tag_artist TEXT,
      tag_album_artist TEXT,
      tag_genre TEXT,
      source TEXT NOT NULL CHECK (source IN ('files', 'apple_xml')),
      apple_persistent_id TEXT,
      is_missing INTEGER NOT NULL DEFAULT 0 CHECK (is_missing IN (0, 1)),
      missing_reason TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE INDEX files_content_hash ON files (content_hash);
    CREATE UNIQUE INDEX files_apple_persistent_id ON files (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    CREATE TABLE songs (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL UNIQUE REFERENCES files (id) ON DELETE CASCADE,
      uuid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT,
      teacher TEXT,
      choreographer TEXT,
      country TEXT,
      dance_type TEXT,
      canva_url TEXT,
      canva_page INTEGER CHECK (canva_page IS NULL OR canva_page >= 1)
    );

    CREATE VIRTUAL TABLE songs_fts USING fts5 (
      title, teacher, choreographer, country, artist,
      content = '', contentless_delete = 1,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER songs_fts_insert AFTER INSERT ON songs BEGIN
      INSERT INTO songs_fts (rowid, title, teacher, choreographer, country, artist)
      VALUES (${ftsValues('new')});
    END;
    CREATE TRIGGER songs_fts_delete AFTER DELETE ON songs BEGIN
      DELETE FROM songs_fts WHERE rowid = old.id;
    END;
    CREATE TRIGGER songs_fts_update AFTER UPDATE ON songs BEGIN
      DELETE FROM songs_fts WHERE rowid = old.id;
      INSERT INTO songs_fts (rowid, title, teacher, choreographer, country, artist)
      VALUES (${ftsValues('new')});
    END;

    CREATE TABLE file_prefs (
      file_id INTEGER PRIMARY KEY REFERENCES files (id) ON DELETE CASCADE,
      is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
      in_holding INTEGER NOT NULL DEFAULT 0 CHECK (in_holding IN (0, 1)),
      difficulty INTEGER CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5)
    );

    CREATE TABLE slide_cache (
      canva_url TEXT NOT NULL,
      canva_page INTEGER NOT NULL,
      image_path TEXT,
      captured_at TEXT,
      last_error TEXT,
      PRIMARY KEY (canva_url, canva_page)
    );

    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'apple_xml')),
      apple_persistent_id TEXT,
      imported_at TEXT,
      modified_at TEXT NOT NULL DEFAULT ${now},
      created_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE UNIQUE INDEX playlists_apple_persistent_id ON playlists (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    CREATE TABLE playlist_items (
      id INTEGER PRIMARY KEY,
      playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE
    );
    CREATE INDEX playlist_items_order ON playlist_items (playlist_id, position);

    CREATE TABLE programs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${now},
      updated_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE INDEX programs_recent ON programs (updated_at DESC);

    CREATE TABLE program_items (
      id INTEGER PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('track', 'stop')),
      file_id INTEGER REFERENCES files (id) ON DELETE SET NULL,
      played_at TEXT,
      CHECK (kind = 'track' OR file_id IS NULL)
    );
    CREATE INDEX program_items_order ON program_items (program_id, position);

    CREATE TABLE play_log (
      id INTEGER PRIMARY KEY,
      file_id INTEGER REFERENCES files (id) ON DELETE SET NULL,
      played_at TEXT NOT NULL DEFAULT ${now},
      program_id INTEGER REFERENCES programs (id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('program', 'preview', 'replay'))
    );
    CREATE INDEX play_log_program ON play_log (program_id, played_at DESC);
    CREATE INDEX play_log_file ON play_log (file_id, played_at DESC);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `
}
