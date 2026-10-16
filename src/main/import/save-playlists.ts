import type { DatabaseSync } from 'node:sqlite'
import type { ApplePlaylistConflict, ImportSummary, PlaylistDecision } from '@shared/import'
import type { ApplePlaylist } from './apple-library'

export interface PlaylistRow {
  id: number
  name: string
  imported_at: string | null
  modified_at: string
}

type PlaylistResult = ImportSummary['playlists']

const APPLE_SUFFIX = ' (Apple Music)'

// Any local edit bumps playlists.modified_at; an import sets imported_at = modified_at.
export const isEdited = (row: PlaylistRow): boolean =>
  row.imported_at === null || row.modified_at > row.imported_at

function findByPersistentId(db: DatabaseSync, persistentId: string): PlaylistRow | undefined {
  return db
    .prepare(
      'SELECT id, name, imported_at, modified_at FROM playlists WHERE apple_persistent_id = ?'
    )
    .get(persistentId) as PlaylistRow | undefined
}

// Spec §5.3: Apple playlists edited locally since their last import need the user's decision.
export function findEditedApplePlaylists(
  db: DatabaseSync,
  persistentIds: string[]
): ApplePlaylistConflict[] {
  return persistentIds.flatMap((persistentId) => {
    const row = findByPersistentId(db, persistentId)
    return row && isEdited(row) ? [{ persistentId, name: row.name }] : []
  })
}

function writeItems(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
  const insert = db.prepare(
    'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
  )
  fileIds.forEach((fileId, i) => insert.run(playlistId, i + 1, fileId))
}

function createPlaylist(db: DatabaseSync, name: string, persistentId: string, now: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at, created_at)
         VALUES (?, 'apple_xml', ?, ?, ?, ?)`
      )
      .run(name, persistentId, now, now, now).lastInsertRowid
  )
}

export function saveApplePlaylists(
  db: DatabaseSync,
  playlists: ApplePlaylist[],
  fileIdByTrackId: Map<number, number>,
  decisions: Record<string, PlaylistDecision>,
  now: string
): PlaylistResult {
  const result: PlaylistResult = { created: [], replaced: [], kept: [], duplicated: [] }

  for (const playlist of playlists) {
    const fileIds = playlist.trackIds
      .map((id) => fileIdByTrackId.get(id))
      .filter((id): id is number => id !== undefined)
    const existing = findByPersistentId(db, playlist.persistentId)

    if (!existing) {
      writeItems(db, createPlaylist(db, playlist.name, playlist.persistentId, now), fileIds)
      result.created.push(playlist.name)
      continue
    }

    // Without an explicit decision an edited playlist is kept: never lose the user's edits.
    const decision = isEdited(existing) ? (decisions[playlist.persistentId] ?? 'keep') : 'replace'
    if (decision === 'keep') {
      result.kept.push(existing.name)
    } else if (decision === 'replace') {
      // A copy made by "Keep both" keeps its suffix, so it never takes the user's playlist's name.
      const name = existing.name.endsWith(APPLE_SUFFIX)
        ? `${playlist.name}${APPLE_SUFFIX}`
        : playlist.name
      db.prepare(
        'UPDATE playlists SET name = ?, imported_at = ?, modified_at = ? WHERE id = ?'
      ).run(name, now, now, existing.id)
      writeItems(db, existing.id, fileIds)
      result.replaced.push(name)
    } else {
      // Keep both: the edited copy becomes the user's own playlist; the Apple copy is new.
      db.prepare(
        "UPDATE playlists SET source = 'local', apple_persistent_id = NULL WHERE id = ?"
      ).run(existing.id)
      const name = `${playlist.name}${APPLE_SUFFIX}`
      writeItems(db, createPlaylist(db, name, playlist.persistentId, now), fileIds)
      result.duplicated.push(name)
    }
  }
  return result
}
