// Types for programs, the play log and the player, shared by main and renderer. Spec §6.2, §7.
import type { LabelParts } from './labels'

// A program in the sidebar list (spec §6.1): newest edit first.
export interface ProgramSummary {
  id: number
  name: string
  updatedAt: string
  unplayedCount: number // unplayed songs (not STOP markers)
}

// A song with the dance shown for it, as programs, the play log and the player show it.
export interface Track {
  fileId: number
  songId: number
  danceId: number | null
  title: string
  label: string // "Song | Dance (Choreographer)" (spec §4)
  parts: LabelParts
  country: string | null
  teacher: string | null
  durationMs: number | null
  isMissing: boolean
  danceCount: number // dances linked to the song; > 1 offers the Dance menu
}

export type ProgramItem = { id: number; kind: 'stop' } | ({ id: number; kind: 'track' } & Track)

// A program with its unplayed items, in order (spec §6.2: played items aren't shown).
export interface ProgramDetail {
  id: number
  name: string
  items: ProgramItem[]
}

export type PlayKind = 'program' | 'preview' | 'replay'

// One play_log row for the "Previously played" list, newest first.
export interface PlayedEntry {
  logId: number
  kind: PlayKind
  playedAt: string
  track: Track | null // null when the file has since been removed from the library
}
