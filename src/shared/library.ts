import type { DanceSlide } from './canva'
// Types for the library (Music page, sidebar) shared by main and renderer. Spec §4, §6.

export type LibraryFilter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'playlist'; playlistId: number }
  | { kind: 'review' } // "Removed from Apple Music" (sync spec §6.2)

export type SortColumn =
  | 'title'
  | 'dance'
  | 'artist'
  | 'country'
  | 'teacher'
  | 'choreographer'
  | 'danceType'
  | 'difficulty'
  | 'duration'
  | 'position' // playlist order; only meaningful with a playlist filter

export interface LibrarySort {
  column: SortColumn
  direction: 'asc' | 'desc'
}

export interface LibraryQuery {
  search: string
  filter: LibraryFilter
  sort: LibrarySort
}

// One song as the table shows it: with its default dance (spec §4) and that pairing's teacher.
export interface LibraryRow {
  fileId: number
  songId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: boolean
  isFavorite: boolean
  danceId: number | null
  danceName: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
  danceType: string | null
  difficulty: number | null
  danceCount: number
  hasNotesPdf: boolean // the shown dance has a PDF attached (it can be opened from the row's menu)
  label: string
  playlistItemId: number | null // set when listing a playlist
  playlistNumber: number | null // its place in the playlist's own order (1, 2, …), in a playlist
}

// A dance linked to a song, as the side editor shows it (spec §6.3).
export interface SongDance {
  danceId: number
  pairingId: number
  name: string
  country: string | null
  choreographer: string | null
  danceType: string | null
  difficulty: number | null
  notes: string | null
  teacher: string | null // on this dance–song pairing
  songCount: number // songs this dance is linked to ("also used by N songs")
  isDefault: boolean
  // The song's default dance, used by this song only, named like the song: it follows the song's
  // name (0.3.0 spec §3.5).
  sameAsSong: boolean
  notesPdf: { name: string; missing: boolean } | null // its attached PDF (0.3.0 spec §3.6)
  slideImage: { name: string; url: string; missing: boolean } | null // its slide image (§3.7)
  // Which slide the projector shows when the dance has both a Canva slide and an image; null
  // otherwise (there is nothing to choose).
  slideShows: 'canva' | 'image' | null
  label: string
  slide: DanceSlide | null // its Canva slide (spec §8.3)
}

// "Another dance called X exists — same dance?" (spec §6.3)
export interface SameNameSuggestion {
  forDanceId: number
  candidate: {
    danceId: number
    name: string
    choreographer: string | null
    country: string | null
    songTitles: string[]
  }
}

export interface SongDetail {
  songId: number
  fileId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: boolean
  isFavorite: boolean
  dances: SongDance[]
  suggestions: SameNameSuggestion[]
}

export interface SongPatch {
  title?: string
  artist?: string | null
  // With a new title: leave the song's default dance named as it is, even when it was named like the
  // song (the editor sends it while "Same as song" is unchecked; 0.3.0 spec §3.5).
  keepDanceName?: boolean
}

export interface DancePatch {
  name?: string
  country?: string | null
  choreographer?: string | null
  danceType?: string | null
  difficulty?: number | null
  notes?: string | null
  // Name the dance as its song is named now ("Same as song" checked); only for a dance used by
  // one song. Wins over `name`.
  sameAsSong?: boolean
}

// A dance offered by "Link an existing dance…".
export interface DanceSearchResult {
  danceId: number
  name: string
  choreographer: string | null
  country: string | null
  songCount: number
}

export interface PlaylistSummary {
  id: number
  name: string
  source: 'local' | 'apple_xml'
  itemCount: number
  mirror: boolean // a read-only mirror of a Music playlist (sync spec §6.3)
  folderId: number | null // its Music folder
}

// Autocomplete lists (spec §4): teachers and choreographers share one list.
export interface Suggestions {
  people: string[]
  countries: string[]
  danceTypes: string[]
}

// A song's raw file tags, shown when choosing a mapping to re-apply.
export interface SongTags {
  songId: number
  title: string
  artist: string | null
  albumArtist: string | null
  genre: string | null
}

export interface ReapplyResult {
  songs: number
  skippedSharedDances: number // dances used by other songs too, left unchanged
}
