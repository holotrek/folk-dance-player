import type { DatabaseSync } from 'node:sqlite'
import type { ImportMapping } from '@shared/import'
import { mapTags } from '../import/mapping'
import type { FileFacts } from '../import/read-file'
import { insertFile, type FileRow } from '../import/save-file'
import type { EligibleTrack } from './eligible'
import { applyMusicTags } from './sync-tags'

export type SyncOutcome =
  'added' | 'updated' | 'relinked' | 'adopted' | 'restored' | 'unchanged' | 'missing' | 'taken' // another song has the file's path; nothing was written

export const TAKEN_DETAIL = 'Another Apple Music track uses this file'

export type RowMatch = { kind: 'row'; row: FileRow } | { kind: 'none' } | { kind: 'taken' }

// Music and the file system can store the same accented name in different Unicode forms (§5.3).
export const samePath = (a: string, b: string): boolean => a.normalize('NFC') === b.normalize('NFC')

// The row at `path` in either Unicode form, other than `exceptId`.
function pathOwner(db: DatabaseSync, path: string, exceptId: number | null): number | undefined {
  const row = db
    .prepare('SELECT id FROM files WHERE path IN (?, ?) AND id IS NOT ? LIMIT 1')
    .get(path.normalize('NFC'), path.normalize('NFD'), exceptId) as { id: number } | undefined
  return row?.id
}

const ownedByLiveTrack = (row: FileRow, pid: string, live: ReadonlySet<string>): boolean =>
  row.apple_persistent_id !== null &&
  row.apple_persistent_id !== pid &&
  live.has(row.apple_persistent_id)

// Before reading: the file row with the track's persistent ID, else the one at its path. A path
// that belongs to another track Music still has is 'taken' (files.path is unique).
export function findSyncRow(
  db: DatabaseSync,
  track: EligibleTrack,
  livePids: ReadonlySet<string>
): RowMatch {
  const byPid = db
    .prepare('SELECT * FROM files WHERE apple_persistent_id = ?')
    .get(track.persistentId) as FileRow | undefined
  if (byPid) return { kind: 'row', row: byPid }
  const byPath = db
    .prepare('SELECT * FROM files WHERE path IN (?, ?) ORDER BY id LIMIT 1')
    .get(track.path.normalize('NFC'), track.path.normalize('NFD')) as FileRow | undefined
  if (!byPath) return { kind: 'none' }
  return ownedByLiveTrack(byPath, track.persistentId, livePids)
    ? { kind: 'taken' }
    : { kind: 'row', row: byPath }
}

// After reading a file that matched nothing: a song with the same audio. A Music track re-added
// with a new ID (its old song is gone, or synced under an ID Music no longer has) comes first, then
// a removed song (restored), then the oldest local song (adopted, even if its copy still exists).
// Rows owned by a track Music still has never match: two tracks with the same audio are two songs.
function findByFingerprint(
  db: DatabaseSync,
  hash: string,
  pid: string,
  live: ReadonlySet<string>
): FileRow | undefined {
  const rows = (
    db
      .prepare('SELECT * FROM files WHERE content_hash = ? ORDER BY id')
      .all(hash) as unknown as FileRow[]
  ).filter((r) => !ownedByLiveTrack(r, pid, live))
  return (
    rows.find((r) => r.apple_sync !== null && r.removed_at === null) ??
    rows.find((r) => r.removed_at !== null) ??
    rows.find((r) => r.apple_sync === null)
  )
}

export interface SyncTrackInput {
  track: EligibleTrack
  facts: FileFacts | null // null when the file wasn't read (unchanged, or missing)
  rowId: number | null // what findSyncRow found before reading
  missing: boolean // the file isn't on disk
}

export interface SyncSaveContext {
  mapping: ImportMapping
  livePids: ReadonlySet<string>
}

// Saves one track (the caller runs it in a transaction). Every match keeps the song and all its
// data: the file row is pointed at Music's track and copy, marked synced, and un-removed.
export function saveSyncedTrack(
  db: DatabaseSync,
  input: SyncTrackInput,
  ctx: SyncSaveContext
): { outcome: SyncOutcome; fileId: number; missingChanged?: boolean } {
  const { track, facts } = input
  const row =
    (input.rowId !== null
      ? (db.prepare('SELECT * FROM files WHERE id = ?').get(input.rowId) as FileRow | undefined)
      : undefined) ??
    (facts ? findByFingerprint(db, facts.contentHash, track.persistentId, ctx.livePids) : undefined)

  if (!row) {
    if (!facts) throw new Error(`A new track must be read first: ${track.path}`)
    const owner = pathOwner(db, facts.path, null)
    if (owner !== undefined) return { outcome: 'taken', fileId: owner }
    const fileId = insertFile(
      db,
      { ...facts, tags: track.tags },
      { source: 'apple_xml', applePersistentId: track.persistentId, mapping: ctx.mapping },
      mapTags(track.tags, facts.path, ctx.mapping)
    )
    db.prepare("UPDATE files SET apple_sync = 'synced' WHERE id = ?").run(fileId)
    applyMusicTags(db, fileId, track.tags, ctx.mapping)
    return { outcome: 'added', fileId }
  }

  const moved = facts !== null && !samePath(row.path, facts.path)
  if (moved) {
    const owner = pathOwner(db, facts.path, row.id)
    if (owner !== undefined) return { outcome: 'taken', fileId: owner }
  }
  if (row.apple_persistent_id !== track.persistentId) {
    // The ID is unique; only a row findSyncRow didn't pick can hold it (none, in practice).
    db.prepare('UPDATE files SET apple_persistent_id = NULL WHERE apple_persistent_id = ?').run(
      track.persistentId
    )
  }
  const replaced =
    facts !== null &&
    (facts.fileSize !== row.file_size ||
      facts.mtimeMs !== row.mtime_ms ||
      facts.contentHash !== row.content_hash)
  const next: Record<string, string | number | null> = {
    apple_persistent_id: track.persistentId,
    apple_sync: 'synced',
    removed_at: null,
    is_missing: input.missing ? 1 : 0,
    missing_reason: input.missing ? 'not_found' : null
  }
  if (facts) {
    next.path = moved ? facts.path : row.path
    next.file_size = facts.fileSize
    next.mtime_ms = facts.mtimeMs
    next.duration_ms = facts.durationMs ?? row.duration_ms
    next.content_hash = facts.contentHash
  }
  const cols = Object.keys(next)
  db.prepare(`UPDATE files SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...cols.map((c) => next[c]),
    row.id
  )
  const tagsChanged = applyMusicTags(db, row.id, track.tags, ctx.mapping)

  const outcome: SyncOutcome =
    row.removed_at !== null
      ? 'restored'
      : row.apple_sync === null
        ? 'adopted'
        : input.missing
          ? 'missing'
          : moved
            ? 'relinked'
            : tagsChanged || replaced
              ? 'updated'
              : 'unchanged'
  // Whether the file went missing or came back, for a quiet refresh of the lists.
  const missingChanged = (input.missing ? 1 : 0) !== row.is_missing
  return { outcome, fileId: row.id, ...(missingChanged && { missingChanged }) }
}
