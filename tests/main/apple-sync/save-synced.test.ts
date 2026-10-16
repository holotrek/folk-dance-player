import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import type { EligibleTrack } from '../../../src/main/apple-sync/eligible'
import {
  findSyncRow,
  samePath,
  saveSyncedTrack,
  type SyncTrackInput
} from '../../../src/main/apple-sync/save-synced'
import type { FileFacts } from '../../../src/main/import/read-file'
import { addToPlaylist, createPlaylist, setFavorite } from '../../../src/main/library/playlists'
import { addLibrarySong, removeSong, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid } from './fixtures'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'ignore',
  genreIsCountry: true
}

let db: DatabaseSync
beforeEach(() => (db = createTestDb()))

const track = (n: number, path: string, title = `Track ${n}`): EligibleTrack => ({
  persistentId: pid(n),
  path,
  tags: { title, artist: null, albumArtist: null, genre: 'Serbia' },
  durationMs: 1000,
  kind: 'MPEG audio file'
})
const facts = (path: string, hash: string, size = 10): FileFacts => ({
  path,
  fileSize: size,
  mtimeMs: 5,
  durationMs: 1000,
  contentHash: hash,
  tags: { title: null, artist: null, albumArtist: null, genre: null }
})
const file = (id: number) =>
  db
    .prepare(
      'SELECT path, apple_persistent_id AS pid, apple_sync AS sync, removed_at AS removed, is_missing AS missing FROM files WHERE id = ?'
    )
    .get(id)
const ctx = (live: number[] = []) => ({ mapping, livePids: new Set(live.map(pid)) })
const save = (input: Partial<SyncTrackInput> & { track: EligibleTrack }, live: number[] = []) =>
  saveSyncedTrack(db, { facts: null, rowId: null, missing: false, ...input }, ctx(live))

// A local song with a fingerprint, as Add Music… makes it.
function local(title: string, path: string, hash: string) {
  const s = addLibrarySong(db, { title, path, dance: { name: title } })
  db.prepare('UPDATE files SET content_hash = ?, file_size = 10, mtime_ms = 5 WHERE id = ?').run(
    hash,
    s.fileId
  )
  return s
}

describe('samePath', () => {
  test('compares accented names in either Unicode form', () => {
    expect(samePath('/m/Paşa.mp3', '/m/Paşa.mp3')).toBe(true)
    expect(samePath('/m/a.mp3', '/m/b.mp3')).toBe(false)
  })
})

describe('findSyncRow', () => {
  test('finds by persistent ID first, then by path in either form', () => {
    const a = local('A', '/m/Paşa.mp3', 'h1')
    expect(findSyncRow(db, track(1, '/m/Paşa.mp3'), new Set())).toMatchObject({
      kind: 'row',
      row: { id: a.fileId }
    })
    db.prepare('UPDATE files SET apple_persistent_id = ? WHERE id = ?').run(pid(7), a.fileId)
    expect(findSyncRow(db, track(7, '/elsewhere.mp3'), new Set())).toMatchObject({
      row: { id: a.fileId }
    })
  })

  test('a path owned by another track Music still has is taken', () => {
    const a = local('A', '/m/a.mp3', 'h1')
    db.prepare('UPDATE files SET apple_persistent_id = ? WHERE id = ?').run(pid(1), a.fileId)
    expect(findSyncRow(db, track(2, '/m/a.mp3'), new Set([pid(1), pid(2)]))).toEqual({
      kind: 'taken'
    })
  })

  test('nothing matches a new file', () => {
    expect(findSyncRow(db, track(1, '/m/new.mp3'), new Set())).toEqual({ kind: 'none' })
  })
})

describe('saveSyncedTrack (sync spec §5.3)', () => {
  test('a new track becomes a synced song with its dance', () => {
    const { outcome, fileId } = save({
      track: track(1, '/m/Kolo.mp3', 'Kolo'),
      facts: facts('/m/Kolo.mp3', 'h1')
    })
    expect(outcome).toBe('added')
    expect(file(fileId)).toMatchObject({ pid: pid(1), sync: 'synced', removed: null })
    expect(songView(db, fileId)).toMatchObject({ title: 'Kolo', dance: 'Kolo', country: 'Serbia' })
  })

  test('an unchanged synced track is unchanged', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId }, [1]).outcome).toBe('unchanged')
  })

  test('Music moving the file relinks it', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    const moved = save(
      { track: track(1, '/m/new/a.mp3'), rowId: fileId, facts: facts('/m/new/a.mp3', 'h1') },
      [1]
    )
    expect(moved).toEqual({ outcome: 'relinked', fileId })
    expect(file(fileId)).toMatchObject({ path: '/m/new/a.mp3' })
  })

  test('a path that differs only in Unicode form is kept as stored', () => {
    const { fileId } = save({ track: track(1, '/m/Paşa.mp3'), facts: facts('/m/Paşa.mp3', 'h1') })
    const again = save(
      {
        track: track(1, '/m/Paşa.mp3'),
        rowId: fileId,
        facts: facts('/m/Paşa.mp3', 'h1')
      },
      [1]
    )
    expect(again.outcome).toBe('unchanged')
    expect(file(fileId)).toMatchObject({ path: '/m/Paşa.mp3' })
  })

  test('a local song at the same path is adopted with its data', () => {
    const a = local('Kolo', '/m/Kolo.mp3', 'h1')
    setFavorite(db, [a.fileId], true)
    const result = save({ track: track(1, '/m/Kolo.mp3', 'Kolo'), rowId: a.fileId }, [1])
    expect(result).toEqual({ outcome: 'adopted', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ pid: pid(1), sync: 'synced' })
  })

  test('a local copy elsewhere is adopted by fingerprint, even though it still exists', () => {
    const a = local('Kolo', '/Users/me/Downloads/Kolo.mp3', 'h1')
    const result = save(
      { track: track(1, '/m/Music/Kolo.mp3', 'Kolo'), facts: facts('/m/Music/Kolo.mp3', 'h1') },
      [1]
    )
    expect(result).toEqual({ outcome: 'adopted', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ path: '/m/Music/Kolo.mp3', sync: 'synced' })
  })

  test('of two local copies, the oldest is adopted and the other stays local', () => {
    const first = local('Kolo', '/d/1.mp3', 'h1')
    const second = local('Kolo copy', '/d/2.mp3', 'h1')
    const result = save({ track: track(1, '/m/Kolo.mp3'), facts: facts('/m/Kolo.mp3', 'h1') }, [1])
    expect(result.fileId).toBe(first.fileId)
    expect(file(second.fileId)).toMatchObject({ sync: null })
  })

  test('a removed song whose file comes back is restored, with its playlists', () => {
    const a = local('Kolo', '/m/Kolo.mp3', 'h1')
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a.fileId])
    removeSong(db, a.fileId)
    const result = save(
      { track: track(9, '/m/Kolo again.mp3'), facts: facts('/m/Kolo again.mp3', 'h1') },
      [9]
    )
    expect(result).toEqual({ outcome: 'restored', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ removed: null, sync: 'synced', pid: pid(9) })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM playlist_items WHERE file_id = ?').get(a.fileId)
    ).toEqual({ n: 1 })
  })

  test('a gone song whose track comes back is synced again, quietly', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(fileId)
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId }, [1]).outcome).toBe('unchanged')
    expect(file(fileId)).toMatchObject({ sync: 'synced' })
  })

  test('Music re-adding a deleted track (a new ID) relinks the gone song by fingerprint', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(fileId)
    const result = save({ track: track(2, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [2])
    expect(result.fileId).toBe(fileId)
    expect(file(fileId)).toMatchObject({ pid: pid(2), sync: 'synced' })
  })

  test('two Music tracks with identical audio are two songs', () => {
    const one = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    const two = save({ track: track(2, '/m/b.mp3'), facts: facts('/m/b.mp3', 'h1') }, [1, 2])
    expect(two.outcome).toBe('added')
    expect(two.fileId).not.toBe(one.fileId)
  })

  test('a second track of the same sync at the same path is taken, and writes nothing', () => {
    const one = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    const two = save({ track: track(2, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    expect(two).toEqual({ outcome: 'taken', fileId: one.fileId })
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 1 })
  })

  test('a synced track whose file is gone from disk is marked missing, still synced', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId, missing: true }, [1]).outcome).toBe(
      'missing'
    )
    expect(file(fileId)).toMatchObject({ missing: 1, sync: 'synced' })
  })

  test('a replaced file (new size or fingerprint) is updated', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    const replaced = save(
      { track: track(1, '/m/a.mp3'), rowId: fileId, facts: facts('/m/a.mp3', 'h2', 20) },
      [1]
    )
    expect(replaced.outcome).toBe('updated')
  })
})
