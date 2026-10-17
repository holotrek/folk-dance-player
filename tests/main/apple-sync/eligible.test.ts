import { describe, expect, test } from 'vitest'
import { previewSnapshot, sortTracks } from '../../../src/main/apple-sync/eligible'
import { pid, snapTrack, snapshot } from './fixtures'

describe('sortTracks (sync spec §5.2)', () => {
  test('local music files in a playable format are synced, with Music tags', () => {
    const { eligible, skipped, unsupported } = sortTracks([
      snapTrack(1, '/m/Kolo.mp3', { title: 'Kolo', artist: 'Taraf', genre: 'Serbia' })
    ])
    expect(eligible).toEqual([
      {
        persistentId: pid(1),
        path: '/m/Kolo.mp3',
        tags: { title: 'Kolo', artist: 'Taraf', albumArtist: null, genre: 'Serbia' },
        durationMs: 1000,
        kind: 'MPEG audio file'
      }
    ])
    expect(skipped).toEqual([])
    expect(unsupported).toEqual([])
  })

  test('cloud items and other media kinds are skipped and counted by reason', () => {
    const { eligible, skipped } = sortTracks([
      snapTrack(1, '/m/a.mp3', { locationType: 'remote', location: 'https://x' }),
      snapTrack(2, '/m/b.mp3', { locationType: 'remote', location: null }),
      snapTrack(3, '/m/c.m4v', { mediaKind: 'music video' }),
      snapTrack(4, '/m/d.pdf', { mediaKind: 'PDF or booklet' })
    ])
    expect(eligible).toEqual([])
    expect(skipped).toEqual([
      { reason: 'In the cloud or streamed', count: 2 },
      { reason: 'Not music: music video', count: 1 },
      { reason: 'Not music: PDF or booklet', count: 1 }
    ])
  })

  test('Apple Lossless and AIFF are unsupported formats', () => {
    const { eligible, unsupported } = sortTracks([
      snapTrack(1, '/m/a.m4a', { kind: 'Apple Lossless audio file' }),
      snapTrack(2, '/m/b.aiff', { kind: 'AIFF audio file' })
    ])
    expect(eligible).toEqual([])
    expect(unsupported.map((u) => u.path)).toEqual(['/m/a.m4a', '/m/b.aiff'])
  })

  test('a music track that is not an audio file is skipped', () => {
    expect(sortTracks([snapTrack(1, '/m/notes.txt')]).skipped).toEqual([
      { reason: 'Not an audio file', count: 1 }
    ])
  })
})

describe('previewSnapshot', () => {
  test('counts synced tracks per playlist and samples tags', () => {
    const preview = previewSnapshot(
      snapshot({
        tracks: [
          snapTrack(1, '/m/a.mp3', { title: 'B' }),
          snapTrack(2, '/m/b.mp3', { title: 'A' }),
          snapTrack(3, '/m/c.mp3', { locationType: 'remote' })
        ],
        playlists: [
          { persistentId: pid(9), name: 'Week', parentId: null, itemIds: [pid(1), pid(3)] }
        ]
      }),
      () => 0
    )
    expect(preview.trackCount).toBe(2)
    expect(preview.playlists).toEqual([{ persistentId: pid(9), name: 'Week', trackCount: 1 }])
    expect(preview.tagSample.map((t) => t.title)).toEqual(['A', 'B'])
  })
})
