import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ApplePlaylist } from '../../../src/main/import/apple-library'
import {
  findEditedApplePlaylists,
  saveApplePlaylists
} from '../../../src/main/import/save-playlists'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let fileIds: Map<number, number>

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'

function addFile(path: string): number {
  return Number(
    db
      .prepare(
        "INSERT INTO files (path, file_size, mtime_ms, source) VALUES (?, 1, 1, 'apple_xml')"
      )
      .run(path).lastInsertRowid
  )
}

const balkan = (trackIds: number[], name = 'Balkan'): ApplePlaylist => ({
  persistentId: 'BAL',
  name,
  trackIds
})

function playlists() {
  return db
    .prepare(
      'SELECT id, name, source, apple_persistent_id, imported_at, modified_at FROM playlists ORDER BY id'
    )
    .all()
}

function items(playlistName: string): string[] {
  return db
    .prepare(
      `SELECT f.path FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id
       JOIN files f ON f.id = i.file_id WHERE p.name = ? ORDER BY i.position`
    )
    .all(playlistName)
    .map((r) => r.path as string)
}

beforeEach(() => {
  db = createTestDb()
  fileIds = new Map([
    [101, addFile('/a.mp3')],
    [102, addFile('/b.mp3')],
    [103, addFile('/c.mp3')]
  ])
})

describe('saveApplePlaylists', () => {
  test('creates a new playlist in Apple Music order, skipping tracks that were not imported', () => {
    const result = saveApplePlaylists(db, [balkan([102, 999, 101])], fileIds, {}, T1)
    expect(result).toEqual({ created: ['Balkan'], replaced: [], kept: [], duplicated: [] })
    expect(items('Balkan')).toEqual(['/b.mp3', '/a.mp3'])
    expect(playlists()).toEqual([
      expect.objectContaining({
        name: 'Balkan',
        source: 'apple_xml',
        apple_persistent_id: 'BAL',
        imported_at: T1,
        modified_at: T1
      })
    ])
  })

  test('silently replaces a playlist that was not edited since it was imported', () => {
    saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
    const result = saveApplePlaylists(db, [balkan([103, 102], 'Balkan 2')], fileIds, {}, T2)
    expect(result.replaced).toEqual(['Balkan 2'])
    expect(items('Balkan 2')).toEqual(['/c.mp3', '/b.mp3'])
    expect(playlists()).toHaveLength(1)
  })

  describe('a playlist edited locally after its import', () => {
    beforeEach(() => {
      saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
      db.prepare('UPDATE playlists SET modified_at = ?').run(T2)
    })

    test('is listed as a conflict', () => {
      expect(findEditedApplePlaylists(db, ['BAL', 'OTHER'])).toEqual([
        { persistentId: 'BAL', name: 'Balkan' }
      ])
    })

    test('is kept by default', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, {}, T3)
      expect(result.kept).toEqual(['Balkan'])
      expect(items('Balkan')).toEqual(['/a.mp3'])
    })

    test('is replaced when the user chooses Replace', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, { BAL: 'replace' }, T3)
      expect(result.replaced).toEqual(['Balkan'])
      expect(items('Balkan')).toEqual(['/b.mp3'])
    })

    test('becomes a local playlist next to a new Apple copy when the user chooses Keep both', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, { BAL: 'both' }, T3)
      expect(result.duplicated).toEqual(['Balkan (Apple Music)'])
      expect(items('Balkan')).toEqual(['/a.mp3'])
      expect(items('Balkan (Apple Music)')).toEqual(['/b.mp3'])
      expect(playlists()).toEqual([
        expect.objectContaining({ name: 'Balkan', source: 'local', apple_persistent_id: null }),
        expect.objectContaining({
          name: 'Balkan (Apple Music)',
          source: 'apple_xml',
          apple_persistent_id: 'BAL'
        })
      ])
    })
  })

  test('playlists never imported or not edited are not conflicts', () => {
    saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
    expect(findEditedApplePlaylists(db, ['BAL', 'NEW'])).toEqual([])
  })
})
