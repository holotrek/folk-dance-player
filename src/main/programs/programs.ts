import type { DatabaseSync } from 'node:sqlite'
import type { ProgramDetail, ProgramItem, ProgramSummary } from '@shared/program'
import { playTime, type TimedItem } from '@shared/program-time'
import { inTransaction } from '../db/transaction'
import { shownPairingSql } from '../library/list'
import { TRACK_COLUMNS, toTrack, trackJoins, type TrackRow } from './tracks'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

// A rule a program edit broke; the message is shown to the operator.
export class ProgramError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgramError'
  }
}

function cleanName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new ProgramError("A program name can't be empty.")
  return trimmed
}

// Every change to a program or its items bumps updated_at, which orders the sidebar (spec §4).
const touch = (db: DatabaseSync, programId: number): void => {
  db.prepare(`UPDATE programs SET updated_at = ${NOW} WHERE id = ?`).run(programId)
}

function requireProgram(db: DatabaseSync, programId: number): void {
  if (!db.prepare('SELECT 1 FROM programs WHERE id = ?').get(programId)) {
    throw new ProgramError('That program no longer exists.')
  }
}

// Spec §6.1: newest edit first, filtered by name as you type.
export function listPrograms(db: DatabaseSync, search = ''): ProgramSummary[] {
  const text = search.trim().toLowerCase()
  const summaries = db
    .prepare(
      `SELECT p.id, p.name, p.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM program_items i
          WHERE i.program_id = p.id AND i.kind = 'track' AND i.played_at IS NULL) AS unplayedCount
       FROM programs p
       WHERE ? = '' OR instr(lower(p.name), ?) > 0
       ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all(text, text) as unknown as Omit<ProgramSummary, 'unplayedDurationMs' | 'unplayedGaps'>[]
  const items = new Map<number, TimedItem[]>()
  const unplayed = db
    .prepare(
      `SELECT i.program_id AS programId, i.kind, f.duration_ms AS durationMs,
         COALESCE(f.is_missing, 0) AS isMissing, (f.removed_at IS NOT NULL) AS isRemoved
       FROM program_items i LEFT JOIN files f ON f.id = i.file_id
       WHERE i.played_at IS NULL
       ORDER BY i.program_id, i.position`
    )
    .all() as unknown as {
    programId: number
    kind: 'track' | 'stop'
    durationMs: number | null
    isMissing: number
    isRemoved: number
  }[]
  for (const row of unplayed) {
    const list = items.get(row.programId) ?? []
    list.push(
      row.kind === 'stop'
        ? { kind: 'stop' }
        : {
            kind: 'track',
            durationMs: row.durationMs,
            isMissing: row.isMissing === 1,
            isRemoved: row.isRemoved === 1
          }
    )
    items.set(row.programId, list)
  }
  return summaries.map((s) => {
    const time = playTime(items.get(s.id) ?? [])
    return { ...s, unplayedDurationMs: time.durationMs, unplayedGaps: time.gaps }
  })
}

export function createProgram(db: DatabaseSync, name: string): number {
  return Number(
    db.prepare('INSERT INTO programs (name) VALUES (?)').run(cleanName(name)).lastInsertRowid
  )
}

export function renameProgram(db: DatabaseSync, programId: number, name: string): void {
  requireProgram(db, programId)
  db.prepare(`UPDATE programs SET name = ?, updated_at = ${NOW} WHERE id = ?`).run(
    cleanName(name),
    programId
  )
}

export function deleteProgram(db: DatabaseSync, programId: number): void {
  db.prepare('DELETE FROM programs WHERE id = ?').run(programId)
}

// A fresh copy to run again: every item, all unplayed. The original keeps its record.
export function duplicateProgram(db: DatabaseSync, programId: number): number {
  return inTransaction(db, () => {
    const source = db.prepare('SELECT name FROM programs WHERE id = ?').get(programId) as
      { name: string } | undefined
    if (!source) throw new ProgramError('That program no longer exists.')
    const copy = createProgram(db, `${source.name} copy`)
    db.prepare(
      `INSERT INTO program_items (program_id, position, kind, file_id, dance_id)
       SELECT ?, position, kind, file_id, dance_id FROM program_items
       WHERE program_id = ? ORDER BY position`
    ).run(copy, programId)
    return copy
  })
}

type ItemRow = { id: number; kind: 'track' | 'stop' } & Partial<TrackRow>

const ITEMS_SQL = `SELECT pi.id, pi.kind, ${TRACK_COLUMNS}
  FROM program_items pi
  LEFT JOIN files f ON f.id = pi.file_id
  LEFT JOIN songs s ON s.file_id = f.id
  ${trackJoins('pi.dance_id')}`

function toItem(row: ItemRow): ProgramItem {
  if (row.kind === 'stop') return { id: row.id, kind: 'stop' }
  return { id: row.id, kind: 'track', ...toTrack(row as TrackRow) }
}

// The program and its unplayed items in order; null for an unknown program. A track whose
// file was removed from the library is left out.
export function getProgram(db: DatabaseSync, programId: number): ProgramDetail | null {
  const program = db.prepare('SELECT id, name FROM programs WHERE id = ?').get(programId) as
    { id: number; name: string } | undefined
  if (!program) return null
  const rows = db
    .prepare(
      `${ITEMS_SQL}
       WHERE pi.program_id = ? AND pi.played_at IS NULL AND (pi.kind = 'stop' OR s.id IS NOT NULL)
       ORDER BY pi.position, pi.id`
    )
    .all(programId) as unknown as ItemRow[]
  return { ...program, items: rows.map(toItem) }
}

// The dances still to come in a program, in order: what the projector will need (an unknown
// program has none). A song with no dance is left out.
export function upcomingDanceIds(db: DatabaseSync, programId: number): number[] {
  const items = getProgram(db, programId)?.items ?? []
  return items.flatMap((i) => (i.kind === 'track' && i.danceId !== null ? [i.danceId] : []))
}

// Next up (spec §7.2): the first unplayed item by position.
export function nextItem(db: DatabaseSync, programId: number): ProgramItem | null {
  const row = db
    .prepare(
      `${ITEMS_SQL}
       WHERE pi.program_id = ? AND pi.played_at IS NULL AND (pi.kind = 'stop' OR s.id IS NOT NULL)
       ORDER BY pi.position, pi.id LIMIT 1`
    )
    .get(programId) as ItemRow | undefined
  return row ? toItem(row) : null
}

const unplayedIds = (db: DatabaseSync, programId: number): number[] =>
  db
    .prepare(
      'SELECT id FROM program_items WHERE program_id = ? AND played_at IS NULL ORDER BY position, id'
    )
    .all(programId)
    .map((r) => r.id as number)

// Rewrites positions: played items first (in their old order), then `unplayed` in the order given.
function renumber(db: DatabaseSync, programId: number, unplayed: number[]): void {
  const played = db
    .prepare(
      'SELECT id FROM program_items WHERE program_id = ? AND played_at IS NOT NULL ORDER BY position, id'
    )
    .all(programId)
    .map((r) => r.id as number)
  const set = db.prepare('UPDATE program_items SET position = ? WHERE id = ?')
  ;[...played, ...unplayed].forEach((id, i) => set.run(i + 1, id))
}

// Places new item ids before `beforeItemId` (an unplayed item), or at the end when null.
function place(db: DatabaseSync, programId: number, ids: number[], beforeItemId: number | null) {
  const order = unplayedIds(db, programId).filter((id) => !ids.includes(id))
  const at = beforeItemId === null ? -1 : order.indexOf(beforeItemId)
  order.splice(at < 0 ? order.length : at, 0, ...ids)
  renumber(db, programId, order)
}

// Adds songs as tracks, each with its song's default dance (spec §6.2). Returns the new item ids.
export function addTracks(
  db: DatabaseSync,
  programId: number,
  fileIds: number[],
  beforeItemId: number | null = null
): number[] {
  return inTransaction(db, () => {
    requireProgram(db, programId)
    const insert = db.prepare(
      `INSERT INTO program_items (program_id, position, kind, file_id, dance_id)
       SELECT ?, 0, 'track', f.id,
         (SELECT p.dance_id FROM dance_songs p WHERE p.id = ${shownPairingSql('s.id')})
       FROM files f JOIN songs s ON s.file_id = f.id WHERE f.id = ?`
    )
    const ids = fileIds
      .map((fileId) => insert.run(programId, fileId))
      .filter((r) => r.changes > 0)
      .map((r) => Number(r.lastInsertRowid))
    place(db, programId, ids, beforeItemId)
    touch(db, programId)
    return ids
  })
}

// A STOP / TEACHING marker (spec §7.2), before `beforeItemId` or at the end.
export function addStop(
  db: DatabaseSync,
  programId: number,
  beforeItemId: number | null = null
): number {
  return inTransaction(db, () => {
    requireProgram(db, programId)
    const id = Number(
      db
        .prepare("INSERT INTO program_items (program_id, position, kind) VALUES (?, 0, 'stop')")
        .run(programId).lastInsertRowid
    )
    place(db, programId, [id], beforeItemId)
    touch(db, programId)
    return id
  })
}

// `itemIds` is the complete new order of the program's unplayed items.
export function reorderItems(db: DatabaseSync, programId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const current = unplayedIds(db, programId)
    const same =
      current.length === itemIds.length &&
      new Set(itemIds).size === itemIds.length &&
      current.every((id) => itemIds.includes(id))
    if (!same) throw new ProgramError('The program changed; please try again.')
    renumber(db, programId, itemIds)
    touch(db, programId)
  })
}

export function removeItems(db: DatabaseSync, programId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM program_items WHERE program_id = ? AND id = ?')
    for (const id of itemIds) remove.run(programId, id)
    touch(db, programId)
  })
}

// Switches the dance shown for one item (spec §6.2 "Choosing the dance"). The dance must be
// linked to the item's song.
export function setItemDance(db: DatabaseSync, itemId: number, danceId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare(
        `SELECT pi.program_id AS programId,
           EXISTS (SELECT 1 FROM songs s JOIN dance_songs x ON x.song_id = s.id
                   WHERE s.file_id = pi.file_id AND x.dance_id = ?) AS linked
         FROM program_items pi WHERE pi.id = ? AND pi.kind = 'track'`
      )
      .get(danceId, itemId) as { programId: number; linked: number } | undefined
    if (!item) throw new ProgramError('That program item no longer exists.')
    if (!item.linked) throw new ProgramError("That dance isn't linked to this song.")
    db.prepare('UPDATE program_items SET dance_id = ? WHERE id = ?').run(danceId, itemId)
    touch(db, item.programId)
  })
}

// Marks an item played (spec §7.2); it leaves the program view but stays stored.
export function markPlayed(db: DatabaseSync, itemId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare('SELECT program_id AS programId FROM program_items WHERE id = ?')
      .get(itemId) as { programId: number } | undefined
    if (!item) return
    db.prepare(`UPDATE program_items SET played_at = ${NOW} WHERE id = ?`).run(itemId)
    touch(db, item.programId)
  })
}

// Puts an interrupted item back as unplayed: ⏹, a preview or a replay stopped it before it ended.
export function markUnplayed(db: DatabaseSync, itemId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare('SELECT program_id AS programId FROM program_items WHERE id = ?')
      .get(itemId) as { programId: number } | undefined
    if (!item) return
    db.prepare('UPDATE program_items SET played_at = NULL WHERE id = ?').run(itemId)
    touch(db, item.programId)
  })
}
