# Folk Dance Player — Plan 5: Projector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dancers see the program on a projector. The view is large-font and shows:
- what was played
- what's playing, with a red progress line
- what's coming up, with a Teaching marker before a dance that will be taught

**The organizer:**
- turns the view on from the player bar and chooses its display in Settings
- can have it cover the laptop instead (laptop mode: Esc or the mouse closes it, and it opens on its own after an idle time while music plays)
- has the Mac kept awake during an event

**Architecture:**
- **Main process:** owns the projector.
  - **`buildProjectorSnapshot`** is a pure function from the player state, the loaded program and its play log to what the projector shows.
  - **`ProjectorController`** manages the one borderless window: choosing the display, projector mode vs laptop mode, display plug/unplug/resize, and keeping the control window off the projector.
  - **`ActivityWatcher`** polls the mouse and takes the control window's keys, for laptop mode's dismissal and the idle auto-fullscreen.
  - **`createProjectorFeed`** sends the snapshot to the projector window after player, program or library changes, and forwards the control window's position reports for the red line.
  - **`KeepAwake`** blocks display sleep.
  - All of these take injected Electron pieces, so they're unit-tested.
- **Renderer:** the projector window is a second page (`projector.html`) with its own read-only preload. `ProjectorView` renders the snapshot. The control window gets a Projector switch in the player bar and a display choice in Settings.

**Tech Stack:** As Plans 1–4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §7.3 (laptop-mode auto-fullscreen), §8.1 (window), §8.2 (layout) and §9. Task 8 updates the spec with this plan's decisions and what real-hardware testing showed.

This is plan 5 of 7. Plans 1–4 are merged. **Not in this plan:**
- Canva slides, and the with-slide layout: Plan 6. The no-slide layout is used throughout.
- the display setup assistant: post-v1
- packaging: Plan 7

**Decisions made with the user while planning** (recorded in the spec by Task 8):
- **The Teaching row:** a STOP marker shows in the upcoming list as a row `⌄ —— Teaching —— ⌄`, its arrows pointing down at the dance that will be taught.
- **Idle auto-fullscreen** (laptop mode) only happens while music plays or a countdown runs.
- **With a program loaded but nothing playing,** the projector shows that program's Up Next (with previously played above).
- **Previews and replays** show on the projector like any play.

**Learned on real hardware during planning** (each is built into a task):
- **The process transform:** `setVisibleOnAllWorkspaces` must be called with `skipTransformProcessType`. Otherwise macOS can leave the whole app as a background app after sleep: no Dock icon, no ⌘-Tab, and the control window hidden. (Task 5)
- **Sleep and wake** renumber displays and can move windows. On any display change, the control window is moved off the projector's display. On wake, the displays are re-checked and the control window is shown. (Tasks 3, 5)
- **The Mac must not sleep during an event:** display sleep is blocked while the view shows, or music plays or counts down. (Tasks 4, 5)
- **At startup,** projector mode left on reopens only if a projector is connected; it never covers the laptop at launch. (Task 3)
- **Known issue, deferred:** unplugging the projector mid-session sometimes orphans the projector window over the laptop (about 1 unplug in 4) until the app quits. The investigation and the two fixes that didn't work are in `docs/spikes/projector-unplug.md`. Leaders plug in before the dances and unplug after, so it's unlikely at an event. (Task 8)

## Global Constraints

- **Everything in Plans 1–4 still applies:**
  - exact version pins, at least two weeks old
  - `node:sqlite` only
  - renderers reach main only through their preload
  - Mantine with CSS Modules in the control window
  - Prettier settings
  - spec, CHANGELOG and AGENTS.md kept current
  - conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **The projector window is read-only.** Its preload exposes only `getSnapshot`, `onSnapshot` and `onProgress`. It never shows an error; warnings stay in the control window.
- **No renderer decides what the projector shows.** Main builds the snapshot.
- **The projector window is created only through `ProjectorController`,** never directly, so the display rules always apply.
- **Never center a Mantine button with `transform`.** Icons are SVG (`components/icons.tsx`), never Unicode symbols.
- **Manual runs use `FDP_USER_DATA`** (a copy of the library). Ask the user before any test that needs them or covers their screen.
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.**

## Review Focus

These are the five failure modes most likely to bite an organizer during an event. Each has a test in the task that owns it.

1. **The operator loses the control window:** macOS moves it onto the projector, or the app turns into a background app after sleep. It must stay on the laptop and reachable. Task 3: "after a display change (sleep and wake)…" and "the control window moves off the projector display…"; Task 5 wires `skipTransformProcessType` and the wake handling.
2. **The projector covering the laptop unexpectedly:** at startup without a projector, after unplugging, or in projector mode with mouse or Esc. Task 3: "projector mode left on, but no projector at startup…", "unplugging the projector closes the window…", "in projector mode, mouse and Esc never close it".
3. **Laptop mode that can't be closed, or closes on a jiggle as it opens:** Task 4: "mouse movement or Esc closes it, after a 1 s grace" and "laptop mode from the toggle (one display) closes the same way…".
4. **The projector showing the wrong thing:** a stale label, a song that will be skipped, the teaching row, previews, the countdown. Task 1: "refresh relabels the playing song…"; Task 2: the snapshot tests; Task 6: the view tests.
5. **The Mac sleeping mid-event:** Task 4: "blocks display sleep while needed…" and "is needed while the projector shows…".

---

## File Structure

```
src/shared/projector.ts              ProjectorSnapshot (+ entries, rows, middle), progress, status, displays, ProjectorApi
src/main/projector/snapshot.ts       buildProjectorSnapshot(player, unplayed, played)
src/main/projector/projector-controller.ts   ProjectorController + chooseDisplay (spec §8.1)
src/main/projector/activity.ts       ActivityWatcher: laptop-mode dismissal, idle auto-fullscreen (§7.3)
src/main/projector/projector-feed.ts createProjectorFeed: snapshot + progress to the projector window
src/main/power/keep-awake.ts         KeepAwake: blocks display sleep during an event
src/main/ipc/projector-handlers.ts   projector:* handlers (+ HandlerDeps.projector)
src/main/session/player-session.ts (modify)   atStop; STOP marked played with auto-continue off; relabel on refresh
src/shared/program.ts, src/shared/contract.ts, src/main/ipc/handlers.ts, src/main/index.ts (modify)
electron.vite.config.ts (modify)     two pages, two preloads
src/preload/projector.ts, src/preload/index.d.ts   the projector's read-only API
src/renderer/projector.html + src/renderer/src/projector/   main.tsx, ProjectorView (+ css)
src/renderer/src/program/useProjectorStatus.ts, PlayerBar.tsx, useAudio.ts (modify)   switch + progress reports
src/renderer/src/components/ProjectorDisplay.tsx, icons.tsx, pages/SettingsPage.tsx (modify)
docs/spikes/projector-unplug.md      the deferred unplug issue
```

---

### Task 1: What the session tells the projector

**Files:**
- Modify: `src/shared/program.ts` (replace), `src/main/session/player-session.ts` (replace), `tests/main/session/player-session.test.ts` (replace)

**Interfaces:**
- Produces:
  - **`PlayerState.atStop: boolean`:** playback halted at a STOP marker. It is cleared when the next song starts.
  - **A STOP reached after a song is now marked played even with auto-continue off.** This is spec §7.2, deferred from Plan 4. The projector then shows the next dance.
  - **`refresh()`** re-reads the playing song's track, so an edited dance relabels Now Playing (deferred from Plan 4).

- [ ] **Step 1: Write the failing tests**

Replace `tests/main/session/player-session.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/session`
Expected: FAIL. The three tests in "what the projector shows" fail: the STOP isn't marked played with auto-continue off, `atStop` is undefined, and the label is stale.

- [ ] **Step 3: Implement**

Replace `src/shared/program.ts` with:

```ts
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

// What the player is doing; main broadcasts it after every change (spec §9).
export interface NowPlaying {
  playId: number // new for every start; the control window's audio events carry it
  source: PlayKind
  itemId: number | null // the program item, for program plays
  track: Track
  restarts: number // bumped by ◀◀ (restart); the control window rewinds when it changes
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
```

Replace `src/main/session/player-session.ts` with:

```ts
import {
  IDLE_PLAYER_STATE,
  type PlayerState,
  type PlayKind,
  type ProgramItem,
  type Track
} from '@shared/program'

// What the session needs from the rest of the app: the program, the library and the play log.
// The real ones read the database (session-ports.ts); tests can use the same, over a test db.
export interface SessionPorts {
  programId(): number | null
  unplayedItems(programId: number): ProgramItem[]
  markPlayed(itemId: number): void
  markUnplayed(itemId: number): void
  getTrack(fileId: number, danceId: number | null): Track | null
  getLoggedPlay(logId: number): { fileId: number; danceId: number | null } | null
  logPlay(entry: {
    fileId: number
    danceId: number | null
    programId: number | null
    kind: PlayKind
  }): void
  // Checks the file is on disk, flagging or unflagging it in the library.
  checkFile(fileId: number): boolean
  autoContinue(): { enabled: boolean; seconds: number }
  countdownSeconds(): number
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const MIN_SPEED = 0.5
const MAX_SPEED = 1.5
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Spec §7: decides what plays. The control window owns the <audio> element and reports back
// (ended / failed); no renderer decides what plays next. No Electron imports, so it's unit-tested.
export class PlayerSession {
  private state: PlayerState
  private nextPlayId = 1
  private timer: unknown = null

  constructor(
    private readonly ports: SessionPorts,
    private readonly timers: Timers,
    private readonly emit: (state: PlayerState) => void
  ) {
    this.state = { ...IDLE_PLAYER_STATE, autoContinue: ports.autoContinue() }
    this.sync()
  }

  getState(): PlayerState {
    return this.state
  }

  // Re-reads the program and settings (after an edit, or a different program was loaded), and the
  // playing song's label (its dance may have been edited).
  refresh(): void {
    const current = this.state.current
    const track = current && this.ports.getTrack(current.track.fileId, current.track.danceId)
    this.update(current && track ? { current: { ...current, track } } : {})
  }

  // ▶ (spec §7.2): resumes, or skips a running countdown, or starts the program's next song —
  // after the countdown when one is set. An operator's ▶ passes STOP markers.
  play(): void {
    const { status } = this.state
    if (status === 'paused' || status === 'stopped') return this.update({ status: 'playing' })
    if (status === 'playing') return
    if (status === 'countdown') return this.finishCountdown()
    const seconds = this.ports.countdownSeconds()
    if (seconds > 0 && this.hasPlayable(true)) return this.startCountdown(seconds, 'start')
    this.advance(true)
  }

  pause(): void {
    if (this.state.status === 'playing') this.update({ status: 'paused' })
  }

  // The remote's play/pause button (one physical button): pauses a playing song, or does ▶.
  toggle(): void {
    if (this.state.status === 'playing') this.pause()
    else this.play()
  }

  // ◀◀ (and the remote's back button): rewinds the current song to its start. It stays the same
  // play; playing or paused, it carries on as it was.
  restart(): void {
    const current = this.state.current
    if (current) this.update({ current: { ...current, restarts: current.restarts + 1 } })
  }

  // ⏹: rewinds the song to its start and keeps it loaded, so ▶ plays it again as the same play
  // (no new log entry). During a countdown, cancels it.
  stop(): void {
    if (this.state.status === 'countdown') {
      this.cancelCountdown()
      return this.update({ status: 'idle', countdown: null })
    }
    if (this.state.status === 'playing' || this.state.status === 'paused') {
      this.update({ status: 'stopped' })
    }
  }

  // ⏭: stops the song and starts the program's next song now, passing STOP markers.
  next(): void {
    this.cancelCountdown()
    this.update({ status: 'idle', current: null, countdown: null })
    this.advance(true)
  }

  // Double-click in the library, holding or a playlist (spec §7.1): plays now, logged as a
  // preview of the song's default dance. Afterwards playback halts.
  preview(fileId: number): void {
    const track = this.ports.getTrack(fileId, null)
    if (track) this.startNow('preview', track)
  }

  // Double-click in "Previously played": plays that entry again, as the dance it was logged with.
  replay(logId: number): void {
    const logged = this.ports.getLoggedPlay(logId)
    const track = logged && this.ports.getTrack(logged.fileId, logged.danceId)
    if (track) this.startNow('replay', track)
  }

  // A preview or replay: plays now, interrupting what's playing. A missing file only warns, and
  // whatever was playing or counting down carries on.
  private startNow(source: 'preview' | 'replay', track: Track): void {
    if (!this.ports.checkFile(track.fileId)) {
      this.update({ warning: `Couldn't play “${track.label}”: the file is missing` })
      return
    }
    this.interrupt()
    this.start(source, null, track)
  }

  // Cancels the countdown, and puts a program song that hasn't ended back as unplayed.
  private interrupt(): void {
    this.cancelCountdown()
    const current = this.state.current
    if (current?.source === 'program' && current.itemId !== null) {
      this.ports.markUnplayed(current.itemId)
    }
  }

  // The control window's <audio> reached the end of play `playId`.
  ended(playId: number): void {
    const current = this.state.current
    if (!current || current.playId !== playId) return
    this.afterSong(current.source)
  }

  // The control window couldn't play `playId` (unreadable or unsupported file).
  failed(playId: number, message: string): void {
    const current = this.state.current
    if (!current || current.playId !== playId) return
    this.update({ warning: `Couldn't play “${current.track.label}”: ${message}` })
    this.afterSong(current.source)
  }

  setSpeed(speed: number): void {
    this.update({ speed: clamp(Math.round(speed * 100) / 100, MIN_SPEED, MAX_SPEED) })
  }

  setSpeedLocked(locked: boolean): void {
    this.update({ speedLocked: locked })
  }

  setVolume(volume: number): void {
    this.update({ volume: clamp(volume, 0, 1) })
  }

  dismissWarning(): void {
    this.update({ warning: null })
  }

  // When a song ends: a program song continues per the setting (halting at a STOP marker);
  // a preview or replay always halts, with the program's next item queued.
  private afterSong(source: PlayKind): void {
    this.update({ status: 'idle', current: null })
    if (source !== 'program') return
    const { enabled, seconds } = this.ports.autoContinue()
    if (!enabled || !this.hasPlayable(false)) return this.advanceToStop()
    if (seconds > 0) return this.startCountdown(seconds, 'continue')
    this.advance(false)
  }

  // Auto-continue found a STOP marker (or nothing playable) before the next song: a STOP at the
  // head is marked played and playback halts there. Missing songs it ran into are named.
  private advanceToStop(): void {
    const programId = this.ports.programId()
    if (programId === null) return this.sync()
    this.warnSkipped(this.pick(false, false).skipped)
    const head = this.ports.unplayedItems(programId)[0]
    if (head?.kind === 'stop') {
      this.ports.markPlayed(head.id)
      return this.update({ atStop: true })
    }
    this.sync()
  }

  private startCountdown(seconds: number, reason: 'start' | 'continue'): void {
    this.cancelCountdown()
    this.update({ status: 'countdown', current: null, countdown: { secondsLeft: seconds, reason } })
    this.tick()
  }

  private tick(): void {
    this.timer = this.timers.setTimeout(() => {
      const countdown = this.state.countdown
      if (!countdown) return
      if (countdown.secondsLeft <= 1) return this.finishCountdown()
      this.update({ countdown: { ...countdown, secondsLeft: countdown.secondsLeft - 1 } })
      this.tick()
    }, 1000)
  }

  private finishCountdown(): void {
    const reason = this.state.countdown?.reason ?? 'start'
    this.cancelCountdown()
    this.update({ status: 'idle', countdown: null })
    // Between songs, the program or the setting may have changed during the countdown: a STOP now
    // at the head still halts, and so does auto-continue turned off.
    if (reason === 'continue' && (!this.ports.autoContinue().enabled || !this.hasPlayable(false))) {
      return this.advanceToStop()
    }
    this.advance(reason === 'start')
  }

  private cancelCountdown(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
  }

  // Whether the program has a song to play next: passing STOP markers, or stopping at one.
  private hasPlayable(passStops: boolean): boolean {
    return this.pick(passStops, false).item !== null
  }

  // Finds the next song to play. STOP markers are passed (and, when `consume`, marked played)
  // or end the search; songs whose file is missing are skipped and left in the program, flagged.
  // `skipped` names them, whether or not a song was found.
  private pick(
    passStops: boolean,
    consume: boolean
  ): { item: Extract<ProgramItem, { kind: 'track' }> | null; skipped: string[] } {
    const skipped: string[] = []
    const programId = this.ports.programId()
    if (programId === null) return { item: null, skipped }
    for (const item of this.ports.unplayedItems(programId)) {
      if (item.kind === 'stop') {
        if (!passStops) return { item: null, skipped }
        if (consume) this.ports.markPlayed(item.id)
        continue
      }
      if (this.ports.checkFile(item.fileId)) return { item, skipped }
      skipped.push(item.label)
    }
    return { item: null, skipped }
  }

  private warnSkipped(skipped: string[]): void {
    if (skipped.length) this.update({ warning: `Skipped missing file: ${skipped.join(', ')}` })
  }

  // Starts the program's next song now.
  private advance(passStops: boolean): void {
    const { item, skipped } = this.pick(passStops, true)
    this.warnSkipped(skipped)
    if (!item) return this.sync()
    this.ports.markPlayed(item.id)
    this.start('program', item.id, item)
  }

  private start(source: PlayKind, itemId: number | null, track: Track): void {
    this.ports.logPlay({
      fileId: track.fileId,
      danceId: track.danceId,
      programId: this.ports.programId(),
      kind: source
    })
    const { fileId, songId, danceId, title, label, parts, country, teacher } = track
    this.update({
      status: 'playing',
      countdown: null,
      atStop: false,
      speed: this.state.speedLocked ? this.state.speed : 1,
      current: {
        playId: this.nextPlayId++,
        source,
        itemId,
        restarts: 0,
        track: {
          fileId,
          songId,
          danceId,
          title,
          label,
          parts,
          country,
          teacher,
          durationMs: track.durationMs,
          isMissing: false,
          danceCount: track.danceCount
        }
      }
    })
  }

  // Applies a change, re-reads the program and settings, and broadcasts the new state.
  private update(change: Partial<PlayerState>): void {
    const programId = this.ports.programId()
    const items = programId === null ? [] : this.ports.unplayedItems(programId)
    this.state = {
      ...this.state,
      ...change,
      programId,
      nextUp: items[0] ?? null,
      autoContinue: this.ports.autoContinue()
    }
    this.emit(this.state)
  }

  private sync(): void {
    this.update({})
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/session && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/session`: 35 pass; the suite: 433; typecheck and formatting are clean.

```bash
git add src/shared/program.ts src/main/session tests/main/session
git commit -m "feat(playback): atStop, STOP marked played with auto-continue off, relabel on refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The projector snapshot

**Files:**
- Create: `src/shared/projector.ts`, `src/main/projector/snapshot.ts`
- Test: `tests/main/projector/snapshot.test.ts`

**Interfaces:**
- Consumes: `PlayerState`, `ProgramItem`, `PlayedEntry`, `Track` (Plan 4 and Task 1).
- Produces:
  - **`@shared/projector`, every projector type used later:**
    - `ProjectorEntry { parts, country }`
    - `UpcomingRow` (a dance, or `{ kind: 'teaching' }`)
    - `ProjectorMiddle`: either `{ kind: 'now', entry, playId, paused }` or `{ kind: 'next', entry, countdown, teaching }`
    - `ProjectorSnapshot { hasProgram, middle, upcoming, played }` and `EMPTY_SNAPSHOT`
    - `ProjectorProgress { playId, positionMs, durationMs }`
    - `ProjectorStatus { enabled, open, mode, display, notice }` and `PROJECTOR_OFF`
    - `DisplayChoice { id, label, primary, internal }`
    - `ProjectorApi`
  - **`buildProjectorSnapshot(player, unplayed, played)`:**
    - **The middle:** a loaded song (playing, paused or stopped) is `now`. Otherwise it's the first playable song, as `next`, with the countdown. `teaching` is set when halted at a STOP, or when a STOP comes before that song.
    - **Upcoming rows:** STOPs become one Teaching row before the song that follows. A trailing STOP is dropped. Missing files are left out.
    - **Played:** newest first, including previews; removed songs are left out.
    - **No program and nothing loaded:** an empty snapshot.

- [ ] **Step 1: Write the failing tests**

`tests/main/projector/snapshot.test.ts`:

```ts
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
  danceCount: 1,
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
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0 }
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
      played: [{ parts: hora.parts, country: 'Country 1' }]
    })
  })

  test('paused or stopped still show the loaded song', () => {
    for (const status of ['paused', 'stopped'] as const) {
      const snap = buildProjectorSnapshot(
        state({
          status,
          current: { playId: 7, source: 'preview', itemId: null, track: kolo, restarts: 0 }
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
        current: { playId: 7, source: 'program', itemId: 1, track: hora, restarts: 0 }
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

  test('previously played lists previews and replays too, newest first; removed songs are left out', () => {
    const snap = buildProjectorSnapshot(
      state(),
      [],
      [played(3, kolo, 'preview'), played(2, null), played(1, hora, 'replay')]
    )
    expect(snap.played.map((e) => e.parts.dance)).toEqual(['Kolo', 'Hora Mare'])
  })

  test('no program and nothing playing: an empty snapshot', () => {
    expect(buildProjectorSnapshot(state({ programId: null }), [], [])).toEqual({
      hasProgram: false,
      middle: null,
      upcoming: [],
      played: []
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/projector`
Expected: FAIL — `Cannot find module '../../../src/main/projector/snapshot'`.

- [ ] **Step 3: Implement**

`src/shared/projector.ts`:

```ts
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
```

`src/main/projector/snapshot.ts`:

```ts
import type { PlayedEntry, PlayerState, ProgramItem, Track } from '@shared/program'
import type { ProjectorEntry, ProjectorSnapshot, UpcomingRow } from '@shared/projector'

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
// play log (which includes previews and replays).
export function buildProjectorSnapshot(
  player: PlayerState,
  unplayed: ProgramItem[],
  played: PlayedEntry[]
): ProjectorSnapshot {
  const history = played.flatMap((p) => (p.track ? [entry(p.track)] : []))
  const { current } = player
  if (current && player.status !== 'idle' && player.status !== 'countdown') {
    return {
      hasProgram: player.programId !== null,
      middle: {
        kind: 'now',
        entry: entry(current.track),
        playId: current.playId,
        paused: player.status !== 'playing'
      },
      upcoming: upcomingRows(unplayed),
      played: history
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
      teaching: player.atStop || stopBefore
    },
    upcoming: next ? upcomingRows(unplayed.slice(index + 1)) : [],
    played: history
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/projector && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/projector`: 8 pass; the suite: 441; typecheck and formatting are clean.

```bash
git add src/shared/projector.ts src/main/projector tests/main/projector
git commit -m "feat(projector): the snapshot — now playing, up next, teaching rows, previously played

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The projector window controller

**Files:**
- Create: `src/main/projector/projector-controller.ts`
- Test: `tests/main/projector/projector-controller.test.ts`

**Interfaces:**
- Consumes: `ProjectorStatus` (Task 2).
- Produces:
  - **Types:** `Rect`, `DisplayInfo { id, label, internal, bounds }` and `ProjectorWindow { setBounds, close, onceClosed, send }`.
  - **`chooseDisplay(displays, savedId)`:** the saved display if it's connected, else the first external one. It returns null with only one display.
  - **`ProjectorController(deps)`**, where `deps` provides `displays`, `controlDisplayId`, `moveControlTo`, `createWindow`, `settings { enabled, setEnabled, displayId }` and `onStatus`. Its methods:
    - `status()`
    - `start()`: reopens only with a projector connected
    - `setEnabled(on)`
    - `showOnLaptop()`: the idle view, only when projector mode is off
    - `dismiss()`: laptop mode only; laptop mode from the toggle also turns projector mode off
    - `displaysChanged()`: closes on unplug, without covering the laptop; reopens on plug-in; resizes; moves laptop mode to a newly connected projector; keeps the control window off the projector's display
    - `displayChoiceChanged()`
    - `send(channel, payload)`: only to an open window
  - `onStatus` is called after every change.

- [ ] **Step 1: Write the failing tests**

`tests/main/projector/projector-controller.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  chooseDisplay,
  ProjectorController,
  type DisplayInfo,
  type ProjectorWindow
} from '../../../src/main/projector/projector-controller'

const laptop: DisplayInfo = {
  id: 1,
  label: 'Built-in Retina Display',
  internal: true,
  bounds: { x: 0, y: 0, width: 1512, height: 982 }
}
const hdmi: DisplayInfo = {
  id: 2,
  label: 'Epson Projector',
  internal: false,
  bounds: { x: 1512, y: 0, width: 1920, height: 1080 }
}
const tv: DisplayInfo = {
  id: 3,
  label: 'TV',
  internal: false,
  bounds: { x: 3432, y: 0, width: 1280, height: 720 }
}

class FakeWindow implements ProjectorWindow {
  bounds: DisplayInfo['bounds']
  closed = false
  sent: [string, unknown][] = []
  private onClosed: () => void = () => undefined
  constructor(bounds: DisplayInfo['bounds']) {
    this.bounds = bounds
  }
  setBounds(bounds: DisplayInfo['bounds']) {
    this.bounds = bounds
  }
  close() {
    this.closed = true
    this.onClosed()
  }
  onceClosed(fn: () => void) {
    this.onClosed = fn
  }
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload])
  }
}

function setup(
  displays: DisplayInfo[],
  options: { control?: number; saved?: number | null; enabled?: boolean } = {}
) {
  const state = {
    displays,
    control: options.control ?? 1,
    settings: { enabled: options.enabled ?? false, displayId: options.saved ?? null },
    windows: [] as FakeWindow[],
    movedControlTo: [] as number[],
    statuses: [] as unknown[]
  }
  const controller = new ProjectorController({
    displays: () => state.displays,
    controlDisplayId: () => state.control,
    moveControlTo: (d) => {
      state.movedControlTo.push(d.id)
      state.control = d.id
    },
    createWindow: (bounds) => {
      const w = new FakeWindow(bounds)
      state.windows.push(w)
      return w
    },
    settings: {
      enabled: () => state.settings.enabled,
      setEnabled: (on) => void (state.settings.enabled = on),
      displayId: () => state.settings.displayId
    },
    onStatus: (s) => state.statuses.push(s)
  })
  const open = () => state.windows.filter((w) => !w.closed)
  return { controller, state, open }
}

describe('choosing the projector display', () => {
  test('the saved display when connected, else the first external one; none when alone', () => {
    expect(chooseDisplay([laptop, hdmi, tv], 3)?.id).toBe(3)
    expect(chooseDisplay([laptop, hdmi, tv], 99)?.id).toBe(2)
    expect(chooseDisplay([laptop, hdmi], null)?.id).toBe(2)
    expect(chooseDisplay([laptop], null)).toBeNull()
  })
})

describe('projector window', () => {
  test('turning projector mode on opens a borderless window over the other display', () => {
    const { controller, open, state } = setup([laptop, hdmi])
    controller.setEnabled(true)
    expect(state.settings.enabled).toBe(true)
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toEqual({
      enabled: true,
      open: true,
      mode: 'projector',
      display: 'Epson Projector',
      notice: null
    })
    controller.setEnabled(false)
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: false, open: false, mode: null })
  })

  test('the control window moves off the projector display (macOS may make it the main one)', () => {
    const { controller, state, open } = setup([laptop, hdmi], { control: 2 })
    controller.setEnabled(true)
    expect(state.movedControlTo).toEqual([1])
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('with only one display it shows on this screen, as laptop mode, and says so', () => {
    const { controller, open } = setup([laptop])
    controller.setEnabled(true)
    expect(open()[0].bounds).toEqual(laptop.bounds)
    expect(controller.status()).toMatchObject({
      mode: 'laptop',
      notice: 'No separate display — showing on this screen (move the mouse or press Esc to close)'
    })
    controller.dismiss() // mouse or Esc
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: false, open: false })
  })

  test('in projector mode, mouse and Esc never close it', () => {
    const { controller, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    controller.dismiss()
    expect(open()).toHaveLength(1)
  })

  test('unplugging the projector closes the window; plugging it back in reopens it', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    state.displays = [laptop]
    controller.displaysChanged()
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: true, open: false })
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('after a display change (sleep and wake), a control window on the projector’s display is moved off it', () => {
    const { controller, state } = setup([laptop, hdmi])
    controller.setEnabled(true)
    expect(state.movedControlTo).toEqual([])
    state.control = 2 // macOS put the control window on the projector's display
    controller.displaysChanged()
    expect(state.movedControlTo).toEqual([1])
  })

  test('displays renumbered on wake: the projector reopens on the display that is back', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    const hdmiAgain = { ...hdmi, id: 22 }
    state.displays = [laptop, hdmiAgain]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toMatchObject({ open: true, mode: 'projector' })
  })

  test('a display that changes size gets the window resized', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    const bigger = { ...hdmi, bounds: { ...hdmi.bounds, width: 3840, height: 2160 } }
    state.displays = [laptop, bigger]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(bigger.bounds)
  })

  test('laptop mode (shown on this screen) moves to the projector when one is plugged in', () => {
    const { controller, state, open } = setup([laptop])
    controller.setEnabled(true)
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toMatchObject({ mode: 'projector', notice: null })
  })

  test('projector mode left on, but no projector at startup: nothing covers the laptop until one is plugged in', () => {
    const { controller, state, open } = setup([laptop], { enabled: true })
    controller.start()
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: true, open: false })
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('choosing another display in Settings moves an open projector there', () => {
    const { controller, state, open } = setup([laptop, hdmi, tv], { enabled: true })
    controller.start()
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    state.settings.displayId = 3
    controller.displayChoiceChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(tv.bounds)
  })

  test('projector mode left on from last time opens at startup', () => {
    const { controller, open } = setup([laptop, tv, hdmi], { enabled: true, saved: 3 })
    controller.start()
    expect(open()[0].bounds).toEqual(tv.bounds)
  })

  test('the auto-fullscreen view covers the laptop only while projector mode is off', () => {
    const { controller, open } = setup([laptop, hdmi])
    controller.showOnLaptop()
    expect(open()[0].bounds).toEqual(laptop.bounds)
    expect(controller.status()).toMatchObject({ enabled: false, mode: 'laptop', notice: null })
    controller.dismiss()
    expect(open()).toHaveLength(0)
    controller.setEnabled(true)
    controller.showOnLaptop()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('sends only to an open window, and announces every status change', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.send('projector:snapshot', 1)
    controller.setEnabled(true)
    controller.send('projector:snapshot', 2)
    expect(open()[0].sent).toEqual([['projector:snapshot', 2]])
    expect(state.statuses.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/projector/projector-controller.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/projector/projector-controller'`.

- [ ] **Step 3: Implement**

`src/main/projector/projector-controller.ts`:

```ts
import type { ProjectorStatus } from '@shared/projector'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  label: string
  internal: boolean // the laptop's own screen
  bounds: Rect
}

// The borderless projector window (created by main/index.ts with the spec §8.1 settings).
export interface ProjectorWindow {
  setBounds(bounds: Rect): void
  close(): void
  onceClosed(callback: () => void): void
  send(channel: string, payload: unknown): void
}

export interface ProjectorDeps {
  displays(): DisplayInfo[]
  controlDisplayId(): number // the display the control window is on
  moveControlTo(display: DisplayInfo): void
  createWindow(bounds: Rect): ProjectorWindow
  settings: { enabled(): boolean; setEnabled(on: boolean): void; displayId(): number | null }
  onStatus(status: ProjectorStatus): void
}

const NO_SEPARATE_DISPLAY =
  'No separate display — showing on this screen (move the mouse or press Esc to close)'

// The projector's display (spec §8.1): the one chosen in Settings when it's connected, else the
// first external one. None when there's only one display.
export function chooseDisplay(displays: DisplayInfo[], savedId: number | null): DisplayInfo | null {
  if (displays.length < 2) return null
  return (
    displays.find((d) => d.id === savedId) ??
    displays.find((d) => !d.internal) ??
    displays.find((d) => d.id !== displays[0].id) ??
    null
  )
}

// Spec §8.1: one projector window.
// - Projector mode (the toggle is on and there is a separate display): it covers that display, and
//   only the toggle closes it. The control window is kept off that display.
// - Laptop mode (it covers the control window's own display): the toggle with only one display, or
//   the idle auto-fullscreen view (§7.3). Mouse movement or Esc closes it (`dismiss`).
// - Display changes: unplugging the projector closes the window (the music goes on); plugging one
//   in reopens it; a resized display gets the window resized.
export class ProjectorController {
  private window: ProjectorWindow | null = null
  private mode: 'projector' | 'laptop' | null = null
  private display: DisplayInfo | null = null
  private notice: string | null = null

  constructor(private readonly deps: ProjectorDeps) {}

  status(): ProjectorStatus {
    return {
      enabled: this.deps.settings.enabled(),
      open: this.window !== null,
      mode: this.mode,
      display: this.display?.label ?? null,
      notice: this.notice
    }
  }

  // At startup: projector mode left on from last time opens again on a projector (spec §8.1).
  // Without one, nothing covers the laptop; plugging one in opens it.
  start(): void {
    const projector = chooseDisplay(this.deps.displays(), this.deps.settings.displayId())
    if (this.deps.settings.enabled() && projector) this.openProjector()
    this.announce()
  }

  // The player bar's projector toggle.
  setEnabled(on: boolean): void {
    this.deps.settings.setEnabled(on)
    if (on) this.openProjector()
    else this.close()
    this.announce()
  }

  // The idle auto-fullscreen view (spec §7.3): only while projector mode is off.
  showOnLaptop(): void {
    if (this.deps.settings.enabled() || this.window) return
    this.open(this.controlDisplay(), 'laptop', null)
    this.announce()
  }

  // Mouse movement or Esc: closes laptop mode only. Laptop mode from the toggle (one display) turns
  // projector mode off too.
  dismiss(): void {
    if (this.mode !== 'laptop') return
    if (this.deps.settings.enabled()) this.deps.settings.setEnabled(false)
    this.close()
    this.announce()
  }

  // A display was added, removed or changed.
  displaysChanged(): void {
    const displays = this.deps.displays()
    if (this.window && this.mode === 'projector') {
      const now = displays.find((d) => d.id === this.display?.id)
      if (!now) this.close()
      else {
        this.display = now
        this.window.setBounds(now.bounds)
      }
    }
    if (this.deps.settings.enabled() && this.mode !== 'projector') {
      // A separate display appeared: projector mode (from laptop mode, or after an unplug). Without
      // one, an unplugged projector's view stays closed rather than covering the laptop mid-event.
      if (chooseDisplay(displays, this.deps.settings.displayId())) {
        this.close()
        this.openProjector()
      }
    }
    if (this.window && this.mode === 'projector' && this.display) this.keepControlOff(this.display)
    if (this.window && this.mode === 'laptop') {
      const own = this.controlDisplay()
      this.display = own
      this.window.setBounds(own.bounds)
    }
    this.announce()
  }

  // Settings chose another display: an open projector moves there.
  displayChoiceChanged(): void {
    if (this.mode === 'projector') {
      this.close()
      this.openProjector()
    }
    this.announce()
  }

  send(channel: string, payload: unknown): void {
    this.window?.send(channel, payload)
  }

  private openProjector(): void {
    if (this.window) return
    const displays = this.deps.displays()
    const target = chooseDisplay(displays, this.deps.settings.displayId())
    if (!target) return this.open(this.controlDisplay(), 'laptop', NO_SEPARATE_DISPLAY)
    this.keepControlOff(target)
    this.open(target, 'projector', null)
  }

  // The control window never stays under the projector window (spec §8.1): macOS may put it on
  // the projector's display (it can become the main display, or windows move on sleep and wake).
  private keepControlOff(projector: DisplayInfo): void {
    if (this.deps.controlDisplayId() !== projector.id) return
    const displays = this.deps.displays()
    const other =
      displays.find((d) => d.id !== projector.id && d.internal) ??
      displays.find((d) => d.id !== projector.id)
    if (other) this.deps.moveControlTo(other)
  }

  private open(display: DisplayInfo, mode: 'projector' | 'laptop', notice: string | null): void {
    const window = this.deps.createWindow(display.bounds)
    this.window = window
    this.mode = mode
    this.display = display
    this.notice = notice
    window.onceClosed(() => {
      if (this.window !== window) return
      this.window = null
      this.mode = null
      this.display = null
      this.notice = null
      this.announce()
    })
  }

  private close(): void {
    const window = this.window
    this.window = null
    this.mode = null
    this.display = null
    this.notice = null
    window?.close()
  }

  private controlDisplay(): DisplayInfo {
    const displays = this.deps.displays()
    return displays.find((d) => d.id === this.deps.controlDisplayId()) ?? displays[0]
  }

  private announce(): void {
    this.deps.onStatus(this.status())
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/projector && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/projector`: 23 pass; the suite: 456; typecheck and formatting are clean.

```bash
git add src/main/projector tests/main/projector
git commit -m "feat(projector): window controller — display choice, projector vs laptop mode, display changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Activity (laptop mode, idle auto-fullscreen) and keeping the Mac awake

**Files:**
- Create: `src/main/projector/activity.ts`, `src/main/power/keep-awake.ts`
- Test: `tests/main/projector/activity.test.ts`, `tests/main/power/keep-awake.test.ts`

**Interfaces:**
- Consumes: `ProjectorController`'s `status`, `showOnLaptop` and `dismiss` (Task 3).
- Produces:
  - **`ActivityWatcher(deps)`**, where `deps` provides `cursor`, `playing`, `autoFullscreen` and `projector`. Its methods are `start()`, `stop()` and `keyInput(key)`.
    - It polls the mouse every 250 ms.
    - Mouse movement or Esc closes laptop mode, after a 1 s grace.
    - With projector mode off and music playing or counting down, no input for `autoFullscreen.seconds` opens laptop mode.
  - **`KeepAwake(blocker)`:**
    - `update(needed)` starts one `prevent-display-sleep` block, or releases it.
    - `KeepAwake.needed({ projectorOpen, status })`: needed while the projector shows, or music plays or counts down.

- [ ] **Step 1: Write the failing tests**

`tests/main/projector/activity.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProjectorStatus } from '@shared/projector'
import { ActivityWatcher } from '../../../src/main/projector/activity'

let cursor = { x: 0, y: 0 }
let playing = true
let settings = { enabled: true, seconds: 10 }
let status: ProjectorStatus
let calls: string[]
let watcher: ActivityWatcher

const closed: ProjectorStatus = {
  enabled: false,
  open: false,
  mode: null,
  display: null,
  notice: null
}

beforeEach(() => {
  vi.useFakeTimers()
  cursor = { x: 0, y: 0 }
  playing = true
  settings = { enabled: true, seconds: 10 }
  status = closed
  calls = []
  watcher = new ActivityWatcher({
    cursor: () => cursor,
    playing: () => playing,
    autoFullscreen: () => settings,
    projector: {
      status: () => status,
      showOnLaptop: () => {
        calls.push('show')
        status = { ...closed, open: true, mode: 'laptop' }
      },
      dismiss: () => {
        calls.push('dismiss')
        status = closed
      }
    }
  })
  watcher.start()
})

afterEach(() => {
  watcher.stop()
  vi.useRealTimers()
})

describe('laptop-mode auto-fullscreen (spec §7.3)', () => {
  test('after the idle time while music plays, the view covers the laptop', () => {
    vi.advanceTimersByTime(9_000)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1_500)
    expect(calls).toEqual(['show'])
  })

  test('any key or mouse movement restarts the idle time', () => {
    vi.advanceTimersByTime(8_000)
    watcher.keyInput('a')
    vi.advanceTimersByTime(8_000)
    cursor = { x: 5, y: 5 }
    vi.advanceTimersByTime(8_000)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(3_000)
    expect(calls).toEqual(['show'])
  })

  test('not while nothing plays, when turned off, or when the projector is already showing', () => {
    playing = false
    vi.advanceTimersByTime(20_000)
    playing = true
    settings = { enabled: false, seconds: 10 }
    vi.advanceTimersByTime(20_000)
    settings = { enabled: true, seconds: 10 }
    status = { enabled: true, open: true, mode: 'projector', display: 'Epson', notice: null }
    vi.advanceTimersByTime(20_000)
    expect(calls).toEqual([])
  })

  test('mouse movement or Esc closes it, after a 1 s grace', () => {
    vi.advanceTimersByTime(10_500)
    expect(calls).toEqual(['show'])
    cursor = { x: 1, y: 1 } // the mouse jiggles right after it opens: ignored
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['show'])
    vi.advanceTimersByTime(1_000)
    cursor = { x: 2, y: 2 }
    vi.advanceTimersByTime(300)
    expect(calls).toEqual(['show', 'dismiss'])
    vi.advanceTimersByTime(11_000)
    expect(calls).toEqual(['show', 'dismiss', 'show'])
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    expect(calls).toEqual(['show', 'dismiss', 'show', 'dismiss'])
  })

  test('laptop mode from the toggle (one display) closes the same way; projector mode never does', () => {
    status = {
      enabled: true,
      open: true,
      mode: 'laptop',
      display: 'Built-in',
      notice: 'No separate display'
    }
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    expect(calls).toEqual(['dismiss'])
    status = { enabled: true, open: true, mode: 'projector', display: 'Epson', notice: null }
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    cursor = { x: 9, y: 9 }
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['dismiss'])
  })
})
```

`tests/main/power/keep-awake.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { KeepAwake } from '../../../src/main/power/keep-awake'

function setup() {
  const started = new Set<number>()
  let next = 1
  const calls: string[] = []
  const blocker = {
    start: (type: string) => {
      calls.push(`start ${type}`)
      started.add(next)
      return next++
    },
    stop: (id: number) => {
      calls.push(`stop ${id}`)
      started.delete(id)
    }
  }
  return { keep: new KeepAwake(blocker), calls, started }
}

describe('keeping the Mac awake during an event', () => {
  test('blocks display sleep while needed, once, and releases it after', () => {
    const { keep, calls, started } = setup()
    keep.update(true)
    keep.update(true)
    expect(calls).toEqual(['start prevent-display-sleep'])
    expect(started.size).toBe(1)
    keep.update(false)
    keep.update(false)
    expect(calls).toEqual(['start prevent-display-sleep', 'stop 1'])
    expect(started.size).toBe(0)
  })

  test('is needed while the projector shows, or music plays or counts down', () => {
    expect(KeepAwake.needed({ projectorOpen: true, status: 'idle' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'playing' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'countdown' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'paused' })).toBe(false)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'idle' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/projector/activity.test.ts tests/main/power`
Expected: FAIL. `../../../src/main/projector/activity` and `../../../src/main/power/keep-awake` can't be found.

- [ ] **Step 3: Implement**

`src/main/projector/activity.ts`:

```ts
import type { ProjectorController } from './projector-controller'

const POLL_MS = 250
const GRACE_MS = 1000 // laptop mode ignores input this soon after opening

export interface ActivityDeps {
  cursor(): { x: number; y: number } // the mouse position on screen
  playing(): boolean // a song plays or a countdown runs
  autoFullscreen(): { enabled: boolean; seconds: number }
  projector: Pick<ProjectorController, 'status' | 'showOnLaptop' | 'dismiss'>
}

// Spec §7.3 and §8.1 laptop mode. The mouse is polled (it moves over the projector window too,
// which takes no input), and the control window passes on its key presses.
// - Mouse movement or Esc closes laptop mode, after a 1 s grace.
// - With projector mode off and music playing, no input for `autoFullscreen.seconds` shows the
//   view over the laptop.
export class ActivityWatcher {
  private last = Date.now()
  private openedAt: number | null = null
  private cursor = { x: 0, y: 0 }
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: ActivityDeps) {}

  start(): void {
    this.last = Date.now()
    this.cursor = this.deps.cursor()
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  // A key pressed in the control window.
  keyInput(key: string): void {
    this.last = Date.now()
    if (key === 'Escape') this.closeLaptop()
  }

  private tick(): void {
    const now = Date.now()
    const status = this.deps.projector.status()
    const laptop = status.open && status.mode === 'laptop'
    if (!laptop) this.openedAt = null
    else if (this.openedAt === null) this.openedAt = now

    const cursor = this.deps.cursor()
    if (cursor.x !== this.cursor.x || cursor.y !== this.cursor.y) {
      this.cursor = cursor
      this.last = now
      return this.closeLaptop()
    }

    const { enabled, seconds } = this.deps.autoFullscreen()
    if (enabled && !status.open && this.deps.playing() && now - this.last >= seconds * 1000) {
      this.deps.projector.showOnLaptop()
      this.openedAt = now
    }
  }

  private closeLaptop(): void {
    const status = this.deps.projector.status()
    if (!status.open || status.mode !== 'laptop') return
    if (this.openedAt !== null && Date.now() - this.openedAt < GRACE_MS) return
    this.deps.projector.dismiss()
    this.openedAt = null
  }
}
```

`src/main/power/keep-awake.ts`:

```ts
import type { PlayerState } from '@shared/program'

// Electron's powerSaveBlocker, or a fake in tests.
export interface PowerBlocker {
  start(type: 'prevent-display-sleep'): number
  stop(id: number): void
}

// The Mac must not sleep (or dim the projector) during an event: while the projector shows, or
// music plays or counts down. Paused or idle, it may.
export class KeepAwake {
  private id: number | null = null

  constructor(private readonly blocker: PowerBlocker) {}

  static needed(state: { projectorOpen: boolean; status: PlayerState['status'] }): boolean {
    return state.projectorOpen || state.status === 'playing' || state.status === 'countdown'
  }

  update(needed: boolean): void {
    if (needed && this.id === null) this.id = this.blocker.start('prevent-display-sleep')
    else if (!needed && this.id !== null) {
      this.blocker.stop(this.id)
      this.id = null
    }
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/projector tests/main/power && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/projector` 28 pass and `tests/main/power` 2 pass; the suite: 463; typecheck and formatting are clean.

```bash
git add src/main/projector src/main/power tests/main/projector tests/main/power
git commit -m "feat(projector): laptop-mode dismissal and idle auto-fullscreen; keep the Mac awake

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Channels and main-process wiring

**Files:**
- Create: `src/main/projector/projector-feed.ts`, `src/main/ipc/projector-handlers.ts`
- Modify: `src/shared/contract.ts` (replace), `src/main/ipc/handlers.ts` (replace), `src/main/index.ts` (replace)
- Test: `tests/main/projector/projector-feed.test.ts`, `tests/main/ipc/projector-handlers.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - **Invoke channels:** `projector:status`, `projector:setEnabled(on)`, `projector:displays`, `projector:setDisplay(id | null)` (it saves `projector.displayId`), `projector:getSnapshot`, and `projector:reportProgress(playId, positionMs, durationMs)`.
  - **Events:**
    - `projector:status` goes to the control window.
    - `projector:snapshot` and `projector:progress` go only to the projector window.
  - **`HandlerDeps.projector?: ProjectorDeps`** (`status`, `setEnabled`, `displays`, `displayChoiceChanged`, `snapshot`, `progress`). It's reported off when absent.
  - **`createProjectorFeed({ db, player, projector })`** provides `snapshot()`, `update()` (sends only when open) and `progress(p)`.
  - **In `main/index.ts`:**
    - `loadPage` and `createProjectorWindow`: the spec §8.1 settings, with `skipTransformProcessType` and a projector preload.
    - Closing the control window quits the app.
    - The controller is wired to `screen` (display events), `ActivityWatcher` reads the cursor and the control window's `before-input-event`, and `KeepAwake` uses `powerSaveBlocker`.
    - The snapshot is coalesced, sent after player, program, library and projector-status changes.
    - `powerMonitor` `resume` re-checks the displays and shows the control window.
    - `controller.start()` runs at launch.

- [ ] **Step 1: Write the failing tests**

`tests/main/projector/projector-feed.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { addStop, addTracks, createProgram } from '../../../src/main/programs/programs'
import { createProjectorFeed } from '../../../src/main/projector/projector-feed'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

let db: DatabaseSync
let settings: SettingsStore
let sent: [string, unknown][]
let open: boolean

function setup() {
  const player = testPlayer(db, settings)
  const feed = createProjectorFeed({
    db,
    player,
    projector: {
      status: () => ({
        enabled: open,
        open,
        mode: open ? 'projector' : null,
        display: null,
        notice: null
      }),
      send: (channel, payload) => void sent.push([channel, payload])
    }
  })
  return { player, feed }
}

beforeEach(() => {
  db = createTestDb()
  settings = new SettingsStore(db)
  settings.set('countdown.seconds', 0)
  sent = []
  open = true
})

describe('projector feed', () => {
  test('the snapshot follows the player and the loaded program', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora', country: 'Romania' } })
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo', country: 'Serbia' } })
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    addStop(db, p)
    addTracks(db, p, [kolo.fileId])
    settings.set('currentProgramId', p)
    const { player, feed } = setup()
    player.refresh()
    expect(feed.snapshot().middle).toMatchObject({
      kind: 'next',
      entry: { parts: { dance: 'Hora' }, country: 'Romania' }
    })
    player.play()
    const snap = feed.snapshot()
    expect(snap.middle).toMatchObject({ kind: 'now', entry: { parts: { dance: 'Hora' } } })
    expect(snap.upcoming.map((r) => r.kind)).toEqual(['teaching', 'dance'])
    expect(snap.played.map((e) => e.parts.dance)).toEqual(['Hora'])
  })

  test('update sends the snapshot to an open projector only', () => {
    const { feed } = setup()
    feed.update()
    expect(sent.map(([c]) => c)).toEqual(['projector:snapshot'])
    open = false
    feed.update()
    expect(sent).toHaveLength(1)
  })

  test('progress goes straight to the projector', () => {
    const { feed } = setup()
    feed.progress({ playId: 3, positionMs: 1000, durationMs: 180_000 })
    expect(sent).toEqual([
      ['projector:progress', { playId: 3, positionMs: 1000, durationMs: 180_000 }]
    ])
  })

  test('with no program loaded, the snapshot is empty', () => {
    const { feed } = setup()
    expect(feed.snapshot()).toEqual({ hasProgram: false, middle: null, upcoming: [], played: [] })
  })
})
```

`tests/main/ipc/projector-handlers.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import type { ProjectorStatus } from '@shared/projector'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

function setup(withProjector = true) {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  const calls: unknown[][] = []
  let status: ProjectorStatus = {
    enabled: false,
    open: false,
    mode: null,
    display: null,
    notice: null
  }
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 3 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    player: testPlayer(db, settings),
    onLibraryChanged: () => undefined,
    onProgramsChanged: () => undefined,
    projector: withProjector
      ? {
          status: () => status,
          setEnabled: (on) => {
            calls.push(['setEnabled', on])
            status = { ...status, enabled: on, open: on, mode: on ? 'projector' : null }
          },
          displays: () => [{ id: 2, label: 'Epson', primary: false, internal: false }],
          displayChoiceChanged: () => void calls.push(['displayChoiceChanged']),
          snapshot: () => ({ hasProgram: true, middle: null, upcoming: [], played: [] }),
          progress: (p) => void calls.push(['progress', p])
        }
      : undefined
  }
  return { h: createHandlers(deps) as InvokeHandlers, calls, settings }
}

describe('projector handlers', () => {
  test('the toggle turns projector mode on and returns the new status', async () => {
    const { h, calls } = setup()
    expect(await h['projector:setEnabled'](true)).toMatchObject({
      enabled: true,
      mode: 'projector'
    })
    expect(calls).toEqual([['setEnabled', true]])
    expect(await h['projector:status']()).toMatchObject({ open: true })
  })

  test('choosing a display saves it and moves an open projector', async () => {
    const { h, calls, settings } = setup()
    expect(await h['projector:displays']()).toEqual([
      { id: 2, label: 'Epson', primary: false, internal: false }
    ])
    await h['projector:setDisplay'](2)
    expect(settings.get('projector.displayId')).toBe(2)
    expect(calls).toEqual([['displayChoiceChanged']])
  })

  test('the projector window gets the snapshot; the control window reports progress', async () => {
    const { h, calls } = setup()
    expect(await h['projector:getSnapshot']()).toMatchObject({ hasProgram: true })
    await h['projector:reportProgress'](4, 1500, 180_000)
    expect(calls).toEqual([['progress', { playId: 4, positionMs: 1500, durationMs: 180_000 }]])
  })

  test('without a projector (tests, or before startup), everything reports it off', async () => {
    const { h } = setup(false)
    expect(await h['projector:status']()).toEqual({
      enabled: false,
      open: false,
      mode: null,
      display: null,
      notice: null
    })
    expect(await h['projector:displays']()).toEqual([])
    expect(await h['projector:getSnapshot']()).toEqual({
      hasProgram: false,
      middle: null,
      upcoming: [],
      played: []
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/projector/projector-feed.test.ts tests/main/ipc/projector-handlers.test.ts`
Expected: FAIL. The feed module can't be found, and the handler tests fail because the `projector:*` handlers don't exist.

- [ ] **Step 3: Implement**

`src/main/projector/projector-feed.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { ProjectorProgress, ProjectorSnapshot } from '@shared/projector'
import { listPlayed } from '../programs/history'
import { getProgram } from '../programs/programs'
import type { PlayerSession } from '../session/player-session'
import type { ProjectorController } from './projector-controller'
import { buildProjectorSnapshot } from './snapshot'

export interface ProjectorFeed {
  snapshot(): ProjectorSnapshot
  update(): void // after the player, the programs or the library changed
  progress(progress: ProjectorProgress): void
}

// What the projector window is sent (spec §8.2, §9): the snapshot when anything it shows may have
// changed, and the playing song's position (from the control window, about 4 times a second).
export function createProjectorFeed(deps: {
  db: DatabaseSync
  player: Pick<PlayerSession, 'getState'>
  projector: Pick<ProjectorController, 'status' | 'send'>
}): ProjectorFeed {
  const snapshot = (): ProjectorSnapshot => {
    const state = deps.player.getState()
    const id = state.programId
    return buildProjectorSnapshot(
      state,
      id === null ? [] : (getProgram(deps.db, id)?.items ?? []),
      id === null ? [] : listPlayed(deps.db, id)
    )
  }
  return {
    snapshot,
    update: () => {
      if (deps.projector.status().open) deps.projector.send('projector:snapshot', snapshot())
    },
    progress: (progress) => deps.projector.send('projector:progress', progress)
  }
}
```

`src/main/ipc/projector-handlers.ts`:

```ts
import type { InvokeHandlers } from '@shared/contract'
import {
  EMPTY_SNAPSHOT,
  PROJECTOR_OFF,
  type DisplayChoice,
  type ProjectorProgress,
  type ProjectorSnapshot,
  type ProjectorStatus
} from '@shared/projector'
import type { HandlerDeps } from './handlers'

// What the handlers need from the projector (main/index.ts joins the controller and the feed).
export interface ProjectorDeps {
  status(): ProjectorStatus
  setEnabled(on: boolean): void
  displays(): DisplayChoice[]
  displayChoiceChanged(): void
  snapshot(): ProjectorSnapshot
  progress(progress: ProjectorProgress): void
}

const NO_PROJECTOR: ProjectorDeps = {
  status: () => PROJECTOR_OFF,
  setEnabled: () => undefined,
  displays: () => [],
  displayChoiceChanged: () => undefined,
  snapshot: () => EMPTY_SNAPSHOT,
  progress: () => undefined
}

// Spec §8: the projector toggle and display choice, the projector window's snapshot, and the
// control window's progress reports.
export function projectorHandlers(
  deps: HandlerDeps
): Pick<InvokeHandlers, Extract<keyof InvokeHandlers, `projector:${string}`>> {
  const projector = deps.projector ?? NO_PROJECTOR
  return {
    'projector:status': () => projector.status(),
    'projector:setEnabled': (on) => {
      projector.setEnabled(on)
      return projector.status()
    },
    'projector:displays': () => projector.displays(),
    'projector:setDisplay': (displayId) => {
      deps.settings.set('projector.displayId', displayId)
      projector.displayChoiceChanged()
      return projector.status()
    },
    'projector:getSnapshot': () => projector.snapshot(),
    'projector:reportProgress': (playId, positionMs, durationMs) =>
      projector.progress({ playId, positionMs, durationMs })
  }
}
```

Replace `src/shared/contract.ts` with:

```ts
import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress,
  ImportRequest,
  ImportSummary
} from './import'
import type {
  DancePatch,
  DanceSearchResult,
  LibraryQuery,
  LibraryRow,
  PlaylistSummary,
  ReapplyResult,
  SongDetail,
  SongTags,
  SongPatch,
  Suggestions
} from './library'
import type {
  PlayedEntry,
  PlayerState,
  ProgramDetail,
  ProgramSummary,
  RemoteStatus
} from './program'
import type {
  DisplayChoice,
  ProjectorProgress,
  ProjectorSnapshot,
  ProjectorStatus
} from './projector'
import type { SettingKey, Settings } from './settings'

export interface AppInfo {
  version: string
  dbPath: string
  schemaVersion: number
}

export interface LibraryStats {
  fileCount: number
}

// Every renderer → main request. Add a channel here, to INVOKE_CHANNELS, and to createHandlers.
export interface InvokeContract {
  'app:getInfo': { args: []; result: AppInfo }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: Settings }
  'import:pickMusic': { args: []; result: string[] }
  'import:pickAppleLibrary': { args: []; result: string | null }
  'import:previewApple': { args: [xmlPath: string]; result: ApplePreview }
  'import:checkPlaylistConflicts': {
    args: [persistentIds: string[]]
    result: ApplePlaylistConflict[]
  }
  'import:start': { args: [request: ImportRequest]; result: ImportSummary }
  'import:cancel': { args: []; result: void }
  'library:stats': { args: []; result: LibraryStats }
  'library:list': { args: [query: LibraryQuery]; result: LibraryRow[] }
  'library:song': { args: [songId: number]; result: SongDetail | null }
  'library:updateSong': { args: [songId: number, patch: SongPatch]; result: void }
  'library:updateDance': { args: [danceId: number, patch: DancePatch]; result: void }
  'library:setTeacher': { args: [pairingId: number, teacher: string | null]; result: void }
  'library:setDefaultDance': { args: [songId: number, danceId: number]; result: void }
  'library:linkDance': { args: [songId: number, danceId: number]; result: void }
  'library:createDance': { args: [songId: number, name: string]; result: number }
  'library:unlinkDance': { args: [songId: number, danceId: number]; result: void }
  'library:mergeDances': { args: [keepId: number, removeId: number]; result: void }
  'library:sameDance': { args: [songId: number, ownId: number, otherId: number]; result: void }
  'library:markDifferent': { args: [danceA: number, danceB: number]; result: void }
  'library:searchDances': { args: [text: string]; result: DanceSearchResult[] }
  'library:setFavorite': { args: [fileIds: number[], favorite: boolean]; result: void }
  'library:songTags': { args: [songIds: number[]]; result: SongTags[] }
  'library:reapplyMapping': {
    args: [songIds: number[], mapping: ImportMapping]
    result: ReapplyResult
  }
  'library:suggestions': { args: []; result: Suggestions }
  'playlists:list': { args: []; result: PlaylistSummary[] }
  'playlists:create': { args: [name: string]; result: number }
  'playlists:rename': { args: [playlistId: number, name: string]; result: void }
  'playlists:duplicate': { args: [playlistId: number]; result: number }
  'playlists:delete': { args: [playlistId: number]; result: void }
  'playlists:add': { args: [playlistId: number, fileIds: number[]]; result: void }
  'playlists:remove': { args: [playlistId: number, itemIds: number[]]; result: void }
  'playlists:reorder': { args: [playlistId: number, itemIds: number[]]; result: void }
  // Holding places songs before `beforeFileId` (a held song) or at the end; held songs move.
  'library:setHolding': {
    args: [fileIds: number[], held: boolean, beforeFileId?: number | null]
    result: void
  }
  'programs:list': { args: [search: string]; result: ProgramSummary[] }
  'programs:get': { args: [programId: number]; result: ProgramDetail | null }
  'programs:create': { args: [name: string]; result: number }
  'programs:rename': { args: [programId: number, name: string]; result: void }
  'programs:duplicate': { args: [programId: number]; result: number }
  'programs:delete': { args: [programId: number]; result: void }
  // Loads a program (spec §6.1): it becomes current, and its files are checked (§10.1).
  'programs:setCurrent': { args: [programId: number | null]; result: void }
  'programs:addTracks': {
    args: [programId: number, fileIds: number[], beforeItemId: number | null]
    result: number[]
  }
  'programs:addStop': { args: [programId: number, beforeItemId: number | null]; result: number }
  'programs:reorder': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:removeItems': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:setItemDance': { args: [itemId: number, danceId: number]; result: void }
  'programs:played': { args: [programId: number]; result: PlayedEntry[] }
  'player:getState': { args: []; result: PlayerState }
  'player:play': { args: []; result: void }
  'player:pause': { args: []; result: void }
  'player:stop': { args: []; result: void }
  'player:next': { args: []; result: void }
  'player:preview': { args: [fileId: number]; result: void }
  'player:replay': { args: [logId: number]; result: void }
  // Reports from the control window's <audio> element, for play `playId`.
  'player:ended': { args: [playId: number]; result: void }
  'player:failed': { args: [playId: number, message: string]; result: void }
  'player:setSpeed': { args: [speed: number]; result: void }
  'player:setSpeedLocked': { args: [locked: boolean]; result: void }
  'player:setVolume': { args: [volume: number]; result: void }
  'player:setAutoContinue': {
    args: [change: { enabled?: boolean; seconds?: number }]
    result: void
  }
  'player:dismissWarning': { args: []; result: void }
  'player:restart': { args: []; result: void }
  'remote:status': { args: []; result: RemoteStatus }
  // Asks macOS for Accessibility permission (its own dialog), then reports the status.
  'remote:requestAccess': { args: []; result: RemoteStatus }
  // The player bar's projector toggle (spec §8.1).
  'projector:status': { args: []; result: ProjectorStatus }
  'projector:setEnabled': { args: [on: boolean]; result: ProjectorStatus }
  'projector:displays': { args: []; result: DisplayChoice[] }
  'projector:setDisplay': { args: [displayId: number | null]; result: ProjectorStatus }
  // The projector window asks for the current snapshot when it loads.
  'projector:getSnapshot': { args: []; result: ProjectorSnapshot }
  // The control window reports the playing song's position, for the projector's red line.
  'projector:reportProgress': {
    args: [playId: number, positionMs: number, durationMs: number | null]
    result: void
  }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'settings:getAll',
  'settings:set',
  'import:pickMusic',
  'import:pickAppleLibrary',
  'import:previewApple',
  'import:checkPlaylistConflicts',
  'import:start',
  'import:cancel',
  'library:stats',
  'library:list',
  'library:song',
  'library:updateSong',
  'library:updateDance',
  'library:setTeacher',
  'library:setDefaultDance',
  'library:linkDance',
  'library:createDance',
  'library:unlinkDance',
  'library:mergeDances',
  'library:sameDance',
  'library:markDifferent',
  'library:searchDances',
  'library:setFavorite',
  'library:songTags',
  'library:reapplyMapping',
  'library:suggestions',
  'playlists:list',
  'playlists:create',
  'playlists:rename',
  'playlists:duplicate',
  'playlists:delete',
  'playlists:add',
  'playlists:remove',
  'playlists:reorder',
  'library:setHolding',
  'programs:list',
  'programs:get',
  'programs:create',
  'programs:rename',
  'programs:duplicate',
  'programs:delete',
  'programs:setCurrent',
  'programs:addTracks',
  'programs:addStop',
  'programs:reorder',
  'programs:removeItems',
  'programs:setItemDance',
  'programs:played',
  'player:getState',
  'player:play',
  'player:pause',
  'player:stop',
  'player:next',
  'player:preview',
  'player:replay',
  'player:ended',
  'player:failed',
  'player:setSpeed',
  'player:setSpeedLocked',
  'player:setVolume',
  'player:setAutoContinue',
  'player:dismissWarning',
  'player:restart',
  'remote:status',
  'remote:requestAccess',
  'projector:status',
  'projector:setEnabled',
  'projector:displays',
  'projector:setDisplay',
  'projector:getSnapshot',
  'projector:reportProgress'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

// Every main → renderer event. Add a channel here and to EVENT_CHANNELS.
export interface EventContract {
  'import:progress': ImportProgress
  // Songs, dances, playlists or favorites changed (an edit or a finished import): refetch.
  'library:changed': null
  // Programs, their items or the play log changed: refetch.
  'programs:changed': null
  // The player's state after every change (spec §9).
  'player:state': PlayerState
  // To the control window: the projector opened, closed or moved.
  'projector:status': ProjectorStatus
  // To the projector window only: what to show, and the playing song's position.
  'projector:snapshot': ProjectorSnapshot
  'projector:progress': ProjectorProgress
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed',
  'programs:changed',
  'player:state',
  'projector:status',
  'projector:snapshot',
  'projector:progress'
] as const satisfies readonly EventChannel[]

type MissingEvents = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
const allEventsListed: [MissingEvents] extends [never] ? true : MissingEvents = true
void allEventsListed

export interface RendererApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  // Subscribes to a main → renderer event; returns the unsubscribe function.
  on<C extends EventChannel>(channel: C, listener: (payload: EventContract[C]) => void): () => void
  // File paths for files dropped onto the window (Electron's webUtils.getPathForFile).
  getPathsForFiles(files: File[]): string[]
}

export type InvokeHandlers = {
  [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
}
```

Replace `src/main/ipc/handlers.ts` with:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'
import { projectorHandlers, type ProjectorDeps } from './projector-handlers'
import type { ImportService } from '../import/import-service'
import { getLibraryStats } from '../library/stats'
import type { PlayerSession } from '../session/player-session'
import { libraryHandlers } from './library-handlers'
import { programHandlers } from './program-handlers'
import type { SettingsStore } from '../settings/settings-store'

export interface Dialogs {
  pickMusic(): Promise<string[]>
  pickAppleLibrary(): Promise<string | null>
}

export interface HandlerDeps {
  db: DatabaseSync
  settings: SettingsStore
  appInfo: () => AppInfo
  importer: Pick<ImportService, 'run' | 'cancel' | 'previewApple' | 'checkPlaylistConflicts'>
  dialogs: Dialogs
  player: PlayerSession
  // Whether a file is on disk (the program pre-check); defaults to the real file system.
  fileExists?: (path: string) => boolean
  // The remote's media keys (spec §7.4); reported off when absent.
  remote?: { status(): RemoteStatus; requestAccess(): RemoteStatus }
  // The projector window (spec §8); reported off when absent.
  projector?: ProjectorDeps
  // Called after every change to songs, dances, playlists, favorites or holding.
  onLibraryChanged: () => void
  // Called after every change to programs or their items.
  onProgramsChanged: () => void
}

export function createHandlers(deps: HandlerDeps): InvokeHandlers {
  return {
    'app:getInfo': () => deps.appInfo(),
    'settings:getAll': () => deps.settings.getAll(),
    'settings:set': (key, value) => {
      deps.settings.set(key, value)
      return deps.settings.getAll()
    },
    'import:pickMusic': () => deps.dialogs.pickMusic(),
    'import:pickAppleLibrary': () => deps.dialogs.pickAppleLibrary(),
    'import:previewApple': (xmlPath) => deps.importer.previewApple(xmlPath),
    'import:checkPlaylistConflicts': (ids) => deps.importer.checkPlaylistConflicts(ids),
    'import:start': (request) => deps.importer.run(request),
    'import:cancel': () => deps.importer.cancel(),
    'library:stats': () => getLibraryStats(deps.db),
    ...libraryHandlers(deps),
    ...programHandlers(deps),
    ...projectorHandlers(deps)
  }
}
```

Replace `src/main/index.ts` with:

```ts
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  systemPreferences
} from 'electron'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import type { EventChannel, EventContract } from '@shared/contract'
import { MEDIA_SCHEME, parseMediaUrl } from '@shared/media'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { importDialogs } from './import/dialogs'
import { ImportService } from './import/import-service'
import { startUtilityWorker } from './import/utility-worker'
import { createHandlers } from './ipc/handlers'
import { mediaResponse } from './media/media-response'
import { KeepAwake } from './power/keep-awake'
import { ActivityWatcher } from './projector/activity'
import {
  ProjectorController,
  type DisplayInfo,
  type ProjectorWindow,
  type Rect
} from './projector/projector-controller'
import { createProjectorFeed } from './projector/projector-feed'
import { registerMediaKeys } from './remote/media-keys'
import { checkProgramFiles } from './programs/file-check'
import { getProgram } from './programs/programs'
import { trackPath } from './programs/tracks'
import { PlayerSession } from './session/player-session'
import { createSessionPorts } from './session/session-ports'
import { guardNavigation } from './navigation'
import { registerHandlers } from './ipc/register'
import { SettingsStore } from './settings/settings-store'

// A separate library for end-to-end tests and smoke runs, so they never touch the real one.
if (process.env['FDP_USER_DATA']) app.setPath('userData', process.env['FDP_USER_DATA'])

// The remote's media keys go to PlayerSession (global shortcuts, spec §7.4). Chromium's own media
// key handling would pause or play the <audio> element behind the session's back.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService')

// Audio is served to the control window by file id (spec §9). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }
])

// Loads one of the renderer's pages: index.html (the control window) or projector.html.
function loadPage(win: BrowserWindow, page: 'index.html' | 'projector.html'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}`)
  } else {
    win.loadFile(join(__dirname, '../renderer', page))
  }
}

// Spec §8.1: borderless over a whole display, above everything, never taking focus, so the
// control window keeps the keyboard. Always-on-top is set before the bounds, or macOS keeps the
// window below the menu bar.
function createProjectorWindow(bounds: Rect): ProjectorWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    enableLargerThanScreen: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#000',
    title: 'Folk Dance Player — Projector',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/projector.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // skipTransformProcessType: without it, macOS briefly makes the whole app a background app on
  // every call, hiding the control window and the Dock icon, and after sleep it can stay that way.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setBounds(bounds)
  guardNavigation(win.webContents)
  win.once('ready-to-show', () => win.showInactive())
  loadPage(win, 'projector.html')
  return {
    setBounds: (b) => win.setBounds(b),
    close: () => {
      if (!win.isDestroyed()) win.close()
    },
    onceClosed: (callback) => win.once('closed', callback),
    send: (channel, payload) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

const toDisplay = (d: Electron.Display): DisplayInfo => ({
  id: d.id,
  label: d.label || `Display ${d.id}`,
  internal: d.internal,
  bounds: d.bounds
})

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Folk Dance Player',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  guardNavigation(win.webContents)
  loadPage(win, 'index.html')
  return win
}

function broadcast<C extends EventChannel>(channel: C, payload: EventContract[C]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

// Runs `fn` once after the current task, however many times it was asked for in it.
function coalesced(fn: () => void): () => void {
  let pending = false
  return () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      fn()
    })
  }
}

function openLibraryDatabase(dbPath: string): DatabaseSync {
  const db = openDatabase(dbPath)
  try {
    migrate(db, MIGRATIONS)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

function startupErrorMessage(err: unknown): string {
  if (err instanceof SchemaTooNewError) {
    return (
      'This music library was created by a newer version of Folk Dance Player ' +
      `(schema ${err.dbVersion}; this version supports up to ${err.appVersion}).\n\n` +
      'Please update the app. Your library has not been changed.'
    )
  }
  return `The music library could not be opened.\n\n${err instanceof Error ? err.message : String(err)}`
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folkdanceplayer.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dbPath = join(app.getPath('userData'), 'folk-dance-player.sqlite')
  let db: DatabaseSync
  try {
    db = openLibraryDatabase(dbPath)
  } catch (err) {
    dialog.showErrorBox('Folk Dance Player', startupErrorMessage(err))
    app.exit(1)
    return
  }

  const settings = new SettingsStore(db)
  // The projector's snapshot is rebuilt after anything it shows may have changed (set up below).
  let updateProjector = (): void => undefined
  const programsChanged = coalesced(() => {
    broadcast('programs:changed', null)
    updateProjector()
  })
  const libraryChanged = coalesced(() => {
    broadcast('library:changed', null)
    updateProjector()
  })
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    onProgress: (progress) => {
      broadcast('import:progress', progress)
      if (progress.phase === 'done') libraryChanged()
    }
  })
  // A program that was deleted outside the app's control is forgotten; the current one's files
  // are checked before the event (spec §10.1). Playback never resumes on its own after a restart.
  const current = settings.get('currentProgramId')
  if (current !== null && !getProgram(db, current)) settings.set('currentProgramId', null)
  else if (current !== null) checkProgramFiles(db, current)

  const player = new PlayerSession(
    createSessionPorts(db, settings, undefined, { programsChanged, libraryChanged }),
    { setTimeout, clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) },
    (state) => {
      broadcast('player:state', state)
      updateProjector()
    }
  )
  protocol.handle(MEDIA_SCHEME, (request) => {
    const fileId = parseMediaUrl(request.url)
    return mediaResponse(
      fileId === null ? null : trackPath(db, fileId),
      request.headers.get('range')
    )
  })

  const mediaKeys = registerMediaKeys(globalShortcut, player)
  // macOS delivers media keys only to an app trusted for Accessibility; other platforms don't ask.
  const trusted = (prompt: boolean) =>
    process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(prompt)
  const remote = {
    status: () => ({ trusted: trusted(false), keys: mediaKeys }),
    requestAccess: () => ({ trusted: trusted(true), keys: mediaKeys })
  }

  // One control window; closing it quits, so the projector is never left on its own.
  const mainWindow = createMainWindow()
  mainWindow.on('closed', () => app.quit())

  const controller = new ProjectorController({
    displays: () => screen.getAllDisplays().map(toDisplay),
    controlDisplayId: () =>
      mainWindow.isDestroyed()
        ? screen.getPrimaryDisplay().id
        : screen.getDisplayMatching(mainWindow.getBounds()).id,
    moveControlTo: (display) => {
      const { width, height } = mainWindow.getBounds()
      const area =
        screen.getAllDisplays().find((d) => d.id === display.id)?.workArea ?? display.bounds
      mainWindow.setBounds({
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width: Math.min(width, area.width),
        height: Math.min(height, area.height)
      })
    },
    createWindow: createProjectorWindow,
    settings: {
      enabled: () => settings.get('projector.enabled'),
      setEnabled: (on) => settings.set('projector.enabled', on),
      displayId: () => settings.get('projector.displayId')
    },
    onStatus: (status) => {
      broadcast('projector:status', status)
      updateProjector()
    }
  })
  const feed = createProjectorFeed({ db, player, projector: controller })
  const keepAwake = new KeepAwake(powerSaveBlocker)
  updateProjector = coalesced(() => {
    feed.update()
    keepAwake.update(
      KeepAwake.needed({
        projectorOpen: controller.status().open,
        status: player.getState().status
      })
    )
  })
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(event as 'display-added', () => controller.displaysChanged())
  }

  const activity = new ActivityWatcher({
    cursor: () => screen.getCursorScreenPoint(),
    playing: () => ['playing', 'countdown'].includes(player.getState().status),
    autoFullscreen: () => ({
      enabled: settings.get('autoFullscreen.enabled'),
      seconds: settings.get('autoFullscreen.seconds')
    }),
    projector: controller
  })
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown') activity.keyInput(input.key)
  })
  const primaryId = () => screen.getPrimaryDisplay().id

  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs,
      player,
      remote,
      projector: {
        status: () => controller.status(),
        setEnabled: (on) => controller.setEnabled(on),
        displays: () =>
          screen.getAllDisplays().map((d) => ({
            id: d.id,
            label: toDisplay(d).label,
            primary: d.id === primaryId(),
            internal: d.internal
          })),
        displayChoiceChanged: () => controller.displayChoiceChanged(),
        snapshot: () => feed.snapshot(),
        progress: (progress) => feed.progress(progress)
      },
      onLibraryChanged: () => {
        player.refresh() // labels or missing flags of the next item may have changed
        libraryChanged()
      },
      onProgramsChanged: programsChanged
    })
  )

  // After sleep, displays come back renumbered and windows may have moved: re-check them, and make
  // sure the control window is showing.
  powerMonitor.on('resume', () => {
    controller.displaysChanged()
    if (process.platform === 'darwin') void app.dock?.show()
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  })

  controller.start()
  activity.start()
  app.on('will-quit', () => {
    activity.stop()
    globalShortcut.unregisterAll()
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main && npm test && npm run typecheck && npx prettier --check .`
Expected: the suite: 471; typecheck and formatting are clean. The projector page and preload don't exist until Task 6, so don't run the app yet.

```bash
git add src/shared/contract.ts src/main tests/main
git commit -m "feat(projector): channels, feed and main-process wiring; keep-awake and wake handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The projector window's page

**Files:**
- Create: `src/preload/projector.ts`, `src/renderer/projector.html`, `src/renderer/src/projector/main.tsx`, `ProjectorView.tsx`, `ProjectorView.module.css`
- Modify: `electron.vite.config.ts` (replace), `src/preload/index.d.ts` (replace), `src/renderer/src/components/icons.tsx` (replace: adds `ChevronDownIcon`)
- Test: `tests/renderer/projector/projector-view.test.tsx`

**Interfaces:**
- Consumes: `@shared/projector` (Task 2); the projector events (Task 5).
- Produces:
  - **The build:** two renderer pages (`index`, `projector`) and two preloads.
  - **`window.projector: ProjectorApi`:** read-only.
  - **`ProjectorView({ snapshot, progress })`**, following spec §8.2 without a slide:
    - **Regions:** "Previously played"; then "Now playing" or "Up next" (with "Starting in N…" or "Next in N…"); then "Up next" or "After that".
    - **Text:** the dance and its choreographer large, "♪ song" smaller only when it differs, and the country on the right.
    - **The red progress line,** for the matching `playId`.
    - **The Teaching row:** ⌄ —— Teaching —— ⌄.
    - **"Paused"** when paused or stopped.
    - **The app's name** when there's no program and nothing playing.

- [ ] **Step 1: Write the failing tests**

`tests/renderer/projector/projector-view.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ProjectorEntry, ProjectorSnapshot } from '@shared/projector'
import ProjectorView from '@renderer/projector/ProjectorView'

const pravo: ProjectorEntry = {
  parts: { song: 'Pusteno Ludo', dance: 'Pravo Rhodopsko Oro', choreographer: 'Yves Moreau' },
  country: 'Bulgaria'
}
const svornato: ProjectorEntry = {
  parts: { song: null, dance: 'Svornato', choreographer: 'Jaap Leegwater' },
  country: 'Bulgaria'
}
const hora: ProjectorEntry = {
  parts: { song: 'Hora de la Munte', dance: 'Hora Mare', choreographer: null },
  country: 'Romania'
}
const misirlou: ProjectorEntry = {
  parts: { song: null, dance: 'Misirlou', choreographer: null },
  country: null
}

const playing: ProjectorSnapshot = {
  hasProgram: true,
  middle: { kind: 'now', entry: pravo, playId: 4, paused: false },
  upcoming: [
    { kind: 'dance', entry: svornato },
    { kind: 'teaching' },
    { kind: 'dance', entry: hora }
  ],
  played: [misirlou, hora]
}

const region = (name: string) => screen.getByRole('region', { name })

describe('projector view (spec §8.2)', () => {
  test('Now Playing: the dance large with its choreographer, ♪ the song below, the country right', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const now = region('Now playing')
    expect(within(now).getByText('Pravo Rhodopsko Oro (Yves Moreau)')).toBeInTheDocument()
    expect(within(now).getByText('♪ Pusteno Ludo')).toBeInTheDocument()
    expect(within(now).getByText('Bulgaria')).toBeInTheDocument()
  })

  test('the red line shows how far the playing song has got; another play’s position is ignored', () => {
    const { rerender } = render(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 4, positionMs: 45_000, durationMs: 180_000 }}
      />
    )
    expect(screen.getByTestId('progress')).toHaveStyle({ width: '25%' })
    rerender(
      <ProjectorView
        snapshot={playing}
        progress={{ playId: 3, positionMs: 90_000, durationMs: 180_000 }}
      />
    )
    expect(screen.getByTestId('progress')).toHaveStyle({ width: '0%' })
  })

  test('Up Next lists dances with ♪ songs on the same line, and a Teaching row before a taught dance', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const rows = within(region('Up next')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Svornato (Jaap Leegwater)Bulgaria',
      'Teaching',
      'Hora Mare♪ Hora de la MunteRomania'
    ])
    expect(rows[1].querySelectorAll('svg')).toHaveLength(2) // ⌄ arrows pointing at the dance
  })

  test('previously played is listed newest first with countries; a missing country is left blank', () => {
    render(<ProjectorView snapshot={playing} progress={null} />)
    const rows = within(region('Previously played')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Misirlou',
      'Hora Mare♪ Hora de la MunteRomania'
    ])
  })

  test('a paused or stopped song says so', () => {
    render(
      <ProjectorView
        snapshot={{ ...playing, middle: { kind: 'now', entry: svornato, playId: 4, paused: true } }}
        progress={null}
      />
    )
    expect(within(region('Now playing')).getByText('Paused')).toBeInTheDocument()
  })

  test('nothing playing: the next dance in the middle, with the countdown, and what comes after it', () => {
    const next = (
      countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null,
      teaching = false
    ) =>
      ({
        ...playing,
        middle: { kind: 'next', entry: hora, countdown, teaching },
        upcoming: [{ kind: 'dance', entry: svornato }]
      }) as ProjectorSnapshot
    const { rerender } = render(<ProjectorView snapshot={next(null)} progress={null} />)
    expect(within(region('Up next')).getByText('Hora Mare')).toBeInTheDocument()
    expect(within(region('After that')).getByText('Svornato (Jaap Leegwater)')).toBeInTheDocument()
    rerender(<ProjectorView snapshot={next({ secondsLeft: 3, reason: 'start' })} progress={null} />)
    expect(within(region('Up next')).getByText('Starting in 3…')).toBeInTheDocument()
    rerender(
      <ProjectorView snapshot={next({ secondsLeft: 2, reason: 'continue' })} progress={null} />
    )
    expect(within(region('Up next')).getByText('Next in 2…')).toBeInTheDocument()
    rerender(<ProjectorView snapshot={next(null, true)} progress={null} />)
    expect(within(region('Up next')).getByText('Teaching')).toBeInTheDocument()
  })

  test('with no program and nothing playing, only the app’s name', () => {
    render(
      <ProjectorView
        snapshot={{ hasProgram: false, middle: null, upcoming: [], played: [] }}
        progress={null}
      />
    )
    expect(screen.getByText('Folk Dance Player')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Now playing' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/projector`
Expected: FAIL — `Failed to resolve import "@renderer/projector/ProjectorView"`.

- [ ] **Step 3: Implement**

Replace `src/renderer/src/components/icons.tsx` with:

```tsx
// Drawn transport icons. Characters like ⏸ and ⏹ render as colored emoji on macOS while ▶ doesn't,
// so the buttons wouldn't match; these SVGs look the same everywhere and follow the text color.

type IconProps = { size?: number }

function Icon({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M7 4.5v15l12.5-7.5z" />
  </Icon>
)

export const PauseIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6" y="4.5" width="4.5" height="15" rx="1" />
    <rect x="13.5" y="4.5" width="4.5" height="15" rx="1" />
  </Icon>
)

export const StopIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
  </Icon>
)

// ◀◀: restart the song.
export const RestartIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 5v14L3 12zM21 5v14l-9-7z" />
  </Icon>
)

// ▶▶: the next item.
export const NextIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M3 5v14l9-7zM12 5v14l9-7z" />
  </Icon>
)

// ⌄: points down at the dance that will be taught (the projector's Teaching row).
export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4.5 8.5 12 16l7.5-7.5-1.8-1.8L12 12.4 6.3 6.7z" />
  </Icon>
)
```

`src/renderer/src/projector/ProjectorView.module.css`:

```css
.screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 2.5vh;
  padding: 3vh 4vw;
  background: #000;
  color: #f2f2f2;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  cursor: none;
}

.heading {
  margin: 0 0 1vh;
  font-size: 2.4vh;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9a9a9a;
}

.played {
  flex: 0 1 auto;
  max-height: 28vh;
  overflow: hidden;
}

.middle {
  flex: 0 0 auto;
}

.upcoming {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 2vw;
  padding: 1vh 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 4.2vh;
}

.played .row {
  font-size: 3.4vh;
  color: #c8c8c8;
}

/* The name truncates (the song first, then the dance) so the country is never pushed off. */
.name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 1.2vw;
  overflow: hidden;
  white-space: nowrap;
}

.dance {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song {
  flex: 0 100 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.7em;
  color: #a8a8a8;
}

.country {
  flex: 0 0 auto;
  color: #c8c8c8;
}

.nowLine {
  display: flex;
  align-items: baseline;
  gap: 2vw;
}

.nowDance {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 7.5vh;
  font-weight: 700;
  line-height: 1.15;
}

.nowCountry {
  flex: 0 0 auto;
  font-size: 4.5vh;
  color: #c8c8c8;
}

.nowSong {
  margin-top: 0.6vh;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 4vh;
  color: #a8a8a8;
}

.paused {
  margin-left: 1.5vw;
  font-size: 2.4vh;
  color: #f0b429;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.track {
  height: 0.8vh;
  margin-top: 2vh;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 0.4vh;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: #e03131;
  transition: width 0.25s linear;
}

/* ⌄ —— Teaching —— ⌄ */
.teaching {
  display: flex;
  align-items: center;
  gap: 1.5vw;
  padding: 1vh 0;
  font-size: 3vh;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #f0b429;
}

/* The arrows scale with the text (the icon's own size is in pixels). */
.teaching svg {
  flex: 0 0 auto;
  width: 1.2em;
  height: 1.2em;
}

.rule {
  flex: 1;
  height: 2px;
  background: rgba(240, 180, 41, 0.5);
}

.empty {
  margin: auto;
  font-size: 4vh;
  color: #555;
  letter-spacing: 0.1em;
}
```

`src/renderer/src/projector/ProjectorView.tsx`:

```tsx
import type { LabelParts } from '@shared/labels'
import type { ProjectorEntry, ProjectorProgress, ProjectorSnapshot } from '@shared/projector'
import { ChevronDownIcon } from '../components/icons'
import classes from './ProjectorView.module.css'

// The large part of a label: the dance, and the choreographer when the label needs it (spec §4).
const dance = (parts: LabelParts): string =>
  parts.choreographer ? `${parts.dance} (${parts.choreographer})` : parts.dance

// A list row: the dance and (smaller, only when it differs) ♪ the song on the left; the country on
// the right.
function Row({ entry }: { entry: ProjectorEntry }): React.JSX.Element {
  return (
    <li className={classes.row}>
      <span className={classes.name}>
        <span className={classes.dance}>{dance(entry.parts)}</span>
        {entry.parts.song && <span className={classes.song}>♪ {entry.parts.song}</span>}
      </span>
      <span className={classes.country}>{entry.country}</span>
    </li>
  )
}

// ⌄ —— Teaching —— ⌄, pointing down at the dance that will be taught.
function Teaching({ as: Tag = 'li' }: { as?: 'li' | 'div' }): React.JSX.Element {
  return (
    <Tag className={classes.teaching}>
      <ChevronDownIcon size={28} />
      <span className={classes.rule} />
      <span>Teaching</span>
      <span className={classes.rule} />
      <ChevronDownIcon size={28} />
    </Tag>
  )
}

function percent(snapshot: ProjectorSnapshot, progress: ProjectorProgress | null): number {
  const { middle } = snapshot
  if (middle?.kind !== 'now' || !progress || progress.playId !== middle.playId) return 0
  if (!progress.durationMs) return 0
  return Math.min(100, Math.max(0, (progress.positionMs / progress.durationMs) * 100))
}

// Spec §8.2, without a slide (Canva slides arrive in plan 6): previously played across the top,
// then what's playing (or the next dance), then the rest of the program. It only renders.
export default function ProjectorView({
  snapshot,
  progress
}: {
  snapshot: ProjectorSnapshot
  progress: ProjectorProgress | null
}): React.JSX.Element {
  const { middle, upcoming, played } = snapshot
  if (!snapshot.hasProgram && !middle) {
    return (
      <div className={classes.screen}>
        <div className={classes.empty}>Folk Dance Player</div>
      </div>
    )
  }
  const nextHeading =
    middle?.kind === 'next' && middle.countdown
      ? middle.countdown.reason === 'start'
        ? `Starting in ${middle.countdown.secondsLeft}…`
        : `Next in ${middle.countdown.secondsLeft}…`
      : 'Up next'
  return (
    <div className={classes.screen}>
      {played.length > 0 && (
        <section className={classes.played} aria-label="Previously played">
          <h2 className={classes.heading}>Previously played</h2>
          <ul className={classes.list}>
            {played.map((entry, i) => (
              <Row key={i} entry={entry} />
            ))}
          </ul>
        </section>
      )}
      {middle && (
        <section
          className={classes.middle}
          aria-label={middle.kind === 'now' ? 'Now playing' : 'Up next'}
        >
          <h2 className={classes.heading}>
            {middle.kind === 'now' ? 'Now playing' : nextHeading}
            {middle.kind === 'now' && middle.paused && (
              <span className={classes.paused}>Paused</span>
            )}
          </h2>
          {middle.kind === 'next' && middle.teaching && <Teaching as="div" />}
          <div className={classes.nowLine}>
            <span className={classes.nowDance}>{dance(middle.entry.parts)}</span>
            <span className={classes.nowCountry}>{middle.entry.country}</span>
          </div>
          {middle.entry.parts.song && (
            <div className={classes.nowSong}>♪ {middle.entry.parts.song}</div>
          )}
          {middle.kind === 'now' && (
            <div className={classes.track}>
              <div
                className={classes.bar}
                data-testid="progress"
                style={{ width: `${percent(snapshot, progress)}%` }}
              />
            </div>
          )}
        </section>
      )}
      {upcoming.length > 0 && (
        <section
          className={classes.upcoming}
          aria-label={middle?.kind === 'next' ? 'After that' : 'Up next'}
        >
          <h2 className={classes.heading}>{middle?.kind === 'next' ? 'After that' : 'Up next'}</h2>
          <ul className={classes.list}>
            {upcoming.map((row, i) =>
              row.kind === 'teaching' ? <Teaching key={i} /> : <Row key={i} entry={row.entry} />
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
```

`src/renderer/src/projector/main.tsx`:

```tsx
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EMPTY_SNAPSHOT, type ProjectorProgress } from '@shared/projector'
import ProjectorView from './ProjectorView'

// The projector window (spec §8): renders what main sends, nothing else.
function Projector(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [progress, setProgress] = useState<ProjectorProgress | null>(null)
  useEffect(() => {
    const api = window.projector
    void api.getSnapshot().then(setSnapshot)
    const stops = [api.onSnapshot(setSnapshot), api.onProgress(setProgress)]
    return () => stops.forEach((stop) => stop())
  }, [])
  return <ProjectorView snapshot={snapshot} progress={progress} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Projector />
  </StrictMode>
)
```

`src/renderer/projector.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Folk Dance Player — Projector</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/projector/main.tsx"></script>
  </body>
</html>
```

`src/preload/projector.ts`:

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ProjectorApi } from '@shared/projector'

// The projector window is read-only (spec §8.2): it gets the snapshot and the position, and can
// send nothing back.
function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: ProjectorApi = {
  getSnapshot: () => ipcRenderer.invoke('projector:getSnapshot'),
  onSnapshot: (listener) => listen('projector:snapshot', listener),
  onProgress: (listener) => listen('projector:progress', listener)
}

contextBridge.exposeInMainWorld('projector', api)
```

Replace `src/preload/index.d.ts` with:

```ts
import type { RendererApi } from '../shared/contract'
import type { ProjectorApi } from '../shared/projector'

declare global {
  interface Window {
    api: RendererApi // the control window
    projector: ProjectorApi // the projector window
  }
}

export {}
```

Replace `electron.vite.config.ts` with:

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

// Two windows: the control window (index) and the projector (spec §8), each with its own preload.
export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          projector: resolve('src/preload/projector.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          projector: resolve('src/renderer/projector.html')
        }
      }
    }
  }
})
```

- [ ] **Step 4: Run the tests, typecheck, build and commit**

Run: `npx vitest run tests/renderer/projector && npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: projector view 7 pass; the suite: 478. Typecheck, formatting and build are clean, and `out/renderer` has `projector.html` while `out/preload` has `projector.js`.

```bash
git add electron.vite.config.ts src/preload src/renderer tests/renderer/projector
git commit -m "feat(projector): the projector page — large-font view, red progress line, Teaching rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The control window: Projector switch, progress reports, display choice

**Files:**
- Create: `src/renderer/src/program/useProjectorStatus.ts`, `src/renderer/src/components/ProjectorDisplay.tsx`
- Modify: `src/renderer/src/program/useAudio.ts` (replace), `src/renderer/src/program/PlayerBar.tsx` (replace), `src/renderer/src/pages/SettingsPage.tsx` (replace), `tests/renderer/fake-api.ts` (replace), `tests/renderer/program/player-bar.test.tsx` (replace), `tests/renderer/settings-page.test.tsx` (replace)

**Interfaces:**
- Consumes: the `projector:*` channels and events (Task 5).
- Produces:
  - **`useAudio`:** each `timeupdate` also sends `projector:reportProgress(playId, ms, duration)`, using the track's duration until the audio knows its own.
  - **`useProjectorStatus(api)`:** like the program store, a broadcast beats a late first answer.
  - **`PlayerBar`:** a **Projector** switch, plus "On <display>" or the notice.
  - **Settings:** a **Projector display** select ("Automatic (the first external display)" or a display), saved through `projector:setDisplay`. `SettingsPage` reloads its settings afterwards.
  - **The fake API:** answers `projector:status` (off), `projector:displays` (`[]`) and `projector:reportProgress`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/renderer/fake-api.ts` with:

```ts
import type { EventChannel, EventContract, InvokeChannel, RendererApi } from '@shared/contract'
import { IDLE_PLAYER_STATE, NO_REMOTE } from '@shared/program'
import { PROJECTOR_OFF } from '@shared/projector'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

type Handler = (...args: never[]) => unknown

export interface FakeApi {
  api: RendererApi
  // Every invoke, as [channel, ...args].
  calls: unknown[][]
  callsTo(channel: InvokeChannel): unknown[][]
  emit<C extends EventChannel>(channel: C, payload: EventContract[C]): void
  settings: Settings
}

// A RendererApi for component tests. `handlers` answer invoke channels (sync or async values,
// or functions of the call's arguments); settings:getAll/settings:set work out of the box.
export function createFakeApi(
  handlers: Partial<Record<InvokeChannel, unknown>> = {},
  paths: string[] = []
): FakeApi {
  const calls: unknown[][] = []
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const fake: FakeApi = {
    calls,
    callsTo: (channel) => calls.filter((c) => c[0] === channel).map((c) => c.slice(1)),
    emit: (channel, payload) => listeners.get(channel)?.forEach((l) => l(payload)),
    settings: { ...DEFAULT_SETTINGS },
    api: {
      invoke: (async (channel: InvokeChannel, ...args: unknown[]) => {
        calls.push([channel, ...args])
        if (channel in handlers) {
          const handler = handlers[channel]
          return typeof handler === 'function'
            ? (handler as Handler)(...(args as never[]))
            : handler
        }
        // The library starts empty unless a test says otherwise.
        if (channel === 'library:list' || channel === 'playlists:list') return []
        if (channel === 'library:stats') return { fileCount: 0 }
        if (channel === 'library:suggestions') return { people: [], countries: [], danceTypes: [] }
        // No program is loaded unless a test says otherwise.
        if (channel === 'programs:list' || channel === 'programs:played') return []
        if (channel === 'programs:get') return null
        if (channel === 'player:getState') return IDLE_PLAYER_STATE
        if (channel === 'remote:status') return NO_REMOTE
        // The projector is off, and the control window's progress reports go nowhere.
        if (channel === 'projector:status') return PROJECTOR_OFF
        if (channel === 'projector:displays') return []
        if (channel === 'projector:reportProgress') return undefined
        if (channel === 'settings:getAll') return fake.settings
        if (channel === 'settings:set') {
          const [key, value] = args as [keyof Settings, unknown]
          fake.settings = { ...fake.settings, [key]: value }
          return fake.settings
        }
        throw new Error(`No fake handler for ${channel}`)
      }) as RendererApi['invoke'],
      on: ((channel: string, listener: (payload: unknown) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel)!.add(listener)
        return () => listeners.get(channel)!.delete(listener)
      }) as RendererApi['on'],
      getPathsForFiles: () => paths
    }
  }
  return fake
}
```

Replace `tests/renderer/program/player-bar.test.tsx` with:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlayerState } from '@shared/program'
import PlayerBar from '@renderer/program/PlayerBar'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, playing, stop, track } from './fixtures'

const hora = track(101, 'Hora', { country: 'Romania', durationMs: 185_000 })

const COMMANDS = [
  'player:play',
  'player:pause',
  'player:stop',
  'player:next',
  'player:ended',
  'player:failed',
  'player:setSpeed',
  'player:setSpeedLocked',
  'player:setVolume',
  'player:setAutoContinue',
  'player:dismissWarning',
  'player:restart',
  'projector:setEnabled'
] as const

function setup(state: PlayerState) {
  const fake = createFakeApi({
    'player:getState': state,
    ...Object.fromEntries(COMMANDS.map((c) => [c, undefined]))
  })
  renderWithLibrary(<PlayerBar />, fake.api)
  return fake
}

const audio = () => screen.getByTestId('player-audio') as HTMLAudioElement
const title = () => screen.getByTestId('player-title')

describe('player bar', () => {
  test('idle: shows next up, and ▶ starts the program', async () => {
    const fake = setup(playerState({ nextUp: item(1, hora) }))
    await waitFor(() => expect(title()).toHaveTextContent('Next up: Hora'))
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(fake.callsTo('player:play')).toEqual([[]])
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  })

  test('a STOP marker next, or nothing loaded, says so', async () => {
    const fake = setup(playerState({ nextUp: stop(3) }))
    await waitFor(() => expect(title()).toHaveTextContent('Next up: STOP / TEACHING'))
    act(() => fake.emit('player:state', playerState({ programId: null })))
    expect(title()).toHaveTextContent('No program loaded')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  test('playing: loads the song by file id and plays it, showing its label and country', async () => {
    setup(playing(hora))
    await waitFor(() => expect(audio().src).toBe('fdp-media://file/101'))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(title()).toHaveTextContent('Hora')
    expect(screen.getByText('Romania')).toBeInTheDocument()
    expect(screen.getByText('0:00 / 3:05')).toBeInTheDocument()
  })

  test('a double-click on ▶ or ⏸ counts as one press', async () => {
    const fake = setup(playerState({ nextUp: item(1, hora) }))
    const play = await screen.findByRole('button', { name: 'Play' })
    fireEvent.click(play, { detail: 1 })
    fireEvent.click(play, { detail: 2 })
    expect(fake.callsTo('player:play')).toHaveLength(1)
    act(() => fake.emit('player:state', playing(hora)))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }), { detail: 2 })
    expect(fake.callsTo('player:pause')).toEqual([])
  })

  test('stopped: the song stays loaded at its start, and ▶ plays it again', async () => {
    const fake = setup(playing(hora))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 42
    act(() => fake.emit('player:state', { ...playing(hora), status: 'stopped' }))
    expect(audio().currentTime).toBe(0)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(title()).toHaveTextContent('Hora')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(fake.callsTo('player:play')).toHaveLength(1)
  })

  test('transport buttons show matching drawn icons, not emoji characters', async () => {
    setup(playing(hora))
    for (const name of ['Restart song', 'Pause', 'Stop', 'Next']) {
      const button = await screen.findByRole('button', { name })
      expect(button.querySelector('svg')).not.toBeNull()
      expect(button.textContent).toBe('')
    }
  })

  test('transport buttons send pause, stop and next', async () => {
    const fake = setup(playing(hora))
    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
    expect(fake.callsTo('player:stop')).toHaveLength(1)
    expect(fake.callsTo('player:next')).toHaveLength(1)
  })

  test('◀◀ asks main to restart; the audio rewinds when the restart count changes', async () => {
    const fake = setup(playing(hora))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 42
    await userEvent.click(screen.getByRole('button', { name: 'Restart song' }))
    expect(fake.callsTo('player:restart')).toEqual([[]])
    expect(audio().currentTime).toBe(42) // main decides; the remote's back button goes there too
    const state = playing(hora)
    act(() => fake.emit('player:state', { ...state, current: { ...state.current!, restarts: 1 } }))
    expect(audio().currentTime).toBe(0)
  })

  test('reports the end of the song, and a song that can’t be played, with its play id', async () => {
    const fake = setup(playing(hora, {}, 7))
    await waitFor(() => expect(audio().src).toContain('101'))
    fireEvent(audio(), new Event('ended'))
    expect(fake.callsTo('player:ended')).toEqual([[7]])
    Object.defineProperty(audio(), 'error', { configurable: true, value: { code: 4 } })
    fireEvent(audio(), new Event('error'))
    expect(fake.callsTo('player:failed')).toEqual([
      [7, "the file can't be read or isn't a supported format"]
    ])
  })

  test('shows the countdowns before the first song and between songs', async () => {
    const fake = setup(
      playerState({
        status: 'countdown',
        countdown: { secondsLeft: 3, reason: 'start' },
        nextUp: item(1, hora)
      })
    )
    await waitFor(() => expect(title()).toHaveTextContent('Starting in 3…'))
    act(() =>
      fake.emit(
        'player:state',
        playerState({
          status: 'countdown',
          countdown: { secondsLeft: 2, reason: 'continue' },
          nextUp: item(1, hora)
        })
      )
    )
    expect(title()).toHaveTextContent('Next: Hora in 2…')
  })

  test('marks a preview, and keeps the speed and pitch on the audio element', async () => {
    const fake = setup(playing(hora, { speed: 0.75 }))
    await waitFor(() => expect(audio().playbackRate).toBe(0.75))
    expect(audio().preservesPitch).toBe(true)
    act(() =>
      fake.emit('player:state', {
        ...playing(hora, { speed: 0.75 }, 2),
        current: { playId: 2, source: 'preview', itemId: null, track: hora, restarts: 0 }
      })
    )
    expect(screen.getByText('Preview')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep speed for the next song' }))
    expect(fake.callsTo('player:setSpeedLocked')).toEqual([[true]])
  })

  test('auto-continue and its seconds are set from the bar', async () => {
    const fake = setup(playerState({ autoContinue: { enabled: true, seconds: 5 } }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Auto-continue' }))
    expect(fake.callsTo('player:setAutoContinue')).toEqual([[{ enabled: false }]])
    const seconds = screen.getByRole('textbox', { name: 'Auto-continue after (seconds)' })
    await userEvent.clear(seconds)
    await userEvent.type(seconds, '8')
    await userEvent.tab()
    expect(fake.callsTo('player:setAutoContinue')).toEqual([[{ enabled: false }], [{ seconds: 8 }]])
  })

  test('reports the playing song’s position, for the projector’s red line', async () => {
    const fake = setup(playing(hora, {}, 7))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 12
    fireEvent(audio(), new Event('timeupdate'))
    expect(fake.callsTo('projector:reportProgress').at(-1)).toEqual([7, 12_000, 185_000])
  })

  test('the projector switch turns projector mode on, and shows where it is and any notice', async () => {
    const fake = setup(playerState())
    await userEvent.click(await screen.findByRole('switch', { name: 'Projector' }))
    expect(fake.callsTo('projector:setEnabled')).toEqual([[true]])
    act(() =>
      fake.emit('projector:status', {
        enabled: true,
        open: true,
        mode: 'laptop',
        display: 'Built-in Retina Display',
        notice:
          'No separate display — showing on this screen (move the mouse or press Esc to close)'
      })
    )
    expect(screen.getByRole('switch', { name: 'Projector' })).toBeChecked()
    expect(screen.getByText(/No separate display/)).toBeInTheDocument()
    act(() =>
      fake.emit('projector:status', {
        enabled: true,
        open: true,
        mode: 'projector',
        display: 'Epson',
        notice: null
      })
    )
    expect(screen.getByText('On Epson')).toBeInTheDocument()
  })

  test('shows a warning until it is dismissed', async () => {
    const fake = setup(playerState({ warning: 'Skipped missing file: Hora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Skipped missing file: Hora')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }))
    expect(fake.callsTo('player:dismissWarning')).toHaveLength(1)
  })
})
```

Replace `tests/renderer/settings-page.test.tsx` with:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { RendererApi } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import SettingsPage from '@renderer/pages/SettingsPage'
import { renderWithMantine } from './render'

function fakeApi(
  initial: Settings = DEFAULT_SETTINGS,
  remote: () => RemoteStatus = () => ({ trusted: true, keys: ALL_KEYS })
) {
  let current: Settings = { ...initial }
  const calls: unknown[][] = []
  const api: RendererApi = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      if (channel === 'settings:getAll') return current
      if (channel === 'remote:status' || channel === 'remote:requestAccess') return remote()
      if (channel === 'projector:displays')
        return [
          { id: 1, label: 'Built-in Retina Display', primary: true, internal: true },
          { id: 2, label: 'Epson Projector', primary: false, internal: false }
        ]
      if (channel === 'projector:setDisplay') {
        current = { ...current, 'projector.displayId': args[0] as number | null }
        return { enabled: false, open: false, mode: null, display: null, notice: null }
      }
      if (channel === 'app:getInfo')
        return { version: '0.1.0', dbPath: '/data/folk-dance-player.sqlite', schemaVersion: 1 }
      if (channel === 'settings:set') {
        const [key, value] = args as [keyof Settings, unknown]
        if (key === 'autoContinue.seconds' && (value as number) < 0) {
          throw new Error('Invalid value for autoContinue.seconds')
        }
        current = { ...current, [key]: value }
        return current
      }
      throw new Error(`unexpected channel ${channel}`)
    }) as RendererApi['invoke'],
    on: () => () => undefined,
    getPathsForFiles: () => []
  }
  return { api, calls }
}

const ALL_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop']

describe('SettingsPage', () => {
  test('shows the stored settings', async () => {
    const { api } = fakeApi({ ...DEFAULT_SETTINGS, 'autoContinue.seconds': 8 })
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByLabelText('Genre is Country')).toBeChecked()
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue('8')
    expect(await screen.findByText('/data/folk-dance-player.sqlite')).toBeInTheDocument()
  })

  test('saves a toggled setting', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    await userEvent.click(await screen.findByLabelText('Genre is Country'))
    expect(calls).toContainEqual(['settings:set', 'import.genreIsCountry', false])
    expect(screen.getByLabelText('Genre is Country')).not.toBeChecked()
  })

  test('saves a number setting on blur', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Countdown before first song (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '3')
    await userEvent.tab()
    expect(calls).toContainEqual(['settings:set', 'countdown.seconds', 3])
  })

  test('shows an error and restores the saved value when a save is rejected', async () => {
    const { api } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Auto-continue after (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '-4')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save setting")
    // The field re-mounts after a rejected save, so look it up again.
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue('5')
  })

  test('saves the import mapping defaults', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Album Artist → Teacher' }))
    expect(calls).toContainEqual(['settings:set', 'import.albumArtistTagTarget', 'teacher'])
  })

  test('edits the dance-type suggestions', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    // TagsInput labels both its visible and its hidden input, so find it by placeholder.
    const input = await screen.findByPlaceholderText('Add a dance type')
    await userEvent.type(input, 'Hora line{Enter}')
    expect(calls).toContainEqual([
      'settings:set',
      'danceTypeSuggestions',
      [...DEFAULT_SETTINGS.danceTypeSuggestions, 'Hora line']
    ])
  })

  test('shows errors without Electron’s technical prefix', async () => {
    const { api } = fakeApi()
    const original = api.invoke
    api.invoke = (async (channel: string, ...args: unknown[]) => {
      if (channel === 'settings:set') {
        throw new Error(
          "Error invoking remote method 'settings:set': InvalidSettingError: Invalid value for autoContinue.seconds: -4"
        )
      }
      return (original as (c: string, ...a: unknown[]) => unknown)(channel, ...args)
    }) as RendererApi['invoke']
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Auto-continue after (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '-4')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save setting: Invalid value for autoContinue.seconds: -4"
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('invoking remote method')
  })

  test('says the remote is ready when its media keys are active', async () => {
    const { api } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/The remote is ready/)).toBeInTheDocument()
  })

  test('without Accessibility permission, explains and asks macOS for it', async () => {
    let trusted = false
    const { api, calls } = fakeApi(DEFAULT_SETTINGS, () => ({ trusted, keys: ALL_KEYS }))
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/needs Accessibility permission/)).toBeInTheDocument()
    trusted = true
    await userEvent.click(screen.getByRole('button', { name: 'Allow remote control…' }))
    expect(calls).toContainEqual(['remote:requestAccess'])
    expect(await screen.findByText(/The remote is ready/)).toBeInTheDocument()
  })

  test('names media keys another app is holding', async () => {
    const { api } = fakeApi(DEFAULT_SETTINGS, () => ({ trusted: true, keys: ALL_KEYS.slice(1) }))
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/Another app is using: play\/pause/)).toBeInTheDocument()
  })

  test('chooses the projector display, or automatic', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    // Select labels a hidden input too (like TagsInput), so find it by the value it shows.
    const select = await screen.findByDisplayValue('Automatic (the first external display)')
    await userEvent.click(select)
    await userEvent.click(await screen.findByRole('option', { name: 'Epson Projector' }))
    expect(calls).toContainEqual(['projector:setDisplay', 2])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/program/player-bar.test.tsx tests/renderer/settings-page.test.tsx`
Expected: FAIL. The 3 new tests fail: there are no progress reports, no Projector switch and no Projector display select.

- [ ] **Step 3: Implement**

`src/renderer/src/program/useProjectorStatus.ts`:

```ts
import { useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { PROJECTOR_OFF, type ProjectorStatus } from '@shared/projector'

// The projector window's state (spec §8.1), kept current by main's 'projector:status' events.
export function useProjectorStatus(api: RendererApi): ProjectorStatus {
  const [status, setStatus] = useState<ProjectorStatus>(PROJECTOR_OFF)
  useEffect(() => {
    let heard = false
    const stop = api.on('projector:status', (s) => {
      heard = true
      setStatus(s)
    })
    void api.invoke('projector:status').then((s) => {
      if (!heard) setStatus(s)
    })
    return stop
  }, [api])
  return status
}
```

Replace `src/renderer/src/program/useAudio.ts` with:

```ts
import { useEffect, useRef, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { mediaUrl } from '@shared/media'
import type { PlayerState } from '@shared/program'

const MEDIA_ERRORS: Record<number, string> = {
  2: "the file couldn't be loaded",
  3: 'the file is damaged',
  4: "the file can't be read or isn't a supported format"
}

export interface AudioControls {
  ref: React.RefObject<HTMLAudioElement | null>
  positionMs: number
  durationMs: number | null
  seek(ms: number): void
}

// The control window plays the audio (spec §9): this follows main's player state — which song,
// playing, paused or stopped, speed and volume — and reports back when a song ends or can't be played.
export function useAudio(api: RendererApi, player: PlayerState): AudioControls {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [positionMs, setPosition] = useState(0)
  const [durationMs, setDuration] = useState<number | null>(null)
  const playId = player.current?.playId ?? null
  const trackMs = player.current?.track.durationMs ?? null
  const fileId = player.current?.track.fileId ?? null
  const playing = player.status === 'playing'
  const stopped = player.status === 'stopped'

  // A new play: load its file from the start.
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    setPosition(0)
    if (fileId === null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      setDuration(null)
      return
    }
    audio.src = mediaUrl(fileId)
    audio.currentTime = 0
  }, [playId, fileId])

  // Playing or paused; ⏹ ('stopped') pauses and rewinds to the start, keeping the song loaded.
  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null) return
    if (playing) {
      void audio.play().catch(() => undefined) // a failure arrives as an 'error' event
      return
    }
    audio.pause()
    if (stopped) {
      audio.currentTime = 0
      setPosition(0)
    }
  }, [playing, stopped, playId])

  // ◀◀ or the remote's back button: main bumps the play's restart count; rewind to the start.
  const restarts = player.current?.restarts ?? 0
  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null || restarts === 0) return
    audio.currentTime = 0
    setPosition(0)
  }, [restarts, playId])

  // Speed changes keep the pitch (spec §7.2). A new source resets playbackRate to the default.
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    audio.preservesPitch = true
    audio.defaultPlaybackRate = player.speed
    audio.playbackRate = player.speed
  }, [player.speed, playId])

  useEffect(() => {
    if (ref.current) ref.current.volume = player.volume
  }, [player.volume])

  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null) return
    const onEnded = () => void api.invoke('player:ended', playId)
    const onError = () =>
      void api.invoke(
        'player:failed',
        playId,
        MEDIA_ERRORS[audio.error?.code ?? 0] ?? 'unknown error'
      )
    // The position also goes to main, for the projector's red line (spec §8.2).
    const onTime = () => {
      const ms = audio.currentTime * 1000
      setPosition(ms)
      const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : trackMs
      void api.invoke('projector:reportProgress', playId, ms, duration)
    }
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration * 1000 : null)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [api, playId, trackMs])

  return {
    ref,
    positionMs,
    durationMs: durationMs ?? player.current?.track.durationMs ?? null,
    seek: (ms) => {
      if (!ref.current) return
      ref.current.currentTime = ms / 1000
      setPosition(ms)
    }
  }
}
```

Replace `src/renderer/src/program/PlayerBar.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Slider,
  Switch,
  Text,
  Tooltip
} from '@mantine/core'
import type { PlayerState } from '@shared/program'
import { NextIcon, PauseIcon, PlayIcon, RestartIcon, StopIcon } from '../components/icons'
import { formatTime } from '../format-time'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from './ProgramProvider'
import { useAudio } from './useAudio'
import { useProjectorStatus } from './useProjectorStatus'
import classes from './PlayerBar.module.css'

const nextLabel = (player: PlayerState): string | null =>
  player.nextUp === null
    ? null
    : player.nextUp.kind === 'stop'
      ? 'STOP / TEACHING'
      : player.nextUp.label

// The line under the transport: what's playing, the countdown, or what's next (spec §6.2, §7.2).
function status(player: PlayerState): { title: string; detail: string | null } {
  const next = nextLabel(player)
  if (player.current) {
    return { title: player.current.track.label, detail: player.current.track.country }
  }
  if (player.countdown) {
    const n = player.countdown.secondsLeft
    return player.countdown.reason === 'start'
      ? { title: `Starting in ${n}…`, detail: next }
      : { title: `Next: ${next ?? ''} in ${n}…`, detail: null }
  }
  if (player.programId === null) return { title: 'No program loaded', detail: null }
  return next
    ? { title: `Next up: ${next}`, detail: null }
    : { title: 'Nothing left to play', detail: null }
}

// ▶ turns into ⏸ under the pointer, so the second click of a habitual double-click is ignored
// (it would pause the song that just started).
// Spec §6.2 player bar: transport, the current song, a seek bar, speed (with 🔒) and volume,
// and auto-continue. Owns the <audio> element, so it's mounted once, above the tabs (App).
export default function PlayerBar(): React.JSX.Element {
  const api = useLibraryApi()
  const player = useProgram((s) => s.player)
  const audio = useAudio(api, player)
  const projector = useProjectorStatus(api)
  const [seeking, setSeeking] = useState<number | null>(null)
  const [seconds, setSeconds] = useState<string | number>(player.autoContinue.seconds)
  useEffect(() => setSeconds(player.autoContinue.seconds), [player.autoContinue.seconds])

  const { title, detail } = status(player)
  const playing = player.status === 'playing'
  const loaded = player.current !== null
  const canStart = player.status !== 'idle' || player.nextUp !== null
  const duration = audio.durationMs ?? 0

  return (
    <Paper withBorder p="sm" className={classes.bar}>
      <audio ref={audio.ref} data-testid="player-audio" />
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Restart song"
          disabled={!loaded}
          onClick={() => void api.invoke('player:restart')}
        >
          <RestartIcon />
        </ActionIcon>
        {playing ? (
          <ActionIcon
            size="lg"
            aria-label="Pause"
            onClick={(e) => e.detail < 2 && void api.invoke('player:pause')}
          >
            <PauseIcon />
          </ActionIcon>
        ) : (
          <ActionIcon
            size="lg"
            aria-label="Play"
            disabled={!canStart}
            onClick={(e) => e.detail < 2 && void api.invoke('player:play')}
          >
            <PlayIcon />
          </ActionIcon>
        )}
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Stop"
          disabled={player.status === 'idle' || player.status === 'stopped'}
          onClick={() => void api.invoke('player:stop')}
        >
          <StopIcon />
        </ActionIcon>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Next"
          disabled={player.programId === null}
          onClick={() => void api.invoke('player:next')}
        >
          <NextIcon />
        </ActionIcon>
        <div className={classes.now} aria-live="polite">
          <Group gap={6} wrap="nowrap">
            <Text fw={600} className={classes.label} data-testid="player-title">
              {title}
            </Text>
            {player.current && player.current.source !== 'program' && (
              <Badge size="xs" variant="light">
                {player.current.source === 'preview' ? 'Preview' : 'Replay'}
              </Badge>
            )}
          </Group>
          {detail && (
            <Text size="sm" c="dimmed" className={classes.label}>
              {detail}
            </Text>
          )}
        </div>
        <Group gap={4} wrap="nowrap" w={210}>
          <Text size="sm" w={40}>{`${player.speed}×`}</Text>
          <Slider
            aria-label="Speed"
            min={0.5}
            max={1.5}
            step={0.05}
            value={player.speed}
            onChange={(v) => void api.invoke('player:setSpeed', v)}
            label={(v) => `${v}×`}
            style={{ flex: 1 }}
          />
          <Tooltip
            label={
              player.speedLocked ? 'Speed kept for the next song' : 'Speed resets for each song'
            }
          >
            <ActionIcon
              variant={player.speedLocked ? 'filled' : 'subtle'}
              size="sm"
              aria-label="Keep speed for the next song"
              aria-pressed={player.speedLocked}
              onClick={() => void api.invoke('player:setSpeedLocked', !player.speedLocked)}
            >
              {player.speedLocked ? '🔒' : '🔓'}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap={4} wrap="nowrap" w={140}>
          <Text size="sm">Vol</Text>
          <Slider
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={player.volume}
            onChange={(v) => void api.invoke('player:setVolume', v)}
            label={(v) => `${Math.round(v * 100)}%`}
            style={{ flex: 1 }}
          />
        </Group>
      </Group>
      <Group gap="sm" wrap="nowrap">
        <Slider
          aria-label="Position"
          min={0}
          max={Math.max(duration, 1)}
          value={seeking ?? Math.min(audio.positionMs, duration)}
          disabled={!loaded}
          onChange={setSeeking}
          onChangeEnd={(ms) => {
            audio.seek(ms)
            setSeeking(null)
          }}
          label={(ms) => formatTime(ms)}
          color="red"
          style={{ flex: 1 }}
        />
        <Text size="sm" className={classes.time}>
          {loaded ? `${formatTime(seeking ?? audio.positionMs)} / ${formatTime(duration)}` : ''}
        </Text>
        <Checkbox
          label="Auto-continue"
          checked={player.autoContinue.enabled}
          onChange={(e) =>
            void api.invoke('player:setAutoContinue', { enabled: e.currentTarget.checked })
          }
        />
        <Text size="sm">after</Text>
        <NumberInput
          aria-label="Auto-continue after (seconds)"
          size="xs"
          w={70}
          min={0}
          max={600}
          allowDecimal={false}
          clampBehavior="strict"
          value={seconds}
          onChange={setSeconds}
          onBlur={() => {
            const n = Number(seconds)
            if (seconds === '' || !Number.isInteger(n))
              return setSeconds(player.autoContinue.seconds)
            if (n !== player.autoContinue.seconds)
              void api.invoke('player:setAutoContinue', { seconds: n })
          }}
        />
        <Text size="sm">s</Text>
        <Group gap={6} wrap="nowrap" ml="md">
          <Switch
            label="Projector"
            checked={projector.enabled}
            onChange={(e) => void api.invoke('projector:setEnabled', e.currentTarget.checked)}
          />
          {projector.open && (
            <Text size="xs" c="dimmed" className={classes.label}>
              {projector.notice ?? `On ${projector.display}`}
            </Text>
          )}
        </Group>
      </Group>
      {player.warning && (
        <Alert
          color="orange"
          withCloseButton
          closeButtonLabel="Dismiss warning"
          onClose={() => void api.invoke('player:dismissWarning')}
          role="alert"
        >
          {player.warning}
        </Alert>
      )}
    </Paper>
  )
}
```

`src/renderer/src/components/ProjectorDisplay.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Select, Stack, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import type { DisplayChoice } from '@shared/projector'

const AUTO = 'auto'

// Spec §6.4: which display the projector uses. Automatic is the first external display; a chosen
// display that isn't connected now falls back to automatic until it's back.
export default function ProjectorDisplay(props: {
  api: RendererApi
  value: number | null
  onSaved: () => void
}): React.JSX.Element {
  const { api, value } = props
  const [displays, setDisplays] = useState<DisplayChoice[]>([])
  useEffect(() => {
    void api.invoke('projector:displays').then(setDisplays)
  }, [api])
  const data = [
    { value: AUTO, label: 'Automatic (the first external display)' },
    ...displays.map((d) => ({
      value: String(d.id),
      label: d.internal ? `${d.label} (this screen)` : d.label
    }))
  ]
  if (value !== null && !displays.some((d) => d.id === value)) {
    data.push({ value: String(value), label: "A display that isn't connected now" })
  }
  return (
    <Stack gap="xs">
      <Title order={4}>Projector</Title>
      <Select
        label="Projector display"
        data={data}
        value={value === null ? AUTO : String(value)}
        allowDeselect={false}
        w={360}
        onChange={(v) => {
          if (v)
            void api
              .invoke('projector:setDisplay', v === AUTO ? null : Number(v))
              .then(props.onSaved)
        }}
      />
    </Stack>
  )
}
```

Replace `src/renderer/src/pages/SettingsPage.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import {
  Alert,
  Code,
  Loader,
  NumberInput,
  Stack,
  Switch,
  TagsInput,
  Text,
  Title
} from '@mantine/core'
import type { AppInfo, RendererApi } from '@shared/contract'
import type { ImportMapping } from '@shared/import'
import type { SettingKey, Settings } from '@shared/settings'
import ProjectorDisplay from '../components/ProjectorDisplay'
import RemoteSection from '../components/RemoteSection'
import ImportMappingFields from '../import/ImportMappingFields'
import { errorMessage } from '../ipc-error'

type NumberKey = 'autoContinue.seconds' | 'countdown.seconds' | 'autoFullscreen.seconds'
type BooleanKey = 'autoContinue.enabled' | 'autoFullscreen.enabled'

export default function SettingsPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a rejected save so number inputs re-mount showing the saved value.
  const [revision, setRevision] = useState(0)

  const reload = (): void => void api.invoke('settings:getAll').then(setSettings)
  useEffect(() => {
    api.invoke('settings:getAll').then(setSettings)
    api.invoke('app:getInfo').then(setInfo)
  }, [api])

  async function save(key: SettingKey, value: unknown): Promise<void> {
    try {
      setSettings(await api.invoke('settings:set', key, value))
      setError(null)
    } catch (e) {
      setError(`Couldn't save setting: ${errorMessage(e)}`)
      setRevision((r) => r + 1)
    }
  }

  if (!settings) return <Loader m="md" />

  const mapping: ImportMapping = {
    artistTagTarget: settings['import.artistTagTarget'],
    albumArtistTagTarget: settings['import.albumArtistTagTarget'],
    genreIsCountry: settings['import.genreIsCountry']
  }
  // Saves whichever mapping setting changed.
  const saveMapping = (next: ImportMapping): void => {
    if (next.artistTagTarget !== mapping.artistTagTarget)
      void save('import.artistTagTarget', next.artistTagTarget)
    if (next.albumArtistTagTarget !== mapping.albumArtistTagTarget)
      void save('import.albumArtistTagTarget', next.albumArtistTagTarget)
    if (next.genreIsCountry !== mapping.genreIsCountry)
      void save('import.genreIsCountry', next.genreIsCountry)
  }

  const toggle = (key: BooleanKey, label: string): React.JSX.Element => (
    <Switch
      label={label}
      checked={settings[key]}
      onChange={(e) => save(key, e.currentTarget.checked)}
    />
  )

  const number = (key: NumberKey, label: string, min: number, max: number): React.JSX.Element => (
    <NumberInput
      key={`${key}-${revision}`}
      label={label}
      min={min}
      max={max}
      clampBehavior="none"
      allowDecimal={false}
      w={260}
      defaultValue={settings[key]}
      onBlur={(e) => {
        const raw = e.currentTarget.value
        const value = Number(raw)
        if (raw !== '' && value !== settings[key]) save(key, value)
      }}
    />
  )

  return (
    <Stack p="md" gap="lg" maw={640}>
      <Title order={2}>Settings</Title>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Stack gap="xs">
        <Title order={4}>Import</Title>
        <Text size="sm" c="dimmed">
          The defaults for the mapping step shown before every import.
        </Text>
        <ImportMappingFields value={mapping} onChange={saveMapping} />
      </Stack>
      <Stack gap="xs">
        <Title order={4}>Library</Title>
        <TagsInput
          label="Dance type suggestions"
          placeholder="Add a dance type"
          description="Offered when you edit a dance's type. Press Enter after each one."
          value={settings.danceTypeSuggestions}
          onChange={(types) => save('danceTypeSuggestions', types)}
        />
      </Stack>
      <Stack gap="xs">
        <Title order={4}>Playback</Title>
        {toggle('autoContinue.enabled', 'Auto-continue to the next song')}
        {number('autoContinue.seconds', 'Auto-continue after (seconds)', 0, 600)}
        {number('countdown.seconds', 'Countdown before first song (seconds)', 0, 60)}
      </Stack>
      <RemoteSection api={api} />
      <ProjectorDisplay api={api} value={settings['projector.displayId']} onSaved={reload} />
      <Stack gap="xs">
        <Title order={4}>Fullscreen on this screen</Title>
        {toggle('autoFullscreen.enabled', 'Show fullscreen view when idle')}
        {number('autoFullscreen.seconds', 'Idle time before fullscreen (seconds)', 5, 3600)}
      </Stack>
      {info && (
        <Stack gap={4}>
          <Title order={4}>About</Title>
          <Text size="sm">Version {info.version}</Text>
          <Text size="sm">Library database (schema {info.schemaVersion}):</Text>
          <Code>{info.dbPath}</Code>
        </Stack>
      )}
    </Stack>
  )
}
```

- [ ] **Step 4: Run the tests, typecheck, build and commit**

Run: `npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: the suite: 481; typecheck, formatting and build are clean.

```bash
git add src/renderer/src tests/renderer
git commit -m "feat(projector): Projector switch, progress reports and the display choice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Spec, release notes, decisions, the known issue, and a check on real hardware

**Files:**
- Create: `docs/spikes/projector-unplug.md`
- Modify: the spec, `CHANGELOG.md`, `AGENTS.md`

- [ ] **Step 1: Record the deferred unplug issue**

`docs/spikes/projector-unplug.md`:

````markdown
# Known issue: unplugging the projector mid-session (2026-10-14)

**Status:** deferred. Leaders usually plug the projector in before the dances and unplug it
afterwards, so this is unlikely at an event. Workaround: turn the **Projector** switch off before
unplugging, or quit the app if it happens.

## Symptom

Unplugging the projector while the projector view is showing sometimes (about 1 unplug in 4)
leaves a grey rectangle covering about 90% of the laptop screen. It can't be moved, nothing can
be brought in front of it, and it outlives plugging the projector back in (after which macOS
switches the laptop's resolution, so it covers the whole screen). The music keeps playing and the
control window still works underneath. Quitting the app clears it.

## Evidence

Gathered with temporary logging of display events and window state, plus a
`CGWindowListCopyWindowInfo` recorder (one sample a second) of the app's on-screen windows:

- On unplug, `display-removed` arrives first, and the app closes the projector window at once.
- macOS relocates the projector window from the removed display onto the laptop, to (64,0) or
  (0,0) at 1920×1080, around the same moment.
- On a failing unplug, Electron reports the window **closed** within ~60 ms, but macOS's window
  list still shows that window (screen-saver layer, 1000) on the laptop until the app quits. The
  native window is orphaned and still drawn, with no Electron object left to control it.
- On a passing unplug, the same window disappears from macOS's list after the close.
- The display event sequence is identical in passing and failing runs. Along the way the laptop's
  scaled resolution changes (1792×1120 ↔ 2048×1280), and the built-in display is removed and
  re-added with a new id.

## Tried

1. **`hide()` synchronously before `close()`:** still failed. The window closed within 3 ms,
   before macOS moved it, and the grey rectangle still appeared.
2. **One persistent projector window, hidden instead of closed, with its state re-asserted 1.5 s
   after the displays settle:** worse. After two cycles the projector view itself stayed over the
   laptop and couldn't be closed, even with the projector plugged back in.

## Leads for later

- A window at the screen-saver level that can join all spaces (`setVisibleOnAllWorkspaces`) may be
  what macOS mishandles while removing a display. Try a lower level once the projector display is
  separate (always-on-top was needed to cover the menu bar on the laptop display).
- Delay closing until the display configuration settles, and check macOS's window list (via a small
  native helper) afterwards; if an orphan remains, recreate and close a window at the same bounds.
- Reproduce in a minimal Electron app (one borderless screen-saver-level window on a second display,
  unplug) to report upstream.
````

- [ ] **Step 2: Update the spec, the release notes and the decision log**

Make these replacements in order. Each "before" text appears exactly once in its file.

**`docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`**

1. Replace:

````markdown

- **Player bar** (above the tabs on every page; drawn above the Program page here): transport controls, the current item's label (§4 "Labels"), a seek bar, speed and volume. The auto-continue checkbox and its seconds are editable right here. There is also the projector toggle (plan 5).
````

   with:

````markdown

- **Player bar** (above the tabs on every page; drawn above the Program page here): transport controls, the current item's label (§4 "Labels"), a seek bar, speed and volume. The auto-continue checkbox and its seconds are editable right here. There is also the **Projector** switch: it shows where the view is ("On Epson Projector"), or the notice when there's no separate display.
````

2. Replace:

````markdown

- **When:** only when projector mode is off. If `autoFullscreen.enabled` is on and there has been no input in the control window for `autoFullscreen.seconds`, the projector view opens over the laptop display.
````

   with:

````markdown

- **When:** only when projector mode is off, and only while music plays or a countdown runs. If `autoFullscreen.enabled` is on and there has been no input for `autoFullscreen.seconds` (keys in the control window, or mouse movement anywhere), the projector view opens over the laptop display.
````

3. Replace:

````markdown
- **Display changes:**
  - **`display-removed` for the projector:** the window closes and audio continues.
````

   with:

````markdown
- **Display changes:**
  - **`display-removed` for the projector:** the window closes and audio continues. It does not fall back to covering the laptop. **Known issue:** about one unplug in four leaves an orphaned grey window over the laptop until the app quits; turn the Projector switch off before unplugging (see `docs/spikes/projector-unplug.md`).
````

4. Replace:

````markdown
  - **`display-metrics-changed`:** bounds are reapplied.
````

   with:

````markdown
  - **`display-metrics-changed`:** bounds are reapplied.
- **At startup,** projector mode left on from last time reopens only when a separate display is connected; otherwise nothing covers the laptop until one is plugged in.
- **The control window is kept off the projector's display** after any display change, including sleep and wake, which renumber displays and can move windows.
- **macOS specifics:** `setVisibleOnAllWorkspaces` is called with `skipTransformProcessType`, or macOS briefly turns the whole app into a background app (no Dock icon, no ⌘-Tab, the control window hidden) and after sleep it can stay that way. On wake, the app re-checks the displays and shows the control window if it's hidden.
- **Keeping the Mac awake:** while the projector view shows, or music plays or counts down, the app blocks display sleep (`powerSaveBlocker`).
- **Closing the control window quits the app,** so the projector view is never left on its own.
````

5. Replace:

````markdown
- **Up next** is a vertical list showing as many entries as fit in its area.
````

   with:

````markdown
- **Up next** is a vertical list showing as many entries as fit in its area.
- **STOP markers** show in the list as a row reading `⌄ —— Teaching —— ⌄`, the arrows pointing down at the dance that will be taught. Several STOPs in a row show once, and a STOP with no song after it isn't shown. Halted at a STOP, the next dance in the middle row carries the same Teaching row.
- **The middle row's heading:** "Now playing" (with "Paused" when paused or stopped), or, when nothing is loaded, "Up next", "Starting in N…" or "Next in N…". The list below is then headed "After that".
- **Previews and replays** show as Now Playing and are listed in previously played, like any play.
- **Songs whose file is missing** are left out of the lists, since they will be skipped.
- **With no program loaded and nothing playing,** the view shows only the app's name.
````

6. Replace:

````markdown

- **Read-only.** The view renders state snapshots from main and sends nothing back except diagnostics.
````

   with:

````markdown

- **Read-only.** The view renders state snapshots from main (`projector:snapshot`, plus `projector:progress` about 4 times a second for the red line) and sends nothing back. Its own preload exposes only `getSnapshot`, `onSnapshot` and `onProgress`.
- **Without Canva slides (until plan 6),** the view always uses the no-slide layout.
````

**`CHANGELOG.md`**

1. Replace:

````markdown
- Double-click a song in the library, a playlist or holding to preview it; double-click an entry in Previously played to play it again. Previews and replays never continue on their own.
````

   with:

````markdown
- Double-click a song in the library, a playlist or holding to preview it; double-click an entry in Previously played to play it again. Previews and replays never continue on their own.
- The projector view: on a second display, a large-font view of what was played, what's playing (with a red progress line) and what's coming up, including a "Teaching" marker before a dance that will be taught. Turn it on with the Projector switch in the player bar, and choose its display in Settings.
- With no projector connected, the same view can cover the laptop screen: from the Projector switch, or automatically after an idle time while music plays. Move the mouse or press Esc to close it.
- The Mac doesn't go to sleep while the projector view shows or music plays.
````

**`AGENTS.md`**

1. Replace:

````markdown
- **2026-10-14 — ⏹ keeps the song loaded ("stopped", rewound to the start); ▶ plays it again as the same play.** Chosen by the user: stopping to re-teach a figure and pressing ▶ must neither skip the dance nor add a second Previously played entry. A preview or replay that interrupts a program song puts it back as next up instead (its `played_at` is cleared; its `play_log` row stays), since something else is now loaded. ⏭ means "skip", so the song stays played. _Rejected:_ ⏹ putting the song back into the program (each ⏹/▶ added a log entry); marking an item played only when it ends (the projector and the log need the start).
````

   with:

````markdown
- **2026-10-14 — ⏹ keeps the song loaded ("stopped", rewound to the start); ▶ plays it again as the same play.** Chosen by the user: stopping to re-teach a figure and pressing ▶ must neither skip the dance nor add a second Previously played entry. A preview or replay that interrupts a program song puts it back as next up instead (its `played_at` is cleared; its `play_log` row stays), since something else is now loaded. ⏭ means "skip", so the song stays played. _Rejected:_ ⏹ putting the song back into the program (each ⏹/▶ added a log entry); marking an item played only when it ends (the projector and the log need the start).
- **2026-10-14 — The projector window is managed by `ProjectorController` (display choice, projector vs laptop mode, display events) and fed by `createProjectorFeed`; `ActivityWatcher` handles laptop mode's mouse/Esc dismissal and the idle auto-fullscreen.** All three take injected Electron pieces, so they're unit-tested. Rules learned on real hardware: call `setVisibleOnAllWorkspaces` with `skipTransformProcessType` (otherwise macOS can leave the app as a background app after sleep: no Dock icon, no ⌘-Tab, control window hidden); after any display change keep the control window off the projector's display; on wake re-check displays and show the control window; at startup reopen projector mode only with a projector connected; block display sleep while the view shows or music plays. Known issue: unplugging mid-session can orphan the projector window (`docs/spikes/projector-unplug.md`). The projector page has its own read-only preload.
````

- [ ] **Step 3: Run everything and commit**

Run: `npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: 481 tests pass; typecheck, formatting and build are clean.

```bash
git add docs CHANGELOG.md AGENTS.md
git commit -m "docs: the projector in the spec, release notes and decision log; the unplug known issue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Check on real hardware (ask the user first; run it on a copy of the library)**

```bash
mkdir -p /tmp/fdp-check
cp "$HOME/Library/Application Support/Folk Dance Player/folk-dance-player.sqlite" /tmp/fdp-check/
npm run build && FDP_USER_DATA=/tmp/fdp-check npm start
```

1. **Without a projector:**
   - The Projector switch covers the laptop and shows its notice. Esc closes it, and so does moving the mouse after a second.
   - With music playing and no input for the idle time, the view appears by itself.
2. **With the projector** (in extended mode):
   - The switch puts the view on the projector, and the control window stays on the laptop. The mouse and Esc don't close it.
   - The red line moves, Teaching rows show before taught dances, and previews appear.
   - Settings → Projector display lists both displays.
3. **Sleep:** Apple menu → Sleep with the view up, then wake. The app is still in ⌘-Tab with its window on the laptop, and the view is back on the projector.
4. **The Mac stays awake:** `pmset -g assertions` shows Electron's `PreventUserIdleDisplaySleep` while the view shows.
5. **Unplugging:** turn the switch off before unplugging. (The deferred issue: unplugging with the view up can leave a grey window until the app quits.)

---

## Done when

- `npm test` passes: 481 tests (430 from Plans 1–4, plus 51 new).
- `npm run typecheck`, `npx prettier --check .` and `npm run build` are clean, and the build has both pages and both preloads.
- On real hardware, the view runs on a projector and on the laptop, laptop mode closes with Esc or the mouse, the idle view appears while music plays, sleep and wake keep the control window reachable, and the Mac stays awake during an event.

---

## Changes after execution

The final whole-branch review found nothing Critical. Five Important findings were fixed on the branch, each with a test that failed first; the suite grew from 481 to 487.

- **A control window dragged onto the projector was hidden under it.** `ProjectorController.keepControlReachable()` runs on the control window's `moved` event.
- **Projector mode could cover the operator's only display** (clamshell, mirroring). `displaysChanged()` closes it when no other display is left; the switch stays on.
- **Idle auto-fullscreen covered an operator scrolling or clicking.** `ActivityWatcher` also requires `powerMonitor.getSystemIdleTime()` to reach the idle time.
- **The playing song appeared twice on the projector.** `NowPlaying.logId` (from `logPlay`) keeps it out of previously played; the Task 2 and Task 5 tests now expect that.
- **The Teaching marker went stale.** `atStop` holds only while the halted program's next item is the one after the STOP.

**Deferred minors from the final review:**
- The switch looks on with no projector connected (show "Waiting for a projector", and the unplug workaround as a tooltip).
- Settings offers the built-in display as the projector display.
- `moveControlTo` does nothing on a fullscreen control window.
- A crashed projector renderer stays black (reload on `render-process-gone`).
- Turning the switch on while the idle laptop view is open leaves it in laptop mode.
- Esc right after opening laptop mode from the switch skips the grace period.
- Progress is sent with `invoke` 4 times a second and isn't validated in main.
- The projector window receives every broadcast.
- The projector bundle is 644 kB.
- Settings' display list isn't refreshed on hotplug.
- The `coalesced()` comment says "task" where it means microtask.

The real-hardware check (Task 8, Step 4) is still to do with the user.

