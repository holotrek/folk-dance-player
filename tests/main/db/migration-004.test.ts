import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addLibrarySong } from '../helpers/library-fixtures'

describe('migration 004: Apple Music sync', () => {
  test('existing songs and playlists start unsynced, and folders can be stored', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 3))
    const song = addLibrarySong(db, { title: 'Kolo' })
    db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 3, to: 4 })
    expect(getSchemaVersion(db)).toBe(4)

    expect(
      db
        .prepare('SELECT apple_sync, removed_at, sync_baseline FROM files WHERE id = ?')
        .get(song.fileId)
    ).toEqual({ apple_sync: null, removed_at: null, sync_baseline: null })
    expect(db.prepare('SELECT apple_sync, folder_id FROM playlists').get()).toEqual({
      apple_sync: 0,
      folder_id: null
    })

    const parent = Number(
      db
        .prepare(
          "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'F1', 1)"
        )
        .run().lastInsertRowid
    )
    db.prepare(
      "INSERT INTO playlist_folders (name, parent_id, apple_persistent_id, position) VALUES ('Week', ?, 'F2', 2)"
    ).run(parent)
    db.prepare('UPDATE playlists SET folder_id = ?').run(parent)
    // Deleting a folder deletes its subfolders; its playlists stay, outside any folder.
    db.prepare('DELETE FROM playlist_folders WHERE id = ?').run(parent)
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlist_folders').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT folder_id FROM playlists').get()).toEqual({ folder_id: null })
  })

  test('apple_sync accepts only synced and gone', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    const song = addLibrarySong(db, { title: 'Kolo' })
    expect(() =>
      db.prepare("UPDATE files SET apple_sync = 'other' WHERE id = ?").run(song.fileId)
    ).toThrow(/CHECK/)
  })
})
