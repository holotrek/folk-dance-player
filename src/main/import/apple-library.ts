import { parse } from 'plist'
import { fileURLToPath } from 'url'
import type { AppleSelection, ApplePreview } from '@shared/import'
import type { RawTags } from './mapping'

export interface AppleTrack {
  trackId: number
  persistentId: string | null
  path: string | null // null for streaming-only tracks
  tags: RawTags
  durationMs: number | null
  kind: string | null
}

export interface ApplePlaylist {
  persistentId: string
  name: string
  trackIds: number[]
}

export interface AppleLibrary {
  tracks: Map<number, AppleTrack>
  playlists: ApplePlaylist[]
}

export class AppleLibraryError extends Error {
  constructor(message = 'This file is not an Apple Music library export (Library.xml).') {
    super(message)
    this.name = 'AppleLibraryError'
  }
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function trackPath(raw: Dict): string | null {
  const location = str(raw['Location'])
  const type = str(raw['Track Type'])
  if (!location?.startsWith('file://') || (type !== null && type !== 'File')) return null
  try {
    return fileURLToPath(location)
  } catch {
    return null
  }
}

// System playlists (Library, Music, Purchased, Downloaded…), folders and hidden lists aren't the
// user's own playlists (spec §5.3).
const isUserPlaylist = (raw: Dict): boolean =>
  raw['Master'] !== true &&
  raw['Distinguished Kind'] === undefined &&
  raw['Folder'] !== true &&
  raw['Visible'] !== false &&
  typeof raw['Playlist Persistent ID'] === 'string'

export function parseAppleLibrary(xml: string): AppleLibrary {
  let root: unknown
  try {
    root = parse(xml)
  } catch {
    throw new AppleLibraryError()
  }
  if (!isDict(root) || !isDict(root['Tracks'])) throw new AppleLibraryError()

  const tracks = new Map<number, AppleTrack>()
  for (const raw of Object.values(root['Tracks'])) {
    if (!isDict(raw)) continue
    const trackId = num(raw['Track ID'])
    if (trackId === null) continue
    tracks.set(trackId, {
      trackId,
      persistentId: str(raw['Persistent ID']),
      path: trackPath(raw),
      tags: {
        title: str(raw['Name']),
        artist: str(raw['Artist']),
        albumArtist: str(raw['Album Artist']),
        genre: str(raw['Genre'])
      },
      durationMs: num(raw['Total Time']),
      kind: str(raw['Kind'])
    })
  }

  const rawPlaylists = Array.isArray(root['Playlists']) ? root['Playlists'] : []
  const playlists: ApplePlaylist[] = rawPlaylists
    .filter(isDict)
    .filter(isUserPlaylist)
    .map((raw) => ({
      persistentId: raw['Playlist Persistent ID'] as string,
      name: str(raw['Name']) ?? 'Untitled playlist',
      trackIds: (Array.isArray(raw['Playlist Items']) ? raw['Playlist Items'] : [])
        .map((item) => (isDict(item) ? num(item['Track ID']) : null))
        .filter((id): id is number => id !== null)
    }))

  return { tracks, playlists }
}

const localTracks = (lib: AppleLibrary, ids: number[]): AppleTrack[] =>
  ids.map((id) => lib.tracks.get(id)).filter((t): t is AppleTrack => !!t?.path)

export function previewAppleLibrary(lib: AppleLibrary): ApplePreview {
  return {
    trackCount: [...lib.tracks.values()].filter((t) => t.path).length,
    playlists: lib.playlists.map((p) => ({
      persistentId: p.persistentId,
      name: p.name,
      trackCount: localTracks(lib, p.trackIds).length
    }))
  }
}

export function selectAppleImport(
  lib: AppleLibrary,
  selection: AppleSelection
): { tracks: AppleTrack[]; playlists: ApplePlaylist[] } {
  if (selection.mode === 'all') {
    return { tracks: localTracks(lib, [...lib.tracks.keys()]), playlists: lib.playlists }
  }
  const wanted = new Set(selection.persistentIds)
  const playlists = lib.playlists.filter((p) => wanted.has(p.persistentId))
  const ids = [...new Set(playlists.flatMap((p) => p.trackIds))]
  return { tracks: localTracks(lib, ids), playlists }
}
