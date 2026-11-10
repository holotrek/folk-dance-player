import type { Migration } from '../migrate'

// Clearing "Previously played" (1.0.0 spec §3.6) hides the program's play log rather than deleting
// it: entries logged at or before this mark are left out of the list. NULL means never cleared.
export const logCleared: Migration = {
  version: 8,
  name: 'log-cleared',
  sql: `ALTER TABLE programs ADD COLUMN log_cleared_at TEXT;`
}
