import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { PlayerState } from '@shared/program'
import { listPlayed } from '../../../src/main/programs/history'
import { addStop, addTracks, createProgram, getProgram } from '../../../src/main/programs/programs'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let settings: SettingsStore
let missing: Set<string>
let session: PlayerSession
let emitted: PlayerState[]
let program: number
let songs: Record<'a' | 'b' | 'c', ReturnType<typeof addLibrarySong>>

function setup(options: { autoContinue?: boolean; seconds?: number; countdown?: number } = {}) {
  settings.set('autoContinue.enabled', options.autoContinue ?? true)
  settings.set('autoContinue.seconds', options.seconds ?? 0)
  settings.set('countdown.seconds', options.countdown ?? 0)
  emitted = []
  session = new PlayerSession(
    createSessionPorts(db, settings, (path) => !missing.has(path)),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    (state) => emitted.push(state)
  )
}

const state = () => session.getState()
const playing = () => state().current?.track.title ?? null
const unplayed = () =>
  getProgram(db, program)!.items.map((i) => (i.kind === 'stop' ? 'STOP' : i.title))
const finish = () => session.ended(state().current!.playId)
const log = () => listPlayed(db, program).map((e) => [e.kind, e.track?.title])

beforeEach(() => {
  vi.useFakeTimers()
  db = createTestDb()
  settings = new SettingsStore(db)
  missing = new Set()
  songs = {
    a: addLibrarySong(db, { title: 'A', dance: { name: 'A' } }),
    b: addLibrarySong(db, { title: 'B', dance: { name: 'B' } }),
    c: addLibrarySong(db, { title: 'C', dance: { name: 'C' } })
  }
  program = createProgram(db, 'Set')
  settings.set('currentProgramId', program)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('starting the program', () => {
  test('▶ plays next up, marks it played and logs it', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'A' } })
    session.play()
    expect(state()).toMatchObject({ status: 'playing', current: { source: 'program' } })
    expect(playing()).toBe('A')
    expect(unplayed()).toEqual(['B'])
    expect(state().nextUp).toMatchObject({ title: 'B' })
    expect(log()).toEqual([['program', 'A']])
    expect(emitted.length).toBeGreaterThan(1)
  })

  test('with a countdown set, ▶ counts down first; ▶ again skips it', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ countdown: 3, autoContinue: false })
    session.play()
    expect(state()).toMatchObject({
      status: 'countdown',
      countdown: { secondsLeft: 3, reason: 'start' }
    })
    vi.advanceTimersByTime(1000)
    expect(state().countdown?.secondsLeft).toBe(2)
    vi.advanceTimersByTime(2000)
    expect(playing()).toBe('A')
    finish()
    session.play()
    expect(state().status).toBe('countdown')
    session.play()
    expect(playing()).toBe('B')
  })

  test('⏹ cancels the countdown; nothing plays or is marked played', () => {
    addTracks(db, program, [songs.a.fileId])
    setup({ countdown: 3 })
    session.play()
    session.stop()
    vi.advanceTimersByTime(5000)
    expect(state()).toMatchObject({ status: 'idle', current: null, countdown: null })
    expect(unplayed()).toEqual(['A'])
  })

  test('▶ passes a STOP marker at the head of the program', () => {
    addStop(db, program)
    addTracks(db, program, [songs.a.fileId])
    setup()
    session.play()
    expect(playing()).toBe('A')
    expect(unplayed()).toEqual([])
  })

  test('▶ with no program, or nothing left, does nothing', () => {
    settings.set('currentProgramId', null)
    setup()
    session.play()
    expect(state().status).toBe('idle')
    settings.set('currentProgramId', program)
    session.refresh()
    session.play()
    expect(state().status).toBe('idle')
  })

  test('after a restart, the session is idle with the next unplayed item queued', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    session.play()
    setup() // a new session over the same database, as after quitting mid-song
    expect(state()).toMatchObject({ status: 'idle', current: null, nextUp: { title: 'B' } })
  })

  test('pause and resume', () => {
    addTracks(db, program, [songs.a.fileId])
    setup()
    session.play()
    session.pause()
    expect(state().status).toBe('paused')
    session.play()
    expect(state()).toMatchObject({ status: 'playing' })
    expect(playing()).toBe('A')
  })
})

describe('when a program song ends', () => {
  test('auto-continue counts down, then plays the next item', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 2 })
    session.play()
    finish()
    expect(state()).toMatchObject({
      status: 'countdown',
      current: null,
      countdown: { secondsLeft: 2, reason: 'continue' },
      nextUp: { title: 'B' }
    })
    vi.advanceTimersByTime(2000)
    expect(playing()).toBe('B')
  })

  test('auto-continue with 0 seconds plays the next item at once', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    finish()
    expect(playing()).toBe('B')
  })

  test('auto-continue off: playback stops with next up queued', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ autoContinue: false })
    session.play()
    finish()
    expect(state()).toMatchObject({ status: 'idle', current: null, nextUp: { title: 'B' } })
    expect(unplayed()).toEqual(['B'])
  })

  test('a STOP marker always halts, is marked played, and ▶ resumes after it', () => {
    addTracks(db, program, [songs.a.fileId])
    addStop(db, program)
    addTracks(db, program, [songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    finish()
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'B' } })
    expect(unplayed()).toEqual(['B'])
    session.play()
    expect(playing()).toBe('B')
  })

  test('a STOP moved to the head during the countdown still halts', () => {
    const [, b] = addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 3 })
    session.play()
    finish()
    addStop(db, program, b)
    session.refresh()
    vi.advanceTimersByTime(3000)
    expect(state().status).toBe('idle')
    expect(unplayed()).toEqual(['B'])
  })

  test('the end of the program stops playback', () => {
    addTracks(db, program, [songs.a.fileId])
    setup()
    session.play()
    finish()
    expect(state()).toMatchObject({ status: 'idle', current: null, nextUp: null })
  })

  test('a late "ended" from an earlier song is ignored', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId, songs.c.fileId])
    setup()
    session.play()
    const first = state().current!.playId
    session.next()
    session.ended(first)
    expect(playing()).toBe('B')
  })
})

describe('operator commands', () => {
  test('⏭ starts the next item now, passing a STOP marker', () => {
    addTracks(db, program, [songs.a.fileId])
    addStop(db, program)
    addTracks(db, program, [songs.b.fileId])
    setup({ countdown: 5 })
    session.play()
    session.play()
    session.next()
    expect(playing()).toBe('B')
    expect(unplayed()).toEqual([])
  })

  test('a preview plays now, is logged with the program, and halts afterwards', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    session.preview(songs.c.fileId)
    expect(state().current).toMatchObject({ source: 'preview', itemId: null })
    expect(playing()).toBe('C')
    finish()
    // A, interrupted by the preview, is next up again.
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'A' } })
    expect(log()).toEqual([
      ['preview', 'C'],
      ['program', 'A']
    ])
  })

  test('a replay plays a logged entry again and halts afterwards', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    session.stop()
    const [entry] = listPlayed(db, program)
    session.replay(entry.logId)
    expect(state().current?.source).toBe('replay')
    expect(playing()).toBe('A')
    finish()
    // ⏹ put A back as next up; the replay doesn't change that.
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'A' } })
  })
})

describe('missing and unreadable files', () => {
  test('a missing file is skipped, flagged and left in the program, with a warning', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    missing.add('/music/A.mp3')
    setup()
    session.play()
    expect(playing()).toBe('B')
    expect(state().warning).toBe('Skipped missing file: A')
    expect(unplayed()).toEqual(['A'])
    expect(getProgram(db, program)!.items[0]).toMatchObject({ isMissing: true })
    session.dismissWarning()
    expect(state().warning).toBeNull()
  })

  test('a file that fails to play warns, then continues per auto-continue', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    session.failed(state().current!.playId, 'unsupported format')
    expect(state().warning).toBe("Couldn't play “A”: unsupported format")
    expect(playing()).toBe('B')
  })

  test('previewing a missing file warns and keeps playing what was playing', () => {
    addTracks(db, program, [songs.a.fileId])
    missing.add('/music/C.mp3')
    setup()
    session.play()
    session.preview(songs.c.fileId)
    expect(playing()).toBe('A')
    expect(state().warning).toContain('the file is missing')
  })
})

describe('review fixes', () => {
  test('previewing a missing file during the countdown warns and keeps counting down', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    missing.add('/music/C.mp3')
    setup({ seconds: 3 })
    session.play()
    finish()
    session.preview(songs.c.fileId)
    expect(state().warning).toContain('the file is missing')
    expect(state().status).toBe('countdown')
    vi.advanceTimersByTime(3000)
    expect(playing()).toBe('B')
  })

  test('⏹ keeps the song loaded at its start; ▶ plays it again as the same play', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    session.play()
    const playId = state().current!.playId
    session.stop()
    expect(state()).toMatchObject({ status: 'stopped', current: { playId } })
    expect(playing()).toBe('A')
    expect(unplayed()).toEqual(['B'])
    session.stop() // a second ⏹ changes nothing
    expect(state().status).toBe('stopped')
    session.play()
    expect(state()).toMatchObject({ status: 'playing', current: { playId } })
    expect(log()).toEqual([['program', 'A']])
    session.stop()
    session.next() // ⏭ from a stopped song moves on
    expect(playing()).toBe('B')
  })

  test('a preview that interrupts a program song puts that song back as next up', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    session.play()
    session.preview(songs.c.fileId)
    finish()
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'A' } })
  })

  test('⏭ still counts the skipped song as played', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    session.play()
    session.next()
    expect(unplayed()).toEqual([])
  })

  test('▶ with only missing songs left warns instead of doing nothing', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    missing.add('/music/A.mp3')
    missing.add('/music/B.mp3')
    setup()
    session.play()
    expect(state()).toMatchObject({ status: 'idle', warning: 'Skipped missing file: A, B' })
  })

  test('auto-continue into only missing songs warns', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    missing.add('/music/B.mp3')
    setup({ seconds: 0 })
    session.play()
    finish()
    expect(state()).toMatchObject({ status: 'idle', warning: 'Skipped missing file: B' })
  })

  test('unticking auto-continue during the countdown halts before the next song', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup({ seconds: 3 })
    session.play()
    finish()
    settings.set('autoContinue.enabled', false)
    session.refresh()
    vi.advanceTimersByTime(3000)
    expect(state()).toMatchObject({ status: 'idle', current: null, nextUp: { title: 'B' } })
  })
})

describe('what the projector shows', () => {
  test('with auto-continue off, a STOP reached after a song is marked played; the next dance is queued', () => {
    addTracks(db, program, [songs.a.fileId])
    addStop(db, program)
    addTracks(db, program, [songs.b.fileId])
    setup({ autoContinue: false })
    session.play()
    finish()
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'B' } })
    expect(unplayed()).toEqual(['B'])
  })

  test('says when playback halted at a STOP marker, until the next song starts', () => {
    addTracks(db, program, [songs.a.fileId])
    addStop(db, program)
    addTracks(db, program, [songs.b.fileId])
    setup({ seconds: 0 })
    session.play()
    expect(state().atStop).toBe(false)
    finish()
    expect(state()).toMatchObject({ status: 'idle', atStop: true })
    session.play()
    expect(state()).toMatchObject({ status: 'playing', atStop: false })
  })

  test('refresh relabels the playing song after its dance is edited', () => {
    addTracks(db, program, [songs.a.fileId])
    setup()
    session.play()
    db.prepare("UPDATE dances SET name = 'Hora Mare' WHERE id = ?").run(songs.a.danceId)
    session.refresh()
    expect(state().current?.track.label).toBe('A | Hora Mare')
    expect(state().status).toBe('playing')
  })
})

describe('remote control commands', () => {
  test('toggle plays when nothing plays, pauses a playing song, and resumes it', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    setup()
    session.toggle()
    expect(state().status).toBe('playing')
    expect(playing()).toBe('A')
    session.toggle()
    expect(state().status).toBe('paused')
    session.toggle()
    expect(state().status).toBe('playing')
    session.stop()
    session.toggle()
    expect(state()).toMatchObject({ status: 'playing' })
    expect(playing()).toBe('A')
  })

  test('toggle during a countdown starts the song now', () => {
    addTracks(db, program, [songs.a.fileId])
    setup({ countdown: 5 })
    session.toggle()
    expect(state().status).toBe('countdown')
    session.toggle()
    expect(playing()).toBe('A')
  })

  test('restart rewinds the current song: the same play, with a new restart count', () => {
    addTracks(db, program, [songs.a.fileId])
    setup()
    session.restart() // nothing loaded: nothing happens
    expect(state().current).toBeNull()
    session.play()
    const playId = state().current!.playId
    expect(state().current!.restarts).toBe(0)
    session.pause()
    session.restart()
    expect(state()).toMatchObject({ status: 'paused', current: { playId, restarts: 1 } })
    expect(log()).toEqual([['program', 'A']])
  })
})

describe('speed and volume', () => {
  test('speed resets to 1× for each song unless locked, within 0.5–1.5×', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId, songs.c.fileId])
    setup()
    session.play()
    session.setSpeed(0.75)
    expect(state().speed).toBe(0.75)
    session.next()
    expect(state().speed).toBe(1)
    session.setSpeed(3)
    expect(state().speed).toBe(1.5)
    session.setSpeedLocked(true)
    session.next()
    expect(state()).toMatchObject({ speed: 1.5, speedLocked: true })
  })

  test('volume is kept between songs, within 0–1', () => {
    setup()
    session.setVolume(0.4)
    expect(state().volume).toBe(0.4)
    session.setVolume(-1)
    expect(state().volume).toBe(0)
  })
})
