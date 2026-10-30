import type { PlayerState } from './program'

// Program times (0.3.0 spec §3.9), computed here once so main, the control window and the
// projector agree. Only unplayed items are passed in. A STOP adds no time (the ending time assumes
// no pauses), and the playback speed is ignored.
// What playTime reads of a program item (a ProgramItem has it all).
export type TimedItem =
  | { kind: 'stop' }
  | { kind: 'track'; durationMs: number | null; isMissing: boolean; isRemoved: boolean }

export interface PlayTime {
  durationMs: number // the songs that will play
  gaps: number // auto-continue gaps between two songs with no STOP between them
}

export interface AutoContinue {
  enabled: boolean
  seconds: number
}

// Songs whose file is missing, and removed songs, are skipped by playback, so they are left out; a
// song with no known duration counts as zero. `afterSong` says a song is playing now, so the first
// song also has a gap before it (unless a STOP comes first).
export function playTime(items: TimedItem[], afterSong = false): PlayTime {
  let durationMs = 0
  let gaps = 0
  let songBefore = afterSong
  for (const item of items) {
    if (item.kind === 'stop') {
      songBefore = false
    } else if (!item.isMissing && !item.isRemoved) {
      if (songBefore) gaps++
      durationMs += item.durationMs ?? 0
      songBefore = true
    }
  }
  return { durationMs, gaps }
}

export const totalMs = (time: PlayTime, autoContinue: AutoContinue): number =>
  time.durationMs + (autoContinue.enabled ? time.gaps * autoContinue.seconds * 1000 : 0)

// What remains after the current song (or from now, when nothing is playing): the unplayed songs
// and their gaps, and a countdown's seconds left.
export function tailMs(
  items: TimedItem[],
  player: Pick<PlayerState, 'status' | 'countdown' | 'autoContinue'>
): number {
  const { status, autoContinue } = player
  if (status === 'playing' || status === 'paused' || status === 'stopped') {
    return totalMs(playTime(items, true), autoContinue)
  }
  const rest = totalMs(playTime(items, false), autoContinue)
  return status === 'countdown' ? rest + (player.countdown?.secondsLeft ?? 0) * 1000 : rest
}

// A total as M:SS, or H:MM:SS from an hour up.
export function formatTotal(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}

// A clock time (ms since the epoch) as the system's short time, for example "9:42 PM".
export const formatClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
