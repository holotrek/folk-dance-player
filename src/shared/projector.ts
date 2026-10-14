// What the projector shows (spec §8.2), built in main and sent to the projector window, which
// only renders it.
import type { LabelParts } from './labels'

// One dance: the dance (and choreographer, when the label needs it) large; the song smaller, only
// when it differs; the country on the right.
export interface ProjectorEntry {
  parts: LabelParts
  country: string | null
}

// The upcoming list: dances, and "Teaching" before a dance that will be taught (a STOP marker).
export type UpcomingRow = { kind: 'dance'; entry: ProjectorEntry } | { kind: 'teaching' }

export type ProjectorMiddle =
  // The song that's loaded: playing, paused, or stopped (rewound, ▶ plays it again).
  | { kind: 'now'; entry: ProjectorEntry; playId: number; paused: boolean }
  // Nothing loaded: the next dance, with the countdown before it, if one is running.
  | {
      kind: 'next'
      entry: ProjectorEntry
      countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null
      teaching: boolean // a STOP comes before it: it's the dance to be taught
    }

export interface ProjectorSnapshot {
  hasProgram: boolean
  middle: ProjectorMiddle | null
  upcoming: UpcomingRow[]
  played: ProjectorEntry[] // newest first
}

export const EMPTY_SNAPSHOT: ProjectorSnapshot = {
  hasProgram: false,
  middle: null,
  upcoming: [],
  played: []
}

// The red elapsed-time line, sent separately (about 4 times a second) from the snapshot.
export interface ProjectorProgress {
  playId: number
  positionMs: number
  durationMs: number | null
}

// The projector window's state, shown by the player bar's toggle (spec §8.1).
export interface ProjectorStatus {
  enabled: boolean // the toggle: projector mode wanted
  open: boolean
  mode: 'projector' | 'laptop' | null // a separate display, or covering the control window's own
  display: string | null // the display it's on
  notice: string | null // e.g. no separate display: showing on this screen
}

// A display the projector can use (Settings' choice).
export interface DisplayChoice {
  id: number
  label: string
  primary: boolean
  internal: boolean
}

export const PROJECTOR_OFF: ProjectorStatus = {
  enabled: false,
  open: false,
  mode: null,
  display: null,
  notice: null
}

// The projector window's whole API (its own preload): it only receives.
export interface ProjectorApi {
  getSnapshot(): Promise<ProjectorSnapshot>
  onSnapshot(listener: (snapshot: ProjectorSnapshot) => void): () => void
  onProgress(listener: (progress: ProjectorProgress) => void): () => void
}
