import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Snapshot } from '../../../src/main/apple-sync/snapshot'
import { syncedFileIds, syncPlaylists } from '../../../src/main/apple-sync/sync-playlists'
import { addToPlaylist, renamePlaylist } from '../../../src/main/library/playlists'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid, snapshot } from './fixtures'

let db: DatabaseSync
let ids: Map<string, number>
const NOW = '2026-10-16T12:00:00.000Z'

beforeEach(() => {
  db = createTestDb()
  for (const n of [1, 2, 3]) {
    const s = addLibrarySong(db, { title: `T${n}` })
    db.prepare("UPDATE files SET apple_persistent_id = ?, apple_sync = 'synced' WHERE id = ?").run(
      pid(n),
      s.fileId
    )
  }
  ids = syncedFileIds(db)
})

const playlist = (n: number, name: string, items: number[], parent: number | null = null) => ({
  persistentId: pid(1000 + n),
  name,
  parentId: parent === null ? null : pid(2000 + parent),
  itemIds: items.map(pid)
})
const folder = (n: number, name: string, parent: number | null = null) => ({
  persistentId: pid(2000 + n),
  name,
  parentId: parent === null ? null : pid(2000 + parent)
})
const mirrors = () =>
  db
    .prepare(
      `SELECT p.name, p.apple_sync AS mirror, f.name AS folder,
         (SELECT group_concat(t.title, ',') FROM (SELECT s.title FROM playlist_items i
            JOIN songs s ON s.file_id = i.file_id WHERE i.playlist_id = p.id ORDER BY i.position) t) AS items
       FROM playlists p LEFT JOIN playlist_folders f ON f.id = p.folder_id ORDER BY p.name`
    )
    .all()
const folders = () =>
  db
    .prepare(
      `SELECT f.name, p.name AS parent, f.position FROM playlist_folders f
       LEFT JOIN playlist_folders p ON p.id = f.parent_id ORDER BY f.position`
    )
    .all()
const run = (s: Snapshot, decisions = {}) => syncPlaylists(db, s, ids, decisions, NOW)

describe('syncPlaylists (sync spec §5.6)', () => {
  test('creates mirrors and folders, nested and in order', () => {
    const result = run(
      snapshot({
        folders: [folder(1, 'IFD2026'), folder(2, 'Week 3', 1)],
        playlists: [playlist(1, 'Monday', [2, 1], 2), playlist(2, 'Loose', [3])]
      })
    )
    expect(result).toEqual({ created: ['Monday', 'Loose'], updated: [], deleted: [] })
    expect(folders()).toEqual([
      { name: 'IFD2026', parent: null, position: 1 },
      { name: 'Week 3', parent: 'IFD2026', position: 2 }
    ])
    expect(mirrors()).toEqual([
      { name: 'Loose', mirror: 1, folder: null, items: 'T3' },
      { name: 'Monday', mirror: 1, folder: 'Week 3', items: 'T2,T1' }
    ])
  })

  test('renames, refills, moves and deletes with Music; an unchanged run reports nothing', () => {
    const first = snapshot({
      folders: [folder(1, 'A')],
      playlists: [playlist(1, 'P', [1, 2], 1), playlist(2, 'Q', [1])]
    })
    run(first)
    expect(run(first)).toEqual({ created: [], updated: [], deleted: [] })
    const result = run(
      snapshot({ folders: [folder(1, 'A renamed')], playlists: [playlist(1, 'P2', [2, 3], null)] })
    )
    expect(result).toEqual({ created: [], updated: ['P2'], deleted: ['Q'] })
    expect(mirrors()).toEqual([{ name: 'P2', mirror: 1, folder: null, items: 'T2,T3' }])
    expect(folders()).toEqual([{ name: 'A renamed', parent: null, position: 1 }])
    // Deleting a mirror keeps its songs.
    expect(db.prepare('SELECT COUNT(*) AS n FROM songs').get()).toEqual({ n: 3 })
  })

  test('a folder Music deleted is deleted; its playlists move out', () => {
    run(snapshot({ folders: [folder(1, 'Old')], playlists: [playlist(1, 'P', [1], 1)] }))
    run(snapshot({ playlists: [playlist(1, 'P', [1])] }))
    expect(folders()).toEqual([])
    expect(mirrors()).toEqual([{ name: 'P', mirror: 1, folder: null, items: 'T1' }])
  })

  test('items of tracks that are not synced are left out', () => {
    run(snapshot({ playlists: [playlist(1, 'P', [1, 99, 2])] }))
    expect(mirrors()).toEqual([{ name: 'P', mirror: 1, folder: null, items: 'T1,T2' }])
  })

  test('a local playlist is never touched', () => {
    db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
    run(snapshot())
    expect(mirrors()).toEqual([{ name: 'Mine', mirror: 0, folder: null, items: null }])
  })
})

describe('playlists from a Library.xml import (sync spec §5.8 step 4)', () => {
  // An Apple playlist imported from Library.xml, then (optionally) edited.
  function imported(edited: boolean): number {
    const id = Number(
      db
        .prepare(
          `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at)
           VALUES ('Week', 'apple_xml', ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`
        )
        .run(pid(1001)).lastInsertRowid
    )
    addToPlaylist(db, id, [ids.get(pid(1))!])
    if (!edited) db.prepare('UPDATE playlists SET modified_at = imported_at WHERE id = ?').run(id)
    return id
  }

  test('an unedited one becomes the mirror', () => {
    imported(false)
    run(snapshot({ playlists: [playlist(1, 'Week', [2])] }))
    expect(mirrors()).toEqual([{ name: 'Week', mirror: 1, folder: null, items: 'T2' }])
  })

  test('an edited one is kept as "(my edits)" by default, beside a new mirror', () => {
    const id = imported(true)
    renamePlaylist(db, id, 'Week')
    const result = run(snapshot({ playlists: [playlist(1, 'Week', [2])] }))
    expect(result.created).toEqual(['Week'])
    expect(mirrors()).toEqual([
      { name: 'Week', mirror: 1, folder: null, items: 'T2' },
      { name: 'Week (my edits)', mirror: 0, folder: null, items: 'T1' }
    ])
  })

  test('"Replace with Apple version" turns the edited one into the mirror', () => {
    imported(true)
    run(snapshot({ playlists: [playlist(1, 'Week', [2])] }), { [pid(1001)]: 'replace' })
    expect(mirrors()).toEqual([{ name: 'Week', mirror: 1, folder: null, items: 'T2' }])
  })
})
