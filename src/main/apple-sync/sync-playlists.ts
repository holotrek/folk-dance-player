import type { DatabaseSync } from 'node:sqlite'
import type { MirrorDecision, SyncSummary } from '@shared/apple-sync'
import { isEdited } from '../import/save-playlists'
import type { Snapshot } from './snapshot'

type Result = SyncSummary['playlists']

interface MirrorRow {
  id: number
  name: string
  folder_id: number | null
  apple_sync: number
  imported_at: string | null
  modified_at: string
}

// Synced songs by their track's persistent ID: what a mirror's items point at.
export function syncedFileIds(db: DatabaseSync): Map<string, number> {
  const rows = db
    .prepare(
      "SELECT id, apple_persistent_id AS pid FROM files WHERE apple_sync = 'synced' AND removed_at IS NULL"
    )
    .all() as { id: number; pid: string }[]
  return new Map(rows.map((r) => [r.pid, r.id]))
}

function itemsOf(db: DatabaseSync, playlistId: number): number[] {
  return db
    .prepare('SELECT file_id AS id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.id as number)
}

function writeItems(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
  const insert = db.prepare(
    'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
  )
  fileIds.forEach((fileId, i) => insert.run(playlistId, i + 1, fileId))
}

const same = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

// Folders follow Music's names, nesting and order; folders Music no longer has are deleted (their
// subfolders with them; their playlists move out). Returns folder ids by persistent ID.
function syncFolders(db: DatabaseSync, snapshot: Snapshot): Map<string, number> {
  const ids = new Map<string, number>()
  snapshot.folders.forEach((f, i) => {
    const row = db
      .prepare('SELECT id FROM playlist_folders WHERE apple_persistent_id = ?')
      .get(f.persistentId) as { id: number } | undefined
    if (row) {
      db.prepare('UPDATE playlist_folders SET name = ?, position = ? WHERE id = ?').run(
        f.name,
        i + 1,
        row.id
      )
      ids.set(f.persistentId, row.id)
    } else {
      const id = db
        .prepare(
          'INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES (?, ?, ?)'
        )
        .run(f.name, f.persistentId, i + 1).lastInsertRowid
      ids.set(f.persistentId, Number(id))
    }
  })
  // Parents after every folder exists, so a folder moved out of a deleted one is saved first.
  for (const f of snapshot.folders) {
    db.prepare('UPDATE playlist_folders SET parent_id = ? WHERE id = ?').run(
      f.parentId ? (ids.get(f.parentId) ?? null) : null,
      ids.get(f.persistentId)!
    )
  }
  const live = new Set(ids.values())
  const stale = db
    .prepare('SELECT id FROM playlist_folders WHERE apple_persistent_id IS NOT NULL')
    .all()
    .map((r) => r.id as number)
    .filter((id) => !live.has(id))
  for (const id of stale) db.prepare('DELETE FROM playlist_folders WHERE id = ?').run(id)
  return ids
}

function createMirror(
  db: DatabaseSync,
  name: string,
  persistentId: string,
  folderId: number | null,
  now: string
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO playlists (name, source, apple_persistent_id, apple_sync, folder_id,
           imported_at, modified_at, created_at)
         VALUES (?, 'apple_xml', ?, 1, ?, ?, ?, ?)`
      )
      .run(name, persistentId, folderId, now, now, now).lastInsertRowid
  )
}

// Mirrors match Music exactly (sync spec §5.6); a playlist imported from Library.xml becomes the
// mirror, unless it was edited here: then the decision (default "Keep my edits as a copy") applies.
export function syncPlaylists(
  db: DatabaseSync,
  snapshot: Snapshot,
  fileIdByPid: Map<string, number>,
  decisions: Record<string, MirrorDecision>,
  now: string
): Result {
  const result: Result = { created: [], updated: [], deleted: [] }
  const folderIds = syncFolders(db, snapshot)

  for (const p of snapshot.playlists) {
    const fileIds = p.itemIds
      .map((id) => fileIdByPid.get(id))
      .filter((id): id is number => id !== undefined)
    const folderId = p.parentId ? (folderIds.get(p.parentId) ?? null) : null
    const row = db
      .prepare(
        `SELECT id, name, folder_id, apple_sync, imported_at, modified_at FROM playlists
         WHERE apple_persistent_id = ?`
      )
      .get(p.persistentId) as MirrorRow | undefined

    const keepCopy =
      row !== undefined &&
      row.apple_sync === 0 &&
      isEdited(row) &&
      (decisions[p.persistentId] ?? 'copy') === 'copy'
    if (!row || keepCopy) {
      if (row) {
        db.prepare(
          "UPDATE playlists SET name = ?, apple_persistent_id = NULL, source = 'local' WHERE id = ?"
        ).run(`${row.name} (my edits)`, row.id)
      }
      writeItems(db, createMirror(db, p.name, p.persistentId, folderId, now), fileIds)
      result.created.push(p.name)
      continue
    }

    const itemsChanged = !same(itemsOf(db, row.id), fileIds)
    const changed = row.name !== p.name || row.folder_id !== folderId || itemsChanged
    if (row.apple_sync === 0 || changed) {
      db.prepare(
        `UPDATE playlists SET name = ?, folder_id = ?, apple_sync = 1, imported_at = ?,
           modified_at = ? WHERE id = ?`
      ).run(p.name, folderId, now, now, row.id)
      if (itemsChanged) writeItems(db, row.id, fileIds)
      if (changed) result.updated.push(p.name)
    }
  }

  const live = new Set(snapshot.playlists.map((p) => p.persistentId))
  const stale = db
    .prepare('SELECT id, name, apple_persistent_id AS pid FROM playlists WHERE apple_sync = 1')
    .all() as { id: number; name: string; pid: string }[]
  for (const m of stale.filter((m) => !live.has(m.pid))) {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(m.id)
    result.deleted.push(m.name)
  }
  return result
}
