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
  isRemoved: boolean // removed from the library (sync spec §6.4): shown greyed, never played
  isFavorite: boolean
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

// What the player is doing; main broadcasts it after every change (spec §9).
export interface NowPlaying {
  playId: number // new for every start; the control window's audio events carry it
  source: PlayKind
  itemId: number | null // the program item, for program plays
  track: Track
  restarts: number // bumped by ◀◀ (restart); the control window rewinds when it changes
  logId: number | null // its play_log entry (the projector leaves it out of previously played)
}

export interface PlayerState {
  // 'stopped': ⏹ rewound the song to its start; it stays loaded and ▶ plays it again.
  status: 'idle' | 'countdown' | 'playing' | 'paused' | 'stopped'
  current: NowPlaying | null // set while playing, paused or stopped
  // "Starting in N…" before the first song, or "Next: … in N…" between songs (spec §7.2).
  countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null
  programId: number | null
  nextUp: ProgramItem | null // the program's first unplayed item
  speed: number // 0.5–1.5, pitch preserved
  speedLocked: boolean // keep the speed for the next song
  volume: number // 0–1
  autoContinue: { enabled: boolean; seconds: number }
  warning: string | null // shown in the control window only, never on the projector
  atStop: boolean // playback halted at a STOP marker; the next dance is the one to be taught
}

// Before anything has played (and in the control window until main's state arrives).
export const IDLE_PLAYER_STATE: PlayerState = {
  status: 'idle',
  current: null,
  countdown: null,
  programId: null,
  nextUp: null,
  speed: 1,
  speedLocked: false,
  volume: 1,
  autoContinue: { enabled: true, seconds: 5 },
  warning: null,
  atStop: false
}

// Whether the remote works (spec §7.4): its media keys are global shortcuts, which macOS only
// delivers to an app it trusts for Accessibility.
export interface RemoteStatus {
  trusted: boolean
  keys: string[] // the media keys registered
}

export const NO_REMOTE: RemoteStatus = { trusted: false, keys: [] }
