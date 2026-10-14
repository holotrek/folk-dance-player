import { build } from 'plist'
import { pathToFileURL } from 'url'

export interface FakeAppleTrack {
  id: number
  name: string
  path?: string // omitted = streaming-only track
  artist?: string
  albumArtist?: string
  genre?: string
  kind?: string
  totalTimeMs?: number
  persistentId?: string
}

export interface FakeApplePlaylist {
  name: string
  persistentId: string
  trackIds: number[]
  extra?: Record<string, unknown> // e.g. { Master: true }, { 'Distinguished Kind': 4 }, { Folder: true }
}

// Builds a Library.xml in the shape Music.app exports (File → Library → Export Library…).
export function appleLibraryXml(tracks: FakeAppleTrack[], playlists: FakeApplePlaylist[]): string {
  const trackDict: Record<string, Record<string, unknown>> = {}
  for (const t of tracks) {
    trackDict[String(t.id)] = {
      'Track ID': t.id,
      Name: t.name,
      ...(t.artist && { Artist: t.artist }),
      ...(t.albumArtist && { 'Album Artist': t.albumArtist }),
      ...(t.genre && { Genre: t.genre }),
      Kind: t.kind ?? 'MPEG audio file',
      'Total Time': t.totalTimeMs ?? 180000,
      'Persistent ID': t.persistentId ?? `TRACK${String(t.id).padStart(12, '0')}`,
      'Track Type': t.path ? 'File' : 'Remote',
      ...(t.path && { Location: pathToFileURL(t.path).href })
    }
  }
  return build({
    'Major Version': 1,
    'Minor Version': 1,
    'Application Version': '1.5.0.73',
    Tracks: trackDict,
    Playlists: playlists.map((p, i) => ({
      Name: p.name,
      'Playlist ID': 1000 + i,
      'Playlist Persistent ID': p.persistentId,
      'All Items': true,
      ...p.extra,
      'Playlist Items': p.trackIds.map((id) => ({ 'Track ID': id }))
    }))
  } as Parameters<typeof build>[0])
}
