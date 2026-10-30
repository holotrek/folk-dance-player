import { tailMs } from '@shared/program-time'
import type { PlayedEntry, PlayerState, ProgramItem, Track } from '@shared/program'
import type {
  ProjectorEntry,
  ProjectorSlide,
  ProjectorSnapshot,
  UpcomingRow
} from '@shared/projector'

const entry = (track: Track): ProjectorEntry => ({ parts: track.parts, country: track.country })

// Upcoming rows from program items: songs, and one "Teaching" row before a song that follows STOP
// markers. Songs whose file is missing are left out (they'll be skipped), and so is a STOP with no
// song after it.
function upcomingRows(items: ProgramItem[]): UpcomingRow[] {
  const rows: UpcomingRow[] = []
  let teaching = false
  for (const item of items) {
    if (item.kind === 'stop') {
      teaching = true
    } else if (!item.isMissing) {
      if (teaching) rows.push({ kind: 'teaching' })
      teaching = false
      rows.push({ kind: 'dance', entry: entry(item) })
    }
  }
  return rows
}

// Spec §8.2: what the projector shows, from the player, the loaded program's unplayed items and its
// play log (which includes previews and replays). `slideFor` gives the middle dance's Canva slide.
export function buildProjectorSnapshot(
  player: PlayerState,
  unplayed: ProgramItem[],
  played: PlayedEntry[],
  slideFor: (danceId: number | null) => ProjectorSlide | null = () => null
): ProjectorSnapshot {
  const withSlide = (track: Track) => {
    const slide = slideFor(track.danceId)
    return slide ? { slide } : {}
  }
  const { current } = player
  const loaded = current && player.status !== 'idle' && player.status !== 'countdown'
  // The song playing now is the newest log entry; it shows in the middle, not twice.
  const history = played.flatMap((p) =>
    p.track && !(loaded && p.logId === current.logId) ? [entry(p.track)] : []
  )
  if (loaded) {
    return {
      hasProgram: player.programId !== null,
      middle: {
        kind: 'now',
        entry: entry(current.track),
        playId: current.playId,
        paused: player.status !== 'playing',
        ...withSlide(current.track)
      },
      upcoming: upcomingRows(unplayed),
      played: history,
      tailMs: tailMs(unplayed, player)
    }
  }
  // Nothing loaded: the next song that will play is the middle; what's after it, the list.
  const index = unplayed.findIndex((i) => i.kind === 'track' && !i.isMissing)
  const next = index < 0 ? null : (unplayed[index] as Extract<ProgramItem, { kind: 'track' }>)
  const stopBefore = unplayed.slice(0, Math.max(index, 0)).some((i) => i.kind === 'stop')
  return {
    hasProgram: player.programId !== null,
    middle: next && {
      kind: 'next',
      entry: entry(next),
      countdown: player.countdown,
      teaching: player.atStop || stopBefore,
      ...withSlide(next)
    },
    upcoming: next ? upcomingRows(unplayed.slice(index + 1)) : [],
    played: history,
    tailMs: next ? tailMs(unplayed, player) : null
  }
}
