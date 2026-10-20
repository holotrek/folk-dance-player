// Types shared by the import pipeline (main + renderer). Spec §5.
import type { Settings, TagSource } from './settings'

// The import mapping settings (spec §5.2), shown and editable before every import: for each
// destination, which tag fills it. A tag may feed several fields; a field has one source.
export interface ImportMapping {
  artistFrom: TagSource
  teacherFrom: TagSource
  choreographerFrom: TagSource
  genreIsCountry: boolean
}

export const mappingFromSettings = (s: Settings): ImportMapping => ({
  artistFrom: s['import.artistFrom'],
  teacherFrom: s['import.teacherFrom'],
  choreographerFrom: s['import.choreographerFrom'],
  genreIsCountry: s['import.genreIsCountry']
})

// The settings a mapping is saved as.
export const mappingSettings = (
  m: ImportMapping
): Pick<
  Settings,
  'import.artistFrom' | 'import.teacherFrom' | 'import.choreographerFrom' | 'import.genreIsCountry'
> => ({
  'import.artistFrom': m.artistFrom,
  'import.teacherFrom': m.teacherFrom,
  'import.choreographerFrom': m.choreographerFrom,
  'import.genreIsCountry': m.genreIsCountry
})

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
