import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { mediaUrl, parseMediaUrl, parseSlideUrl, slideUrl } from '@shared/media'
import { mediaResponse, parseRange } from '../../../src/main/media/media-response'

const dir = mkdtempSync(join(tmpdir(), 'fdp-media-'))
const song = join(dir, 'song.mp3')
writeFileSync(song, Buffer.from('0123456789'))
const image = join(dir, 'slide.png')
writeFileSync(image, Buffer.from('png'))

describe('media URLs', () => {
  test('round-trip a file id, and reject anything else', () => {
    expect(mediaUrl(42)).toBe('fdp-media://file/42')
    expect(parseMediaUrl(mediaUrl(42))).toBe(42)
    expect(parseMediaUrl('fdp-media://file/42/')).toBe(42)
    expect(parseMediaUrl('fdp-media://file/../etc/passwd')).toBeNull()
    expect(parseMediaUrl('file:///etc/passwd')).toBeNull()
  })
})

describe('slide image URLs', () => {
  test('name a deck and page, with a version so a new capture reloads', () => {
    const url = slideUrl(3, 'PBrWDbC9tVSzgzvW', '2026-10-14 10:00:00')
    expect(url).toBe('fdp-media://slide/3/PBrWDbC9tVSzgzvW?v=2026-10-14%2010%3A00%3A00')
    expect(parseSlideUrl(url)).toEqual({ deckId: 3, pageId: 'PBrWDbC9tVSzgzvW' })
    expect(parseSlideUrl('fdp-media://slide/3/../../etc')).toBeNull()
    expect(parseSlideUrl(mediaUrl(42))).toBeNull()
  })
})

describe('parseRange', () => {
  test('reads start-end, open-ended and suffix ranges, clamped to the file', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=5-99', 10)).toEqual({ start: 5, end: 9 })
  })

  test('rejects ranges the file can’t satisfy', () => {
    expect(parseRange('bytes=10-', 10)).toBeNull()
    expect(parseRange('bytes=6-2', 10)).toBeNull()
    expect(parseRange('bytes=-0', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })
})

describe('mediaResponse', () => {
  test('serves the whole file with its type', async () => {
    const res = await mediaResponse(song, null)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  test('serves a byte range for seeking', async () => {
    const res = await mediaResponse(song, 'bytes=3-6')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 3-6/10')
    expect(res.headers.get('content-length')).toBe('4')
    expect(await res.text()).toBe('3456')
  })

  test('answers 416 for an impossible range and 404 for a missing file', async () => {
    expect((await mediaResponse(song, 'bytes=20-')).status).toBe(416)
    expect((await mediaResponse(join(dir, 'gone.mp3'), null)).status).toBe(404)
    expect((await mediaResponse(null, null)).status).toBe(404)
    expect((await mediaResponse(dir, null)).status).toBe(404)
  })

  test('serves a saved slide as a PNG', async () => {
    const res = await mediaResponse(image, null)
    expect(res.headers.get('content-type')).toBe('image/png')
  })
})
