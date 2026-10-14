import type { DatabaseSync } from 'node:sqlite'
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

export function listPlaylists(db: DatabaseSync): PlaylistSummary[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.source, (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS itemCount
       FROM playlists p ORDER BY p.name COLLATE NOCASE, p.id`
    )
    .all() as unknown as PlaylistSummary[]
}

export function createPlaylist(db: DatabaseSync, playlistName: string): number {
  return Number(
    db.prepare("INSERT INTO playlists (name, source) VALUES (?, 'local')").run(name(playlistName))
      .lastInsertRowid
  )
}

export function renamePlaylist(db: DatabaseSync, playlistId: number, playlistName: string): void {
  db.prepare(`UPDATE playlists SET name = ?, modified_at = ${NOW} WHERE id = ?`).run(
    name(playlistName),
    playlistId
  )
}

export function deletePlaylist(db: DatabaseSync, playlistId: number): void {
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
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND id = ?')
    for (const id of itemIds) remove.run(playlistId, id)
    touch(db, playlistId)
  })
}

// `itemIds` is the playlist's complete new order.
export function reorderPlaylist(db: DatabaseSync, playlistId: number, itemIds: number[]): void {
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

// Holding (spec §3, §6.2): a per-file flag; held songs appear in the Program page's holding
// panel, in the order they were placed. Holding songs places them before `beforeFileId` (a held
// song) or at the end; songs already held move there, which is how the panel reorders.
export function setHolding(
  db: DatabaseSync,
  fileIds: number[],
  held: boolean,
  beforeFileId: number | null = null
): void {
  inTransaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO file_prefs (file_id, in_holding, holding_position) VALUES (?, ?, NULL)
       ON CONFLICT (file_id) DO UPDATE SET in_holding = excluded.in_holding,
         holding_position = CASE WHEN excluded.in_holding = 1 THEN holding_position END`
    )
    const moving = [...new Set(fileIds)]
    for (const fileId of moving) upsert.run(fileId, held ? 1 : 0)
    if (!held) return
    const order = db
      .prepare(
        'SELECT file_id AS id FROM file_prefs WHERE in_holding = 1 ORDER BY holding_position, file_id'
      )
      .all()
      .map((r) => r.id as number)
      .filter((id) => !moving.includes(id))
    const at = beforeFileId === null ? -1 : order.indexOf(beforeFileId)
    order.splice(at < 0 ? order.length : at, 0, ...moving)
    const place = db.prepare('UPDATE file_prefs SET holding_position = ? WHERE file_id = ?')
    order.forEach((id, i) => place.run(i + 1, id))
  })
}
