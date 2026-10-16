import type { DatabaseSync } from 'node:sqlite'
import type { LibraryStats } from '@shared/contract'

export function getLibraryStats(db: DatabaseSync): LibraryStats {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM files WHERE is_missing = 0 AND removed_at IS NULL')
    .get() as {
    n: number
  }
  return { fileCount: row.n }
}
