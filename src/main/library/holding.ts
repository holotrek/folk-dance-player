import type { DatabaseSync } from 'node:sqlite'
import type { HoldingItem } from '@shared/program'
import { inTransaction } from '../db/transaction'
import { TRACK_COLUMNS, toTrack, trackJoins, type TrackRow } from '../programs/tracks'
import { LibraryEditError } from './edit'
import { shownPairingSql } from './list'

// Holding (spec §3, §6.2; 0.3.0 spec §3.12): songs set aside for this session, as song-and-dance
// pairs in the order they were placed. The same pair is held once (a unique index); one song may be
// held once for each of its dances.

// The dance a song is held as when none is chosen: the one the library shows for it (its default
// dance, else its first-linked one), or none for a song with no dance.
export function defaultDanceOf(db: DatabaseSync, fileId: number): number | null {
  const row = db
    .prepare(
      `SELECT p.dance_id AS id FROM songs s JOIN dance_songs p ON p.id = ${shownPairingSql('s.id')}
       WHERE s.file_id = ?`
    )
    .get(fileId) as { id: number } | undefined
  return row?.id ?? null
}

type HoldingRow = { id: number } & TrackRow

// The held songs in order, each with the dance it is held as. Removed songs are listed too (they
// show greyed, as in the program).
export function listHolding(db: DatabaseSync): HoldingItem[] {
  const rows = db
    .prepare(
      `SELECT h.id, ${TRACK_COLUMNS}
       FROM holding_items h
       JOIN files f ON f.id = h.file_id
       JOIN songs s ON s.file_id = f.id
       ${trackJoins('h.dance_id')}
       ORDER BY h.position, h.id`
    )
    .all() as unknown as HoldingRow[]
  return rows.map(({ id, ...track }) => ({ id, ...toTrack(track as TrackRow) }))
}

const heldIds = (db: DatabaseSync): number[] =>
  db
    .prepare('SELECT id FROM holding_items ORDER BY position, id')
    .all()
    .map((r) => r.id as number)

const renumber = (db: DatabaseSync, order: number[]): void => {
  const set = db.prepare('UPDATE holding_items SET position = ? WHERE id = ?')
  order.forEach((id, i) => set.run(i + 1, id))
}

// Puts `moving` (in the order given) before the held row `before`, or at the end. Dropping rows on
// one of themselves leaves them where they are: they go before the first row after `before` that
// isn't moving.
function place(db: DatabaseSync, moving: number[], before: number | null): void {
  const order = heldIds(db)
  const going = new Set(moving)
  const rest = order.filter((id) => !going.has(id))
  let at = rest.length
  if (before !== null) {
    const next = order.slice(Math.max(order.indexOf(before), 0)).find((id) => !going.has(id))
    if (order.includes(before) && next !== undefined) at = rest.indexOf(next)
  }
  rest.splice(at, 0, ...moving.filter((id) => order.includes(id)))
  renumber(db, rest)
}

const pairId = (db: DatabaseSync, fileId: number, danceId: number | null): number | null => {
  const row = db
    .prepare('SELECT id FROM holding_items WHERE file_id = ? AND COALESCE(dance_id, 0) = ?')
    .get(fileId, danceId ?? 0) as { id: number } | undefined
  return row?.id ?? null
}

// Holds songs, each as its default dance, before the held row `before` or at the end. A pair that
// is already held moves to the new spot instead of being held twice. Returns the held rows, in the
// order given.
export function holdSongs(db: DatabaseSync, fileIds: number[], before: number | null): number[] {
  return inTransaction(db, () =>
    holdPairs(
      db,
      fileIds.map((fileId) => [fileId, defaultDanceOf(db, fileId)]),
      before
    )
  )
}

// Holds the given song-and-dance pairs (`danceId` already resolved), as `holdSongs` does. With
// `moveExisting` false, a pair that is already held stays where it is and is left out of the result.
export function holdPairs(
  db: DatabaseSync,
  pairs: [fileId: number, danceId: number | null][],
  before: number | null,
  moveExisting = true
): number[] {
  const insert = db.prepare(
    'INSERT INTO holding_items (file_id, dance_id, position) VALUES (?, ?, 0)'
  )
  const hasSong = db.prepare('SELECT 1 FROM songs WHERE file_id = ?')
  const ids: number[] = []
  for (const [fileId, danceId] of pairs) {
    if (!hasSong.get(fileId)) continue
    const held = pairId(db, fileId, danceId)
    if (held !== null && !moveExisting) continue
    const id = held ?? Number(insert.run(fileId, danceId).lastInsertRowid)
    if (!ids.includes(id)) ids.push(id)
  }
  place(db, ids, before)
  return ids
}

// Reorders held rows: they move together, keeping the order they had.
export function moveHolding(db: DatabaseSync, itemIds: number[], before: number | null): void {
  inTransaction(db, () => {
    const going = new Set(itemIds)
    place(
      db,
      heldIds(db).filter((id) => going.has(id)),
      before
    )
  })
}

export function releaseHolding(db: DatabaseSync, itemIds: number[]): void {
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM holding_items WHERE id = ?')
    for (const id of itemIds) remove.run(id)
    renumber(db, heldIds(db))
  })
}

// Changes the dance a held song is held as. The same pair can't be held twice.
export function setHoldingDance(db: DatabaseSync, itemId: number, danceId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare('SELECT file_id AS fileId FROM holding_items WHERE id = ?')
      .get(itemId) as { fileId: number } | undefined
    if (!item) throw new LibraryEditError('That song is no longer in Holding.')
    const held = pairId(db, item.fileId, danceId)
    if (held !== null && held !== itemId) {
      throw new LibraryEditError('That song is already held as that dance.')
    }
    db.prepare('UPDATE holding_items SET dance_id = ? WHERE id = ?').run(danceId, itemId)
  })
}
