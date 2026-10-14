import type { Migration } from '../migrate'

// Pairs of same-named dances the user confirmed are different ("Different dance" on a same-name
// suggestion, spec §6.3), so the suggestion isn't shown again. Stored once per pair, smaller id first.
export const distinctDances: Migration = {
  version: 2,
  name: 'distinct-dances',
  sql: `
    CREATE TABLE distinct_dances (
      dance_a INTEGER NOT NULL REFERENCES dances (id) ON DELETE CASCADE,
      dance_b INTEGER NOT NULL REFERENCES dances (id) ON DELETE CASCADE,
      PRIMARY KEY (dance_a, dance_b),
      CHECK (dance_a < dance_b)
    );
    CREATE INDEX distinct_dances_b ON distinct_dances (dance_b);
  `
}
