import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

export interface Id3Tags {
  title?: string
  artist?: string
  albumArtist?: string
  genre?: string
}

const syncsafe = (n: number): Buffer =>
  Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])

// A small, valid MP3: an ID3v2.4 tag (UTF-8 text frames) followed by silent MPEG-1 Layer III
// frames (128 kbps, 44.1 kHz; 417 bytes ≈ 26 ms each). `salt` changes the audio bytes, so files
// with identical tags still get different content hashes.
export function mp3Bytes(tags: Id3Tags, seconds = 1, salt = 0): Buffer {
  const ids: Record<keyof Id3Tags, string> = {
    title: 'TIT2',
    artist: 'TPE1',
    albumArtist: 'TPE2',
    genre: 'TCON'
  }
  const frames = (Object.keys(tags) as (keyof Id3Tags)[]).map((key) => {
    const data = Buffer.concat([Buffer.from([3]), Buffer.from(tags[key] ?? '', 'utf8')])
    return Buffer.concat([
      Buffer.from(ids[key], 'latin1'),
      syncsafe(data.length),
      Buffer.alloc(2),
      data
    ])
  })
  const body = Buffer.concat(frames)
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), syncsafe(body.length)])
  const frame = Buffer.alloc(417)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  frame[100] = salt & 0xff
  const count = Math.max(1, Math.round(seconds * 38.28))
  return Buffer.concat([header, body, ...Array.from({ length: count }, () => frame)])
}

export interface TempDir {
  path: string
  file(relative: string, contents: Buffer | string): string
  cleanup(): void
}

export function tempDir(): TempDir {
  const root = mkdtempSync(join(tmpdir(), 'fdp-import-'))
  return {
    path: root,
    file(relative, contents) {
      const full = join(root, relative)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, contents)
      return full
    },
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}
