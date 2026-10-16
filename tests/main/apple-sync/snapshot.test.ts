import { describe, expect, test } from 'vitest'
import { parseSnapshot, SnapshotError } from '../../../src/main/apple-sync/snapshot'
import { pid, snapTrack, snapshot } from './fixtures'

describe('parseSnapshot', () => {
  test('accepts the helper format', () => {
    const value = snapshot({
      tracks: [snapTrack(1, '/m/a.mp3', { title: 'Kolo', genre: 'Serbia' })],
      folders: [{ persistentId: pid(100), name: 'IFD2026', parentId: null }],
      playlists: [{ persistentId: pid(200), name: 'Week 3', parentId: pid(100), itemIds: [pid(1)] }]
    })
    expect(parseSnapshot(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  test.each([
    ['not an object', 'x'],
    ['another version', { ...snapshot(), version: 2 }],
    ['a bad library id', { ...snapshot(), libraryId: 'abc' }],
    ['tracks missing', { ...snapshot(), tracks: undefined }],
    [
      'a track without an id',
      { ...snapshot(), tracks: [{ ...snapTrack(1, '/m/a.mp3'), persistentId: 1 }] }
    ],
    [
      'a playlist with bad items',
      {
        ...snapshot(),
        playlists: [{ persistentId: pid(2), name: 'P', parentId: null, itemIds: [3] }]
      }
    ]
  ])('rejects %s', (_, value) => {
    expect(() => parseSnapshot(value)).toThrow(SnapshotError)
  })
})
