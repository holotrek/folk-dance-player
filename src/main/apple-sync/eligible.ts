import { fileURLToPath } from 'url'
import type { ApplePreview, ImportSummaryItem } from '@shared/import'
import { sampleTags } from '../import/apple-library'
import { classifyPath } from '../import/formats'
import type { RawTags } from '../import/mapping'
import type { Snapshot, SnapshotTrack } from './snapshot'

// A track sync brings in: a local music file in a supported format (sync spec §5.2).
export interface EligibleTrack {
  persistentId: string
  path: string
  tags: RawTags // Music's tags, which win over the file's (§5.3)
  durationMs: number | null
  kind: string | null
}

export interface SortedTracks {
  eligible: EligibleTrack[]
  skipped: { reason: string; count: number }[]
  unsupported: ImportSummaryItem[]
}

// The same rule as readAudioFile's: Music's Kind names Apple Lossless and AIFF.
const UNPLAYABLE_KINDS = /apple lossless|aiff/i

function localPath(track: SnapshotTrack): string | null {
  if (track.locationType !== 'file' || !track.location?.startsWith('file://')) return null
  try {
    return fileURLToPath(track.location)
  } catch {
    return null
  }
}

export function sortTracks(tracks: SnapshotTrack[]): SortedTracks {
  const eligible: EligibleTrack[] = []
  const unsupported: ImportSummaryItem[] = []
  const skipped = new Map<string, number>()
  const skip = (reason: string): void => void skipped.set(reason, (skipped.get(reason) ?? 0) + 1)

  for (const track of tracks) {
    const path = localPath(track)
    if (path === null) {
      skip('In the cloud or streamed')
      continue
    }
    if (track.mediaKind !== 'music') {
      skip(`Not music: ${track.mediaKind}`)
      continue
    }
    const kind = classifyPath(path)
    if (kind === 'ignore') {
      skip('Not an audio file')
      continue
    }
    if (kind === 'unsupported' || (track.kind && UNPLAYABLE_KINDS.test(track.kind))) {
      unsupported.push(track.kind ? { path, detail: `${track.kind} is not supported` } : { path })
      continue
    }
    eligible.push({
      persistentId: track.persistentId,
      path,
      tags: {
        title: track.title,
        artist: track.artist,
        albumArtist: track.albumArtist,
        genre: track.genre
      },
      durationMs: track.durationMs,
      kind: track.kind
    })
  }
  return {
    eligible,
    unsupported,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count }))
  }
}

// The turn-on dialog's mapping step (§5.8 step 2): the synced tracks' tags, sampled like
// Library.xml's, and how many synced tracks each playlist has.
export function previewSnapshot(
  snapshot: Snapshot,
  random: () => number = Math.random
): ApplePreview {
  const { eligible } = sortTracks(snapshot.tracks)
  const synced = new Set(eligible.map((t) => t.persistentId))
  return {
    trackCount: eligible.length,
    playlists: snapshot.playlists.map((p) => ({
      persistentId: p.persistentId,
      name: p.name,
      trackCount: p.itemIds.filter((id) => synced.has(id)).length
    })),
    tagSample: sampleTags(
      eligible.map((t) => t.tags),
      random
    )
  }
}
