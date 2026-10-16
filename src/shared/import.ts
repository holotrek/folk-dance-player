// Types shared by the import pipeline (main + renderer). Spec §5.
import type { TagTarget } from './settings'

// The import mapping settings (spec §5.2), shown and editable before every import.
export interface ImportMapping {
  artistTagTarget: TagTarget
  albumArtistTagTarget: TagTarget
  genreIsCountry: boolean
}

export type AppleSelection = { mode: 'all' } | { mode: 'playlists'; persistentIds: string[] }

export type PlaylistDecision = 'replace' | 'keep' | 'both'

export type ImportRequest =
  | { kind: 'paths'; paths: string[] }
  | {
      kind: 'apple'
      xmlPath: string
      selection: AppleSelection
      // Only needed for Apple playlists edited locally since their last import (spec §5.3).
      decisions: Record<string, PlaylistDecision>
    }

export interface ImportProgress {
  phase: 'scanning' | 'reading' | 'done'
  done: number
  total: number
  currentPath: string | null
}

export interface ImportSummaryItem {
  path: string
  detail?: string
}

export interface ImportSummary {
  added: ImportSummaryItem[]
  updated: ImportSummaryItem[]
  relinked: ImportSummaryItem[]
  alreadyPresent: ImportSummaryItem[]
  restored: ImportSummaryItem[] // removed songs whose file was added again (sync spec §7.3)
  appleSynced: ImportSummaryItem[] // already in the library through Apple Music sync (§5.7)
  notFound: ImportSummaryItem[]
  unsupported: ImportSummaryItem[]
  unreadable: ImportSummaryItem[]
  playlists: { created: string[]; replaced: string[]; kept: string[]; duplicated: string[] }
  cancelled: boolean
}

export interface ApplePlaylistInfo {
  persistentId: string
  name: string
  trackCount: number
}

// One track's tags as Apple Music lists them, shown beside the mapping choices.
export interface TagSample {
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
}

export interface ApplePreview {
  trackCount: number
  playlists: ApplePlaylistInfo[]
  // Up to TAG_SAMPLE_SIZE local tracks, chosen at random when there are more; sorted by title.
  tagSample: TagSample[]
}

export interface ApplePlaylistConflict {
  persistentId: string
  name: string
}

export function emptySummary(): ImportSummary {
  return {
    added: [],
    updated: [],
    relinked: [],
    alreadyPresent: [],
    restored: [],
    appleSynced: [],
    notFound: [],
    unsupported: [],
    unreadable: [],
    playlists: { created: [], replaced: [], kept: [], duplicated: [] },
    cancelled: false
  }
}
