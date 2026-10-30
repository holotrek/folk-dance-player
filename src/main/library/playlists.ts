import type { DatabaseSync } from 'node:sqlite'
import type { PlaylistFolder } from '@shared/apple-sync'
import type { PlaylistSummary } from '@shared/library'
import { inTransaction } from '../db/transaction'
import { LibraryEditError } from './edit'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

function name(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new LibraryEditError("A playlist name can't be empty.")
  return trimmed
}

// Every local edit bumps modified_at, which protects edited Apple playlists on re-import (§5.3).
const touch = (db: DatabaseSync, playlistId: number): void => {
  db.prepare(`UPDATE playlists SET modified_at = ${NOW} WHERE id = ?`).run(playlistId)
}

// Main rejects writes to a mirror of a Music playlist (sync spec §6.3), so the rule doesn't depend
// on the UI.
function requireEditable(db: DatabaseSync, playlistId: number): void {
  const row = db.prepare('SELECT apple_sync FROM playlists WHERE id = ?').get(playlistId) as
    { apple_sync: number } | undefined
  if (row?.apple_sync === 1) throw new LibraryEditError('Edit this playlist in Music.')
}

// Mirrors first, in name order (their folders come from listPlaylistFolders), then local playlists.
export function listPlaylists(db: DatabaseSync): PlaylistSummary[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.source, p.apple_sync AS mirror, p.folder_id AS folderId,
         (SELECT COUNT(*) FROM playlist_items i JOIN files f ON f.id = i.file_id
          WHERE i.playlist_id = p.id AND f.removed_at IS NULL) AS itemCount
       FROM playlists p ORDER BY p.apple_sync DESC, p.name COLLATE NOCASE, p.id`
    )
    .all() as unknown as (Omit<PlaylistSummary, 'mirror'> & { mirror: number })[]
  return rows.map((r) => ({ ...r, mirror: r.mirror === 1 }))
}

// Music's playlist folders (sync spec §6.2), in Music's order.
export function listPlaylistFolders(db: DatabaseSync): PlaylistFolder[] {
  return db
    .prepare(
      `SELECT id, name, parent_id AS parentId, apple_persistent_id AS persistentId
       FROM playlist_folders ORDER BY position, id`
    )
    .all() as unknown as PlaylistFolder[]
}

export function createPlaylist(db: DatabaseSync, playlistName: string): number {
  return Number(
    db.prepare("INSERT INTO playlists (name, source) VALUES (?, 'local')").run(name(playlistName))
      .lastInsertRowid
  )
}

export function renamePlaylist(db: DatabaseSync, playlistId: number, playlistName: string): void {
  requireEditable(db, playlistId)
  db.prepare(`UPDATE playlists SET name = ?, modified_at = ${NOW} WHERE id = ?`).run(
    name(playlistName),
    playlistId
  )
}

export function deletePlaylist(db: DatabaseSync, playlistId: number): void {
  requireEditable(db, playlistId)
  db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId)
}

export function duplicatePlaylist(db: DatabaseSync, playlistId: number): number {
  return inTransaction(db, () => {
    const source = db.prepare('SELECT name FROM playlists WHERE id = ?').get(playlistId) as
      { name: string } | undefined
    if (!source) throw new LibraryEditError('That playlist no longer exists.')
    const copy = createPlaylist(db, `${source.name} copy`)
    db.prepare(
      `INSERT INTO playlist_items (playlist_id, position, file_id)
       SELECT ?, position, file_id FROM playlist_items WHERE playlist_id = ? ORDER BY position`
    ).run(copy, playlistId)
    return copy
  })
}

// Appends songs to the end of a playlist; songs already in it are skipped.
export function addToPlaylist(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  requireEditable(db, playlistId)
  inTransaction(db, () => {
    const present = new Set(
      db
        .prepare('SELECT file_id FROM playlist_items WHERE playlist_id = ?')
        .all(playlistId)
        .map((r) => r.file_id as number)
    )
    let position = (
      db
        .prepare('SELECT COALESCE(MAX(position), 0) AS n FROM playlist_items WHERE playlist_id = ?')
        .get(playlistId) as {
        n: number
      }
    ).n
    const insert = db.prepare(
      'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
    )
    for (const fileId of fileIds) {
      if (present.has(fileId)) continue
      present.add(fileId)
      insert.run(playlistId, ++position, fileId)
    }
    touch(db, playlistId)
  })
}

export function removeFromPlaylist(db: DatabaseSync, playlistId: number, itemIds: number[]): void {
  requireEditable(db, playlistId)
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND id = ?')
    for (const id of itemIds) remove.run(playlistId, id)
    touch(db, playlistId)
  })
}

// `itemIds` is the playlist's complete new order.
export function reorderPlaylist(db: DatabaseSync, playlistId: number, itemIds: number[]): void {
  requireEditable(db, playlistId)
  inTransaction(db, () => {
    const current = db
      .prepare('SELECT id FROM playlist_items WHERE playlist_id = ?')
      .all(playlistId)
      .map((r) => r.id as number)
    const same = current.length === itemIds.length && current.every((id) => itemIds.includes(id))
    if (!same) throw new LibraryEditError('The playlist changed; please try again.')
    const set = db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?')
    itemIds.forEach((id, i) => set.run(i + 1, id))
    touch(db, playlistId)
  })
}

export function setFavorite(db: DatabaseSync, fileIds: number[], favorite: boolean): void {
  inTransaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, ?)
       ON CONFLICT (file_id) DO UPDATE SET is_favorite = excluded.is_favorite`
    )
    for (const fileId of fileIds) upsert.run(fileId, favorite ? 1 : 0)
  })
}
