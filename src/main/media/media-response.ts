import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

// One byte range from a Range header ("bytes=a-b", "bytes=a-" or "bytes=-n"), clamped to the
// file; null when the header asks for something the file doesn't have.
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (suffix === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start < size && start <= end ? { start, end } : null
}

// Serves an audio file to <audio> (or a saved slide image to the projector), honoring Range requests so seeking works (spec §9).
export async function mediaResponse(path: string | null, range: string | null): Promise<Response> {
  if (!path) return new Response('Not found', { status: 404 })
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return new Response('Not found', { status: 404 })
    size = info.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const body = (start: number, end: number) =>
    Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
  if (!range) {
    return new Response(size === 0 ? null : body(0, size - 1), {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
    })
  }
  const r = parseRange(range, size)
  if (!r) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  return new Response(body(r.start, r.end), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(r.end - r.start + 1),
      'Content-Range': `bytes ${r.start}-${r.end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  })
}
