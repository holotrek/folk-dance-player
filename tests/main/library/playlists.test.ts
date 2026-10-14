import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { LibraryEditError } from '../../../src/main/library/edit'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  listPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  setFavorite,
  setHolding
} from '../../../src/main/library/playlists'
import { listLibrary } from '../../../src/main/library/list'
import {
  findEditedApplePlaylists,
  saveApplePlaylists
} from '../../../src/main/import/save-playlists'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let a: number, b: number, c: number

const files = (playlistId: number): number[] =>
  db
    .prepare('SELECT file_id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.file_id as number)
const itemIds = (playlistId: number): number[] =>
  db
    .prepare('SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.id as number)

beforeEach(() => {
  db = createTestDb()
  a = addLibrarySong(db, { title: 'A' }).fileId
  b = addLibrarySong(db, { title: 'B' }).fileId
  c = addLibrarySong(db, { title: 'C' }).fileId
})

describe('playlists', () => {
  test('creates, lists (by name) and renames playlists; a name is required', () => {
    const z = createPlaylist(db, 'Zemer set')
    createPlaylist(db, ' couple dances ')
    renamePlaylist(db, z, 'Beginner night')
    expect(listPlaylists(db).map((p) => [p.name, p.source, p.itemCount])).toEqual([
      ['Beginner night', 'local', 0],
      ['couple dances', 'local', 0]
    ])
    expect(() => createPlaylist(db, '  ')).toThrow(LibraryEditError)
  })

  test('adds songs at the end, skipping ones already in the playlist', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [b, a])
    addToPlaylist(db, p, [a, c])
    expect(files(p)).toEqual([b, a, c])
    expect(listPlaylists(db)[0].itemCount).toBe(3)
  })

  test('removes and reorders items', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a, b, c])
    const [ia, ib, ic] = itemIds(p)
    removeFromPlaylist(db, p, [ib])
    expect(files(p)).toEqual([a, c])
    reorderPlaylist(db, p, [ic, ia])
    expect(files(p)).toEqual([c, a])
  })

  test('reorder must list exactly the playlist’s items', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a, b])
    expect(() => reorderPlaylist(db, p, [itemIds(p)[0]])).toThrow(LibraryEditError)
  })

  test('duplicates a playlist as a local copy with the same songs', () => {
    const p = createPlaylist(db, 'Balkan')
    addToPlaylist(db, p, [c, a])
    const copy = duplicatePlaylist(db, p)
    expect(listPlaylists(db).find((x) => x.id === copy)).toMatchObject({
      name: 'Balkan copy',
      source: 'local'
    })
    expect(files(copy)).toEqual([c, a])
  })

  test('deletes a playlist and its items, not the songs', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a])
    deletePlaylist(db, p)
    expect(listPlaylists(db)).toEqual([])
    expect(db.prepare('SELECT COUNT(*) n FROM playlist_items').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM files').get()).toEqual({ n: 3 })
  })

  // Spec §5.3: local edits to an Apple playlist must be protected on re-import.
  test('editing an imported Apple playlist marks it as edited', () => {
    saveApplePlaylists(
      db,
      [{ persistentId: 'BAL', name: 'Balkan', trackIds: [1] }],
      new Map([[1, a]]),
      {},
      '2020-01-01T00:00:00.000Z'
    )
    const [p] = listPlaylists(db)
    expect(findEditedApplePlaylists(db, ['BAL'])).toEqual([])
    addToPlaylist(db, p.id, [b])
    expect(findEditedApplePlaylists(db, ['BAL'])).toEqual([{ persistentId: 'BAL', name: 'Balkan' }])
  })
})

describe('setFavorite', () => {
  test('marks and unmarks recordings as favorites', () => {
    setFavorite(db, [a, b], true)
    setFavorite(db, [b], false)
    expect(
      db.prepare('SELECT file_id, is_favorite FROM file_prefs ORDER BY file_id').all()
    ).toEqual([
      { file_id: a, is_favorite: 1 },
      { file_id: b, is_favorite: 0 }
    ])
  })
})

describe('holding', () => {
  const held = () =>
    listLibrary(db, {
      search: '',
      filter: { kind: 'holding' },
      sort: { column: 'title', direction: 'asc' } // ignored: holding keeps its own order
    }).map((r) => r.title)

  test('holds and releases songs; the holding filter lists them', () => {
    setHolding(db, [a, c], true)
    setHolding(db, [a], false)
    expect(held()).toEqual(['C'])
  })

  test('held songs keep the order they were placed in: at the end, or before a held song', () => {
    setHolding(db, [c, a], true)
    expect(held()).toEqual(['C', 'A'])
    setHolding(db, [b], true, a)
    expect(held()).toEqual(['C', 'B', 'A'])
  })

  test('holding songs that are already held moves them (reordering)', () => {
    setHolding(db, [a, b, c], true)
    setHolding(db, [c], true, a)
    expect(held()).toEqual(['C', 'A', 'B'])
    setHolding(db, [c, a], true)
    expect(held()).toEqual(['B', 'C', 'A'])
    setHolding(db, [b], false)
    setHolding(db, [b], true, c)
    expect(held()).toEqual(['B', 'C', 'A'])
  })
})
