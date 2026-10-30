import type { Migration } from '../migrate'

// Holding holds song-and-dance pairs (0.3.0 spec §3.12), in the order they were placed, in their
// own table instead of a flag on `file_prefs`. A held song keeps the dance it was moved with, so
// the same song may be held once for each dance, never twice for the same one (the unique index;
// `COALESCE` makes a song with no dance one pair too). A dance that goes takes its held pairs with
// it. Songs held before are copied over in their saved order, each as the dance the library shows
// for it (its default dance, else its first-linked one, else none); then the old columns go.
export const holdingItems: Migration = {
  version: 7,
  name: 'holding-items',
  sql: `
    CREATE TABLE holding_items (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
      dance_id INTEGER REFERENCES dances (id) ON DELETE CASCADE,
      position INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX holding_pair ON holding_items (file_id, COALESCE(dance_id, 0));

    INSERT INTO holding_items (file_id, dance_id, position)
    SELECT fp.file_id,
      (SELECT ds.dance_id FROM dance_songs ds WHERE ds.id = COALESCE(
         (SELECT x.id FROM dance_songs x JOIN song_prefs sp
            ON sp.song_id = x.song_id AND sp.default_dance_id = x.dance_id
          WHERE x.song_id = s.id),
         (SELECT x.id FROM dance_songs x WHERE x.song_id = s.id ORDER BY x.id LIMIT 1))),
      ROW_NUMBER() OVER (ORDER BY fp.holding_position, fp.file_id)
    FROM file_prefs fp JOIN songs s ON s.file_id = fp.file_id
    WHERE fp.in_holding = 1;

    ALTER TABLE file_prefs DROP COLUMN in_holding;
    ALTER TABLE file_prefs DROP COLUMN holding_position;
  `
}
