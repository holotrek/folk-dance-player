import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../db/transaction'

// Spec §10.1 "Program pre-check": when a program is loaded (and at startup), every file it still
// has to play is checked, so missing files are flagged before the event. A file that has come
// back is unflagged. Returns the ids of the missing files.
export function checkProgramFiles(
  db: DatabaseSync,
  programId: number,
  exists: (path: string) => boolean = existsSync
): number[] {
  const files = db
    .prepare(
      `SELECT DISTINCT f.id, f.path, f.is_missing AS isMissing FROM program_items pi
       JOIN files f ON f.id = pi.file_id
       WHERE pi.program_id = ? AND pi.played_at IS NULL`
    )
    .all(programId) as { id: number; path: string; isMissing: number }[]
  const missing: number[] = []
  inTransaction(db, () => {
    const flag = db.prepare(
      "UPDATE files SET is_missing = 1, missing_reason = 'not_found' WHERE id = ?"
    )
    const unflag = db.prepare('UPDATE files SET is_missing = 0, missing_reason = NULL WHERE id = ?')
    for (const file of files) {
      if (exists(file.path)) {
        if (file.isMissing) unflag.run(file.id)
      } else {
        missing.push(file.id)
        if (!file.isMissing) flag.run(file.id)
      }
    }
  })
  return missing
}
