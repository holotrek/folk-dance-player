import { describe, expect, test } from 'vitest'
import {
  AppleLibraryError,
  parseAppleLibrary,
  previewAppleLibrary,
  selectAppleImport
} from '../../../src/main/import/apple-library'
import { appleLibraryXml } from '../helpers/apple-xml'

const xml = appleLibraryXml(
  [
    {
      id: 101,
      name: 'Ajde Jano',
      path: '/Music/Balkan/Ajde Jano.mp3',
      artist: 'Ensemble',
      albumArtist: 'Bora Özkök',
      genre: 'Serbia',
      totalTimeMs: 201000,
      persistentId: 'AAA0000000000101'
    },
    { id: 102, name: 'Ali Paşa', path: '/Music/Ali Paşa.mp3', genre: 'Turkey' },
    { id: 103, name: 'Hora Mare', path: '/Music/Hora Mare.m4a', kind: 'Apple Lossless audio file' },
    { id: 104, name: 'Streaming Only' }
  ],
  [
    {
      name: 'Library',
      persistentId: 'LIB',
      trackIds: [101, 102, 103, 104],
      extra: { Master: true }
    },
    {
      name: 'Music',
      persistentId: 'MUS',
      trackIds: [101, 102],
      extra: { 'Distinguished Kind': 4 }
    },
    { name: 'Folk Folder', persistentId: 'FLD', trackIds: [], extra: { Folder: true } },
    { name: 'Hidden', persistentId: 'HID', trackIds: [101], extra: { Visible: false } },
    { name: 'Balkan', persistentId: 'BAL', trackIds: [102, 101, 104] },
    { name: 'Couple dances', persistentId: 'CPL', trackIds: [103] }
  ]
)

describe('parseAppleLibrary', () => {
  test('reads tracks with decoded file paths and Apple Music tags', () => {
    const lib = parseAppleLibrary(xml)
    expect(lib.tracks.get(101)).toEqual({
      trackId: 101,
      persistentId: 'AAA0000000000101',
      path: '/Music/Balkan/Ajde Jano.mp3',
      tags: { title: 'Ajde Jano', artist: 'Ensemble', albumArtist: 'Bora Özkök', genre: 'Serbia' },
      durationMs: 201000,
      kind: 'MPEG audio file'
    })
    expect(lib.tracks.get(102)?.path).toBe('/Music/Ali Paşa.mp3')
  })

  test('gives streaming-only tracks no path', () => {
    expect(parseAppleLibrary(xml).tracks.get(104)?.path).toBeNull()
  })

  test('keeps only the user’s own playlists, in order', () => {
    const lib = parseAppleLibrary(xml)
    expect(lib.playlists.map((p) => p.name)).toEqual(['Balkan', 'Couple dances'])
    expect(lib.playlists[0]).toEqual({
      persistentId: 'BAL',
      name: 'Balkan',
      trackIds: [102, 101, 104]
    })
  })

  test('rejects files that are not an Apple Music library', () => {
    expect(() => parseAppleLibrary('<plist version="1.0"><dict></dict></plist>')).toThrow(
      AppleLibraryError
    )
    expect(() => parseAppleLibrary('not xml at all')).toThrow(AppleLibraryError)
  })
})

describe('previewAppleLibrary', () => {
  test('counts local tracks and each playlist’s local tracks', () => {
    expect(previewAppleLibrary(parseAppleLibrary(xml))).toEqual({
      trackCount: 3,
      playlists: [
        { persistentId: 'BAL', name: 'Balkan', trackCount: 2 },
        { persistentId: 'CPL', name: 'Couple dances', trackCount: 1 }
      ],
      tagSample: [
        { title: 'Ajde Jano', artist: 'Ensemble', albumArtist: 'Bora Özkök', genre: 'Serbia' },
        { title: 'Ali Paşa', artist: null, albumArtist: null, genre: 'Turkey' },
        { title: 'Hora Mare', artist: null, albumArtist: null, genre: null }
      ]
    })
  })

  test('samples 50 local tracks at random from a larger library, sorted by title', () => {
    const big = parseAppleLibrary(
      appleLibraryXml(
        Array.from({ length: 120 }, (_, i) => ({
          id: i + 1,
          name: `Song ${String(i + 1).padStart(3, '0')}`,
          path: `/Music/${i + 1}.mp3`
        })),
        []
      )
    )
    const low = previewAppleLibrary(big, () => 0).tagSample.map((t) => t.title)
    const high = previewAppleLibrary(big, () => 0.999).tagSample.map((t) => t.title)
    expect(low).toHaveLength(50)
    expect(new Set(low).size).toBe(50)
    expect(low).toEqual([...low].sort())
    expect(high).toHaveLength(50)
    expect(high).not.toEqual(low)
  })
})

describe('selectAppleImport', () => {
  test('whole library: every local track and every playlist', () => {
    const picked = selectAppleImport(parseAppleLibrary(xml), { mode: 'all' })
    expect(picked.tracks.map((t) => t.trackId)).toEqual([101, 102, 103])
    expect(picked.playlists.map((p) => p.persistentId)).toEqual(['BAL', 'CPL'])
  })

  test('chosen playlists: only their local tracks, without duplicates', () => {
    const picked = selectAppleImport(parseAppleLibrary(xml), {
      mode: 'playlists',
      persistentIds: ['BAL']
    })
    expect(picked.tracks.map((t) => t.trackId)).toEqual([102, 101])
    expect(picked.playlists.map((p) => p.persistentId)).toEqual(['BAL'])
  })
})
