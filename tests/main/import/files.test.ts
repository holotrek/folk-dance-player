import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { symlinkSync } from 'fs'
import { join } from 'path'
import { contentHash } from '../../../src/main/import/content-hash'
import { classifyPath, isPlayableCodec } from '../../../src/main/import/formats'
import { findAudioFiles } from '../../../src/main/import/scan'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'

let dir: TempDir
beforeEach(() => {
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('classifyPath', () => {
  test.each(['a.mp3', 'a.M4A', 'a.aac', 'a.wav', 'a.flac', 'a.ogg', 'a.oga', 'a.opus'])(
    '%s is playable audio',
    (p) => expect(classifyPath(p)).toBe('audio')
  )
  test.each(['a.aif', 'a.aiff', 'a.wma', 'a.ape', 'a.alac', 'a.mid'])(
    '%s is audio we cannot play',
    (p) => expect(classifyPath(p)).toBe('unsupported')
  )
  test.each(['cover.jpg', 'notes.txt', 'a.m3u', 'noext'])('%s is ignored', (p) =>
    expect(classifyPath(p)).toBe('ignore')
  )
})

describe('isPlayableCodec', () => {
  test('rejects Apple Lossless', () => {
    expect(isPlayableCodec('ALAC')).toBe(false)
  })
  test('accepts common codecs and unknown ones', () => {
    expect(isPlayableCodec('MPEG 1 Layer 3')).toBe(true)
    expect(isPlayableCodec('MPEG-4/AAC')).toBe(true)
    expect(isPlayableCodec(undefined)).toBe(true)
  })
})

describe('contentHash', () => {
  test('is stable for the same bytes and differs for different bytes', async () => {
    const a = dir.file('a.mp3', mp3Bytes({ title: 'A' }, 120, 1))
    const b = dir.file('b.mp3', mp3Bytes({ title: 'A' }, 120, 1))
    const c = dir.file('c.mp3', mp3Bytes({ title: 'A' }, 120, 2))
    expect(await contentHash(a)).toBe(await contentHash(b))
    expect(await contentHash(a)).not.toBe(await contentHash(c))
  })

  test('includes the file size', async () => {
    const a = dir.file('a.bin', Buffer.alloc(10))
    const b = dir.file('b.bin', Buffer.alloc(11))
    expect(await contentHash(a)).not.toBe(await contentHash(b))
  })
})

describe('findAudioFiles', () => {
  test('walks folders recursively and sorts audio from unsupported files', async () => {
    dir.file('Balkan/Ajde Jano.mp3', 'x')
    dir.file('Balkan/Serbia/Kolo.flac', 'x')
    dir.file('Balkan/cover.jpg', 'x')
    dir.file('Old/Song.aiff', 'x')
    dir.file('Top.m4a', 'x')
    const found = await findAudioFiles([dir.path])
    expect(found.audio.map((p) => p.slice(dir.path.length + 1)).sort()).toEqual([
      'Balkan/Ajde Jano.mp3',
      'Balkan/Serbia/Kolo.flac',
      'Top.m4a'
    ])
    expect(found.unsupported.map((p) => p.slice(dir.path.length + 1))).toEqual(['Old/Song.aiff'])
  })

  test('accepts individual files as well as folders, without duplicates', async () => {
    const a = dir.file('a.mp3', 'x')
    dir.file('sub/b.mp3', 'x')
    const found = await findAudioFiles([a, dir.path, a])
    expect(found.audio.sort()).toEqual([a, join(dir.path, 'sub/b.mp3')].sort())
  })

  test('skips hidden files and folders', async () => {
    dir.file('.hidden/a.mp3', 'x')
    dir.file('._b.mp3', 'x')
    dir.file('c.mp3', 'x')
    const found = await findAudioFiles([dir.path])
    expect(found.audio).toEqual([join(dir.path, 'c.mp3')])
  })

  test('does not follow symlinked folders (no loops)', async () => {
    dir.file('music/a.mp3', 'x')
    symlinkSync(dir.path, join(dir.path, 'music/loop'))
    const found = await findAudioFiles([dir.path])
    expect(found.audio).toEqual([join(dir.path, 'music/a.mp3')])
  })

  test('ignores roots that do not exist', async () => {
    const found = await findAudioFiles([join(dir.path, 'missing')])
    expect(found).toEqual({ audio: [], unsupported: [] })
  })
})
