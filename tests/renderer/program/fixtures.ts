import { IDLE_PLAYER_STATE, type PlayerState, type ProgramItem, type Track } from '@shared/program'

// A song as programs and the player show it; `label` defaults to the title.
export function track(fileId: number, title: string, extra: Partial<Track> = {}): Track {
  return {
    fileId,
    songId: fileId + 1000,
    danceId: fileId + 2000,
    title,
    label: title,
    parts: { song: null, dance: title, choreographer: null },
    country: null,
    teacher: null,
    durationMs: 180_000,
    isMissing: false,
    danceCount: 1,
    ...extra
  }
}

export const item = (id: number, t: Track): ProgramItem => ({ id, kind: 'track', ...t })
export const stop = (id: number): ProgramItem => ({ id, kind: 'stop' })

export function playerState(extra: Partial<PlayerState> = {}): PlayerState {
  return { ...IDLE_PLAYER_STATE, programId: 5, ...extra }
}

export function playing(t: Track, extra: Partial<PlayerState> = {}, playId = 1): PlayerState {
  return playerState({
    status: 'playing',
    current: { playId, source: 'program', itemId: 1, track: t, restarts: 0 },
    ...extra
  })
}
