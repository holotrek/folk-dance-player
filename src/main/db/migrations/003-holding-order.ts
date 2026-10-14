import type { Migration } from '../migrate'

// Held songs keep the order they were placed in (spec §6.2: drop to slot in, or at the end).
// Songs already held are numbered in title order.
export const holdingOrder: Migration = {
  version: 3,
  name: 'holding-order',
  sql: `
    ALTER TABLE file_prefs ADD COLUMN holding_position INTEGER;
    UPDATE file_prefs SET holding_position = (
      SELECT r.n FROM (
        SELECT fp.file_id AS fileId,
          ROW_NUMBER() OVER (ORDER BY s.title COLLATE NOCASE, fp.file_id) AS n
        FROM file_prefs fp LEFT JOIN songs s ON s.file_id = fp.file_id
        WHERE fp.in_holding = 1
      ) r
      WHERE r.fileId = file_prefs.file_id
    )
    WHERE in_holding = 1;
  `
}
