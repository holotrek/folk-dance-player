import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../db/transaction'
import { defaultDanceOf, holdPairs, releaseHolding } from '../library/holding'
import { place, removeItems, requireProgram, touch } from './programs'

// Moving songs between a program and Holding (0.3.0 spec §3.12). Each is one transaction, so a
// song is never in both places or neither.

// Holds the songs of the given program items, each with the dance of its item (the song's default
// when the item has none), before the held row `before` or at the end, and takes the items out of
// the program. A pair that is already held stays where it is (the item is just removed). STOP
// markers, played items and unknown ids are left alone.
export function moveToHolding(
  db: DatabaseSync,
  programId: number,
  itemIds: number[],
  before: number | null
): void {
  inTransaction(db, () => {
    requireProgram(db, programId)
    const wanted = new Set(itemIds)
    const rows = (
      db
        .prepare(
          `SELECT id, file_id AS fileId, dance_id AS danceId FROM program_items
           WHERE program_id = ? AND kind = 'track' AND played_at IS NULL ORDER BY position, id`
        )
        .all(programId) as unknown as { id: number; fileId: number; danceId: number | null }[]
    ).filter((r) => wanted.has(r.id))
    holdPairs(
      db,
      rows.map((r) => [r.fileId, r.danceId ?? defaultDanceOf(db, r.fileId)]),
      before,
      false
    )
    removeItems(
      db,
      programId,
      rows.map((r) => r.id)
    )
  })
}

// Adds held songs to the program, each as the dance it is held as, before the item `before` or at
// the end, and releases them. They join in the order they were held. Returns the new item ids.
export function moveFromHolding(
  db: DatabaseSync,
  programId: number,
  holdingIds: number[],
  before: number | null
): number[] {
  return inTransaction(db, () => {
    requireProgram(db, programId)
    const wanted = new Set(holdingIds)
    const rows = (
      db
        .prepare(
          'SELECT id, file_id AS fileId, dance_id AS danceId FROM holding_items ORDER BY position, id'
        )
        .all() as unknown as { id: number; fileId: number; danceId: number | null }[]
    ).filter((r) => wanted.has(r.id))
    const insert = db.prepare(
      "INSERT INTO program_items (program_id, position, kind, file_id, dance_id) VALUES (?, 0, 'track', ?, ?)"
    )
    const added = rows.map((r) =>
      Number(insert.run(programId, r.fileId, r.danceId).lastInsertRowid)
    )
    place(db, programId, added, before)
    touch(db, programId)
    releaseHolding(
      db,
      rows.map((r) => r.id)
    )
    return added
  })
}
