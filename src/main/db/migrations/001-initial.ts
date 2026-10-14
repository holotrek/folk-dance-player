import type { Migration } from '../migrate'

const now = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

// Frozen copy of FOLD_MAP (src/main/db/fts.ts) as of this migration: letters the FTS tokenizer
// doesn't fold. Released migrations never change; a later migration must rebuild library_fts to
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

// Re-indexes the songs whose ids are produced by `songIds` (a SQL expression or subquery):
// one library_fts row per song with its title and artist plus, for every linked dance, its
// name, country, choreographer and the pairing's teacher (spec §4 "Search").
const linked = (column: string, join = ''): string =>
  `(SELECT group_concat(${column}, ' ') FROM dance_songs ds JOIN dances d ON d.id = ds.dance_id ${join} WHERE ds.song_id = s.id)`

const reindexSongs = (songIds: string): string => `
      DELETE FROM library_fts WHERE rowid IN (${songIds});
      INSERT INTO library_fts (rowid, title, artist, dance_names, countries, choreographers, teachers)
      SELECT s.id, ${fold('s.title')}, ${fold('s.artist')},
        ${fold(linked('d.name'))}, ${fold(linked('d.country'))}, ${fold(linked('d.choreographer'))},
        ${fold(linked('p.teacher', 'JOIN dance_song_prefs p ON p.dance_song_id = ds.id'))}
      FROM songs s WHERE s.id IN (${songIds});`

// Full v1 schema — spec §4. Layers: local file facts (files); shareable facts (songs, dances,
// dance_songs); personal/local data (song_prefs, dance_prefs, dance_song_prefs, file_prefs,
// canva_decks, slide_cache, playlists).
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
      artist TEXT
    );

    CREATE TABLE dances (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      country TEXT,
      choreographer TEXT,
      dance_type TEXT
    );
    CREATE INDEX dances_name ON dances (name);

    CREATE TABLE dance_songs (
      id INTEGER PRIMARY KEY,
      dance_id INTEGER NOT NULL REFERENCES dances (id) ON DELETE CASCADE,
      song_id INTEGER NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT ${now},
      UNIQUE (dance_id, song_id)
    );
    CREATE INDEX dance_songs_song ON dance_songs (song_id);

    CREATE TABLE song_prefs (
      song_id INTEGER PRIMARY KEY REFERENCES songs (id) ON DELETE CASCADE,
      default_dance_id INTEGER REFERENCES dances (id) ON DELETE SET NULL
    );

    CREATE TABLE canva_decks (
      id INTEGER PRIMARY KEY,
      view_url TEXT NOT NULL UNIQUE,
      design_id TEXT NOT NULL,
      title TEXT,
      pages TEXT NOT NULL DEFAULT '[]',
      synced_at TEXT,
      last_error TEXT
    );

    CREATE TABLE dance_prefs (
      dance_id INTEGER PRIMARY KEY REFERENCES dances (id) ON DELETE CASCADE,
      difficulty INTEGER CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5),
      notes TEXT,
      canva_deck_id INTEGER REFERENCES canva_decks (id) ON DELETE SET NULL,
      canva_page_id TEXT,
      canva_page_index INTEGER CHECK (canva_page_index IS NULL OR canva_page_index >= 1)
    );

    CREATE TABLE dance_song_prefs (
      dance_song_id INTEGER PRIMARY KEY REFERENCES dance_songs (id) ON DELETE CASCADE,
      teacher TEXT
    );

    CREATE TABLE file_prefs (
      file_id INTEGER PRIMARY KEY REFERENCES files (id) ON DELETE CASCADE,
      is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
      in_holding INTEGER NOT NULL DEFAULT 0 CHECK (in_holding IN (0, 1))
    );

    CREATE TABLE slide_cache (
      deck_id INTEGER NOT NULL REFERENCES canva_decks (id) ON DELETE CASCADE,
      page_id TEXT NOT NULL,
      image_path TEXT,
      captured_at TEXT,
      last_error TEXT,
      PRIMARY KEY (deck_id, page_id)
    );

    CREATE VIRTUAL TABLE library_fts USING fts5 (
      title, artist, dance_names, countries, choreographers, teachers,
      content = '', contentless_delete = 1,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER library_fts_song_insert AFTER INSERT ON songs BEGIN
      ${reindexSongs('new.id')}
    END;
    CREATE TRIGGER library_fts_song_update AFTER UPDATE ON songs BEGIN
      ${reindexSongs('new.id')}
    END;
    CREATE TRIGGER library_fts_song_delete AFTER DELETE ON songs BEGIN
      DELETE FROM library_fts WHERE rowid = old.id;
    END;
    CREATE TRIGGER library_fts_dance_update AFTER UPDATE ON dances BEGIN
      ${reindexSongs('SELECT song_id FROM dance_songs WHERE dance_id = new.id')}
    END;
    CREATE TRIGGER library_fts_link_insert AFTER INSERT ON dance_songs BEGIN
      ${reindexSongs('new.song_id')}
    END;
    CREATE TRIGGER library_fts_link_delete AFTER DELETE ON dance_songs BEGIN
      ${reindexSongs('old.song_id')}
    END;
    CREATE TRIGGER library_fts_teacher_insert AFTER INSERT ON dance_song_prefs BEGIN
      ${reindexSongs('SELECT song_id FROM dance_songs WHERE id = new.dance_song_id')}
    END;
    CREATE TRIGGER library_fts_teacher_update AFTER UPDATE ON dance_song_prefs BEGIN
      ${reindexSongs('SELECT song_id FROM dance_songs WHERE id = new.dance_song_id')}
    END;
    CREATE TRIGGER library_fts_teacher_delete AFTER DELETE ON dance_song_prefs BEGIN
      ${reindexSongs('SELECT song_id FROM dance_songs WHERE id = old.dance_song_id')}
    END;

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
    CREATE INDEX playlist_items_file ON playlist_items (file_id);

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
      dance_id INTEGER REFERENCES dances (id) ON DELETE SET NULL,
      played_at TEXT,
      CHECK (kind = 'track' OR (file_id IS NULL AND dance_id IS NULL))
    );
    CREATE INDEX program_items_order ON program_items (program_id, position);
    CREATE INDEX program_items_file ON program_items (file_id);

    CREATE TABLE play_log (
      id INTEGER PRIMARY KEY,
      file_id INTEGER REFERENCES files (id) ON DELETE SET NULL,
      dance_id INTEGER REFERENCES dances (id) ON DELETE SET NULL,
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
