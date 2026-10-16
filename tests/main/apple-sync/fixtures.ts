import { pathToFileURL } from 'url'
import type { Snapshot, SnapshotTrack } from '../../../src/main/apple-sync/snapshot'

export const LIBRARY_ID = 'AAAAAAAAAAAAAAA1'

// A persistent ID: 16 uppercase hex digits.
export const pid = (n: number): string => n.toString(16).toUpperCase().padStart(16, '0')

// A local music track at `path`, as the helper reports it.
export function snapTrack(
  n: number,
  path: string,
  over: Partial<SnapshotTrack> = {}
): SnapshotTrack {
  return {
    persistentId: pid(n),
    location: pathToFileURL(path).href,
    locationType: 'file',
    mediaKind: 'music',
    kind: 'MPEG audio file',
    title: `Track ${n}`,
    artist: null,
    albumArtist: null,
    genre: null,
    durationMs: 1000,
    ...over
  }
}

export function snapshot(parts: Partial<Snapshot> = {}): Snapshot {
  return { version: 1, libraryId: LIBRARY_ID, tracks: [], folders: [], playlists: [], ...parts }
}
