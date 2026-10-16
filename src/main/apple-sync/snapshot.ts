// The helper's JSON snapshot of the Music library, version 1 (sync spec §3.1). Validated before
// anything is applied: a snapshot of the wrong shape is a failed read.

export interface SnapshotTrack {
  persistentId: string
  location: string | null // a file:// URL for local files
  locationType: string // 'file', 'remote', …
  mediaKind: string // 'music', or another kind's name
  kind: string | null // Music's "Kind", e.g. "MPEG audio file"
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
  durationMs: number | null
}

export interface SnapshotFolder {
  persistentId: string
  name: string
  parentId: string | null
}

export interface SnapshotPlaylist {
  persistentId: string
  name: string
  parentId: string | null // its folder
  itemIds: string[] // track persistent IDs, in order
}

export interface Snapshot {
  version: 1
  libraryId: string // the master playlist's persistent ID
  tracks: SnapshotTrack[]
  folders: SnapshotFolder[]
  playlists: SnapshotPlaylist[]
}

export class SnapshotError extends Error {
  constructor(detail: string) {
    super(`The Music library snapshot is invalid: ${detail}`)
    this.name = 'SnapshotError'
  }
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-F]{16}$/.test(v)
const isText = (v: unknown): boolean => v === null || typeof v === 'string'

function list<T>(value: unknown, what: string, check: (v: Dict) => boolean): T[] {
  if (!Array.isArray(value)) throw new SnapshotError(`${what} is not a list`)
  value.forEach((v, i) => {
    if (!isDict(v) || !check(v)) throw new SnapshotError(`${what}[${i}] is malformed`)
  })
  return value as T[]
}

const isTrack = (t: Dict): boolean =>
  isId(t.persistentId) &&
  isText(t.location) &&
  typeof t.locationType === 'string' &&
  typeof t.mediaKind === 'string' &&
  ['kind', 'title', 'artist', 'albumArtist', 'genre'].every((k) => isText(t[k])) &&
  (t.durationMs === null || typeof t.durationMs === 'number')

const isFolder = (f: Dict): boolean =>
  isId(f.persistentId) && typeof f.name === 'string' && (f.parentId === null || isId(f.parentId))

const isPlaylist = (p: Dict): boolean =>
  isFolder(p) && Array.isArray(p.itemIds) && p.itemIds.every(isId)

export function parseSnapshot(value: unknown): Snapshot {
  if (!isDict(value)) throw new SnapshotError('not an object')
  if (value.version !== 1) throw new SnapshotError(`unknown version ${String(value.version)}`)
  if (!isId(value.libraryId)) throw new SnapshotError('no library ID')
  return {
    version: 1,
    libraryId: value.libraryId,
    tracks: list<SnapshotTrack>(value.tracks, 'tracks', isTrack),
    folders: list<SnapshotFolder>(value.folders, 'folders', isFolder),
    playlists: list<SnapshotPlaylist>(value.playlists, 'playlists', isPlaylist)
  }
}
