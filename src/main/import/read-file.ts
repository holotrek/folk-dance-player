import { stat } from 'fs/promises'
import { parseFile } from 'music-metadata'
import { contentHash } from './content-hash'
import { classifyPath, isPlayableCodec } from './formats'
import type { RawTags } from './mapping'

export interface FileFacts {
  path: string
  fileSize: number
  mtimeMs: number
  durationMs: number | null
  contentHash: string
  tags: RawTags
}

export type ReadFailure = 'not_found' | 'unsupported' | 'unreadable'

export type ReadResult =
  { ok: true; facts: FileFacts } | { ok: false; path: string; reason: ReadFailure; detail: string }

// Tags already known from Apple Music's Library.xml; the file itself isn't parsed (spec §5.3).
export interface KnownTags {
  tags: RawTags
  durationMs: number | null
  kind: string | null
}

const UNPLAYABLE_KINDS = /apple lossless|aiff/i

const fail = (path: string, reason: ReadFailure, detail: string): ReadResult => ({
  ok: false,
  path,
  reason,
  detail
})

export async function readAudioFile(path: string, known?: KnownTags): Promise<ReadResult> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return fail(path, 'not_found', 'File not found')
  if (classifyPath(path) !== 'audio') return fail(path, 'unsupported', 'Format not supported')
  if (known?.kind && UNPLAYABLE_KINDS.test(known.kind)) {
    return fail(path, 'unsupported', `${known.kind} is not supported`)
  }

  let tags: RawTags
  let durationMs: number | null
  if (known) {
    tags = known.tags
    durationMs = known.durationMs
  } else {
    try {
      const { format, common } = await parseFile(path)
      if (!format.container) return fail(path, 'unreadable', 'No audio data found')
      if (!isPlayableCodec(format.codec)) {
        return fail(path, 'unsupported', `${format.codec} is not supported`)
      }
      tags = {
        title: common.title ?? null,
        artist: common.artist ?? null,
        albumArtist: common.albumartist ?? null,
        genre: common.genre?.[0] ?? null
      }
      durationMs = format.duration ? Math.round(format.duration * 1000) : null
    } catch (err) {
      return fail(path, 'unreadable', err instanceof Error ? err.message : String(err))
    }
  }

  return {
    ok: true,
    facts: {
      path,
      fileSize: info.size,
      mtimeMs: Math.round(info.mtimeMs),
      durationMs,
      contentHash: await contentHash(path),
      tags
    }
  }
}
