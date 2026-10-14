import { extname } from 'path'

// What Chromium's <audio> element can play (spec §5.4).
const PLAYABLE = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.oga', '.opus'])
// Audio formats we recognize but can't play in v1; reported as "unsupported format".
const UNSUPPORTED = new Set(['.aif', '.aiff', '.aifc', '.alac', '.wma', '.ape', '.mid', '.midi'])

export type PathKind = 'audio' | 'unsupported' | 'ignore'

export function classifyPath(path: string): PathKind {
  const ext = extname(path).toLowerCase()
  if (PLAYABLE.has(ext)) return 'audio'
  if (UNSUPPORTED.has(ext)) return 'unsupported'
  return 'ignore'
}

// Apple Lossless hides inside .m4a files, so the codec is checked after reading the file.
export function isPlayableCodec(codec: string | undefined): boolean {
  return codec?.toUpperCase() !== 'ALAC'
}
