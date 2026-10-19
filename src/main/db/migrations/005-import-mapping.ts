import type { Migration } from '../migrate'

// One stored old choice (what a tag was sent to), or null when it isn't stored or isn't valid.
const old = (key: string): string => `(
  SELECT CASE WHEN json_valid(value) THEN
    CASE WHEN json_extract(value, '$') IN ('artist', 'teacher', 'choreographer', 'ignore')
      THEN json_extract(value, '$') END
  END FROM settings WHERE key = '${key}')`

// The import mapping asked "where does each tag go?", which allowed two tags to feed one field. It
// now asks, for each destination, which tag feeds it (0.3.0 spec §3.4). A destination takes the tag
// that went to it; where both did, the Artist tag keeps it. Nothing is written for a library that
// never changed the mapping, so it keeps following the defaults.
export const importMapping: Migration = {
  version: 5,
  name: 'import-mapping',
  sql: `
    INSERT INTO settings (key, value)
    SELECT 'import.' || d.name || 'From',
      json_quote(CASE WHEN o.a = d.name THEN 'artistTag'
                      WHEN o.b = d.name THEN 'albumArtistTag'
                      ELSE 'ignore' END)
    FROM (SELECT 'artist' AS name UNION ALL SELECT 'teacher' UNION ALL SELECT 'choreographer') d,
      (SELECT COALESCE(${old('import.artistTagTarget')}, 'artist') AS a,
              COALESCE(${old('import.albumArtistTagTarget')}, 'ignore') AS b) o
    WHERE EXISTS (
      SELECT 1 FROM settings
      WHERE key IN ('import.artistTagTarget', 'import.albumArtistTagTarget'))
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;
    DELETE FROM settings WHERE key IN ('import.artistTagTarget', 'import.albumArtistTagTarget');
  `
}
