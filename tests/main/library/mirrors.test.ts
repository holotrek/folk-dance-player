import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  listPlaylistFolders,
  listPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist
} from '../../../src/main/library/playlists'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
beforeEach(() => (db = createTestDb()))

function mirror(name: string, persistentId = 'AAAAAAAAAAAAAAA9'): number {
  return Number(
    db
      .prepare(
        "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES (?, 'apple_xml', ?, 1)"
      )
      .run(name, persistentId).lastInsertRowid
  )
}

describe('mirrors of Music playlists (sync spec §6.3)', () => {
  test('are read-only', () => {
    const song = addLibrarySong(db, { title: 'Kolo' })
    const m = mirror('Week')
    for (const write of [
      () => renamePlaylist(db, m, 'X'),
      () => deletePlaylist(db, m),
      () => addToPlaylist(db, m, [song.fileId]),
      () => removeFromPlaylist(db, m, [1]),
      () => reorderPlaylist(db, m, [])
    ]) {
      expect(write).toThrow('Edit this playlist in Music.')
    }
  })

  test('can be duplicated as an editable playlist', () => {
    const copy = duplicatePlaylist(db, mirror('Week'))
    expect(listPlaylists(db).find((p) => p.id === copy)).toMatchObject({
      name: 'Week copy',
      mirror: false
    })
  })

  test('are listed first, with their folder; folders are listed in order', () => {
    createPlaylist(db, 'Alpha')
    const m = mirror('Zeta')
    const folder = Number(
      db
        .prepare(
          "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'FFFFFFFFFFFFFFF1', 1)"
        )
        .run().lastInsertRowid
    )
    db.prepare('UPDATE playlists SET folder_id = ? WHERE id = ?').run(folder, m)
    expect(listPlaylists(db).map((p) => [p.name, p.mirror, p.folderId])).toEqual([
      ['Zeta', true, folder],
      ['Alpha', false, null]
    ])
    expect(listPlaylistFolders(db)).toEqual([
      { id: folder, name: 'IFD', parentId: null, persistentId: 'FFFFFFFFFFFFFFF1' }
    ])
  })
})
