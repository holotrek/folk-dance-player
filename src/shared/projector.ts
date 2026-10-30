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

// The middle dance's Canva slide (spec §8.3): its saved image, and whether main's live view of it
// is showing over the slide area. The projector uses the slide layout when either is available.
// A dance's own image (0.3.0 spec §3.7) is drawn in the same place; it needs no live view.
export type ProjectorSlide =
  | {
      kind: 'canva'
      deckId: number
      pageId: string
      imageUrl: string | null // fdp-media://slide/<deck>/<page>, when an image is saved
      live: boolean
    }
  | { kind: 'image'; imageUrl: string } // fdp-media://dance-image/<dance>?v=…

export type ProjectorMiddle =
  // The song that's loaded: playing, paused, or stopped (rewound, ▶ plays it again).
  (
    | { kind: 'now'; entry: ProjectorEntry; playId: number; paused: boolean }
    // Nothing loaded: the next dance, with the countdown before it, if one is running.
    | {
        kind: 'next'
        entry: ProjectorEntry
        countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null
        teaching: boolean // a STOP comes before it: it's the dance to be taught
      }
  ) & { slide?: ProjectorSlide }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Where the slide sits on the projector (spec §8.2): top right, 16:9, filling up to two-thirds of
// the width and the top half of the height, inside the view's margins. The projector page draws
// the saved image there, and main lays its live Canva view over exactly the same box.
export function slideBox(width: number, height: number): Rect {
  const padX = width * 0.04
  const padY = height * 0.03
  const areaWidth = ((width - 2 * padX) * 2) / 3
  const areaHeight = height * 0.5 - padY
  let w = areaWidth
  let h = (w * 9) / 16
  if (h > areaHeight) {
    h = areaHeight
    w = (h * 16) / 9
  }
  return {
    x: Math.round(width - padX - w),
    y: Math.round(padY),
    width: Math.round(w),
    height: Math.round(h)
  }
}

export interface ProjectorSnapshot {
  hasProgram: boolean
  middle: ProjectorMiddle | null
  upcoming: UpcomingRow[]
  played: ProjectorEntry[] // oldest first, so the newest is last
  // The time that remains after the middle song (program-time.ts), for the footer's ending time;
  // null while there is nothing to show.
  tailMs: number | null
}

export const EMPTY_SNAPSHOT: ProjectorSnapshot = {
  hasProgram: false,
  middle: null,
  upcoming: [],
  played: [],
  tailMs: null
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
