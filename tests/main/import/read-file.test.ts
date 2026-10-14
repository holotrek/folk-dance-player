import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'path'
import { readAudioFile } from '../../../src/main/import/read-file'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'

let dir: TempDir
beforeEach(() => {
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('readAudioFile', () => {
  test('reads tags, duration, size and fingerprint from an MP3', async () => {
    const path = dir.file(
      'Kırmızı.mp3',
      mp3Bytes(
        { title: 'Kırmızı Gül', artist: 'Bora Özkök', albumArtist: 'Ensemble', genre: 'Turkey' },
        2
      )
    )
    const result = await readAudioFile(path)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facts).toMatchObject({
      path,
      tags: { title: 'Kırmızı Gül', artist: 'Bora Özkök', albumArtist: 'Ensemble', genre: 'Turkey' }
    })
    expect(result.facts.fileSize).toBeGreaterThan(30_000)
    expect(result.facts.durationMs).toBeGreaterThan(1900)
    expect(result.facts.durationMs).toBeLessThan(2100)
    expect(result.facts.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('returns null tags for an untagged file', async () => {
    const result = await readAudioFile(dir.file('plain.mp3', mp3Bytes({})))
    expect(result.ok && result.facts.tags).toEqual({
      title: null,
      artist: null,
      albumArtist: null,
      genre: null
    })
  })

  test('uses known tags (from Apple Music) instead of parsing the file', async () => {
    const path = dir.file('song.mp3', mp3Bytes({ title: 'From the file' }))
    const known = {
      tags: { title: 'From Apple', artist: 'A', albumArtist: null, genre: 'Greece' },
      durationMs: 183000,
      kind: 'MPEG audio file'
    }
    const result = await readAudioFile(path, known)
    expect(result.ok && result.facts).toMatchObject({ tags: known.tags, durationMs: 183000 })
  })

  test('reports a missing file as not found', async () => {
    expect(await readAudioFile(join(dir.path, 'gone.mp3'))).toMatchObject({
      ok: false,
      reason: 'not_found'
    })
  })

  test('reports formats we cannot play as unsupported', async () => {
    expect(await readAudioFile(dir.file('a.aiff', 'x'))).toMatchObject({
      ok: false,
      reason: 'unsupported'
    })
  })

  test('reports Apple Lossless (by Apple Music kind) as unsupported', async () => {
    const path = dir.file('a.m4a', 'x')
    const known = {
      tags: { title: 'A', artist: null, albumArtist: null, genre: null },
      durationMs: 1000,
      kind: 'Apple Lossless audio file'
    }
    expect(await readAudioFile(path, known)).toMatchObject({ ok: false, reason: 'unsupported' })
  })

  test('reports a corrupt file as unreadable', async () => {
    const path = dir.file('broken.mp3', 'this is not audio at all '.repeat(40))
    expect(await readAudioFile(path)).toMatchObject({ ok: false, reason: 'unreadable', path })
  })
})
