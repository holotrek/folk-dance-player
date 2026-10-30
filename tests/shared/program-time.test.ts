import { describe, expect, test } from 'vitest'
import type { PlayerState, ProgramItem } from '@shared/program'
import { IDLE_PLAYER_STATE } from '@shared/program'
import { formatClock, formatTotal, playTime, tailMs, totalMs } from '@shared/program-time'

const MIN = 60_000
const song = (
  id: number,
  durationMs: number | null = 3 * MIN,
  extra: { isMissing?: boolean; isRemoved?: boolean } = {}
): ProgramItem =>
  ({
    id,
    kind: 'track',
    fileId: id,
    durationMs,
    isMissing: false,
    isRemoved: false,
    ...extra
  }) as unknown as ProgramItem
const stop = (id: number): ProgramItem => ({ id, kind: 'stop' })
const on = { enabled: true, seconds: 5 }
const off = { enabled: false, seconds: 5 }

describe('program time', () => {
  test('adds up the songs and counts a gap between neighbours', () => {
    const time = playTime([song(1), song(2), song(3)])
    expect(time).toEqual({ durationMs: 9 * MIN, gaps: 2 })
    expect(totalMs(time, on)).toBe(9 * MIN + 10_000)
    expect(totalMs(time, off)).toBe(9 * MIN)
  })

  test('a STOP between two songs removes the gap there, and two STOPs act as one', () => {
    expect(playTime([song(1), stop(2), song(3)]).gaps).toBe(0)
    expect(playTime([song(1), stop(2), stop(3), song(4), song(5)]).gaps).toBe(1)
    expect(playTime([stop(1), song(2), song(3)]).gaps).toBe(1)
  })

  test('a missing or removed song is left out, and its neighbours still have a gap between them', () => {
    const time = playTime([
      song(1),
      song(2, 3 * MIN, { isMissing: true }),
      song(3),
      song(4, 1, { isRemoved: true })
    ])
    expect(time).toEqual({ durationMs: 6 * MIN, gaps: 1 })
  })

  test('a song with no duration counts as zero', () => {
    expect(playTime([song(1, null), song(2)])).toEqual({ durationMs: 3 * MIN, gaps: 1 })
  })

  test('nothing to play is zero', () => {
    expect(playTime([])).toEqual({ durationMs: 0, gaps: 0 })
    expect(playTime([stop(1)])).toEqual({ durationMs: 0, gaps: 0 })
  })

  test('afterSong adds the gap before the first song, unless a STOP comes first', () => {
    expect(playTime([song(1), song(2)], true).gaps).toBe(2)
    expect(playTime([stop(1), song(2), song(3)], true).gaps).toBe(1)
    expect(playTime([], true).gaps).toBe(0)
  })

  describe('tailMs, what remains after the current song', () => {
    const state = (extra: Partial<PlayerState>): PlayerState => ({
      ...IDLE_PLAYER_STATE,
      autoContinue: on,
      ...extra
    })
    const items = [song(1), song(2)]

    test('playing, paused or stopped: the songs and the gap after the current one', () => {
      for (const status of ['playing', 'paused', 'stopped'] as const) {
        expect(tailMs(items, state({ status }))).toBe(6 * MIN + 2 * 5000)
      }
    })

    test('a countdown adds the seconds left once, and not the gap before the next song', () => {
      const countdown = { secondsLeft: 3, reason: 'continue' as const }
      expect(tailMs(items, state({ status: 'countdown', countdown }))).toBe(6 * MIN + 5000 + 3000)
    })

    test('idle adds neither', () => {
      expect(tailMs(items, state({ status: 'idle' }))).toBe(6 * MIN + 5000)
    })

    test('auto-continue off adds no gaps', () => {
      expect(tailMs(items, state({ status: 'playing', autoContinue: off }))).toBe(6 * MIN)
    })
  })

  test('formatTotal reads M:SS, then H:MM:SS from an hour up', () => {
    expect(formatTotal(9 * MIN + 10_000)).toBe('9:10')
    expect(formatTotal(70 * MIN + 5000)).toBe('1:10:05')
    expect(formatTotal(0)).toBe('0:00')
  })

  test('formatClock gives the short local time with no date', () => {
    const ms = new Date(2026, 9, 30, 21, 42).getTime()
    expect(formatClock(ms)).toBe(
      new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    )
    expect(formatClock(ms)).not.toMatch(/2026/)
  })
})
