import { existsSync } from 'fs'
import type { DatabaseSync } from 'node:sqlite'
import type { ReviewAction } from '@shared/apple-sync'
import type { ImportSummaryItem } from '@shared/import'
import { inTransaction } from '../db/transaction'

// "Removed from Apple Music" (sync spec §5.5, §6.2): songs Music no longer has that the organizer
// hasn't decided about. A removed song keeps 'gone' but has left the list.
const IN_REVIEW = "apple_sync = 'gone' AND removed_at IS NULL"

// After every file is saved: synced songs whose track is no longer in the snapshot go to the review
// list, and every song there notes whether its file is still on disk. Returns the newly gone songs,
// and whether any song's missing state changed (the lists then refresh, quietly).
export function markGone(
  db: DatabaseSync,
  livePids: ReadonlySet<string>,
  exists: (path: string) => boolean = existsSync
): { gone: ImportSummaryItem[]; missingChanged: boolean } {
  const rows = db
    .prepare(
      `SELECT id, path, apple_persistent_id AS pid, apple_sync AS sync, is_missing AS missing
       FROM files WHERE apple_sync IN ('synced', 'gone') AND removed_at IS NULL`
    )
    .all() as {
    id: number
    path: string
    pid: string | null
    sync: 'synced' | 'gone'
    missing: number
  }[]
  const update = db.prepare(
    "UPDATE files SET apple_sync = 'gone', is_missing = ?, missing_reason = ? WHERE id = ?"
  )
  const gone: ImportSummaryItem[] = []
  let missingChanged = false
  for (const row of rows) {
    if (row.pid !== null && livePids.has(row.pid)) continue
    const missing = exists(row.path) ? 0 : 1
    update.run(missing, missing ? 'not_found' : null, row.id)
    if (missing !== row.missing) missingChanged = true
    if (row.sync === 'synced') gone.push({ path: row.path })
  }
  return { gone, missingChanged }
}

// For the shrink check (AppleSync): how many synced songs a snapshot would send to review
// (`inSnapshot` holds every persistent ID it has), of how many synced songs.
export function goneEstimate(
  db: DatabaseSync,
  inSnapshot: ReadonlySet<string>
): { gone: number; synced: number } {
  const pids = db
    .prepare(
      "SELECT apple_persistent_id AS pid FROM files WHERE apple_sync = 'synced' AND removed_at IS NULL"
    )
    .all()
    .map((r) => r.pid as string | null)
  return { gone: pids.filter((p) => p === null || !inSnapshot.has(p)).length, synced: pids.length }
}

export function reviewCount(db: DatabaseSync): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM files WHERE ${IN_REVIEW}`).get() as { n: number }).n
}

// Remove: the soft delete (§6.4). Keep: an ordinary local song from now on.
const ACTION_SQL: Record<ReviewAction, string> = {
  remove: 'removed_at = ?',
  keep: 'apple_sync = NULL'
}

export function resolveReview(
  db: DatabaseSync,
  fileIds: number[],
  action: ReviewAction,
  now: string
): void {
  inTransaction(db, () => {
    const update = db.prepare(
      `UPDATE files SET ${ACTION_SQL[action]} WHERE id = ? AND ${IN_REVIEW}`
    )
    for (const id of fileIds) {
      if (action === 'remove') update.run(now, id)
      else update.run(id)
    }
  })
}

export function resolveAllReview(db: DatabaseSync, action: ReviewAction, now: string): void {
  const update = db.prepare(`UPDATE files SET ${ACTION_SQL[action]} WHERE ${IN_REVIEW}`)
  if (action === 'remove') update.run(now)
  else update.run()
}

// Turning sync off (§5.9): songs become local (gone songs leave the list as kept), removed songs
// stay removed, and mirrors become editable local playlists. Persistent IDs stay, so turning sync on
// again re-adopts them.
export function disableSync(db: DatabaseSync): void {
  inTransaction(db, () => {
    db.prepare(
      'UPDATE files SET apple_sync = NULL WHERE apple_sync IS NOT NULL AND removed_at IS NULL'
    ).run()
    db.prepare('UPDATE playlists SET apple_sync = 0 WHERE apple_sync = 1').run()
  })
}
