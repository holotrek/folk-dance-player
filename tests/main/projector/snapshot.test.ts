import { describe, expect, test } from 'vitest'
import type { PlayedEntry, PlayerState, ProgramItem, Track } from '@shared/program'
import { IDLE_PLAYER_STATE } from '@shared/program'
import { buildProjectorSnapshot } from '../../../src/main/projector/snapshot'

const track = (id: number, dance: string, extra: Partial<Track> = {}): Track => ({
  fileId: id,
  songId: id,
  danceId: id,
  title: dance,
  label: dance,
  parts: { song: null, dance, choreographer: null },
  country: `Country ${id}`,
  teacher: null,
  durationMs: 180_000,
  isMissing: false,
  isRemoved: false,
  isFavorite: false,
  danceCount: 1,
  hasNotesPdf: false,
  ...extra
})
const item = (id: number, t: Track): ProgramItem => ({ id, kind: 'track', ...t })
const stop = (id: number): ProgramItem => ({ id, kind: 'stop' })
const played = (logId: number, t: Track | null, kind: PlayedEntry['kind'] = 'program') => ({
  logId,
  kind,
  playedAt: '2026-10-14T20:00:00Z',
  track: t
})
const state = (extra: Partial<PlayerState> = {}): PlayerState => ({
  ...IDLE_PLAYER_STATE,
  programId: 5,
  ...extra
})

const hora = track(1, 'Hora Mare', {
  parts: { song: 'Hora de la Munte', dance: 'Hora Mare', choreographer: null }
})
const kolo = track(2, 'Kolo')
const tfilati = track(3, 'Tfilati')

describe('projector snapshot', () => {
  test('playing: the song as Now Playing, then the rest of the program', () => {
    const snap = buildProjectorSnapshot(
      state({
        status: 'playing',
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0, logId: null }
      }),
      [item(2, kolo), item(3, tfilati)],
      [played(1, hora)]
    )
    expect(snap).toEqual({
      hasProgram: true,
      middle: {
        kind: 'now',
        playId: 7,
        paused: false,
        entry: { parts: hora.parts, country: 'Country 1' }
      },
      upcoming: [
        { kind: 'dance', entry: { parts: kolo.parts, country: 'Country 2' } },
        { kind: 'dance', entry: { parts: tfilati.parts, country: 'Country 3' } }
      ],
      played: [{ parts: hora.parts, country: 'Country 1' }],
      tailMs: 2 * 180_000 + 2 * 5000
    })
  })

  test('the song playing now isn’t repeated under previously played', () => {
    const snap = buildProjectorSnapshot(
      state({
        status: 'playing',
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0, logId: 5 }
      }),
      [],
      [played(5, hora), played(4, kolo)]
    )
    expect(snap.played.map((e) => e.parts.dance)).toEqual(['Kolo'])
  })

  test('paused or stopped still show the loaded song', () => {
    for (const status of ['paused', 'stopped'] as const) {
      const snap = buildProjectorSnapshot(
        state({
          status,
          current: {
            playId: 7,
            source: 'preview',
            itemId: null,
            track: kolo,
            restarts: 0,
            logId: null
          }
        }),
        [],
        []
      )
      expect(snap.middle).toMatchObject({ kind: 'now', paused: true })
    }
  })

  test('nothing loaded: the next dance in the middle, with the countdown when one runs', () => {
    const snap = buildProjectorSnapshot(
      state({ status: 'countdown', countdown: { secondsLeft: 3, reason: 'continue' } }),
      [item(2, kolo), item(3, tfilati)],
      []
    )
    expect(snap.middle).toEqual({
      kind: 'next',
      entry: { parts: kolo.parts, country: 'Country 2' },
      countdown: { secondsLeft: 3, reason: 'continue' },
      teaching: false
    })
    expect(snap.upcoming).toEqual([
      { kind: 'dance', entry: { parts: tfilati.parts, country: 'Country 3' } }
    ])
  })

  test('a STOP becomes a Teaching row before the dance it leads to', () => {
    const snap = buildProjectorSnapshot(
      state({
        status: 'playing',
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0, logId: null }
      }),
      [item(2, kolo), stop(9), stop(10), item(3, tfilati), stop(11)],
      []
    )
    expect(
      snap.upcoming.map((r) => (r.kind === 'teaching' ? 'TEACHING' : r.entry.parts.dance))
    ).toEqual([
      'Kolo',
      'TEACHING', // two STOPs in a row show once
      'Tfilati'
      // a STOP with nothing after it isn't shown
    ])
  })

  test('halted at a STOP, or with a STOP before it, the next dance is the one to be taught', () => {
    const halted = buildProjectorSnapshot(state({ atStop: true }), [item(3, tfilati)], [])
    expect(halted.middle).toMatchObject({ kind: 'next', teaching: true })
    const ahead = buildProjectorSnapshot(state(), [stop(9), item(3, tfilati), item(2, kolo)], [])
    expect(ahead.middle).toMatchObject({
      kind: 'next',
      teaching: true,
      entry: { parts: tfilati.parts }
    })
    expect(ahead.upcoming).toHaveLength(1)
  })

  test('songs whose file is missing are left out (they will be skipped)', () => {
    const gone = track(4, 'Gone', { isMissing: true })
    const snap = buildProjectorSnapshot(state(), [item(4, gone), item(2, kolo), item(5, gone)], [])
    expect(snap.middle).toMatchObject({ kind: 'next', entry: { parts: kolo.parts } })
    expect(snap.upcoming).toEqual([])
  })

  test('previously played keeps the log’s order (oldest first), with previews and replays; removed songs are left out', () => {
    const snap = buildProjectorSnapshot(
      state(),
      [],
      [played(1, hora, 'replay'), played(2, null), played(3, kolo, 'preview')]
    )
    expect(snap.played.map((e) => e.parts.dance)).toEqual(['Hora Mare', 'Kolo'])
  })

  describe('the time that remains', () => {
    const playingHora = (extra: Partial<PlayerState> = {}) =>
      state({
        status: 'playing',
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0, logId: null },
        ...extra
      })

    test('playing: the rest of the program and the gap after the song that is playing', () => {
      const snap = buildProjectorSnapshot(playingHora(), [item(2, kolo), item(3, tfilati)], [])
      expect(snap.tailMs).toBe(2 * 180_000 + 2 * 5000)
    })

    test('nothing playing: the next song is part of what remains, and a countdown adds its seconds', () => {
      const countdown = { secondsLeft: 4, reason: 'continue' as const }
      const snap = buildProjectorSnapshot(
        state({ status: 'countdown', countdown }),
        [item(2, kolo), item(3, tfilati)],
        []
      )
      expect(snap.middle).toMatchObject({ kind: 'next' })
      expect(snap.tailMs).toBe(2 * 180_000 + 5000 + 4000)
    })

    test('auto-continue off adds no gaps', () => {
      const snap = buildProjectorSnapshot(
        playingHora({ autoContinue: { enabled: false, seconds: 5 } }),
        [item(2, kolo)],
        []
      )
      expect(snap.tailMs).toBe(180_000)
    })

    test('no time without anything to show', () => {
      expect(buildProjectorSnapshot(state({ programId: null }), [], []).tailMs).toBeNull()
      expect(buildProjectorSnapshot(state(), [], []).tailMs).toBeNull()
    })
  })

  test('the middle dance carries its slide, when it has one', () => {
    const slide = {
      kind: 'canva' as const,
      deckId: 1,
      pageId: 'P6',
      imageUrl: 'fdp-media://slide/1/P6',
      live: false
    }
    const slideFor = (danceId: number | null) => (danceId === kolo.danceId ? slide : null)
    const playingKolo = buildProjectorSnapshot(
      state({
        status: 'playing',
        current: { playId: 7, source: 'program', itemId: 1, track: kolo, restarts: 0, logId: null }
      }),
      [],
      [],
      slideFor
    )
    expect(playingKolo.middle).toMatchObject({ kind: 'now', slide })
    const nextKolo = buildProjectorSnapshot(state(), [item(2, kolo)], [], slideFor)
    expect(nextKolo.middle).toMatchObject({ kind: 'next', slide })
    const noSlide = buildProjectorSnapshot(state(), [item(3, tfilati)], [], slideFor)
    expect(noSlide.middle).not.toHaveProperty('slide')
  })

  test('no program and nothing playing: an empty snapshot', () => {
    expect(buildProjectorSnapshot(state({ programId: null }), [], [])).toEqual({
      hasProgram: false,
      middle: null,
      upcoming: [],
      played: [],
      tailMs: null
    })
  })
})
