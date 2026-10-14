# Folk Dance Player — Plan 4: Programs and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers can build a program for a dance session and run it:
- **Programs:** create, load, rename, duplicate and delete them from the sidebar, which now has one component per section.
- **The player bar:** above the page tabs, on every page.
- **The Program page:** previously played above the program; holding above the library list.
- **Playback:** auto-continue, the countdown, STOP markers, previews and replays, speed changes that keep the pitch, and missing-file handling.

**Architecture:**
- **Main process:** owns programs and playback.
  - **Repositories:** `programs.ts`, `history.ts`, `file-check.ts` and `tracks.ts` are plain functions over `node:sqlite`.
  - **`PlayerSession`:** a state machine with no Electron imports. It decides what plays, reaches the database through `SessionPorts`, and gets its timers injected.
  - **IPC:** ~30 typed channels. Main broadcasts every player state change as `player:state`, and every program change as `programs:changed`.
  - **Audio:** served to the control window by `fdp-media://file/<id>`, with Range support so seeking works.
- **Renderer:** a second Zustand store (`createProgramStore`, provided by `ProgramProvider`) holds the program list, the loaded program, its play log and the player state.
  - The control window's `<audio>` (`useAudio`) follows `player:state` and reports only "ended" and "failed", tagged with the play's id.
  - The library list, its search and its selection stay in the Plan 3 library store, shared by the Program and Music pages.

**Tech Stack:** As Plans 1–3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §4 ("Playlists, programs and history"), §6.1 (sidebar), §6.2 (Program page), §7 (playback and program flow), §9 (architecture) and §10.1 (pre-check, restart). Task 11 updates the spec with this plan's decisions.

This is plan 4 of 7. Plans 1–3 are merged. **Not in this plan:**
- the projector window, its toggle in the player bar, and laptop-mode auto-fullscreen: Plan 5
- Canva slides: Plan 6
- the rotating database backup, logging, and packaging: Plan 7

**Decisions made with the user while planning** (recorded in the spec by Task 11):
- **▶ and ⏭ pass a STOP marker.** A button press means "go": the STOP is marked played and the song after it starts. Only auto-continue halts at a STOP.
- **◀◀ restarts the current song.** Going back to an earlier song is a replay (double-click in previously played).
- **A new program is named for today** ("Tue Oct 14"). `+` asks for the name, prefilled with that. Adding songs with no program loaded creates one with that name and loads it.
- **Duplicate makes a fresh copy to run again:** every item, all unplayed. There is no "reset played".
- **The player bar is above the page tabs, on every page,** so a preview started on the Music page can be controlled there. This also keeps the `<audio>` element mounted, so changing pages never cuts the music.

## Global Constraints

- **Everything in Plans 1–3 still applies:**
  - exact version pins, at least two weeks old
  - `node:sqlite` only, and schema changes only as new migrations (this plan needs none: migration 001 already has `programs`, `program_items`, `play_log` and `file_prefs.in_holding`)
  - renderers reach main only through `window.api`
  - Mantine components with CSS Modules only
  - Prettier settings
  - CHANGELOG and AGENTS.md kept current
  - conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **No renderer decides what plays.** Every transport action is a `player:*` command to main. The control window only plays what `player:state` says and reports `ended` and `failed` with the play's `playId`.
- **`PlayerSession` has no Electron imports.** Database access goes through `SessionPorts`, and timers through `Timers`.
- **Every program mutation goes through `programHandlers`' `edit()` wrapper,** so the player re-reads next up and `programs:changed` is broadcast.
- **The projector never shows an error** (spec §10.1). Warnings are only in the control window's player bar.
- **Never center a Mantine button with `transform`** (AGENTS.md). Use `top: 0; bottom: 0; margin-block: auto`.
- **Zustand selectors must return stable values.**
- **Manual runs use `FDP_USER_DATA`** (Task 5) so they never touch a real library.
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.**

## Review Focus

These are the five failure modes most likely to bite an organizer during an event. Each has a test in the task that owns it.

1. **Fast or repeated operator input around a song change:** ▶ pressed twice, ⏭ during a countdown, ⏹ then ▶, or changing pages mid-song. This must never cut the music, play two songs, skip one silently, or act on a late "ended" from the previous song. Task 8: "the player is above the tabs and keeps playing on every page". Task 4: "with a countdown set, ▶ counts down first…", "⏹ cancels the countdown…", "a late "ended" from an earlier song is ignored", and "⏭ starts the next item now…".
2. **The program edited while it runs:** reordering, inserting a STOP, or removing items during a song or a countdown. Next up must follow the edit, and a STOP that moves to the head during the countdown must still halt. Task 4: "a STOP moved to the head during the countdown still halts"; Task 5: every program edit refreshes the player.
3. **Missing files at the event:** loading a program flags them beforehand. At play time, a missing file is skipped without getting stuck, and stays in the program flagged. Task 2: "flags the program's missing files…"; Task 4: "a missing file is skipped, flagged and left in the program…"; Task 5: "loading a program … checks its files".
4. **Quitting or crashing mid-program:** after a restart the player is idle, never auto-resumes, and queues the first unplayed item. Task 4: "after a restart, the session is idle…".
5. **Deleting or changing what's loaded:** deleting the loaded program unloads it; editing a song's dance relabels the program and next up. Task 5: "deleting the current program unloads it"; Task 7: "refetches when programs or the library change…".

---

## File Structure

```
src/shared/program.ts                 ProgramSummary, Track, ProgramItem, ProgramDetail, PlayedEntry,
                                      PlayerState, NowPlaying, IDLE_PLAYER_STATE
src/shared/media.ts                   MEDIA_SCHEME, mediaUrl(), parseMediaUrl()
src/main/programs/tracks.ts           a song with the dance shown for it: TRACK_COLUMNS, trackJoins, getTrack
src/main/programs/programs.ts         program CRUD, items (tracks, STOPs), reorder, dance per item, markPlayed
src/main/programs/history.ts          logPlay(), listPlayed(), getLoggedPlay()
src/main/programs/file-check.ts       checkProgramFiles(): the pre-check (spec §10.1)
src/main/media/media-response.ts      parseRange(), mediaResponse(): files for <audio>, with Range
src/main/session/player-session.ts    PlayerSession: what plays (spec §7)
src/main/session/session-ports.ts     createSessionPorts(): the session's view of the database
src/main/ipc/program-handlers.ts      programs:* and player:* handlers
src/shared/contract.ts, src/main/ipc/handlers.ts, src/main/index.ts (modify)
src/renderer/src/components/Sidebar.tsx (modify) + components/sidebar/   one component per section
src/renderer/src/program/             program-name, program-store, ProgramProvider, useAudio,
                                      PlayerBar, ProgramList, PlayedList, HoldingPanel (+ css)
src/renderer/src/library/             LibrarySearch (new); drag, LibraryTable (modify)
src/renderer/src/pages/ProgramPage.tsx (+css), MusicPage.tsx (modify)
src/renderer/src/App.tsx (+css, modify)  providers; the player bar above the tabs
src/renderer/src/format-time.ts       formatTime()
tests/main/programs/, tests/main/session/, tests/main/media/, tests/main/ipc/program-handlers.test.ts
tests/main/helpers/test-player.ts     a real PlayerSession for handler tests
tests/renderer/program/               store, sidebar section, player bar, lists, holding, page (+ fixtures)
tests/renderer/app.test.tsx           the player survives page changes
```

---

### Task 1: The programs repository

**Files:**
- Create: `src/shared/program.ts`, `src/main/programs/tracks.ts`, `src/main/programs/programs.ts`
- Test: `tests/main/programs/programs.test.ts`

**Interfaces:**
- Consumes: `labelParts`/`formatLabel` (Plan 3), `shownPairingSql`/`choreographerCountSql` (Plan 3 `list.ts`), `inTransaction` (Plan 3).
- Produces:
  - **`@shared/program` (first part):** `ProgramSummary { id, name, updatedAt, unplayedCount }`, `Track { fileId, songId, danceId, title, label, parts, country, teacher, durationMs, isMissing, danceCount }`, `ProgramItem` (`{ id, kind: 'stop' }` or `{ id, kind: 'track' } & Track`), `ProgramDetail { id, name, items }`, `PlayKind`, `PlayedEntry { logId, kind, playedAt, track: Track | null }`. Task 4 adds the player types.
  - **`tracks.ts`:** `TRACK_COLUMNS` and `trackJoins(danceExpr)` (SQL that every track query shares), `TrackRow`, `toTrack(row)`, `getTrack(db, fileId, danceId | null): Track | null`, `trackPath(db, fileId)`.
    - A track is shown with `danceExpr`'s dance. When that is null, the song's shown dance is used (spec §4, default dance).
  - **`programs.ts`:** `ProgramError`, `listPrograms(db, search?)`, `createProgram`, `renameProgram`, `deleteProgram`, `duplicateProgram` (a fresh copy, all unplayed), `getProgram(db, id): ProgramDetail | null` (unplayed items only), `nextItem`, `addTracks(db, programId, fileIds, beforeItemId?) → itemIds`, `addStop(db, programId, beforeItemId?) → itemId`, `reorderItems(db, programId, itemIds)` (the complete new order of unplayed items), `removeItems`, `setItemDance(db, itemId, danceId)`, `markPlayed(db, itemId)`.
    - Every edit bumps `programs.updated_at`, which orders the sidebar.
    - Positions are rewritten with played items first, then the unplayed ones in their new order.

- [ ] **Step 1: Write the shared types and the track helpers**

`src/shared/program.ts`:

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
```

`src/main/programs/tracks.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { formatLabel, labelParts } from '@shared/labels'
import type { Track } from '@shared/program'
import { choreographerCountSql, shownPairingSql } from '../library/list'

// The columns of a Track, for a song `s` joined to its file `f`, the dance shown `d`, and that
// pairing's teacher `dsp`. Every query that returns tracks selects these.
export const TRACK_COLUMNS = `f.id AS fileId, s.id AS songId, d.id AS danceId, s.title,
  d.name AS danceName, d.choreographer, d.country, dsp.teacher, f.duration_ms AS durationMs,
  f.is_missing AS isMissing,
  (SELECT COUNT(*) FROM dance_songs c WHERE c.song_id = s.id) AS danceCount,
  ${choreographerCountSql('s.id')} AS choreographerCount`

// Joins the pairing for dance `danceExpr` (falling back to the song's shown dance when it is
// null) and that pairing's teacher, for a query that already has `songs s` and `files f`.
export const trackJoins = (danceExpr: string): string => `
  LEFT JOIN dance_songs p ON p.id = COALESCE(
    (SELECT x.id FROM dance_songs x WHERE x.song_id = s.id AND x.dance_id = ${danceExpr}),
    CASE WHEN ${danceExpr} IS NULL THEN ${shownPairingSql('s.id')} END)
  LEFT JOIN dances d ON d.id = COALESCE(p.dance_id, ${danceExpr})
  LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = p.id`

export interface TrackRow {
  fileId: number
  songId: number
  danceId: number | null
  title: string
  danceName: string | null
  choreographer: string | null
  country: string | null
  teacher: string | null
  durationMs: number | null
  isMissing: number
  danceCount: number
  choreographerCount: number
}

export function toTrack(row: TrackRow): Track {
  const parts = labelParts({
    songTitle: row.title,
    danceName: row.danceName,
    choreographer: row.choreographer,
    choreographerCount: row.choreographerCount
  })
  return {
    fileId: row.fileId,
    songId: row.songId,
    danceId: row.danceId,
    title: row.title,
    label: formatLabel(parts),
    parts,
    country: row.country,
    teacher: row.teacher,
    durationMs: row.durationMs,
    isMissing: row.isMissing === 1,
    danceCount: row.danceCount
  }
}

// One file's song with dance `danceId` (or its shown dance when null); null for an unknown file.
export function getTrack(db: DatabaseSync, fileId: number, danceId: number | null): Track | null {
  const row = db
    .prepare(
      `SELECT ${TRACK_COLUMNS} FROM files f JOIN songs s ON s.file_id = f.id
       ${trackJoins('?')} WHERE f.id = ?`
    )
    .get(danceId, danceId, danceId, fileId) as TrackRow | undefined
  return row ? toTrack(row) : null
}

export function trackPath(db: DatabaseSync, fileId: number): string | null {
  const row = db.prepare('SELECT path FROM files WHERE id = ?').get(fileId) as
    { path: string } | undefined
  return row?.path ?? null
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/programs/programs.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ProgramItem } from '@shared/program'
import { mergeDances } from '../../../src/main/library/edit'
import {
  addStop,
  addTracks,
  createProgram,
  deleteProgram,
  duplicateProgram,
  getProgram,
  listPrograms,
  markPlayed,
  nextItem,
  ProgramError,
  removeItems,
  renameProgram,
  reorderItems,
  setItemDance
} from '../../../src/main/programs/programs'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let hora: ReturnType<typeof addLibrarySong>
let kolo: ReturnType<typeof addLibrarySong>
let tune: ReturnType<typeof addLibrarySong>

const labels = (programId: number): string[] =>
  getProgram(db, programId)!.items.map((i) => (i.kind === 'stop' ? 'STOP' : i.label))
const ids = (programId: number): number[] => getProgram(db, programId)!.items.map((i) => i.id)
const setUpdated = (programId: number, at: string) =>
  db.prepare('UPDATE programs SET updated_at = ? WHERE id = ?').run(at, programId)

beforeEach(() => {
  db = createTestDb()
  hora = addLibrarySong(db, {
    title: 'Hora',
    durationMs: 185_000,
    dance: { name: 'Hora', country: 'Romania', teacher: 'Sonia Dion' }
  })
  kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Žikino Kolo', country: 'Serbia' } })
  tune = addLibrarySong(db, {
    title: 'Pusteno',
    dance: { name: 'Pravo', choreographer: 'Yves Moreau' }
  })
})

describe('programs', () => {
  test('lists programs newest edit first, filtered by name', () => {
    const a = createProgram(db, 'Tue Oct 14')
    const b = createProgram(db, '  Beginner night ')
    setUpdated(a, '2000-01-02T00:00:00.000Z')
    setUpdated(b, '2000-01-01T00:00:00.000Z')
    addTracks(db, b, [hora.fileId, kolo.fileId])
    addStop(db, b)
    expect(listPrograms(db).map((p) => [p.name, p.unplayedCount])).toEqual([
      ['Beginner night', 2],
      ['Tue Oct 14', 0]
    ])
    expect(listPrograms(db, 'OCT').map((p) => p.name)).toEqual(['Tue Oct 14'])
  })

  test('renames, rejecting a blank name, and deletes', () => {
    const p = createProgram(db, 'Draft')
    renameProgram(db, p, 'Festival')
    expect(listPrograms(db).map((x) => x.name)).toEqual(['Festival'])
    expect(() => renameProgram(db, p, '  ')).toThrow(ProgramError)
    expect(() => createProgram(db, '')).toThrow(ProgramError)
    deleteProgram(db, p)
    expect(listPrograms(db)).toEqual([])
    expect(getProgram(db, p)).toBeNull()
  })

  test('duplicating makes a fresh copy with every item unplayed', () => {
    const p = createProgram(db, 'Set A')
    const [first] = addTracks(db, p, [hora.fileId, kolo.fileId])
    addStop(db, p)
    markPlayed(db, first)
    const copy = duplicateProgram(db, p)
    expect(listPrograms(db).find((x) => x.id === copy)?.name).toBe('Set A copy')
    expect(labels(copy)).toEqual(['Hora', 'Kolo | Žikino Kolo', 'STOP'])
    expect(labels(p)).toEqual(['Kolo | Žikino Kolo', 'STOP'])
  })
})

describe('program items', () => {
  test('adds songs with their default dance, label, country and teacher', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    const [item] = getProgram(db, p)!.items as Extract<ProgramItem, { kind: 'track' }>[]
    expect(item).toMatchObject({
      kind: 'track',
      fileId: hora.fileId,
      danceId: hora.danceId,
      label: 'Hora',
      parts: { song: null, dance: 'Hora', choreographer: null },
      country: 'Romania',
      teacher: 'Sonia Dion',
      durationMs: 185_000,
      isMissing: false,
      danceCount: 1
    })
  })

  test('adds before an item or at the end, and inserts STOP markers', () => {
    const p = createProgram(db, 'Set')
    const [h] = addTracks(db, p, [hora.fileId])
    addTracks(db, p, [kolo.fileId])
    addTracks(db, p, [tune.fileId], h)
    addStop(db, p, h)
    expect(labels(p)).toEqual(['Pusteno | Pravo', 'STOP', 'Hora', 'Kolo | Žikino Kolo'])
  })

  test('the same song can be added twice; unknown files are skipped', () => {
    const p = createProgram(db, 'Set')
    expect(addTracks(db, p, [hora.fileId, 9999, hora.fileId])).toHaveLength(2)
    expect(labels(p)).toEqual(['Hora', 'Hora'])
  })

  test('reorders with the complete new order, and refuses a stale one', () => {
    const p = createProgram(db, 'Set')
    const [h, k, t] = addTracks(db, p, [hora.fileId, kolo.fileId, tune.fileId])
    reorderItems(db, p, [t, h, k])
    expect(ids(p)).toEqual([t, h, k])
    expect(() => reorderItems(db, p, [t, h])).toThrow(ProgramError)
    expect(() => reorderItems(db, p, [t, h, h])).toThrow(ProgramError)
  })

  test('played items leave the view, keep their place, and reordering ignores them', () => {
    const p = createProgram(db, 'Set')
    const [h, k, t] = addTracks(db, p, [hora.fileId, kolo.fileId, tune.fileId])
    markPlayed(db, h)
    expect(ids(p)).toEqual([k, t])
    reorderItems(db, p, [t, k])
    expect(ids(p)).toEqual([t, k])
    expect(nextItem(db, p)?.id).toBe(t)
  })

  test('next up is the first unplayed item, which may be a STOP marker', () => {
    const p = createProgram(db, 'Set')
    expect(nextItem(db, p)).toBeNull()
    const s = addStop(db, p)
    addTracks(db, p, [hora.fileId])
    expect(nextItem(db, p)).toEqual({ id: s, kind: 'stop' })
    markPlayed(db, s)
    expect(nextItem(db, p)).toMatchObject({ kind: 'track', label: 'Hora' })
  })

  test('removes items', () => {
    const p = createProgram(db, 'Set')
    const [h, k] = addTracks(db, p, [hora.fileId, kolo.fileId])
    removeItems(db, p, [h])
    expect(ids(p)).toEqual([k])
  })

  test('switches an item to another dance linked to its song', () => {
    const other = addDance(db, { name: 'Hora Mare', choreographer: 'Theodor Vasilescu' })
    link(db, other, hora.songId)
    const p = createProgram(db, 'Set')
    const [h] = addTracks(db, p, [hora.fileId])
    setItemDance(db, h, other)
    expect(labels(p)).toEqual(['Hora | Hora Mare'])
    const unlinked = addDance(db, { name: 'Sârba' })
    expect(() => setItemDance(db, h, unlinked)).toThrow("isn't linked")
  })

  test('an item follows a merge of its dance', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [kolo.fileId])
    const keep = addDance(db, { name: 'Žikino Kolo', choreographer: 'Trad' })
    mergeDances(db, keep, kolo.danceId!)
    expect(getProgram(db, p)!.items[0]).toMatchObject({ danceId: keep })
  })

  test('every edit moves the program to the top of the list', () => {
    const a = createProgram(db, 'A')
    const b = createProgram(db, 'B')
    setUpdated(a, '2000-01-01T00:00:00.000Z')
    setUpdated(b, '2000-01-02T00:00:00.000Z')
    addTracks(db, a, [hora.fileId])
    expect(listPrograms(db)[0].name).toBe('A')
    setUpdated(a, '2000-01-01T00:00:00.000Z')
    markPlayed(db, ids(a)[0])
    expect(listPrograms(db)[0].name).toBe('A')
  })

  test('edits to a deleted program are refused', () => {
    const p = createProgram(db, 'Gone')
    deleteProgram(db, p)
    expect(() => addTracks(db, p, [hora.fileId])).toThrow(ProgramError)
    expect(() => addStop(db, p)).toThrow(ProgramError)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/programs/programs.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/programs/programs'`.

- [ ] **Step 4: Implement**

`src/main/programs/programs.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { ProgramDetail, ProgramItem, ProgramSummary } from '@shared/program'
import { inTransaction } from '../db/transaction'
import { shownPairingSql } from '../library/list'
import { TRACK_COLUMNS, toTrack, trackJoins, type TrackRow } from './tracks'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

// A rule a program edit broke; the message is shown to the operator.
export class ProgramError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgramError'
  }
}

function cleanName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new ProgramError("A program name can't be empty.")
  return trimmed
}

// Every change to a program or its items bumps updated_at, which orders the sidebar (spec §4).
const touch = (db: DatabaseSync, programId: number): void => {
  db.prepare(`UPDATE programs SET updated_at = ${NOW} WHERE id = ?`).run(programId)
}

function requireProgram(db: DatabaseSync, programId: number): void {
  if (!db.prepare('SELECT 1 FROM programs WHERE id = ?').get(programId)) {
    throw new ProgramError('That program no longer exists.')
  }
}

// Spec §6.1: newest edit first, filtered by name as you type.
export function listPrograms(db: DatabaseSync, search = ''): ProgramSummary[] {
  const text = search.trim().toLowerCase()
  return db
    .prepare(
      `SELECT p.id, p.name, p.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM program_items i
          WHERE i.program_id = p.id AND i.kind = 'track' AND i.played_at IS NULL) AS unplayedCount
       FROM programs p
       WHERE ? = '' OR instr(lower(p.name), ?) > 0
       ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all(text, text) as unknown as ProgramSummary[]
}

export function createProgram(db: DatabaseSync, name: string): number {
  return Number(
    db.prepare('INSERT INTO programs (name) VALUES (?)').run(cleanName(name)).lastInsertRowid
  )
}

export function renameProgram(db: DatabaseSync, programId: number, name: string): void {
  requireProgram(db, programId)
  db.prepare(`UPDATE programs SET name = ?, updated_at = ${NOW} WHERE id = ?`).run(
    cleanName(name),
    programId
  )
}

export function deleteProgram(db: DatabaseSync, programId: number): void {
  db.prepare('DELETE FROM programs WHERE id = ?').run(programId)
}

// A fresh copy to run again: every item, all unplayed. The original keeps its record.
export function duplicateProgram(db: DatabaseSync, programId: number): number {
  return inTransaction(db, () => {
    const source = db.prepare('SELECT name FROM programs WHERE id = ?').get(programId) as
      { name: string } | undefined
    if (!source) throw new ProgramError('That program no longer exists.')
    const copy = createProgram(db, `${source.name} copy`)
    db.prepare(
      `INSERT INTO program_items (program_id, position, kind, file_id, dance_id)
       SELECT ?, position, kind, file_id, dance_id FROM program_items
       WHERE program_id = ? ORDER BY position`
    ).run(copy, programId)
    return copy
  })
}

type ItemRow = { id: number; kind: 'track' | 'stop' } & Partial<TrackRow>

const ITEMS_SQL = `SELECT pi.id, pi.kind, ${TRACK_COLUMNS}
  FROM program_items pi
  LEFT JOIN files f ON f.id = pi.file_id
  LEFT JOIN songs s ON s.file_id = f.id
  ${trackJoins('pi.dance_id')}`

function toItem(row: ItemRow): ProgramItem {
  if (row.kind === 'stop') return { id: row.id, kind: 'stop' }
  return { id: row.id, kind: 'track', ...toTrack(row as TrackRow) }
}

// The program and its unplayed items in order; null for an unknown program. A track whose
// file was removed from the library is left out.
export function getProgram(db: DatabaseSync, programId: number): ProgramDetail | null {
  const program = db.prepare('SELECT id, name FROM programs WHERE id = ?').get(programId) as
    { id: number; name: string } | undefined
  if (!program) return null
  const rows = db
    .prepare(
      `${ITEMS_SQL}
       WHERE pi.program_id = ? AND pi.played_at IS NULL AND (pi.kind = 'stop' OR s.id IS NOT NULL)
       ORDER BY pi.position, pi.id`
    )
    .all(programId) as unknown as ItemRow[]
  return { ...program, items: rows.map(toItem) }
}

// Next up (spec §7.2): the first unplayed item by position.
export function nextItem(db: DatabaseSync, programId: number): ProgramItem | null {
  const row = db
    .prepare(
      `${ITEMS_SQL}
       WHERE pi.program_id = ? AND pi.played_at IS NULL AND (pi.kind = 'stop' OR s.id IS NOT NULL)
       ORDER BY pi.position, pi.id LIMIT 1`
    )
    .get(programId) as ItemRow | undefined
  return row ? toItem(row) : null
}

const unplayedIds = (db: DatabaseSync, programId: number): number[] =>
  db
    .prepare(
      'SELECT id FROM program_items WHERE program_id = ? AND played_at IS NULL ORDER BY position, id'
    )
    .all(programId)
    .map((r) => r.id as number)

// Rewrites positions: played items first (in their old order), then `unplayed` in the order given.
function renumber(db: DatabaseSync, programId: number, unplayed: number[]): void {
  const played = db
    .prepare(
      'SELECT id FROM program_items WHERE program_id = ? AND played_at IS NOT NULL ORDER BY position, id'
    )
    .all(programId)
    .map((r) => r.id as number)
  const set = db.prepare('UPDATE program_items SET position = ? WHERE id = ?')
  ;[...played, ...unplayed].forEach((id, i) => set.run(i + 1, id))
}

// Places new item ids before `beforeItemId` (an unplayed item), or at the end when null.
function place(db: DatabaseSync, programId: number, ids: number[], beforeItemId: number | null) {
  const order = unplayedIds(db, programId).filter((id) => !ids.includes(id))
  const at = beforeItemId === null ? -1 : order.indexOf(beforeItemId)
  order.splice(at < 0 ? order.length : at, 0, ...ids)
  renumber(db, programId, order)
}

// Adds songs as tracks, each with its song's default dance (spec §6.2). Returns the new item ids.
export function addTracks(
  db: DatabaseSync,
  programId: number,
  fileIds: number[],
  beforeItemId: number | null = null
): number[] {
  return inTransaction(db, () => {
    requireProgram(db, programId)
    const insert = db.prepare(
      `INSERT INTO program_items (program_id, position, kind, file_id, dance_id)
       SELECT ?, 0, 'track', f.id,
         (SELECT p.dance_id FROM dance_songs p WHERE p.id = ${shownPairingSql('s.id')})
       FROM files f JOIN songs s ON s.file_id = f.id WHERE f.id = ?`
    )
    const ids = fileIds
      .map((fileId) => insert.run(programId, fileId))
      .filter((r) => r.changes > 0)
      .map((r) => Number(r.lastInsertRowid))
    place(db, programId, ids, beforeItemId)
    touch(db, programId)
    return ids
  })
}

// A STOP / TEACHING marker (spec §7.2), before `beforeItemId` or at the end.
export function addStop(
  db: DatabaseSync,
  programId: number,
  beforeItemId: number | null = null
): number {
  return inTransaction(db, () => {
    requireProgram(db, programId)
    const id = Number(
      db
        .prepare("INSERT INTO program_items (program_id, position, kind) VALUES (?, 0, 'stop')")
        .run(programId).lastInsertRowid
    )
    place(db, programId, [id], beforeItemId)
    touch(db, programId)
    return id
  })
}

// `itemIds` is the complete new order of the program's unplayed items.
export function reorderItems(db: DatabaseSync, programId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const current = unplayedIds(db, programId)
    const same =
      current.length === itemIds.length &&
      new Set(itemIds).size === itemIds.length &&
      current.every((id) => itemIds.includes(id))
    if (!same) throw new ProgramError('The program changed; please try again.')
    renumber(db, programId, itemIds)
    touch(db, programId)
  })
}

export function removeItems(db: DatabaseSync, programId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM program_items WHERE program_id = ? AND id = ?')
    for (const id of itemIds) remove.run(programId, id)
    touch(db, programId)
  })
}

// Switches the dance shown for one item (spec §6.2 "Choosing the dance"). The dance must be
// linked to the item's song.
export function setItemDance(db: DatabaseSync, itemId: number, danceId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare(
        `SELECT pi.program_id AS programId,
           EXISTS (SELECT 1 FROM songs s JOIN dance_songs x ON x.song_id = s.id
                   WHERE s.file_id = pi.file_id AND x.dance_id = ?) AS linked
         FROM program_items pi WHERE pi.id = ? AND pi.kind = 'track'`
      )
      .get(danceId, itemId) as { programId: number; linked: number } | undefined
    if (!item) throw new ProgramError('That program item no longer exists.')
    if (!item.linked) throw new ProgramError("That dance isn't linked to this song.")
    db.prepare('UPDATE program_items SET dance_id = ? WHERE id = ?').run(danceId, itemId)
    touch(db, item.programId)
  })
}

// Marks an item played (spec §7.2); it leaves the program view but stays stored.
export function markPlayed(db: DatabaseSync, itemId: number): void {
  inTransaction(db, () => {
    const item = db
      .prepare('SELECT program_id AS programId FROM program_items WHERE id = ?')
      .get(itemId) as { programId: number } | undefined
    if (!item) return
    db.prepare(`UPDATE program_items SET played_at = ${NOW} WHERE id = ?`).run(itemId)
    touch(db, item.programId)
  })
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/programs && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/programs`: 14 pass; the suite: 321; typecheck and formatting are clean.

```bash
git add src/shared/program.ts src/main/programs tests/main/programs
git commit -m "feat(programs): programs repository — items, STOP markers, order, dance per item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Play log, holding and the missing-file pre-check

**Files:**
- Create: `src/main/programs/history.ts`, `src/main/programs/file-check.ts`
- Modify: `src/shared/library.ts`, `src/main/library/list.ts`, `src/main/library/playlists.ts`, `tests/main/library/playlists.test.ts`
- Test: `tests/main/programs/history.test.ts`, `tests/main/programs/file-check.test.ts`

**Interfaces:**
- Consumes: `TRACK_COLUMNS`, `trackJoins`, `toTrack` (Task 1).
- Produces:
  - **`history.ts`:** `logPlay(db, { fileId, danceId, programId, kind }) → logId`, `listPlayed(db, programId): PlayedEntry[]` (newest first, each as the dance it was played as), `getLoggedPlay(db, logId) → { fileId, danceId } | null`.
  - **`file-check.ts`:** `checkProgramFiles(db, programId, exists = existsSync) → missingFileIds`. It checks the program's unplayed tracks, flags missing files (`is_missing = 1`, `missing_reason = 'not_found'`) and unflags files that came back.
  - **Holding:** `LibraryFilter` gains `{ kind: 'holding' }`, which `listLibrary` filters with `fp.in_holding = 1`; and `setHolding(db, fileIds, held)` in `playlists.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/main/programs/history.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { getLoggedPlay, listPlayed, logPlay } from '../../../src/main/programs/history'
import { createProgram } from '../../../src/main/programs/programs'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDb()
})

describe('play log', () => {
  test('lists a program’s plays newest first, each as the dance it was played as', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const other = addDance(db, { name: 'Hora Mare' })
    link(db, other, hora.songId)
    const p = createProgram(db, 'Set')
    const elsewhere = createProgram(db, 'Other')
    logPlay(db, { fileId: hora.fileId, danceId: hora.danceId, programId: p, kind: 'program' })
    logPlay(db, { fileId: hora.fileId, danceId: other, programId: p, kind: 'preview' })
    logPlay(db, { fileId: hora.fileId, danceId: null, programId: elsewhere, kind: 'program' })
    expect(listPlayed(db, p).map((e) => [e.kind, e.track?.label])).toEqual([
      ['preview', 'Hora | Hora Mare'],
      ['program', 'Hora']
    ])
  })

  test('a play whose file was removed is listed without a track', () => {
    const gone = addLibrarySong(db, { title: 'Gone', dance: { name: 'Gone' } })
    const p = createProgram(db, 'Set')
    logPlay(db, { fileId: gone.fileId, danceId: gone.danceId, programId: p, kind: 'program' })
    db.prepare('DELETE FROM files WHERE id = ?').run(gone.fileId)
    expect(listPlayed(db, p)).toMatchObject([{ kind: 'program', track: null }])
  })

  test('a replay reads the file and dance that were logged', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const id = logPlay(db, {
      fileId: hora.fileId,
      danceId: hora.danceId,
      programId: null,
      kind: 'preview'
    })
    expect(getLoggedPlay(db, id)).toEqual({ fileId: hora.fileId, danceId: hora.danceId })
    expect(getLoggedPlay(db, 999)).toBeNull()
  })
})
```

`tests/main/programs/file-check.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { checkProgramFiles } from '../../../src/main/programs/file-check'
import { addTracks, createProgram, markPlayed } from '../../../src/main/programs/programs'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

describe('program pre-check', () => {
  test('flags the program’s missing files and unflags ones that came back', () => {
    const db = createTestDb()
    const here = addLibrarySong(db, { title: 'Here', path: '/m/here.mp3' })
    const gone = addLibrarySong(db, { title: 'Gone', path: '/m/gone.mp3' })
    const played = addLibrarySong(db, { title: 'Played', path: '/m/played.mp3' })
    db.prepare("UPDATE files SET is_missing = 1, missing_reason = 'not_found' WHERE id = ?").run(
      here.fileId
    )
    const p = createProgram(db, 'Set')
    const [, , last] = addTracks(db, p, [here.fileId, gone.fileId, played.fileId])
    markPlayed(db, last)
    const exists = (path: string) => path === '/m/here.mp3'
    expect(checkProgramFiles(db, p, exists)).toEqual([gone.fileId])
    const flags = db.prepare('SELECT path, is_missing AS m FROM files ORDER BY id').all()
    expect(flags.map((f) => [f.path, f.m])).toEqual([
      ['/m/here.mp3', 0],
      ['/m/gone.mp3', 1],
      ['/m/played.mp3', 0] // already played: not checked
    ])
  })
})
```

In `tests/main/library/playlists.test.ts`, change the playlists import:

```ts
  reorderPlaylist,
  setFavorite
} from '../../../src/main/library/playlists'
```

to:

```ts
  reorderPlaylist,
  setFavorite,
  setHolding
} from '../../../src/main/library/playlists'
import { listLibrary } from '../../../src/main/library/list'
```

and append at the end of the file:

```ts
describe('holding', () => {
  test('holds and releases songs; the holding filter lists them', () => {
    setHolding(db, [a, c], true)
    setHolding(db, [a], false)
    const held = listLibrary(db, {
      search: '',
      filter: { kind: 'holding' },
      sort: { column: 'title', direction: 'asc' }
    })
    expect(held.map((r) => r.title)).toEqual(['C'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/programs/history.test.ts tests/main/programs/file-check.test.ts tests/main/library/playlists.test.ts`
Expected: FAIL. History and file-check can't find their modules, and the holding test fails because `setHolding` doesn't exist.

- [ ] **Step 3: Implement**

`src/main/programs/history.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { PlayedEntry, PlayKind } from '@shared/program'
import { TRACK_COLUMNS, toTrack, trackJoins, type TrackRow } from './tracks'

export interface PlayLogEntry {
  fileId: number
  danceId: number | null
  programId: number | null
  kind: PlayKind
}

// Every play is logged (spec §7.1): program items, previews and replays. Returns the log id.
export function logPlay(db: DatabaseSync, entry: PlayLogEntry): number {
  return Number(
    db
      .prepare('INSERT INTO play_log (file_id, dance_id, program_id, kind) VALUES (?, ?, ?, ?)')
      .run(entry.fileId, entry.danceId, entry.programId, entry.kind).lastInsertRowid
  )
}

type PlayedRow = { logId: number; kind: PlayKind; playedAt: string } & Partial<TrackRow>

// "Previously played" for a program (spec §6.2): its play log, newest first, each with the
// dance it was played as.
export function listPlayed(db: DatabaseSync, programId: number): PlayedEntry[] {
  const rows = db
    .prepare(
      `SELECT l.id AS logId, l.kind, l.played_at AS playedAt, ${TRACK_COLUMNS}
       FROM play_log l
       LEFT JOIN files f ON f.id = l.file_id
       LEFT JOIN songs s ON s.file_id = f.id
       ${trackJoins('l.dance_id')}
       WHERE l.program_id = ?
       ORDER BY l.played_at DESC, l.id DESC`
    )
    .all(programId) as unknown as PlayedRow[]
  return rows.map(({ logId, kind, playedAt, ...track }) => ({
    logId,
    kind,
    playedAt,
    track: track.songId ? toTrack(track as TrackRow) : null
  }))
}

// What a logged play was, for a replay (spec §7.1: it uses the dance it was logged with).
export function getLoggedPlay(
  db: DatabaseSync,
  logId: number
): { fileId: number; danceId: number | null } | null {
  const row = db
    .prepare('SELECT file_id AS fileId, dance_id AS danceId FROM play_log WHERE id = ?')
    .get(logId) as { fileId: number | null; danceId: number | null } | undefined
  return row?.fileId ? { fileId: row.fileId, danceId: row.danceId } : null
}
```

`src/main/programs/file-check.ts`:

```ts
import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../db/transaction'

// Spec §10.1 "Program pre-check": when a program is loaded (and at startup), every file it still
// has to play is checked, so missing files are flagged before the event. A file that has come
// back is unflagged. Returns the ids of the missing files.
export function checkProgramFiles(
  db: DatabaseSync,
  programId: number,
  exists: (path: string) => boolean = existsSync
): number[] {
  const files = db
    .prepare(
      `SELECT DISTINCT f.id, f.path, f.is_missing AS isMissing FROM program_items pi
       JOIN files f ON f.id = pi.file_id
       WHERE pi.program_id = ? AND pi.played_at IS NULL`
    )
    .all(programId) as { id: number; path: string; isMissing: number }[]
  const missing: number[] = []
  inTransaction(db, () => {
    const flag = db.prepare(
      "UPDATE files SET is_missing = 1, missing_reason = 'not_found' WHERE id = ?"
    )
    const unflag = db.prepare('UPDATE files SET is_missing = 0, missing_reason = NULL WHERE id = ?')
    for (const file of files) {
      if (exists(file.path)) {
        if (file.isMissing) unflag.run(file.id)
      } else {
        missing.push(file.id)
        if (!file.isMissing) flag.run(file.id)
      }
    }
  })
  return missing
}
```

In `src/shared/library.ts`, replace:

```ts
export type LibraryFilter =
  { kind: 'all' } | { kind: 'favorites' } | { kind: 'playlist'; playlistId: number }
```

with:

```ts
export type LibraryFilter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'holding' } // the Program page's holding panel (spec §6.2)
  | { kind: 'playlist'; playlistId: number }
```

In `src/main/library/list.ts`, after the line `  if (query.filter.kind === 'favorites') where.push('fp.is_favorite = 1')`, add:

```ts
  if (query.filter.kind === 'holding') where.push('fp.in_holding = 1')
```

Append to `src/main/library/playlists.ts`:

```ts
// Holding (spec §3): a per-file flag; held songs appear in the Program page's holding panel.
export function setHolding(db: DatabaseSync, fileIds: number[], held: boolean): void {
  inTransaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO file_prefs (file_id, in_holding) VALUES (?, ?)
       ON CONFLICT (file_id) DO UPDATE SET in_holding = excluded.in_holding`
    )
    for (const fileId of fileIds) upsert.run(fileId, held ? 1 : 0)
  })
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/programs tests/main/library && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/programs` 18 pass and `tests/main/library/playlists.test.ts` 9 pass; the suite: 326; typecheck and formatting are clean.

```bash
git add src/shared/library.ts src/main/library src/main/programs tests/main/programs tests/main/library
git commit -m "feat(programs): play log, holding, and the missing-file pre-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Serving audio with Range support

**Files:**
- Create: `src/shared/media.ts`, `src/main/media/media-response.ts`
- Test: `tests/main/media/media-response.test.ts`

**Interfaces:**
- Produces:
  - **`@shared/media`:** `MEDIA_SCHEME = 'fdp-media'`, `mediaUrl(fileId) → 'fdp-media://file/<id>'`, `parseMediaUrl(url) → fileId | null`. Anything other than a plain numeric id is refused.
  - **`media-response.ts`:**
    - `parseRange(header, size) → { start, end } | null`: handles `a-b`, `a-` and `-n`, clamped to the file.
    - `mediaResponse(path | null, rangeHeader | null): Promise<Response>`: 200 with the whole file, 206 with `Content-Range` for a range, 416 for an impossible range, and 404 for no path, a missing file or a directory. Task 5 registers it as the `fdp-media` protocol handler.

**Why:** in development the renderer runs on a dev-server origin, where `file://` media is blocked. Serving by file id means the renderer never names a path. Seeking needs 206 responses, so Range requests are answered here.

- [ ] **Step 1: Write the failing tests**

`tests/main/media/media-response.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { mediaUrl, parseMediaUrl } from '@shared/media'
import { mediaResponse, parseRange } from '../../../src/main/media/media-response'

const dir = mkdtempSync(join(tmpdir(), 'fdp-media-'))
const song = join(dir, 'song.mp3')
writeFileSync(song, Buffer.from('0123456789'))

describe('media URLs', () => {
  test('round-trip a file id, and reject anything else', () => {
    expect(mediaUrl(42)).toBe('fdp-media://file/42')
    expect(parseMediaUrl(mediaUrl(42))).toBe(42)
    expect(parseMediaUrl('fdp-media://file/42/')).toBe(42)
    expect(parseMediaUrl('fdp-media://file/../etc/passwd')).toBeNull()
    expect(parseMediaUrl('file:///etc/passwd')).toBeNull()
  })
})

describe('parseRange', () => {
  test('reads start-end, open-ended and suffix ranges, clamped to the file', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=5-99', 10)).toEqual({ start: 5, end: 9 })
  })

  test('rejects ranges the file can’t satisfy', () => {
    expect(parseRange('bytes=10-', 10)).toBeNull()
    expect(parseRange('bytes=6-2', 10)).toBeNull()
    expect(parseRange('bytes=-0', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })
})

describe('mediaResponse', () => {
  test('serves the whole file with its type', async () => {
    const res = await mediaResponse(song, null)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  test('serves a byte range for seeking', async () => {
    const res = await mediaResponse(song, 'bytes=3-6')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 3-6/10')
    expect(res.headers.get('content-length')).toBe('4')
    expect(await res.text()).toBe('3456')
  })

  test('answers 416 for an impossible range and 404 for a missing file', async () => {
    expect((await mediaResponse(song, 'bytes=20-')).status).toBe(416)
    expect((await mediaResponse(join(dir, 'gone.mp3'), null)).status).toBe(404)
    expect((await mediaResponse(null, null)).status).toBe(404)
    expect((await mediaResponse(dir, null)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/media`
Expected: FAIL — `Failed to resolve import "@shared/media"`.

- [ ] **Step 3: Implement**

`src/shared/media.ts`:

```ts
// Audio reaches the control window's <audio> element through this scheme, by file id, so the
// renderer never names a path (spec §9).
export const MEDIA_SCHEME = 'fdp-media'

export const mediaUrl = (fileId: number): string => `${MEDIA_SCHEME}://file/${fileId}`

export function parseMediaUrl(url: string): number | null {
  const match = /^fdp-media:\/\/file\/(\d+)\/?$/.exec(url)
  return match ? Number(match[1]) : null
}
```

`src/main/media/media-response.ts`:

```ts
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg'
}

// One byte range from a Range header ("bytes=a-b", "bytes=a-" or "bytes=-n"), clamped to the
// file; null when the header asks for something the file doesn't have.
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (suffix === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start < size && start <= end ? { start, end } : null
}

// Serves an audio file to <audio>, honoring Range requests so seeking works (spec §9).
export async function mediaResponse(path: string | null, range: string | null): Promise<Response> {
  if (!path) return new Response('Not found', { status: 404 })
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return new Response('Not found', { status: 404 })
    size = info.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const body = (start: number, end: number) =>
    Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
  if (!range) {
    return new Response(size === 0 ? null : body(0, size - 1), {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
    })
  }
  const r = parseRange(range, size)
  if (!r) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  return new Response(body(r.start, r.end), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(r.end - r.start + 1),
      'Content-Range': `bytes ${r.start}-${r.end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  })
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/media && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/media`: 6 pass; the suite: 332; typecheck and formatting are clean.

```bash
git add src/shared/media.ts src/main/media tests/main/media
git commit -m "feat(playback): serve audio by file id with Range support

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PlayerSession

**Files:**
- Modify: `src/shared/program.ts` (replace: adds the player types)
- Create: `src/main/session/player-session.ts`, `src/main/session/session-ports.ts`
- Test: `tests/main/session/player-session.test.ts`

**Interfaces:**
- Consumes: `getProgram`, `markPlayed` (Task 1), `getTrack`, `trackPath` (Task 1), `logPlay`, `getLoggedPlay` (Task 2), `SettingsStore` (Plan 1).
- Produces:
  - **`@shared/program` (second part):** `NowPlaying { playId, source: PlayKind, itemId, track }`; `PlayerState { status: 'idle' | 'countdown' | 'playing' | 'paused', current, countdown: { secondsLeft, reason: 'start' | 'continue' } | null, programId, nextUp, speed, speedLocked, volume, autoContinue: { enabled, seconds }, warning }`; `IDLE_PLAYER_STATE`.
  - **`PlayerSession(ports, timers, emit)`:** `getState()`, `refresh()`, `play()`, `pause()`, `stop()`, `next()`, `preview(fileId)`, `replay(logId)`, `ended(playId)`, `failed(playId, message)`, `setSpeed(speed)` (0.5–1.5), `setSpeedLocked(locked)`, `setVolume(volume)` (0–1), `dismissWarning()`. It calls `emit(state)` after every change.
  - **`SessionPorts`** and **`Timers`** interfaces.
  - **`createSessionPorts(db, settings, exists?, notices?)`:** the database-backed ports. `notices.programsChanged()` fires after an item is marked played or a play is logged; `notices.libraryChanged()` fires when a file is flagged or unflagged.

**Rules** (spec §7; the user's decisions are marked ★):
- **▶:**
  - When paused, it resumes.
  - During a countdown, it skips the rest of it.
  - When idle, it starts the program's next song. When `countdown.seconds > 0`, a `'start'` countdown runs first.
  - ★ An operator's ▶ passes STOP markers, marking them played.
- **⏭:** stops the song and starts the next one at once, also passing STOP markers ★.
- **⏹:** stops the song or cancels the countdown. Nothing is marked played.
- **When a program song ends:**
  - **Auto-continue on:** a `'continue'` countdown of `autoContinue.seconds`, then the next song (at once when the setting is 0). A STOP at the head (also one moved there during the countdown) is marked played and playback halts.
  - **Auto-continue off:** playback halts with next up queued.
- **Previews and replays:** logged with the current `programId`. They always halt afterwards.
- **Starting a program song:** marks its item played, logs it, and resets the speed to 1× unless the speed is locked. Every start gets a new `playId`; `ended` and `failed` for an older `playId` are ignored.
- **Missing file:** the song is skipped and left unplayed and flagged, and a warning names it. `failed` warns, then continues as if the song had ended.

- [ ] **Step 1: Add the player types**

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
}

export interface PlayerState {
  status: 'idle' | 'countdown' | 'playing' | 'paused'
  current: NowPlaying | null // set while playing or paused
  // "Starting in N…" before the first song, or "Next: … in N…" between songs (spec §7.2).
  countdown: { secondsLeft: number; reason: 'start' | 'continue' } | null
  programId: number | null
  nextUp: ProgramItem | null // the program's first unplayed item
  speed: number // 0.5–1.5, pitch preserved
  speedLocked: boolean // keep the speed for the next song
  volume: number // 0–1
  autoContinue: { enabled: boolean; seconds: number }
  warning: string | null // shown in the control window only, never on the projector
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
  warning: null
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/session/player-session.test.ts`:

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
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'B' } })
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
    expect(state()).toMatchObject({ status: 'idle', nextUp: { title: 'B' } })
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

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/session`
Expected: FAIL — `Cannot find module '../../../src/main/session/player-session'`.

- [ ] **Step 4: Implement**

`src/main/session/player-session.ts`:

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

  // Re-reads the program and settings (after an edit, or a different program was loaded).
  refresh(): void {
    this.update({})
  }

  // ▶ (spec §7.2): resumes, or skips a running countdown, or starts the program's next song —
  // after the countdown when one is set. An operator's ▶ passes STOP markers.
  play(): void {
    const { status } = this.state
    if (status === 'paused') return this.update({ status: 'playing' })
    if (status === 'playing') return
    if (status === 'countdown') return this.finishCountdown()
    const seconds = this.ports.countdownSeconds()
    if (seconds > 0 && this.hasPlayable(true)) return this.startCountdown(seconds, 'start')
    this.advance(true)
  }

  pause(): void {
    if (this.state.status === 'playing') this.update({ status: 'paused' })
  }

  // ⏹: stops the song or cancels the countdown. Nothing is marked played.
  stop(): void {
    this.cancelCountdown()
    this.update({ status: 'idle', current: null, countdown: null })
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
    if (!track) return
    this.cancelCountdown()
    this.start('preview', null, track)
  }

  // Double-click in "Previously played": plays that entry again, as the dance it was logged with.
  replay(logId: number): void {
    const logged = this.ports.getLoggedPlay(logId)
    const track = logged && this.ports.getTrack(logged.fileId, logged.danceId)
    if (!track) return
    this.cancelCountdown()
    this.start('replay', null, track)
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
  // head is marked played and playback halts there.
  private advanceToStop(): void {
    const programId = this.ports.programId()
    if (programId === null) return this.sync()
    const head = this.ports.unplayedItems(programId)[0]
    if (head?.kind === 'stop' && this.ports.autoContinue().enabled) {
      this.ports.markPlayed(head.id)
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
    // Between songs, the program may have changed during the countdown: a STOP now at the head
    // still halts.
    if (reason === 'continue' && !this.hasPlayable(false)) return this.advanceToStop()
    this.advance(reason === 'start')
  }

  private cancelCountdown(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
  }

  // Whether the program has a song to play next: passing STOP markers, or stopping at one.
  private hasPlayable(passStops: boolean): boolean {
    return this.pick(passStops, false) !== null
  }

  // Finds the next song to play. STOP markers are passed (and, when `consume`, marked played)
  // or end the search; songs whose file is missing are skipped and left in the program, flagged.
  private pick(
    passStops: boolean,
    consume: boolean
  ): { item: Extract<ProgramItem, { kind: 'track' }>; skipped: string[] } | null {
    const programId = this.ports.programId()
    if (programId === null) return null
    const skipped: string[] = []
    for (const item of this.ports.unplayedItems(programId)) {
      if (item.kind === 'stop') {
        if (!passStops) return null
        if (consume) this.ports.markPlayed(item.id)
        continue
      }
      if (this.ports.checkFile(item.fileId)) return { item, skipped }
      skipped.push(item.label)
    }
    return null
  }

  // Starts the program's next song now.
  private advance(passStops: boolean): void {
    const picked = this.pick(passStops, true)
    if (!picked) return this.sync()
    if (picked.skipped.length) {
      this.update({ warning: `Skipped missing file: ${picked.skipped.join(', ')}` })
    }
    const { item } = picked
    this.ports.markPlayed(item.id)
    this.start('program', item.id, item)
  }

  private start(source: PlayKind, itemId: number | null, track: Track): void {
    if (source !== 'program' && !this.ports.checkFile(track.fileId)) {
      this.update({ warning: `Couldn't play “${track.label}”: the file is missing` })
      return
    }
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
      speed: this.state.speedLocked ? this.state.speed : 1,
      current: {
        playId: this.nextPlayId++,
        source,
        itemId,
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

`src/main/session/session-ports.ts`:

```ts
import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { SettingsStore } from '../settings/settings-store'
import { getLoggedPlay, logPlay } from '../programs/history'
import { getProgram, markPlayed } from '../programs/programs'
import { getTrack, trackPath } from '../programs/tracks'
import type { SessionPorts } from './player-session'

export interface SessionNotices {
  programsChanged(): void // an item was marked played, or a play was logged
  libraryChanged(): void // a file was flagged missing, or found again
}

const quiet: SessionNotices = { programsChanged: () => undefined, libraryChanged: () => undefined }

// The session's view of the database and settings.
export function createSessionPorts(
  db: DatabaseSync,
  settings: SettingsStore,
  exists: (path: string) => boolean = existsSync,
  notices: SessionNotices = quiet
): SessionPorts {
  return {
    programId: () => settings.get('currentProgramId'),
    unplayedItems: (programId) => getProgram(db, programId)?.items ?? [],
    markPlayed: (itemId) => {
      markPlayed(db, itemId)
      notices.programsChanged()
    },
    getTrack: (fileId, danceId) => getTrack(db, fileId, danceId),
    getLoggedPlay: (logId) => getLoggedPlay(db, logId),
    logPlay: (entry) => {
      logPlay(db, entry)
      notices.programsChanged()
    },
    checkFile: (fileId) => {
      const path = trackPath(db, fileId)
      const ok = path !== null && exists(path)
      const flagged = db
        .prepare(
          'UPDATE files SET is_missing = ?, missing_reason = ? WHERE id = ? AND is_missing <> ?'
        )
        .run(ok ? 0 : 1, ok ? null : 'not_found', fileId, ok ? 0 : 1)
      if (flagged.changes) notices.libraryChanged()
      return ok
    },
    autoContinue: () => ({
      enabled: settings.get('autoContinue.enabled'),
      seconds: settings.get('autoContinue.seconds')
    }),
    countdownSeconds: () => settings.get('countdown.seconds')
  }
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/session && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/session`: 22 pass; the suite: 354; typecheck and formatting are clean.

```bash
git add src/shared/program.ts src/main/session tests/main/session
git commit -m "feat(playback): PlayerSession — auto-continue, countdown, STOP, preview, replay, speed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: IPC channels and main-process wiring

**Files:**
- Create: `src/main/ipc/program-handlers.ts`, `tests/main/helpers/test-player.ts`
- Modify: `src/shared/contract.ts` (replace), `src/main/ipc/handlers.ts` (replace), `src/main/index.ts` (replace), `src/main/ipc/library-handlers.ts`, `src/renderer/index.html`, `tests/main/ipc/handlers.test.ts`, `tests/main/ipc/library-handlers.test.ts`
- Test: `tests/main/ipc/program-handlers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces:
  - **Invoke channels:**
    - `library:setHolding`
    - programs: `list`, `get`, `create`, `rename`, `duplicate`, `delete`, `setCurrent`, `addTracks`, `addStop`, `reorder`, `removeItems`, `setItemDance`, `played`
    - player: `getState`, `play`, `pause`, `stop`, `next`, `preview`, `replay`, `ended`, `failed`, `setSpeed`, `setSpeedLocked`, `setVolume`, `setAutoContinue`, `dismissWarning`
    - Argument and result types are in the contract.
  - **Events:** `'programs:changed': null` and `'player:state': PlayerState`.
  - **`HandlerDeps`** gains `player: PlayerSession`, `fileExists?: (path) => boolean` (for the pre-check; defaults to the real file system) and `onProgramsChanged: () => void`.
  - **`programs:setCurrent(id)`:** sets `currentProgramId`, runs the pre-check, and announces a library change (missing flags may change). `programs:delete` of the loaded program unloads it.
  - **`player:setAutoContinue({ enabled?, seconds? })`:** writes the settings and refreshes the player.
  - **In `main/index.ts`:**
    - `FDP_USER_DATA` overrides the `userData` folder.
    - The `fdp-media` scheme is registered (privileged, streaming) and handled with `mediaResponse`.
    - At startup, a dangling `currentProgramId` is cleared, and the loaded program is pre-checked.
    - The session broadcasts `player:state`. `programs:changed` and `library:changed` are coalesced, so one action sends one broadcast. Library changes also refresh the player (labels may change).
  - **`index.html`:** the CSP allows `media-src 'self' fdp-media:`.
  - **`testPlayer(db, settings)`:** a real session for handler tests, where every file exists.

- [ ] **Step 1: Write the failing tests**

`tests/main/helpers/test-player.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import type { SettingsStore } from '../../../src/main/settings/settings-store'

// A real PlayerSession over a test database, for handler tests. Every file "exists".
export function testPlayer(db: DatabaseSync, settings: SettingsStore): PlayerSession {
  return new PlayerSession(
    createSessionPorts(db, settings, () => true),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    () => undefined
  )
}
```

`tests/main/ipc/program-handlers.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

function setup() {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  settings.set('countdown.seconds', 0)
  settings.set('autoContinue.seconds', 0)
  const missing = new Set<string>()
  const counts = { library: 0, programs: 0 }
  const player = new PlayerSession(
    createSessionPorts(db, settings, (path) => !missing.has(path)),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    () => undefined
  )
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 2 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    player,
    fileExists: (path) => !missing.has(path),
    onLibraryChanged: () => void counts.library++,
    onProgramsChanged: () => void counts.programs++
  }
  const songs = {
    hora: addLibrarySong(db, { title: 'Hora', path: '/m/hora.mp3', dance: { name: 'Hora' } }),
    kolo: addLibrarySong(db, { title: 'Kolo', path: '/m/kolo.mp3', dance: { name: 'Kolo' } })
  }
  return { db, settings, missing, counts, songs, h: createHandlers(deps) as InvokeHandlers }
}

describe('program handlers', () => {
  test('create, fill, reorder and load a program; every edit is announced', async () => {
    const { h, counts, songs } = setup()
    const p = await h['programs:create']('Tue Oct 14')
    const [a, b] = await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    const stop = await h['programs:addStop'](p, b)
    await h['programs:reorder'](p, [b, stop, a])
    expect((await h['programs:get'](p))?.items.map((i) => i.id)).toEqual([b, stop, a])
    expect((await h['programs:list'](''))[0]).toMatchObject({
      name: 'Tue Oct 14',
      unplayedCount: 2
    })
    expect(counts.programs).toBe(4)
  })

  test('loading a program makes it current for the player and checks its files', async () => {
    const { h, db, missing, counts, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    missing.add('/m/kolo.mp3')
    await h['programs:setCurrent'](p)
    expect((await h['player:getState']()).nextUp).toMatchObject({ title: 'Hora' })
    expect(counts.library).toBe(1)
    const flagged = db.prepare('SELECT path FROM files WHERE is_missing = 1').all()
    expect(flagged.map((f) => f.path)).toEqual(['/m/kolo.mp3'])
  })

  test('deleting the current program unloads it', async () => {
    const { h, settings } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:setCurrent'](p)
    await h['programs:delete'](p)
    expect(settings.get('currentProgramId')).toBeNull()
    expect((await h['player:getState']()).programId).toBeNull()
  })

  test('the player plays the program, and "Previously played" lists it', async () => {
    const { h, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    await h['programs:setCurrent'](p)
    await h['player:play']()
    const state = await h['player:getState']()
    expect(state).toMatchObject({ status: 'playing', current: { track: { title: 'Hora' } } })
    await h['player:ended'](state.current!.playId)
    expect((await h['player:getState']()).current?.track.title).toBe('Kolo')
    expect((await h['programs:played'](p)).map((e) => e.track?.title)).toEqual(['Kolo', 'Hora'])
  })

  test('auto-continue is changed from the player bar', async () => {
    const { h, settings } = setup()
    await h['player:setAutoContinue']({ enabled: false })
    await h['player:setAutoContinue']({ seconds: 8 })
    expect(settings.get('autoContinue.enabled')).toBe(false)
    expect((await h['player:getState']()).autoContinue).toEqual({ enabled: false, seconds: 8 })
  })

  test('holding is set per file and announced as a library change', async () => {
    const { h, counts, songs } = setup()
    await h['library:setHolding']([songs.kolo.fileId], true)
    const held = await h['library:list']({
      search: '',
      filter: { kind: 'holding' },
      sort: { column: 'title', direction: 'asc' }
    })
    expect(held.map((r) => r.title)).toEqual(['Kolo'])
    expect(counts.library).toBe(1)
  })
})
```

In `tests/main/ipc/handlers.test.ts`:
1. After `import { createTestDb } from '../helpers/test-db'`, add `import { testPlayer } from '../helpers/test-player'`.
2. In `makeDeps`, change:

```ts
  const db = createTestDb()
  return {
    db,
    settings: new SettingsStore(db),
```

   to:

```ts
  const db = createTestDb()
  const settings = new SettingsStore(db)
  return {
    db,
    settings,
```

3. Change:

```ts
    onLibraryChanged: () => undefined,
    ...overrides
```

   to:

```ts
    player: testPlayer(db, settings),
    onLibraryChanged: () => undefined,
    onProgramsChanged: () => undefined,
    ...overrides
```

In `tests/main/ipc/library-handlers.test.ts`:
1. After `import { createTestDb } from '../helpers/test-db'`, add `import { testPlayer } from '../helpers/test-player'`.
2. In `setup`, change:

```ts
  const db = createTestDb()
  let changes = 0
  const deps: HandlerDeps = {
    db,
    settings: new SettingsStore(db),
```

   to:

```ts
  const db = createTestDb()
  const settings = new SettingsStore(db)
  let changes = 0
  const deps: HandlerDeps = {
    db,
    settings,
```

3. Change:

```ts
    onLibraryChanged: () => void changes++
  }
```

   to:

```ts
    player: testPlayer(db, settings),
    onLibraryChanged: () => void changes++,
    onProgramsChanged: () => undefined
  }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/ipc`
Expected: FAIL. The 6 program-handler tests fail, because the handlers don't exist (`h['programs:create'] is not a function`). The other files may also fail to typecheck until Step 3; Vitest still runs them.

- [ ] **Step 3: Extend the contract, add the handlers, and wire the main process**

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
import type { PlayedEntry, PlayerState, ProgramDetail, ProgramSummary } from './program'
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
  'library:setHolding': { args: [fileIds: number[], held: boolean]; result: void }
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
  'player:dismissWarning'
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
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed',
  'programs:changed',
  'player:state'
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

`src/main/ipc/program-handlers.ts`:

```ts
import type { InvokeHandlers } from '@shared/contract'
import { checkProgramFiles } from '../programs/file-check'
import { listPlayed } from '../programs/history'
import {
  addStop,
  addTracks,
  createProgram,
  deleteProgram,
  duplicateProgram,
  getProgram,
  listPrograms,
  removeItems,
  renameProgram,
  reorderItems,
  setItemDance
} from '../programs/programs'
import type { HandlerDeps } from './handlers'

type ProgramChannel = Extract<keyof InvokeHandlers, `programs:${string}` | `player:${string}`>

// Handlers for programs and the player (spec §6.2, §7). A program edit runs, the player
// re-reads next up, then the change is announced.
export function programHandlers(deps: HandlerDeps): Pick<InvokeHandlers, ProgramChannel> {
  const { db, settings, player } = deps
  const edit =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      player.refresh()
      deps.onProgramsChanged()
      return result
    }

  return {
    'programs:list': (search) => listPrograms(db, search),
    'programs:get': (programId) => getProgram(db, programId),
    'programs:played': (programId) => listPlayed(db, programId),
    'programs:create': edit((name) => createProgram(db, name)),
    'programs:rename': edit((programId, name) => renameProgram(db, programId, name)),
    'programs:duplicate': edit((programId) => duplicateProgram(db, programId)),
    'programs:delete': edit((programId) => {
      deleteProgram(db, programId)
      if (settings.get('currentProgramId') === programId) settings.set('currentProgramId', null)
    }),
    'programs:setCurrent': edit((programId) => {
      settings.set('currentProgramId', programId)
      if (programId === null) return
      checkProgramFiles(db, programId, deps.fileExists)
      deps.onLibraryChanged() // missing-file flags may have changed
    }),
    'programs:addTracks': edit((programId, fileIds, before) =>
      addTracks(db, programId, fileIds, before)
    ),
    'programs:addStop': edit((programId, before) => addStop(db, programId, before)),
    'programs:reorder': edit((programId, itemIds) => reorderItems(db, programId, itemIds)),
    'programs:removeItems': edit((programId, itemIds) => removeItems(db, programId, itemIds)),
    'programs:setItemDance': edit((itemId, danceId) => setItemDance(db, itemId, danceId)),
    'player:getState': () => player.getState(),
    'player:play': () => player.play(),
    'player:pause': () => player.pause(),
    'player:stop': () => player.stop(),
    'player:next': () => player.next(),
    'player:preview': (fileId) => player.preview(fileId),
    'player:replay': (logId) => player.replay(logId),
    'player:ended': (playId) => player.ended(playId),
    'player:failed': (playId, message) => player.failed(playId, message),
    'player:setSpeed': (speed) => player.setSpeed(speed),
    'player:setSpeedLocked': (locked) => player.setSpeedLocked(locked),
    'player:setVolume': (volume) => player.setVolume(volume),
    'player:setAutoContinue': (change) => {
      if (change.enabled !== undefined) settings.set('autoContinue.enabled', change.enabled)
      if (change.seconds !== undefined) settings.set('autoContinue.seconds', change.seconds)
      player.refresh()
    },
    'player:dismissWarning': () => player.dismissWarning()
  }
}
```

Replace `src/main/ipc/handlers.ts` with:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, InvokeHandlers } from '@shared/contract'
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
    ...programHandlers(deps)
  }
}
```

In `src/main/ipc/library-handlers.ts`:
1. In the playlists import, change `  setFavorite\n} from '../library/playlists'` to `  setFavorite,\n  setHolding\n} from '../library/playlists'`.
2. After the `'library:setFavorite'` handler line, add:

```ts
    'library:setHolding': edit((fileIds, held) => setHolding(db, fileIds, held)),
```

Replace `src/main/index.ts` with:

```ts
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
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

// Audio is served to the control window by file id (spec §9). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }
])

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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  const programsChanged = coalesced(() => broadcast('programs:changed', null))
  const libraryChanged = coalesced(() => broadcast('library:changed', null))
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
    (state) => broadcast('player:state', state)
  )
  protocol.handle(MEDIA_SCHEME, (request) => {
    const fileId = parseMediaUrl(request.url)
    return mediaResponse(
      fileId === null ? null : trackPath(db, fileId),
      request.headers.get('range')
    )
  })

  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs,
      player,
      onLibraryChanged: () => {
        player.refresh() // labels or missing flags of the next item may have changed
        libraryChanged()
      },
      onProgramsChanged: programsChanged
    })
  )

  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
  app.on('will-quit', () => db.close())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

In `src/renderer/index.html`, change the end of the Content-Security-Policy from `img-src 'self' data:"` to `img-src 'self' data:; media-src 'self' fdp-media:"`.

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/ipc && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/ipc`: 20 pass; the suite: 360; typecheck and formatting are clean.

```bash
git add src/shared/contract.ts src/main src/renderer/index.html tests/main
git commit -m "feat(ipc): program and player channels; media protocol; session wiring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: One sidebar component per section

**Files:**
- Create: `src/renderer/src/components/sidebar/DropTarget.tsx`, `SectionHeading.tsx`, `FilterEntry.tsx`, `LibrarySection.tsx`, `PlaylistsSection.tsx`, `ProgramsSection.tsx` (a placeholder until Task 7)
- Modify: `src/renderer/src/components/Sidebar.tsx` (replace), `src/renderer/src/components/Sidebar.module.css` (replace)

**Interfaces:**
- Produces:
  - **`Sidebar`:** only composes `LibrarySection`, `PlaylistsSection` and `ProgramsSection`.
  - **`DropTarget({ onFiles, children })`:** a song drop target.
  - **`FilterEntry({ label, filter, extra? })`:** a `NavLink` bound to the library filter, plus `sameFilter(a, b)`.
  - **`SectionHeading`.**
  - **CSS:** `.playlist` becomes `.entry`, because program entries use it too.

This is a refactor: behavior doesn't change, and the existing sidebar tests are its tests (the user asked for it before programs grow the file).

- [ ] **Step 1: Confirm the sidebar tests pass before the refactor**

Run: `npx vitest run tests/renderer/library/sidebar.test.tsx`
Expected: 6 pass.

- [ ] **Step 2: Split the sidebar**

`src/renderer/src/components/sidebar/DropTarget.tsx`:

```tsx
import { useState } from 'react'
import { carriesFiles, getDraggedFiles } from '../../library/drag'
import classes from '../Sidebar.module.css'

// A sidebar entry that songs can be dropped onto.
export default function DropTarget(props: {
  onFiles: (fileIds: number[]) => void
  children: React.ReactNode
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  return (
    <div
      className={over ? classes.dropActive : undefined}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const fileIds = getDraggedFiles(e.dataTransfer)
        if (fileIds.length === 0) return
        e.preventDefault()
        props.onFiles(fileIds)
      }}
    >
      {props.children}
    </div>
  )
}
```

`src/renderer/src/components/sidebar/SectionHeading.tsx`:

```tsx
import { Text } from '@mantine/core'

export default function SectionHeading({ children }: { children: string }): React.JSX.Element {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
      {children}
    </Text>
  )
}
```

`src/renderer/src/components/sidebar/FilterEntry.tsx`:

```tsx
import { NavLink } from '@mantine/core'
import type { LibraryFilter } from '@shared/library'
import { useLibrary } from '../../library/LibraryProvider'

export const sameFilter = (a: LibraryFilter, b: LibraryFilter): boolean =>
  a.kind === b.kind && (a.kind !== 'playlist' || a.playlistId === (b as typeof a).playlistId)

// A sidebar entry that filters the library list, marked when it's the current filter.
export default function FilterEntry(props: {
  label: string
  filter: LibraryFilter
  extra?: React.ReactNode
}): React.JSX.Element {
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const active = sameFilter(filter, props.filter)
  return (
    <NavLink
      label={props.label}
      rightSection={props.extra}
      active={active}
      aria-current={active ? 'page' : undefined}
      onClick={() => void setFilter(props.filter)}
    />
  )
}
```

`src/renderer/src/components/sidebar/LibrarySection.tsx`:

```tsx
import { useLibraryApi } from '../../library/LibraryProvider'
import DropTarget from './DropTarget'
import FilterEntry from './FilterEntry'
import SectionHeading from './SectionHeading'

// Spec §6.1 LIBRARY: All Music and Favorites (songs dropped on Favorites become favorites).
export default function LibrarySection(): React.JSX.Element {
  const api = useLibraryApi()
  return (
    <>
      <SectionHeading>Library</SectionHeading>
      <FilterEntry label="♪ All Music" filter={{ kind: 'all' }} />
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        <FilterEntry label="★ Favorites" filter={{ kind: 'favorites' }} />
      </DropTarget>
    </>
  )
}
```

`src/renderer/src/components/sidebar/PlaylistsSection.tsx`:

```tsx
import { useRef, useState } from 'react'
import { ActionIcon, Group, Menu, Text } from '@mantine/core'
import type { PlaylistSummary } from '@shared/library'
import { useLibrary, useLibraryApi } from '../../library/LibraryProvider'
import ConfirmDialog from '../ConfirmDialog'
import NamePrompt from '../NamePrompt'
import classes from '../Sidebar.module.css'
import DropTarget from './DropTarget'
import FilterEntry, { sameFilter } from './FilterEntry'
import SectionHeading from './SectionHeading'

// A playlist in the sidebar: a drop target, with an options menu ("⋯", or right-click).
function PlaylistEntry(props: {
  playlist: PlaylistSummary
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const options = useRef<HTMLButtonElement>(null)
  const p = props.playlist
  return (
    <div
      className={classes.entry}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <DropTarget onFiles={(ids) => void api.invoke('playlists:add', p.id, ids)}>
        <FilterEntry
          label={p.name}
          filter={{ kind: 'playlist', playlistId: p.id }}
          extra={
            p.source === 'apple_xml' ? (
              <Text
                span
                size="xs"
                c="dimmed"
                aria-label="From Apple Music"
                title="Imported from Apple Music"
              ></Text>
            ) : undefined
          }
        />
      </DropTarget>
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${p.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
          <Menu.Item onClick={() => void api.invoke('playlists:duplicate', p.id)}>
            Duplicate
          </Menu.Item>
          <Menu.Item color="red" onClick={props.onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

// Spec §6.1 PLAYLISTS: its own scroll container, at most 40% of the sidebar.
export default function PlaylistsSection(): React.JSX.Element {
  const api = useLibraryApi()
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const playlists = useLibrary((s) => s.playlists)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; playlist: PlaylistSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null)

  return (
    <>
      <Group justify="space-between" mt="md">
        <SectionHeading>Playlists</SectionHeading>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New playlist"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      <div className={classes.playlists} role="group" aria-label="Playlists">
        {playlists.length === 0 && (
          <Text size="sm" c="dimmed">
            No playlists yet
          </Text>
        )}
        {playlists.map((p) => (
          <PlaylistEntry
            key={p.id}
            playlist={p}
            onRename={() => setPrompt({ mode: 'rename', playlist: p })}
            onDelete={() => setDeleting(p)}
          />
        ))}
      </div>
      <NamePrompt
        opened={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename playlist' : 'New playlist'}
        initialValue={prompt?.mode === 'rename' ? prompt.playlist.name : ''}
        submitLabel={prompt?.mode === 'rename' ? 'Save' : 'Create'}
        onSubmit={(name) =>
          prompt?.mode === 'rename'
            ? api.invoke('playlists:rename', prompt.playlist.id, name)
            : api.invoke('playlists:create', name)
        }
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        opened={deleting !== null}
        title="Delete playlist?"
        message={`"${deleting?.name}" will be deleted. The songs stay in your library.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (!deleting) return
          void api.invoke('playlists:delete', deleting.id)
          if (sameFilter(filter, { kind: 'playlist', playlistId: deleting.id }))
            void setFilter({ kind: 'all' })
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
```

`src/renderer/src/components/sidebar/ProgramsSection.tsx` (a placeholder; Task 7 replaces it):

```tsx
import { ScrollArea, Text, TextInput } from '@mantine/core'
import classes from '../Sidebar.module.css'
import SectionHeading from './SectionHeading'

// Spec §6.1 PROGRAMS. Filled in by the next task.
export default function ProgramsSection(): React.JSX.Element {
  return (
    <>
      <SectionHeading>Programs</SectionHeading>
      <TextInput size="xs" placeholder="Search programs…" aria-label="Search programs" my="xs" />
      <ScrollArea className={classes.programs}>
        <Text size="sm" c="dimmed">
          No programs yet
        </Text>
      </ScrollArea>
    </>
  )
}
```

Replace `src/renderer/src/components/Sidebar.tsx` with:

```tsx
import LibrarySection from './sidebar/LibrarySection'
import PlaylistsSection from './sidebar/PlaylistsSection'
import ProgramsSection from './sidebar/ProgramsSection'
import classes from './Sidebar.module.css'

// Spec §6.1: one component per section.
export default function Sidebar(): React.JSX.Element {
  return (
    <nav className={classes.root} aria-label="Library">
      <LibrarySection />
      <PlaylistsSection />
      <ProgramsSection />
    </nav>
  )
}
```

Replace `src/renderer/src/components/Sidebar.module.css` with:

```css
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.programs {
  flex: 1;
  min-height: 0;
}

.dropActive {
  outline: 2px dashed var(--mantine-primary-color-filled);
  outline-offset: -2px;
  border-radius: var(--mantine-radius-sm);
}

.entry {
  position: relative;
}

.entry > div:first-child {
  padding-right: 28px;
}

.playlists {
  max-height: 40%;
  overflow-y: auto;
  flex-shrink: 0;
}

/* Centered with auto margins, not a transform: Mantine's pressed state sets its own transform,
   which would replace a centering one and make the button jump down. */
.options {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 4px;
  margin-block: auto;
  opacity: 0;
}

.entry:hover .options,
.options[aria-expanded='true'],
.options:focus-visible {
  opacity: 1;
}
```

- [ ] **Step 3: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected: the sidebar tests still pass (6); the suite: 360; typecheck and formatting are clean.

```bash
git add src/renderer/src/components
git commit -m "refactor(sidebar): one component per section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The program store and the Programs section

**Files:**
- Create: `src/renderer/src/program/program-name.ts`, `program-store.ts`, `ProgramProvider.tsx`
- Modify: `src/renderer/src/components/sidebar/ProgramsSection.tsx` (replace), `src/renderer/src/App.tsx` (replace), `tests/renderer/fake-api.ts` (replace), `tests/renderer/library/render-library.tsx` (replace)
- Test: `tests/renderer/program/program-store.test.ts`, `tests/renderer/program/programs-section.test.tsx`

**Interfaces:**
- Consumes: the `programs:*` and `player:*` channels and events (Task 5); `IDLE_PLAYER_STATE` (Task 4).
- Produces:
  - **`defaultProgramName(date?)`:** returns a name like "Tue Oct 14".
  - **`createProgramStore(api)`:** state `{ programs, search, program, played, player }` and actions:
    - `refresh()` (drops stale responses)
    - `setSearch(search)`
    - `load(programId | null)`, which invokes `programs:setCurrent`
    - `ensureProgram()`: returns the loaded program's id, or creates one named for today, loads it and returns it
    - `watch()`: takes `player:getState`, then every `player:state`. A broadcast that arrives before the first answer wins, since the answer is older. It refetches on `programs:changed`, on `library:changed`, and when another program is loaded.
  - **`ProgramProvider`, `useProgram(selector)`, `useProgramStore()`.** `App` wraps the shell in `ProgramProvider` inside `LibraryProvider`.
  - **`renderWithLibrary`:** now also provides the program store.
  - **The fake API:** answers `programs:list`/`programs:played` with `[]`, `programs:get` with `null`, and `player:getState` with `IDLE_PLAYER_STATE`.
  - **`ProgramsSection`:** the program list, newest first, with a search box.
    - Each entry shows "N songs to play" and is marked when loaded. Clicking an entry loads it.
    - `+` asks for a name prefilled with today's date, creates the program, then loads it.
    - "⋯" or right-click opens Rename…, Duplicate and Delete… (with a confirmation).

- [ ] **Step 1: Give the test helpers the program store**

Replace `tests/renderer/fake-api.ts` with:

```ts
import type { EventChannel, EventContract, InvokeChannel, RendererApi } from '@shared/contract'
import { IDLE_PLAYER_STATE } from '@shared/program'
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

Replace `tests/renderer/library/render-library.tsx` with:

```tsx
import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import type { RendererApi } from '@shared/contract'
import { LibraryProvider } from '@renderer/library/LibraryProvider'
import { ProgramProvider } from '@renderer/program/ProgramProvider'
import { testTheme } from '../test-theme'

// Renders `ui` the way the app does: Mantine + the library and program stores backed by `api`.
export function renderWithLibrary(ui: React.ReactElement, api: RendererApi): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <LibraryProvider api={api}>
        <ProgramProvider api={api}>{ui}</ProgramProvider>
      </LibraryProvider>
    </MantineProvider>
  )
}
```

- [ ] **Step 2: Write the failing tests**

`tests/renderer/program/program-store.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IDLE_PLAYER_STATE, type ProgramDetail } from '@shared/program'
import { defaultProgramName } from '@renderer/program/program-name'
import { createProgramStore, type ProgramStore } from '@renderer/program/program-store'
import { createFakeApi } from '../fake-api'

const detail: ProgramDetail = { id: 5, name: 'Set', items: [{ id: 1, kind: 'stop' }] }
const summaries = [{ id: 5, name: 'Set', updatedAt: '2026-10-14T00:00:00Z', unplayedCount: 0 }]

let store: ProgramStore
let stop: () => void = () => undefined
afterEach(() => {
  stop()
  vi.useRealTimers()
})

function setup(programId: number | null = 5) {
  const fake = createFakeApi({
    'player:getState': { ...IDLE_PLAYER_STATE, programId },
    'programs:list': summaries,
    'programs:get': detail,
    'programs:played': [],
    'programs:create': 9,
    'programs:setCurrent': undefined
  })
  store = createProgramStore(fake.api)
  return fake
}

describe('program store', () => {
  test('takes the player state, then loads the program list and the current program', async () => {
    const fake = setup()
    stop = store.getState().watch()
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().programs).toEqual(summaries)
    expect(fake.callsTo('programs:played')).toEqual([[5]])
  })

  test('refetches when programs or the library change, and when another program is loaded', async () => {
    const fake = setup(null)
    stop = store.getState().watch()
    await vi.waitFor(() => expect(fake.callsTo('programs:list')).toHaveLength(1))
    expect(store.getState().program).toBeNull()
    fake.emit('programs:changed', null)
    fake.emit('library:changed', null)
    await vi.waitFor(() => expect(fake.callsTo('programs:list')).toHaveLength(3))
    fake.emit('player:state', { ...IDLE_PLAYER_STATE, programId: 5 })
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().player.programId).toBe(5)
  })

  test('a player state broadcast before the first answer arrives is kept', async () => {
    let answer: (state: typeof IDLE_PLAYER_STATE) => void = () => undefined
    const fake = createFakeApi({
      'player:getState': () => new Promise((resolve) => (answer = resolve)),
      'programs:list': summaries,
      'programs:get': detail,
      'programs:played': []
    })
    store = createProgramStore(fake.api)
    stop = store.getState().watch()
    fake.emit('player:state', { ...IDLE_PLAYER_STATE, programId: 5, status: 'paused' })
    answer(IDLE_PLAYER_STATE) // an older state, answered late
    await vi.waitFor(() => expect(store.getState().program).toEqual(detail))
    expect(store.getState().player).toMatchObject({ programId: 5, status: 'paused' })
  })

  test('searches the program list by name', async () => {
    const fake = setup()
    await store.getState().setSearch('oct')
    expect(fake.callsTo('programs:list').at(-1)).toEqual(['oct'])
  })

  test('with no program loaded, ensureProgram creates one named for today and loads it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup(null)
    expect(await store.getState().ensureProgram()).toBe(9)
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    expect(fake.callsTo('programs:setCurrent')).toEqual([[9]])
    expect(await store.getState().ensureProgram()).toBe(9)
    expect(fake.callsTo('programs:create')).toHaveLength(1)
  })

  test('a program’s default name is its date', () => {
    expect(defaultProgramName(new Date(2026, 9, 13))).toBe('Tue Oct 13')
  })
})
```

`tests/renderer/program/programs-section.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IDLE_PLAYER_STATE, type ProgramSummary } from '@shared/program'
import Sidebar from '@renderer/components/Sidebar'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'

const programs: ProgramSummary[] = [
  { id: 1, name: 'Tue Oct 14', updatedAt: '2026-10-14T20:00:00Z', unplayedCount: 12 },
  { id: 2, name: 'Beginner night', updatedAt: '2026-10-07T20:00:00Z', unplayedCount: 1 }
]

afterEach(() => vi.useRealTimers())

function setup(extra = {}) {
  const fake = createFakeApi({
    'programs:list': (search: string) =>
      programs.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    'player:getState': { ...IDLE_PLAYER_STATE, programId: 1 },
    'programs:setCurrent': undefined,
    'programs:create': 3,
    'programs:rename': undefined,
    'programs:duplicate': 4,
    'programs:delete': undefined,
    ...extra
  })
  renderWithLibrary(<Sidebar />, fake.api)
  return fake
}

const group = () => screen.getByRole('group', { name: 'Programs' })

describe('Programs in the sidebar', () => {
  test('lists programs with what is left to play, marking the loaded one', async () => {
    setup()
    expect(await within(group()).findByText('Beginner night')).toBeInTheDocument()
    expect(within(group()).getByText('12 songs to play')).toBeInTheDocument()
    expect(within(group()).getByText('1 song to play')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(group()).getByText('Tue Oct 14').closest('[aria-current]')).toHaveAttribute(
        'aria-current',
        'page'
      )
    )
    expect(within(group()).getByText('Beginner night').closest('[aria-current]')).toBeNull()
  })

  test('clicking a program loads it', async () => {
    const fake = setup()
    await userEvent.click(await within(group()).findByText('Beginner night'))
    expect(fake.callsTo('programs:setCurrent')).toEqual([[2]])
  })

  test('the search box filters the list by name', async () => {
    setup()
    await within(group()).findByText('Beginner night')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search programs' }), 'begin')
    await waitFor(() => expect(within(group()).queryByText('Tue Oct 14')).toBeNull())
    expect(within(group()).getByText('Beginner night')).toBeInTheDocument()
  })

  test('+ asks for a name prefilled with today’s date, creates the program and loads it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup()
    await userEvent.click(screen.getByRole('button', { name: 'New program' }))
    const dialog = await screen.findByRole('dialog', { name: 'New program' })
    expect(within(dialog).getByRole('textbox')).toHaveValue('Wed Oct 14')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    await waitFor(() => expect(fake.callsTo('programs:setCurrent')).toEqual([[3]]))
  })

  test('right-click offers rename, duplicate and delete', async () => {
    const fake = setup()
    const entry = await within(group()).findByText('Beginner night')
    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(fake.callsTo('programs:duplicate')).toEqual([[2]])

    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const rename = await screen.findByRole('dialog', { name: 'Rename program' })
    await userEvent.clear(within(rename).getByRole('textbox'))
    await userEvent.type(within(rename).getByRole('textbox'), 'Beginners')
    await userEvent.click(within(rename).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('programs:rename')).toEqual([[2, 'Beginners']])

    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete program?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(fake.callsTo('programs:delete')).toEqual([[2]])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/renderer`
Expected: FAIL — `Failed to resolve import "@renderer/program/ProgramProvider"` (every test file that uses `renderWithLibrary`), and `@renderer/program/program-store` for the store tests.

- [ ] **Step 4: Implement**

`src/renderer/src/program/program-name.ts`:

```ts
// A new program's suggested name: today's date, as "Tue Oct 14" (spec §6.1).
export function defaultProgramName(date: Date = new Date()): string {
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', options)
  return `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${part({ day: 'numeric' })}`
}
```

`src/renderer/src/program/program-store.ts`:

```ts
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { RendererApi } from '@shared/contract'
import {
  IDLE_PLAYER_STATE,
  type PlayedEntry,
  type PlayerState,
  type ProgramDetail,
  type ProgramSummary
} from '@shared/program'
import { defaultProgramName } from './program-name'

export interface ProgramState {
  programs: ProgramSummary[] // the sidebar list, filtered by `search`
  search: string
  program: ProgramDetail | null // the current (loaded) program, unplayed items only
  played: PlayedEntry[] // its play log, newest first
  player: PlayerState
  refresh(): Promise<void>
  setSearch(search: string): Promise<void>
  load(programId: number | null): Promise<void>
  // The current program's id, creating and loading one named for today when none is loaded.
  ensureProgram(): Promise<number>
  // Follows main: refetches on program and library changes, and takes every player state.
  watch(): () => void
}

export type ProgramStore = StoreApi<ProgramState>

// The Program page's state (spec §6.1, §6.2). Main owns it; this store holds what's on screen.
export function createProgramStore(api: RendererApi): ProgramStore {
  let latest = 0
  const store = createStore<ProgramState>()((set, get) => ({
    programs: [],
    search: '',
    program: null,
    played: [],
    player: IDLE_PLAYER_STATE,

    async refresh() {
      const request = ++latest
      const programId = get().player.programId
      const [programs, program, played] = await Promise.all([
        api.invoke('programs:list', get().search),
        programId === null ? null : api.invoke('programs:get', programId),
        programId === null ? [] : api.invoke('programs:played', programId)
      ])
      if (request !== latest) return // a newer refresh already started
      set({ programs, program, played })
    },

    async setSearch(search) {
      set({ search })
      await get().refresh()
    },

    async load(programId) {
      await api.invoke('programs:setCurrent', programId)
    },

    async ensureProgram() {
      const current = get().player.programId
      if (current !== null) return current
      const id = await api.invoke('programs:create', defaultProgramName())
      await api.invoke('programs:setCurrent', id)
      set((s) => ({ player: { ...s.player, programId: id } }))
      return id
    },

    watch() {
      // A broadcast is always newer than the first answer, which may arrive after it.
      let heard = false
      const stops = [
        api.on('programs:changed', () => void get().refresh()),
        api.on('library:changed', () => void get().refresh()),
        api.on('player:state', (player) => {
          heard = true
          const loaded = player.programId !== get().player.programId
          set({ player })
          if (loaded) void get().refresh()
        })
      ]
      void api.invoke('player:getState').then((player) => {
        if (!heard) set({ player })
        void get().refresh()
      })
      return () => stops.forEach((stop) => stop())
    }
  }))
  return store
}
```

`src/renderer/src/program/ProgramProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { RendererApi } from '@shared/contract'
import { createProgramStore, type ProgramState, type ProgramStore } from './program-store'

const ProgramContext = createContext<ProgramStore | null>(null)

// Provides the program store to the sidebar and the Program page.
export function ProgramProvider({
  api,
  children
}: {
  api: RendererApi
  children: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => createProgramStore(api))
  useEffect(() => store.getState().watch(), [store])
  return <ProgramContext.Provider value={store}>{children}</ProgramContext.Provider>
}

export function useProgramStore(): ProgramStore {
  const store = useContext(ProgramContext)
  if (!store) throw new Error('useProgram must be used inside <ProgramProvider>')
  return store
}

// Selectors must return stable values (state fields, not new arrays/objects).
export function useProgram<T>(selector: (state: ProgramState) => T): T {
  return useStore(useProgramStore(), selector)
}
```

Replace `src/renderer/src/components/sidebar/ProgramsSection.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Group, Menu, NavLink, ScrollArea, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { ProgramSummary } from '@shared/program'
import { useLibraryApi } from '../../library/LibraryProvider'
import { defaultProgramName } from '../../program/program-name'
import { useProgram } from '../../program/ProgramProvider'
import ConfirmDialog from '../ConfirmDialog'
import NamePrompt from '../NamePrompt'
import classes from '../Sidebar.module.css'
import SectionHeading from './SectionHeading'

const songs = (n: number): string => `${n} ${n === 1 ? 'song' : 'songs'} to play`

// A program in the sidebar: click loads it; options on "⋯" or right-click.
function ProgramEntry(props: {
  program: ProgramSummary
  current: boolean
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const load = useProgram((s) => s.load)
  const options = useRef<HTMLButtonElement>(null)
  const p = props.program
  return (
    <div
      className={classes.entry}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <NavLink
        label={p.name}
        description={songs(p.unplayedCount)}
        active={props.current}
        aria-current={props.current ? 'page' : undefined}
        onClick={() => void load(p.id)}
      />
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${p.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
          <Menu.Item onClick={() => void api.invoke('programs:duplicate', p.id)}>
            Duplicate
          </Menu.Item>
          <Menu.Item color="red" onClick={props.onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

// Spec §6.1 PROGRAMS: loaded only from here, newest edit first, searchable, in its own scroll
// container that fills the rest of the sidebar.
export default function ProgramsSection(): React.JSX.Element {
  const api = useLibraryApi()
  const programs = useProgram((s) => s.programs)
  const currentId = useProgram((s) => s.player.programId)
  const setSearch = useProgram((s) => s.setSearch)
  const load = useProgram((s) => s.load)
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, 150)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; program: ProgramSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<ProgramSummary | null>(null)
  useEffect(() => {
    void setSearch(debounced)
  }, [debounced, setSearch])

  return (
    <>
      <Group justify="space-between" mt="md">
        <SectionHeading>Programs</SectionHeading>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New program"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      <TextInput
        size="xs"
        type="search"
        placeholder="Search programs…"
        aria-label="Search programs"
        my="xs"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <ScrollArea className={classes.programs}>
        <div role="group" aria-label="Programs">
          {programs.length === 0 && (
            <Text size="sm" c="dimmed">
              {text ? 'No matching programs' : 'No programs yet'}
            </Text>
          )}
          {programs.map((p) => (
            <ProgramEntry
              key={p.id}
              program={p}
              current={p.id === currentId}
              onRename={() => setPrompt({ mode: 'rename', program: p })}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      </ScrollArea>
      <NamePrompt
        opened={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename program' : 'New program'}
        initialValue={prompt?.mode === 'rename' ? prompt.program.name : defaultProgramName()}
        submitLabel={prompt?.mode === 'rename' ? 'Save' : 'Create'}
        onSubmit={async (name) => {
          if (prompt?.mode === 'rename')
            return api.invoke('programs:rename', prompt.program.id, name)
          await load(await api.invoke('programs:create', name))
        }}
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        opened={deleting !== null}
        title="Delete program?"
        message={`"${deleting?.name}" will be deleted, with its record of what was played.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleting) void api.invoke('programs:delete', deleting.id)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
```

Replace `src/renderer/src/App.tsx` with:

```tsx
import { useState } from 'react'
import { AppShell, Tabs } from '@mantine/core'
import Sidebar from './components/Sidebar'
import { LibraryProvider } from './library/LibraryProvider'
import { ProgramProvider } from './program/ProgramProvider'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'
import classes from './App.module.css'

type Page = 'program' | 'music' | 'settings'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  return (
    <LibraryProvider api={window.api}>
      <ProgramProvider api={window.api}>
        <AppShell
          header={{ height: 48 }}
          navbar={{ width: 220, breakpoint: 0, collapsed: { desktop: page === 'settings' } }}
          padding="sm"
        >
          <AppShell.Header px="sm">
            <Tabs value={page} onChange={(v) => v && setPage(v as Page)} variant="pills" pt={8}>
              <Tabs.List>
                <Tabs.Tab value="program">Program</Tabs.Tab>
                <Tabs.Tab value="music">Music</Tabs.Tab>
                <Tabs.Tab value="settings">Settings</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </AppShell.Header>
          <AppShell.Navbar p="sm">
            <Sidebar />
          </AppShell.Navbar>
          <AppShell.Main className={classes.main}>
            {page === 'program' && <ProgramPage />}
            {page === 'music' && <MusicPage />}
            {page === 'settings' && <SettingsPage api={window.api} />}
          </AppShell.Main>
        </AppShell>
      </ProgramProvider>
    </LibraryProvider>
  )
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/renderer/program`: 11 pass; the suite: 371; typecheck and formatting are clean.

```bash
git add src/renderer/src tests/renderer
git commit -m "feat(programs): program store and the Programs sidebar section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The player bar and the audio element

**Files:**
- Create: `src/renderer/src/format-time.ts`, `src/renderer/src/program/useAudio.ts`, `PlayerBar.tsx`, `PlayerBar.module.css`, `tests/renderer/program/fixtures.ts`
- Modify: `tests/renderer/setup.ts` (replace: stubs `HTMLMediaElement.prototype.play`, `pause` and `load`), `src/renderer/src/App.tsx` (replace), `src/renderer/src/App.module.css` (replace)
- Test: `tests/renderer/program/player-bar.test.tsx`, `tests/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `useProgram` (Task 7), `mediaUrl` (Task 3), the `player:*` channels (Task 5).
- Produces:
  - **`formatTime(ms | null)`:** returns a time like "3:05", or '' when unknown.
  - **`useAudio(api, player)`:** returns `{ ref, positionMs, durationMs, seek(ms) }`. It:
    - loads `mediaUrl(fileId)` for each new `playId`
    - plays or pauses to match `status`
    - sets `playbackRate`, `defaultPlaybackRate` and `preservesPitch = true`, plus the volume
    - reports `player:ended(playId)` and `player:failed(playId, message)`
  - **`PlayerBar`:** the player bar, in two rows (plus a warning line when there is one).
    - **Transport:** ◀◀ (restart the song), ▶/⏸, ⏹, ▶▶.
    - **The title line:** shows the song, the countdown, or next up; previews and replays are marked.
    - **Controls:** speed with a 🔒 toggle (`aria-pressed`) and volume on the first row; the seek bar with the times, the auto-continue checkbox, and its seconds (saved on blur) on the second.
    - **Warnings** appear with a "Dismiss warning" button. The `<audio>` element has `data-testid="player-audio"`.
  - **`App`:** puts `PlayerBar` above the page tabs in the header, mounted once for every page (the user's request). The header's height follows its contents (`useElementSize`; 170 px before it's measured).
  - **Fixtures:** `track(fileId, title, extra?)`, `item(id, track)`, `stop(id)`, `playerState(extra?)` and `playing(track, extra?, playId?)`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/renderer/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom lacks these browser APIs; Mantine uses them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView = vi.fn()
// Auto-growing textareas listen for font loading, which jsdom doesn't implement.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), ready: Promise.resolve() }
})

// jsdom lays nothing out, so every element measures 0×0. Popovers (menus) then treat their anchor
// as detached and hide, and virtualized lists (which read offsetWidth/offsetHeight) render no
// rows. Give elements a plausible size.
Element.prototype.getBoundingClientRect = function (): DOMRect {
  const rect = { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 600, right: 1000, bottom: 600 }
  return { ...rect, toJSON: () => rect } as DOMRect
}
for (const [prop, value] of [
  ['offsetWidth', 1000],
  ['offsetHeight', 600]
] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value })
}

// jsdom doesn't implement media playback. Playing resolves; tests drive the element's events.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

afterEach(() => cleanup())
```

`tests/renderer/program/fixtures.ts`:

```ts
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
    current: { playId, source: 'program', itemId: 1, track: t },
    ...extra
  })
}
```

`tests/renderer/program/player-bar.test.tsx`:

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
  'player:dismissWarning'
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

  test('transport buttons send pause, stop and next', async () => {
    const fake = setup(playing(hora))
    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
    expect(fake.callsTo('player:stop')).toHaveLength(1)
    expect(fake.callsTo('player:next')).toHaveLength(1)
  })

  test('◀◀ restarts the song', async () => {
    setup(playing(hora))
    await waitFor(() => expect(audio().src).toContain('101'))
    audio().currentTime = 42
    await userEvent.click(screen.getByRole('button', { name: 'Restart song' }))
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
        current: { playId: 2, source: 'preview', itemId: null, track: hora }
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

  test('shows a warning until it is dismissed', async () => {
    const fake = setup(playerState({ warning: 'Skipped missing file: Hora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Skipped missing file: Hora')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }))
    expect(fake.callsTo('player:dismissWarning')).toHaveLength(1)
  })
})
```

`tests/renderer/app.test.tsx`:

```tsx
import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import App from '@renderer/App'
import { createFakeApi } from './fake-api'
import { playing, track } from './program/fixtures'
import { testTheme } from './test-theme'

const hora = track(101, 'Hora')

afterEach(() => {
  delete (window as { api?: unknown }).api
})

function setup() {
  const fake = createFakeApi({
    'player:getState': playing(hora),
    'player:pause': undefined,
    'app:getInfo': { version: '0.1.0', dbPath: '/data/fdp.sqlite', schemaVersion: 2 }
  })
  ;(window as { api?: unknown }).api = fake.api
  render(
    <MantineProvider theme={testTheme}>
      <App />
    </MantineProvider>
  )
  return fake
}

describe('App', () => {
  test('the player is above the tabs and keeps playing on every page', async () => {
    const fake = setup()
    const audio = screen.getByTestId('player-audio')
    await waitFor(() => expect((audio as HTMLAudioElement).src).toBe('fdp-media://file/101'))
    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(audio)
    expect(banner).toContainElement(screen.getByRole('tab', { name: 'Music' }))

    for (const tab of ['Music', 'Settings', 'Program']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      // The same element, never remounted: the song isn't cut off by changing pages.
      expect(screen.getByTestId('player-audio')).toBe(audio)
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Music' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/program/player-bar.test.tsx tests/renderer/app.test.tsx`
Expected: FAIL. The player bar test can't resolve `@renderer/program/PlayerBar`, and the App test finds no audio element (the player isn't in the header yet).

- [ ] **Step 3: Implement**

`src/renderer/src/format-time.ts`:

```ts
// "3:05" for a duration or position in milliseconds; '' when unknown.
export function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
```

`src/renderer/src/program/useAudio.ts`:

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
// playing or paused, speed and volume — and reports back when a song ends or can't be played.
export function useAudio(api: RendererApi, player: PlayerState): AudioControls {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [positionMs, setPosition] = useState(0)
  const [durationMs, setDuration] = useState<number | null>(null)
  const playId = player.current?.playId ?? null
  const fileId = player.current?.track.fileId ?? null
  const playing = player.status === 'playing'

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

  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null) return
    if (playing)
      void audio.play().catch(() => undefined) // a failure arrives as an 'error' event
    else audio.pause()
  }, [playing, playId])

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
    const onTime = () => setPosition(audio.currentTime * 1000)
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
  }, [api, playId])

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

`src/renderer/src/program/PlayerBar.module.css`:

```css
.bar {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-xs);
}

.now {
  flex: 1;
  min-width: 0;
}

.label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
```

`src/renderer/src/program/PlayerBar.tsx`:

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
  Text,
  Tooltip
} from '@mantine/core'
import type { PlayerState } from '@shared/program'
import { formatTime } from '../format-time'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from './ProgramProvider'
import { useAudio } from './useAudio'
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

// Spec §6.2 player bar: transport, the current song, a seek bar, speed (with 🔒) and volume,
// and auto-continue. Owns the <audio> element, so it's mounted once, above the tabs (App).
export default function PlayerBar(): React.JSX.Element {
  const api = useLibraryApi()
  const player = useProgram((s) => s.player)
  const audio = useAudio(api, player)
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
          onClick={() => audio.seek(0)}
        >
          ◀◀
        </ActionIcon>
        {playing ? (
          <ActionIcon size="lg" aria-label="Pause" onClick={() => void api.invoke('player:pause')}>
            ⏸
          </ActionIcon>
        ) : (
          <ActionIcon
            size="lg"
            aria-label="Play"
            disabled={!canStart}
            onClick={() => void api.invoke('player:play')}
          >
            ▶
          </ActionIcon>
        )}
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Stop"
          disabled={player.status === 'idle'}
          onClick={() => void api.invoke('player:stop')}
        >
          ⏹
        </ActionIcon>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Next"
          disabled={player.programId === null}
          onClick={() => void api.invoke('player:next')}
        >
          ▶▶
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

Replace `src/renderer/src/App.tsx` with:

```tsx
import { useState } from 'react'
import { AppShell, Tabs } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import Sidebar from './components/Sidebar'
import { LibraryProvider } from './library/LibraryProvider'
import { ProgramProvider } from './program/ProgramProvider'
import PlayerBar from './program/PlayerBar'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'
import classes from './App.module.css'

type Page = 'program' | 'music' | 'settings'

// Before the header has been measured (and in tests, where nothing has a size).
const HEADER_FALLBACK = 170

// Spec §6: the player bar is above the tabs on every page, mounted once, so the audio keeps
// playing — and stays controllable — whichever page is open.
export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  const header = useElementSize()
  return (
    <LibraryProvider api={window.api}>
      <ProgramProvider api={window.api}>
        <AppShell
          header={{ height: Math.ceil(header.height) || HEADER_FALLBACK }}
          navbar={{ width: 220, breakpoint: 0, collapsed: { desktop: page === 'settings' } }}
          padding="sm"
        >
          <AppShell.Header px="sm">
            <div ref={header.ref} className={classes.header}>
              <PlayerBar />
              <Tabs value={page} onChange={(v) => v && setPage(v as Page)} variant="pills">
                <Tabs.List>
                  <Tabs.Tab value="program">Program</Tabs.Tab>
                  <Tabs.Tab value="music">Music</Tabs.Tab>
                  <Tabs.Tab value="settings">Settings</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </div>
          </AppShell.Header>
          <AppShell.Navbar p="sm">
            <Sidebar />
          </AppShell.Navbar>
          <AppShell.Main className={classes.main}>
            {page === 'program' && <ProgramPage />}
            {page === 'music' && <MusicPage />}
            {page === 'settings' && <SettingsPage api={window.api} />}
          </AppShell.Main>
        </AppShell>
      </ProgramProvider>
    </LibraryProvider>
  )
}
```

Replace `src/renderer/src/App.module.css` with:

```css
.header {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-xs);
  padding-block: var(--mantine-spacing-xs);
}

.main {
  height: calc(100dvh - var(--app-shell-header-height, 0px));
  box-sizing: border-box;
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected: the player bar 10 pass and the App test 1 passes; the suite: 382; typecheck and formatting are clean.

```bash
git add src/renderer/src tests/renderer
git commit -m "feat(playback): player bar above the tabs, with the control window's audio element

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The program list and Previously played

**Files:**
- Create: `src/renderer/src/program/ProgramList.tsx`, `ProgramList.module.css`, `PlayedList.tsx`
- Modify: `src/renderer/src/library/drag.ts` (replace: adds program-item drags)
- Test: `tests/renderer/program/program-list.test.tsx`, `tests/renderer/program/played-list.test.tsx`

**Interfaces:**
- Consumes: `useProgram`, `useProgramStore().ensureProgram` (Task 7), `moveBefore` (Plan 3), `library:song` (Plan 3), the `programs:*` channels (Task 5).
- Produces:
  - **`drag.ts`:** adds `ITEMS_MIME`, `setDraggedItems`, `carriesItems` and `getDraggedItems`.
  - **`ProgramList`** (region "Program"):
    - **Header:** "Program: name" with a ✎ rename, "+ STOP" (at the end), and "➕ Add selected" (the library selection, at the end).
    - **Items:** the unplayed items in a list "Program items", with next up in bold, STOP rows, ⚠ for missing files, and the country and time.
    - **Reordering and adding:** items drag to reorder (`programs:reorder` with the complete new order). Songs dropped on an item go before it; dropped below the list, at the end. With no program loaded, `ensureProgram` starts one.
    - **Each item's menu** ("Options for <label>", or right-click): its dances when the song has more than one (fetched with `library:song`, the current one ✓), Insert STOP before, and Remove.
    - **Double-click does nothing.**
  - **`PlayedList`** (region "Previously played"): the play log, newest first, with the time and a Preview/Replay badge. Double-click replays an entry (`player:replay`), and entries drag back into the program.
  - **CSS:** `ProgramList.module.css` (`.panel`, `.list`, `.row`, `.options`, `.release` and others) is shared by both lists and the holding panel.

- [ ] **Step 1: Write the failing tests**

`tests/renderer/program/program-list.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { LibraryRow, SongDetail } from '@shared/library'
import type { ProgramDetail } from '@shared/program'
import { FILES_MIME, ITEMS_MIME } from '@renderer/library/drag'
import LibraryTable from '@renderer/library/LibraryTable'
import ProgramList from '@renderer/program/ProgramList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, stop, track } from './fixtures'

const hora = track(101, 'Hora', { country: 'Romania', durationMs: 185_000 })
const kolo = track(102, 'Kolo', { danceCount: 2, isMissing: true })
const program: ProgramDetail = {
  id: 5,
  name: 'Tue Oct 14',
  items: [item(1, hora), stop(2), item(3, kolo)]
}

const libraryRow = (fileId: number, title: string): LibraryRow => ({
  fileId,
  songId: fileId + 1000,
  title,
  artist: null,
  path: `/m/${title}.mp3`,
  durationMs: null,
  isMissing: false,
  isFavorite: false,
  danceId: null,
  danceName: null,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  label: title,
  playlistItemId: null
})

afterEach(() => vi.useRealTimers())

function setup(options: { loaded?: boolean; withLibrary?: boolean } = {}) {
  const loaded = options.loaded ?? true
  const fake = createFakeApi({
    'player:getState': playerState({ programId: loaded ? 5 : null }),
    'programs:get': loaded ? program : null,
    'programs:addTracks': [9],
    'programs:addStop': 10,
    'programs:reorder': undefined,
    'programs:removeItems': undefined,
    'programs:setItemDance': undefined,
    'programs:rename': undefined,
    'programs:create': 6,
    'programs:setCurrent': undefined,
    'library:list': [libraryRow(201, 'Sârba'), libraryRow(202, 'Tropanka')],
    'library:song': {
      dances: [
        { danceId: 2102, label: 'Kolo' },
        { danceId: 77, label: 'Kolo | Užičko Kolo' }
      ]
    } as unknown as SongDetail
  })
  renderWithLibrary(
    options.withLibrary ? (
      <>
        <ProgramList />
        <LibraryTable />
      </>
    ) : (
      <ProgramList />
    ),
    fake.api
  )
  return fake
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Program items' })).getAllByRole('listitem')
const rowFor = (text: string) => screen.getByText(text).closest('[role=listitem]') as HTMLElement
const files = (ids: number[]) => ({
  dataTransfer: {
    types: [FILES_MIME],
    getData: (t: string) => (t === FILES_MIME ? JSON.stringify(ids) : '')
  }
})
const items = (ids: number[]) => ({
  dataTransfer: {
    types: [ITEMS_MIME],
    getData: (t: string) => (t === ITEMS_MIME ? JSON.stringify(ids) : '')
  }
})

describe('program list', () => {
  test('shows the loaded program’s unplayed items: songs, STOP markers and missing files', async () => {
    setup()
    expect(await screen.findByText('Program: Tue Oct 14')).toBeInTheDocument()
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hora'),
      expect.stringContaining('STOP / TEACHING'),
      expect.stringContaining('Kolo')
    ])
    expect(within(rowFor('Hora')).getByText('Romania')).toBeInTheDocument()
    expect(within(rowFor('Kolo')).getByLabelText('File missing')).toBeInTheDocument()
  })

  test('songs dropped on an item go before it; dropped below the list, at the end', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(rowFor('Kolo'), files([201, 202]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[5, [201, 202], 3]]))
    fireEvent.drop(rows().at(-1)!.nextElementSibling!, files([201]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks').at(-1)).toEqual([5, [201], null]))
  })

  test('dragging an item onto another moves it before that item', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(rowFor('Hora'), items([3]))
    await waitFor(() => expect(fake.callsTo('programs:reorder')).toEqual([[5, [3, 1, 2]]]))
  })

  test('“Add selected” adds the songs selected in the library to the end', async () => {
    const fake = setup({ withLibrary: true })
    fireEvent.click(await screen.findByText('Sârba'))
    fireEvent.click(screen.getByText('Tropanka'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: '➕ Add selected' }))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[5, [201, 202], null]]))
  })

  test('with no program loaded, adding songs starts one named for today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup({ loaded: false })
    expect(await screen.findByText(/No program loaded/)).toBeInTheDocument()
    fireEvent.drop(screen.getByText(/No program loaded/), files([201]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[6, [201], null]]))
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    expect(fake.callsTo('programs:setCurrent')).toEqual([[6]])
  })

  test('an item’s menu chooses its dance, inserts a STOP before it, or removes it', async () => {
    const fake = setup()
    // Each item's menu is labelled by its "⋯" button; a closing menu lingers while it fades.
    const menu = (name: string) => screen.findByRole('menu', { name: `Options for ${name}` })
    await screen.findByText('Kolo')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      await within(await menu('Kolo')).findByRole('menuitem', { name: 'Kolo | Užičko Kolo' })
    )
    expect(fake.callsTo('library:song')).toEqual([[1102]])
    expect(fake.callsTo('programs:setItemDance')).toEqual([[3, 77]])

    await userEvent.click(screen.getByRole('button', { name: 'Options for Hora' }))
    await userEvent.click(
      within(await menu('Hora')).getByRole('menuitem', { name: 'Insert STOP before' })
    )
    expect(fake.callsTo('programs:addStop')).toEqual([[5, 1]])

    const stopRow = screen
      .getByRole('button', { name: 'Options for STOP / TEACHING' })
      .closest('[role=listitem]') as HTMLElement
    await userEvent.pointer({ keys: '[MouseRight]', target: stopRow })
    await userEvent.click(
      within(await menu('STOP / TEACHING')).getByRole('menuitem', { name: 'Remove' })
    )
    expect(fake.callsTo('programs:removeItems')).toEqual([[5, [2]]])
  })

  test('+ STOP adds a marker at the end; the program can be renamed', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: '+ STOP' }))
    expect(fake.callsTo('programs:addStop')).toEqual([[5, null]])
    await userEvent.click(screen.getByRole('button', { name: 'Rename program' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename program' })
    await userEvent.clear(within(dialog).getByRole('textbox'))
    await userEvent.type(within(dialog).getByRole('textbox'), 'Festival')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('programs:rename')).toEqual([[5, 'Festival']])
  })

  test('double-clicking an item does nothing', async () => {
    const fake = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(
      fake.calls.filter(([c]) => String(c).startsWith('player:') && c !== 'player:getState')
    ).toEqual([])
  })
})
```

`tests/renderer/program/played-list.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlayedEntry } from '@shared/program'
import PlayedList from '@renderer/program/PlayedList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, track } from './fixtures'

const played: PlayedEntry[] = [
  { logId: 3, kind: 'preview', playedAt: '2026-10-14T20:10:00Z', track: track(102, 'Kolo') },
  { logId: 2, kind: 'program', playedAt: '2026-10-14T20:05:00Z', track: track(101, 'Hora') },
  { logId: 1, kind: 'program', playedAt: '2026-10-14T20:00:00Z', track: null }
]

function setup() {
  const fake = createFakeApi({
    'player:getState': playerState(),
    'programs:played': played,
    'player:replay': undefined
  })
  renderWithLibrary(<PlayedList />, fake.api)
  return fake
}

describe('previously played', () => {
  test('lists the program’s plays newest first, marking previews', async () => {
    setup()
    await screen.findByText('Kolo')
    const rows = within(screen.getByRole('list', { name: 'Played songs' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Kolo.*Preview/),
      expect.stringContaining('Hora'),
      expect.stringContaining('Removed from the library')
    ])
  })

  test('double-click replays an entry', async () => {
    const fake = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    await userEvent.dblClick(screen.getByText('Removed from the library'))
    expect(fake.callsTo('player:replay')).toEqual([[2]])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/program/program-list.test.tsx tests/renderer/program/played-list.test.tsx`
Expected: FAIL. The imports `ITEMS_MIME` (`@renderer/library/drag`), `@renderer/program/ProgramList` and `@renderer/program/PlayedList` don't exist yet.

- [ ] **Step 3: Implement**

Replace `src/renderer/src/library/drag.ts` with:

```ts
// Dragging songs from the library table onto the sidebar (playlists, Favorites) or a program.
export const FILES_MIME = 'application/x-fdp-files'

export function setDraggedFiles(dataTransfer: DataTransfer, fileIds: number[]): void {
  dataTransfer.setData(FILES_MIME, JSON.stringify(fileIds))
  dataTransfer.effectAllowed = 'copyMove'
}

export const carriesFiles = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(FILES_MIME)

export function getDraggedFiles(dataTransfer: DataTransfer | null): number[] {
  if (!carriesFiles(dataTransfer)) return []
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(FILES_MIME))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

// Dragging program items within the program list, to reorder them.
export const ITEMS_MIME = 'application/x-fdp-program-items'

export function setDraggedItems(dataTransfer: DataTransfer, itemIds: number[]): void {
  dataTransfer.setData(ITEMS_MIME, JSON.stringify(itemIds))
  dataTransfer.effectAllowed = 'move'
}

export const carriesItems = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(ITEMS_MIME)

export function getDraggedItems(dataTransfer: DataTransfer | null): number[] {
  if (!carriesItems(dataTransfer)) return []
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(ITEMS_MIME))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}
```

`src/renderer/src/program/ProgramList.module.css`:

```css
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  min-height: 34px;
  padding: 4px 32px 4px var(--mantine-spacing-xs);
  border-bottom: 1px solid var(--mantine-color-default-border);
  font-size: var(--mantine-font-size-sm);
  user-select: none;
  cursor: grab;
}

.row:hover {
  background: var(--mantine-color-default-hover);
}

.next {
  font-weight: 600;
}

.stop {
  color: var(--mantine-color-orange-text);
  font-weight: 600;
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dropBefore {
  box-shadow: inset 0 2px 0 var(--mantine-primary-color-filled);
}

.end {
  min-height: 40px;
}

.endActive {
  box-shadow: inset 0 2px 0 var(--mantine-primary-color-filled);
}

/* Centered with auto margins, not a transform (see AGENTS.md). */
.options {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 4px;
  margin-block: auto;
  opacity: 0;
}

.row:hover .options,
.options[aria-expanded='true'],
.options:focus-visible {
  opacity: 1;
}

.release {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 4px;
  margin-block: auto;
}
```

`src/renderer/src/program/ProgramList.tsx`:

```tsx
import { useState } from 'react'
import { ActionIcon, Button, Group, Menu, Text, Title } from '@mantine/core'
import type { SongDance } from '@shared/library'
import type { ProgramItem } from '@shared/program'
import NamePrompt from '../components/NamePrompt'
import { errorMessage } from '../ipc-error'
import {
  carriesFiles,
  carriesItems,
  getDraggedFiles,
  getDraggedItems,
  setDraggedItems
} from '../library/drag'
import { useLibraryApi, useLibraryStore } from '../library/LibraryProvider'
import { moveBefore } from '../library/reorder'
import { formatTime } from '../format-time'
import { useProgram, useProgramStore } from './ProgramProvider'
import classes from './ProgramList.module.css'

// One program item's options: its dance (when the song has several), a STOP before it, remove.
function ItemMenu(props: {
  item: ProgramItem
  onError: (message: string) => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const program = useProgram((s) => s.program)
  const [dances, setDances] = useState<SongDance[]>([])
  const { item } = props
  const run = (action: () => Promise<unknown>) => () =>
    void action().catch((err) => props.onError(errorMessage(err)))
  const name = item.kind === 'stop' ? 'STOP / TEACHING' : item.label
  return (
    <Menu
      position="right-start"
      withinPortal
      onOpen={() => {
        if (item.kind === 'track' && item.danceCount > 1) {
          void api.invoke('library:song', item.songId).then((song) => setDances(song?.dances ?? []))
        }
      }}
    >
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          className={classes.options}
          aria-label={`Options for ${name}`}
          data-options
        >
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {dances.length > 1 && item.kind === 'track' && (
          <>
            <Menu.Label>Dance</Menu.Label>
            {dances.map((d) => (
              <Menu.Item
                key={d.danceId}
                leftSection={d.danceId === item.danceId ? '✓' : null}
                onClick={run(() => api.invoke('programs:setItemDance', item.id, d.danceId))}
              >
                {d.label}
              </Menu.Item>
            ))}
            <Menu.Divider />
          </>
        )}
        <Menu.Item onClick={run(() => api.invoke('programs:addStop', program!.id, item.id))}>
          Insert STOP before
        </Menu.Item>
        <Menu.Item
          color="red"
          onClick={run(() => api.invoke('programs:removeItems', program!.id, [item.id]))}
        >
          Remove
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

// Spec §6.2 program list: the loaded program's unplayed items, in order. Reorder by dragging;
// add songs by dropping them in or with "Add selected"; STOP markers; the dance per item.
// Double-clicking an item does nothing (the program means "play in this order").
export default function ProgramList(): React.JSX.Element {
  const api = useLibraryApi()
  const library = useLibraryStore()
  const programStore = useProgramStore()
  const program = useProgram((s) => s.program)
  const programId = useProgram((s) => s.player.programId)
  const [dropTarget, setDropTarget] = useState<number | 'end' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = program?.items ?? []

  const act = (action: () => Promise<unknown>): void =>
    void action()
      .then(() => setError(null))
      .catch((err) => setError(errorMessage(err)))

  // Songs from the library, holding, a playlist or "Previously played", placed before `before`.
  const addFiles = (fileIds: number[], before: number | null) =>
    act(async () => {
      const id = await programStore.getState().ensureProgram()
      await api.invoke('programs:addTracks', id, fileIds, before)
    })

  const drop = (e: React.DragEvent, before: number | null): void => {
    setDropTarget(null)
    if (carriesItems(e.dataTransfer) && program) {
      e.preventDefault()
      const order = items.map((i) => i.id)
      const next = moveBefore(order, getDraggedItems(e.dataTransfer), before)
      if (next.join() !== order.join()) act(() => api.invoke('programs:reorder', program.id, next))
    } else if (carriesFiles(e.dataTransfer)) {
      e.preventDefault()
      addFiles(getDraggedFiles(e.dataTransfer), before)
    }
  }

  const over = (e: React.DragEvent, target: number | 'end'): void => {
    if (!carriesItems(e.dataTransfer) && !carriesFiles(e.dataTransfer)) return
    e.preventDefault()
    setDropTarget(target)
  }

  const selected = () =>
    library
      .getState()
      .selectedRows()
      .map((r) => r.fileId)

  return (
    <section className={classes.panel} aria-label="Program">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Title order={5} style={{ whiteSpace: 'nowrap' }}>
            {program ? `Program: ${program.name}` : 'Program'}
          </Title>
          {program && (
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Rename program"
              onClick={() => setRenaming(true)}
            >
              ✎
            </ActionIcon>
          )}
        </Group>
        <Group gap={6} wrap="nowrap">
          <Button
            size="compact-sm"
            variant="default"
            disabled={!program}
            onClick={() => act(() => api.invoke('programs:addStop', program!.id, null))}
          >
            + STOP
          </Button>
          <Button
            size="compact-sm"
            title="Add the songs selected in the library to the end"
            onClick={() => {
              const fileIds = selected()
              if (fileIds.length) addFiles(fileIds, null)
            }}
          >
            ➕ Add selected
          </Button>
        </Group>
      </Group>
      {error && (
        <Text c="red" size="sm" role="alert" mb="xs">
          {error}
        </Text>
      )}
      <div className={classes.list} role="list" aria-label="Program items">
        {items.map((item, i) => (
          <div
            key={item.id}
            role="listitem"
            className={[
              classes.row,
              i === 0 ? classes.next : '',
              item.kind === 'stop' ? classes.stop : '',
              dropTarget === item.id ? classes.dropBefore : ''
            ].join(' ')}
            draggable
            onDragStart={(e) => setDraggedItems(e.dataTransfer, [item.id])}
            onDragOver={(e) => over(e, item.id)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => drop(e, item.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              ;(e.currentTarget.querySelector('[data-options]') as HTMLElement | null)?.click()
            }}
          >
            {item.kind === 'stop' ? (
              <span className={classes.label}>⏸ STOP / TEACHING</span>
            ) : (
              <>
                {item.isMissing && (
                  <Text span c="red" aria-label="File missing" title="The file can't be found">
                    ⚠
                  </Text>
                )}
                <span className={classes.label}>{item.label}</span>
                <Text span size="xs" c="dimmed">
                  {item.country}
                </Text>
                <Text span size="xs" c="dimmed">
                  {formatTime(item.durationMs)}
                </Text>
              </>
            )}
            <ItemMenu item={item} onError={setError} />
          </div>
        ))}
        <div
          className={`${classes.end} ${dropTarget === 'end' ? classes.endActive : ''}`}
          onDragOver={(e) => over(e, 'end')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => drop(e, null)}
        >
          {items.length === 0 && (
            <Text size="sm" c="dimmed" p="sm">
              {programId === null
                ? 'No program loaded. Drag songs here to start one, or choose one in the sidebar.'
                : 'Nothing left to play. Drag songs here, or select songs and use ➕ Add selected.'}
            </Text>
          )}
        </div>
      </div>
      <NamePrompt
        opened={renaming}
        title="Rename program"
        initialValue={program?.name ?? ''}
        submitLabel="Save"
        onSubmit={(name) => api.invoke('programs:rename', program!.id, name)}
        onClose={() => setRenaming(false)}
      />
    </section>
  )
}
```

`src/renderer/src/program/PlayedList.tsx`:

```tsx
import { Badge, Text, Title } from '@mantine/core'
import { setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from './ProgramProvider'
import classes from './ProgramList.module.css'

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// Spec §6.2 "Previously played": the loaded program's play log, newest first. Double-click
// replays an entry (spec §7.1); entries can be dragged back into the program.
export default function PlayedList(): React.JSX.Element {
  const api = useLibraryApi()
  const played = useProgram((s) => s.played)
  return (
    <section className={classes.panel} aria-label="Previously played">
      <Title order={5} mb="xs">
        Previously played
      </Title>
      <div className={classes.list} role="list" aria-label="Played songs">
        {played.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Nothing played yet
          </Text>
        )}
        {played.map((entry) => (
          <div
            key={entry.logId}
            role="listitem"
            className={classes.row}
            draggable={entry.track !== null}
            onDragStart={(e) =>
              entry.track && setDraggedFiles(e.dataTransfer, [entry.track.fileId])
            }
            onDoubleClick={() => entry.track && void api.invoke('player:replay', entry.logId)}
            title={entry.track ? 'Double-click to play again' : undefined}
          >
            <Text span size="xs" c="dimmed" w={60}>
              {clock(entry.playedAt)}
            </Text>
            <span className={classes.label}>
              {entry.track?.label ?? 'Removed from the library'}
            </span>
            {entry.kind !== 'program' && (
              <Badge size="xs" variant="light">
                {entry.kind === 'preview' ? 'Preview' : 'Replay'}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected: program list 8 pass, played list 2 pass; the suite: 392; typecheck and formatting are clean.

```bash
git add src/renderer/src tests/renderer
git commit -m "feat(programs): program list with drag, STOP markers and dance per item; previously played

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Holding, the library list and the Program page

**Files:**
- Create: `src/renderer/src/library/LibrarySearch.tsx`, `src/renderer/src/program/HoldingPanel.tsx`
- Modify: `src/renderer/src/library/LibraryTable.tsx` (replace), `src/renderer/src/library/LibraryTable.module.css`, `src/renderer/src/pages/MusicPage.tsx` (replace), `src/renderer/src/pages/ProgramPage.tsx` (replace), `src/renderer/src/pages/ProgramPage.module.css` (replace)
- Test: `tests/renderer/program/holding-panel.test.tsx`, `tests/renderer/program/program-page.test.tsx`

**Interfaces:**
- Consumes: everything above; `library:setHolding` and the `holding` filter (Tasks 2 and 5).
- Produces:
  - **`LibraryTable({ compact? })`:** double-click previews a song (`player:preview`), on both pages (spec §7.1). `compact` shows only the icon, Song / Dance, Country, Teacher and Time columns (spec §6.2). It uses `formatTime`.
  - **`LibrarySearch({ style? })`:** the library search box. It starts from the store's search, so the search carries over between pages. The Music page passes `{ flex: 1 }`.
  - **`HoldingPanel`** (region "Holding"):
    - lists held songs (`library:list` with the `holding` filter) and refetches on `library:changed`
    - songs dropped on it are held; "Release <label>" (✕) releases one
    - rows drag into the program; double-click previews
  - **`ProgramPage`:** a 2×2 grid: Previously played | Holding, then Program | Library (region "Library": `LibrarySearch` and a compact `LibraryTable`). The player bar is in `App` (Task 8).

- [ ] **Step 1: Write the failing tests**

`tests/renderer/program/holding-panel.test.tsx`:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import { FILES_MIME } from '@renderer/library/drag'
import HoldingPanel from '@renderer/program/HoldingPanel'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState } from './fixtures'

const held = { fileId: 101, songId: 1, label: 'Hora', country: 'Romania' } as LibraryRow

function setup() {
  let rows: LibraryRow[] = [held]
  const fake = createFakeApi({
    'player:getState': playerState(),
    'library:list': (query: LibraryQuery) => (query.filter.kind === 'holding' ? rows : []),
    'library:setHolding': undefined,
    'player:preview': undefined
  })
  renderWithLibrary(<HoldingPanel />, fake.api)
  return { fake, setRows: (r: LibraryRow[]) => (rows = r) }
}

describe('holding panel', () => {
  test('lists held songs and refreshes when the library changes', async () => {
    const { fake, setRows } = setup()
    expect(await screen.findByText('Hora')).toBeInTheDocument()
    expect(screen.getByText('Romania')).toBeInTheDocument()
    setRows([])
    act(() => fake.emit('library:changed', null))
    expect(await screen.findByText('Drag songs here to keep them handy')).toBeInTheDocument()
  })

  test('songs dropped on it are held; ✕ releases one', async () => {
    const { fake } = setup()
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Holding' }), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([202, 203]) }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Release Hora' }))
    await waitFor(() =>
      expect(fake.callsTo('library:setHolding')).toEqual([
        [[202, 203], true],
        [[101], false]
      ])
    )
  })

  test('double-click previews a held song', async () => {
    const { fake } = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(fake.callsTo('player:preview')).toEqual([[101]])
  })
})
```

`tests/renderer/program/program-page.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import ProgramPage from '@renderer/pages/ProgramPage'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState } from './fixtures'

const row = {
  fileId: 201,
  songId: 1201,
  title: 'Sârba',
  label: 'Sârba',
  country: 'Romania',
  teacher: 'Sonia Dion',
  danceCount: 1,
  durationMs: 120_000
} as LibraryRow

function setup(page: 'program' | 'music') {
  const fake = createFakeApi({
    'player:getState': playerState({ programId: null }),
    // The library list has the song; holding is empty.
    'library:list': (query: LibraryQuery) => (query.filter.kind === 'holding' ? [] : [row]),
    'library:stats': { fileCount: 1 },
    'player:preview': undefined,
    'library:song': null // the Music page opens the song editor for the selected song
  })
  renderWithLibrary(page === 'program' ? <ProgramPage /> : <MusicPage />, fake.api)
  return fake
}

describe('Program page', () => {
  test('has previously played, the program, holding and the library (the player is in App)', async () => {
    setup('program')
    expect(await screen.findByRole('region', { name: 'Program' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    for (const name of ['Previously played', 'Program', 'Holding', 'Library']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  test('its library list shows the song with its dance, country and teacher', async () => {
    setup('program')
    const library = screen.getByRole('region', { name: 'Library' })
    expect(await within(library).findByText('Sârba')).toBeInTheDocument()
    expect(
      within(library)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['', 'Song / Dance ▲', 'Country', 'Teacher', 'Time'])
    expect(within(library).getByText('Sonia Dion')).toBeInTheDocument()
  })

  test('double-clicking a library song previews it', async () => {
    const fake = setup('program')
    const library = screen.getByRole('region', { name: 'Library' })
    await userEvent.dblClick(await within(library).findByText('Sârba'))
    expect(fake.callsTo('player:preview')).toEqual([[201]])
  })

  test('double-click previews on the Music page too', async () => {
    const fake = setup('music')
    await userEvent.dblClick(await screen.findByText('Sârba'))
    expect(fake.callsTo('player:preview')).toEqual([[201]])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/program/holding-panel.test.tsx tests/renderer/program/program-page.test.tsx`
Expected: FAIL. `@renderer/program/HoldingPanel` can't be resolved, and the Program page still shows its Plan 1 placeholders, so its regions aren't there.

- [ ] **Step 3: Implement**

Replace `src/renderer/src/library/LibraryTable.tsx` with:

```tsx
import { useRef, useState } from 'react'
import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryRow, SortColumn } from '@shared/library'
import { formatTime } from '../format-time'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from './drag'
import { useLibrary, useLibraryApi, useLibraryStore } from './LibraryProvider'
import { moveBefore } from './reorder'
import classes from './LibraryTable.module.css'

interface Column {
  sort: SortColumn | null
  label: string
  render: (row: LibraryRow) => React.ReactNode
}

const ALL_COLUMNS: Column[] = [
  {
    sort: null,
    label: '',
    render: (r) =>
      r.isMissing ? (
        <Text span c="red" aria-label="File missing" title="The file can't be found">
          ⚠
        </Text>
      ) : r.isFavorite ? (
        <Text span aria-label="Favorite">
          ★
        </Text>
      ) : null
  },
  {
    sort: 'title',
    label: 'Song / Dance',
    render: (r) => (
      <Group gap={6} wrap="nowrap">
        <span className={classes.cell}>{r.label}</span>
        {r.danceCount > 1 && (
          <Badge size="xs" variant="light" title={`${r.danceCount} dances`}>
            +{r.danceCount - 1}
          </Badge>
        )}
      </Group>
    )
  },
  { sort: 'country', label: 'Country', render: (r) => r.country },
  { sort: 'teacher', label: 'Teacher', render: (r) => r.teacher },
  { sort: 'choreographer', label: 'Choreographer', render: (r) => r.choreographer },
  { sort: 'danceType', label: 'Type', render: (r) => r.danceType },
  {
    sort: 'difficulty',
    label: 'Difficulty',
    render: (r) => (r.difficulty ? '●'.repeat(r.difficulty) : '')
  },
  { sort: 'duration', label: 'Time', render: (r) => formatTime(r.durationMs) }
]

// The Program page's library list (spec §6.2): the song and its dance, country and teacher.
const COMPACT = new Set(['', 'Song / Dance', 'Country', 'Teacher', 'Time'])
const COMPACT_COLUMNS = ALL_COLUMNS.filter((c) => COMPACT.has(c.label))

// Spec §6.3: browse, sort, search and select songs; drag them onto playlists or the program.
// Virtualized, so large libraries stay fast. In a playlist (in its own order), dropping songs on a
// row moves them. Double-click plays a preview (spec §7.1).
export default function LibraryTable({
  compact = false
}: {
  compact?: boolean
}): React.JSX.Element {
  const COLUMNS = compact ? COMPACT_COLUMNS : ALL_COLUMNS
  const api = useLibraryApi()
  const store = useLibraryStore()
  const rows = useLibrary((s) => s.rows)
  const selected = useLibrary((s) => s.selected)
  const sort = useLibrary((s) => s.sort)
  const filter = useLibrary((s) => s.filter)
  const search = useLibrary((s) => s.search)
  const setSort = useLibrary((s) => s.setSort)
  const select = useLibrary((s) => s.select)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 32,
    overscan: 12,
    initialRect: { width: 1000, height: 600 }
  })

  const chosen = new Set(selected)
  // A search hides some of the playlist, so a move can't be placed within the whole order.
  const reorderable = filter.kind === 'playlist' && sort.column === 'position' && search === ''

  const onHeader = (column: SortColumn): void => {
    const direction = sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'
    void setSort({ column, direction })
  }

  const dropOn = (target: LibraryRow, fileIds: number[]): void => {
    if (filter.kind !== 'playlist') return
    const order = rows.map((r) => r.playlistItemId!)
    const moving = rows.filter((r) => fileIds.includes(r.fileId)).map((r) => r.playlistItemId!)
    const next = moveBefore(order, moving, target.playlistItemId)
    if (next.join() !== order.join()) void api.invoke('playlists:reorder', filter.playlistId, next)
  }

  return (
    <div
      className={`${classes.table} ${compact ? classes.compact : ''}`}
      role="table"
      aria-label="Songs"
      aria-rowcount={rows.length}
      // Focusable, so clicking a row gives the table the keyboard: ⌘A / Ctrl+A selects every song.
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          store.getState().selectAll()
        }
      }}
    >
      <div className={classes.header} role="row">
        {COLUMNS.map((c, i) => (
          <div
            key={i}
            role="columnheader"
            aria-sort={
              c.sort && sort.column === c.sort
                ? sort.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
            }
          >
            {c.sort ? (
              <UnstyledButton fz="sm" fw={600} onClick={() => onHeader(c.sort!)}>
                {c.label}
                {sort.column === c.sort ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </UnstyledButton>
            ) : (
              c.label
            )}
          </div>
        ))}
      </div>
      <div ref={scroll} className={classes.scroll}>
        <div className={classes.body} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const r = rows[v.index]
            return (
              <div
                key={r.songId}
                role="row"
                aria-selected={chosen.has(r.songId)}
                className={`${classes.item} ${r.isMissing ? classes.missing : ''} ${
                  dropTarget === r.songId ? classes.dropBefore : ''
                }`}
                style={{ transform: `translateY(${v.start}px)` }}
                onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
                onClick={(e) =>
                  select(
                    r.songId,
                    e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single'
                  )
                }
                draggable
                onDragStart={(e) => {
                  if (!chosen.has(r.songId)) select(r.songId, 'single')
                  const fileIds = store
                    .getState()
                    .selectedRows()
                    .map((x) => x.fileId)
                  setDraggedFiles(e.dataTransfer, fileIds.length ? fileIds : [r.fileId])
                }}
                onDragOver={(e) => {
                  if (!reorderable || !carriesFiles(e.dataTransfer)) return
                  e.preventDefault()
                  setDropTarget(r.songId)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  setDropTarget(null)
                  if (!reorderable) return
                  e.preventDefault()
                  dropOn(r, getDraggedFiles(e.dataTransfer))
                }}
              >
                {COLUMNS.map((c, i) => (
                  <div key={i} role="cell" className={classes.cell}>
                    {c.render(r)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

Append to `src/renderer/src/library/LibraryTable.module.css`:

```css
.compact .header,
.compact .item {
  grid-template-columns: 28px minmax(160px, 3fr) minmax(70px, 1fr) minmax(70px, 1fr) 48px;
}
```

`src/renderer/src/library/LibrarySearch.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useLibrary, useLibraryStore } from './LibraryProvider'

// The library search box (spec §6.2, §6.3), shared by the Music and Program pages. It starts from
// the store's search, so the search carries over between pages.
export default function LibrarySearch(props: { style?: React.CSSProperties }): React.JSX.Element {
  const store = useLibraryStore()
  const setSearch = useLibrary((s) => s.setSearch)
  const [text, setText] = useState(() => store.getState().search)
  const [debounced] = useDebouncedValue(text, 150)
  useEffect(() => {
    if (debounced !== store.getState().search) void setSearch(debounced)
  }, [debounced, setSearch, store])
  return (
    <TextInput
      type="search"
      role="searchbox"
      aria-label="Search music"
      placeholder="Search song, dance, teacher, choreographer or country"
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      style={props.style}
    />
  )
}
```

Replace `src/renderer/src/pages/MusicPage.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, Title } from '@mantine/core'
import type { ReapplyResult } from '@shared/library'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'
import { errorMessage } from '../ipc-error'
import LibrarySearch from '../library/LibrarySearch'
import LibraryTable from '../library/LibraryTable'
import ReapplyDialog from '../library/ReapplyDialog'
import SongEditor from '../library/SongEditor'
import { useLibrary, useLibraryApi, useLibraryStore } from '../library/LibraryProvider'
import classes from './MusicPage.module.css'

const songCount = (n: number): string =>
  n === 0 ? 'Your library is empty.' : `${n} ${n === 1 ? 'song' : 'songs'} in your library`

function reapplyMessage(result: ReapplyResult): string {
  const songs = `Updated ${result.songs} ${result.songs === 1 ? 'song' : 'songs'}.`
  const n = result.skippedSharedDances
  if (n === 0) return songs
  return `${songs} ${n} ${n === 1 ? 'dance used by other songs was' : 'dances used by other songs were'} left unchanged.`
}

// Spec §6.3: browse, search and organize the library; import music.
export default function MusicPage(): React.JSX.Element {
  const api = useLibraryApi()
  const store = useLibraryStore()
  const filter = useLibrary((s) => s.filter)
  const selected = useLibrary((s) => s.selected)
  const rows = useLibrary((s) => s.rows)
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [confirmReapply, setConfirmReapply] = useState(false)
  // The selection when the dialog opened, so a refresh behind the dialog can't change it.
  const [reapplyIds, setReapplyIds] = useState<number[]>([])
  const [notice, setNotice] = useState<{ color: string; text: string } | null>(null)

  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  const flow = useImportFlow(api, refresh)

  const chosen = new Set(selected)
  const selectedRows = rows.filter((r) => chosen.has(r.songId))
  const allFavorite = selectedRows.length > 0 && selectedRows.every((r) => r.isFavorite)

  const act = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
    } catch (err) {
      setNotice({ color: 'red', text: errorMessage(err) })
    }
  }

  return (
    <div className={classes.root}>
      <Group justify="space-between">
        <div>
          <Title order={2}>Music</Title>
          {fileCount !== null && <Text c="dimmed">{songCount(fileCount)}</Text>}
        </div>
        <Group>
          <Button onClick={flow.addMusic}>Add Music…</Button>
          <Button variant="default" onClick={flow.importFromApple}>
            Import from Apple Music…
          </Button>
        </Group>
      </Group>
      <Group>
        <LibrarySearch style={{ flex: 1 }} />
        {selected.length > 0 && (
          <>
            <Button
              variant="default"
              onClick={() =>
                act(() =>
                  api.invoke(
                    'library:setFavorite',
                    selectedRows.map((r) => r.fileId),
                    !allFavorite
                  )
                )
              }
            >
              {allFavorite ? 'Unfavorite' : 'Favorite'}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setReapplyIds(
                  store
                    .getState()
                    .selectedRows()
                    .map((r) => r.songId)
                )
                setConfirmReapply(true)
              }}
            >
              Re-apply mapping…
            </Button>
            {filter.kind === 'playlist' && (
              <Button
                variant="default"
                onClick={() =>
                  act(() =>
                    api.invoke(
                      'playlists:remove',
                      filter.playlistId,
                      selectedRows.map((r) => r.playlistItemId!)
                    )
                  )
                }
              >
                Remove from playlist
              </Button>
            )}
          </>
        )}
      </Group>
      {notice && (
        <Alert color={notice.color} withCloseButton onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      <DropZone onFiles={flow.dropFiles} />
      <div className={classes.body}>
        <LibraryTable />
        {selected.length === 1 && (
          <aside className={classes.editor} aria-label="Song editor">
            <SongEditor key={selected[0]} songId={selected[0]} />
          </aside>
        )}
      </div>
      <ImportDialog flow={flow} />
      <ReapplyDialog
        opened={confirmReapply}
        songIds={reapplyIds}
        onConfirm={(mapping) =>
          act(async () => {
            const result = await api.invoke('library:reapplyMapping', reapplyIds, mapping)
            setNotice({ color: 'blue', text: reapplyMessage(result) })
          })
        }
        onClose={() => setConfirmReapply(false)}
      />
    </div>
  )
}
```

`src/renderer/src/program/HoldingPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Text, Title } from '@mantine/core'
import type { LibraryRow } from '@shared/library'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from '../library/drag'
import { useLibraryApi } from '../library/LibraryProvider'
import classes from './ProgramList.module.css'

const HOLDING = {
  search: '',
  filter: { kind: 'holding' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

// Spec §6.2 holding panel: songs set aside for this session (a per-file flag). Drop songs here
// to hold them; drag them into the program; double-click to preview; ✕ to release.
export default function HoldingPanel(): React.JSX.Element {
  const api = useLibraryApi()
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [over, setOver] = useState(false)
  const refresh = useCallback(() => {
    void api.invoke('library:list', HOLDING).then(setRows)
  }, [api])
  useEffect(() => {
    refresh()
    return api.on('library:changed', refresh)
  }, [api, refresh])

  return (
    <section
      className={classes.panel}
      aria-label="Holding"
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const fileIds = getDraggedFiles(e.dataTransfer)
        if (!fileIds.length) return
        e.preventDefault()
        void api.invoke('library:setHolding', fileIds, true)
      }}
    >
      <Title order={5} mb="xs">
        Holding
      </Title>
      <div
        className={`${classes.list} ${over ? classes.endActive : ''}`}
        role="list"
        aria-label="Held songs"
      >
        {rows.length === 0 && (
          <Text size="sm" c="dimmed" p="sm">
            Drag songs here to keep them handy
          </Text>
        )}
        {rows.map((r) => (
          <div
            key={r.fileId}
            role="listitem"
            className={classes.row}
            draggable
            onDragStart={(e) => setDraggedFiles(e.dataTransfer, [r.fileId])}
            onDoubleClick={() => void api.invoke('player:preview', r.fileId)}
          >
            <span className={classes.label}>{r.label}</span>
            <Text span size="xs" c="dimmed">
              {r.country}
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              className={classes.release}
              aria-label={`Release ${r.label}`}
              onClick={() => void api.invoke('library:setHolding', [r.fileId], false)}
            >
              ✕
            </ActionIcon>
          </div>
        ))}
      </div>
    </section>
  )
}
```

Replace `src/renderer/src/pages/ProgramPage.tsx` with:

```tsx
import LibrarySearch from '../library/LibrarySearch'
import LibraryTable from '../library/LibraryTable'
import HoldingPanel from '../program/HoldingPanel'
import PlayedList from '../program/PlayedList'
import ProgramList from '../program/ProgramList'
import classes from './ProgramPage.module.css'

// Spec §6.2: previously played above the program on the left; holding above the library list on
// the right. The player bar is above the tabs (App), on every page.
export default function ProgramPage(): React.JSX.Element {
  return (
    <div className={classes.root}>
      <div className={classes.grid}>
        <PlayedList />
        <HoldingPanel />
        <ProgramList />
        <section className={classes.library} aria-label="Library">
          <LibrarySearch />
          <LibraryTable compact />
        </section>
      </div>
    </div>
  )
}
```

Replace `src/renderer/src/pages/ProgramPage.module.css` with:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-sm);
  height: 100%;
  min-height: 0;
}

.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--mantine-spacing-sm);
}

.library {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-xs);
  min-height: 0;
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: holding 3 pass, Program page 4 pass; the suite: 399; typecheck, formatting and build are clean.

```bash
git add src/renderer/src tests/renderer
git commit -m "feat(programs): Program page — holding, library list, double-click preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Spec, release notes, decisions and a manual check

**Files:**
- Modify: the spec, `CHANGELOG.md`, `AGENTS.md`

**Interfaces:** none (documentation). It records the decisions listed at the top of this plan and the details settled while building.

- [ ] **Step 1: Update the spec, the release notes and the decision log**

Make these replacements in order. Each "before" text appears exactly once in its file.

**`docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`**

1. Replace:

````markdown
Three pages: **Program**, **Music**, **Settings**. A left sidebar (styled like Apple Music) appears on Program and Music.

````

   with:

````markdown
Three pages: **Program**, **Music**, **Settings**. A left sidebar (styled like Apple Music) appears on Program and Music.

The **player bar** (§6.2) sits above the page tabs and stays on every page. A song started anywhere, such as a preview double-clicked on the Music page, can be paused, stopped or skipped without going to the Program page. The control window's `<audio>` element lives in the player bar, which is mounted once, so changing pages never cuts the music.

````

2. Replace:

````markdown
- **Programs** are loaded only from the sidebar; there is no dropdown.
````

   with:

````markdown
- **Programs** are loaded only from the sidebar; there is no dropdown.
  - Each entry shows how many songs are left to play.
````

3. Replace:

````markdown
  - The search box filters by name as you type.
  - Right-clicking a program offers rename, duplicate and delete. `[+]` creates a new program.
````

   with:

````markdown
  - The search box filters by name as you type.
  - `[+]` asks for a name, prefilled with today's date ("Tue Oct 14"), creates the program and loads it.
  - Adding songs with no program loaded creates one named for today and loads it.
  - Each program's options are on a "⋯" button or a right-click: Rename…, Duplicate, and Delete… (with a confirmation). **Duplicate** makes a fresh copy to run again: every item, all unplayed. The original keeps its record of what was danced.
````

4. Replace:

````markdown

- **Player bar:** transport controls, the current item's label (§4 "Labels"), a seek bar, speed and volume. The auto-continue checkbox and its seconds are editable right here. There is also the projector toggle.
````

   with:

````markdown

- **Player bar** (above the tabs on every page; drawn above the Program page here): transport controls, the current item's label (§4 "Labels"), a seek bar, speed and volume. The auto-continue checkbox and its seconds are editable right here. There is also the projector toggle (plan 5).
  - **◀◀** restarts the current song. To go back to an earlier song, double-click it in previously played.
  - **▶** turns into **⏸** while a song plays.
  - When nothing is playing, the bar shows what's next ("Next up: …", "Starting in N…", or "Next: … in N…").
  - Previews and replays are marked as such.
  - A warning (a skipped missing file, a file that can't be played) appears under the bar until dismissed. It is never shown on the projector.
````

5. Replace:

````markdown
  - **Reordering:** drag and drop.
  - **Adding:** drag songs in from the library, holding or playlists, or use the ➕ button (adds the selected library songs at the end). Each item takes the song's default dance.
  - **Choosing the dance:** each item shows its label (§4 "Labels"). An item whose song has several dances has a **Dance** menu (right-click) listing every linked dance by its label, so dances with the same name are told apart by choreographer.
  - **STOP markers:** inserted with a button or context menu.
````

   with:

````markdown
  - **Reordering:** drag and drop.
  - **Adding:** drag songs in from the library, holding, playlists or previously played (dropped on an item, they go before it; below the list, at the end), or use the ➕ button (adds the selected library songs at the end). Each item takes the song's default dance.
  - **Each item's menu** ("⋯" or right-click) has its options.
    - **Choosing the dance:** each item shows its label (§4 "Labels"). An item whose song has several dances lists every linked dance by its label, with the current one checked, so dances with the same name are told apart by choreographer.
    - **Insert STOP before** and **Remove**.
  - **STOP markers:** inserted with the **+ STOP** button (at the end) or an item's menu (before it).
  - **The program's name** is shown above the list, with a ✎ button to rename it.
````

6. Replace:

````markdown
  - **Double-clicking a program item does nothing.** The program's intent is "play in this order"; to play an item now, drag it to the top.
- **Holding panel:** files with `in_holding`, above the library list.
- **Library list:** one row per song, showing its default dance's name, country and teacher. Songs with more than one dance show a small "+N dances" badge, whose tooltip lists the dances by their labels. Searchable by song title, dance name, teacher, choreographer and country (`library_fts`, §4). Search-box text always goes through `toFtsQuery()`, so accents don't matter and punctuation like "4-Wall" can't break the query. The list is filtered by the sidebar selection.
````

   with:

````markdown
  - **Double-clicking a program item does nothing.** The program's intent is "play in this order"; to play an item now, drag it to the top.
- **Holding panel:** files with `in_holding`, above the library list. Drop songs on it to hold them, ✕ releases one, and held songs can be dragged into the program.
- **Library list:** one row per song, showing its default dance's name, country and teacher. Songs with more than one dance show a small "+N dances" badge, whose tooltip lists the dances by their labels. Searchable by song title, dance name, teacher, choreographer and country (`library_fts`, §4). Search-box text always goes through `toFtsQuery()`, so accents don't matter and punctuation like "4-Wall" can't break the query. The list is filtered by the sidebar selection, and the search carries over between the Program and Music pages.
````

7. Replace:

````markdown
| Double-click in previously played | `replay` | no | **never**: halts and queues the program's next item |
| Double-click anywhere else (library, holding, playlist) = **preview** | `preview` (with current `program_id`) | no | **never**: halts and queues the program's next item |
````

   with:

````markdown
| Double-click in previously played | `replay` | no | **never**: halts and queues the program's next item |
| Double-click anywhere else (library on either page, holding, playlist) = **preview** | `preview` (with current `program_id`) | no | **never**: halts and queues the program's next item |
````

8. Replace:

````markdown
  3. Plays the song, setting `played_at` and writing `play_log`.
- **⏭** stops the current song and starts the next item.
````

   with:

````markdown
  3. Plays the song, setting `played_at` and writing `play_log`.
- **⏭** stops the current song and starts the next item at once, without a countdown.
- **Operator commands pass STOP markers.** When ▶ or ⏭ finds a STOP marker next, it is marked played and the song after it starts: pressing a button means "go". Only automatic continuation halts at a STOP.
````

9. Replace:

````markdown
- **Reaching a STOP marker** always halts, regardless of auto-continue. The marker is marked played. While halted, the projector shows the **next** dance and its slide. ▶ resumes.
- **Speed** ranges from 0.5× to 1.5× using `playbackRate` with `preservesPitch = true`. It resets to 1.0× for each new song unless the 🔒 toggle next to the speed slider is on. **Volume** is global.
- **Missing or unreadable file at play time:** the item is skipped and a control-window warning is shown. With auto-continue on, the next item plays. With it off, playback halts with the item flagged.
````

   with:

````markdown
- **Reaching a STOP marker** always halts, regardless of auto-continue. The marker is marked played. While halted, the projector shows the **next** dance and its slide. ▶ resumes.
- **Speed** ranges from 0.5× to 1.5× using `playbackRate` with `preservesPitch = true`. It resets to 1.0× for each new song unless the 🔒 toggle next to the speed slider is on. **Volume** is global, and starts at 100% each time the app opens.
- **Missing file at play time:** when the next song's file isn't on disk, it is skipped: left in the program, unplayed and flagged ⚠, while the song after it plays. A control-window warning names it. A preview or replay of a missing file only shows the warning.
- **Unreadable file at play time** (the file is there but can't be played): a warning is shown, and the program continues as if the song had ended. With auto-continue on, the next item plays; with it off, playback halts.
````

10. Replace:

````markdown
- **`PlayerSession` has no Electron imports.** Timers are injected, so it is fully unit-testable.
````

   with:

````markdown
- **`PlayerSession` has no Electron imports.** Timers are injected, so it is fully unit-testable.
  - It reaches the database through small "ports".
  - The control window's `<audio>` reports only "ended" and "failed", each tagged with the play's id, so a late event from an earlier song is ignored.
- **Audio reaches `<audio>` through an `fdp-media://file/<id>` scheme.** It looks up the path by file id, so the renderer never names a path. It answers Range requests itself, because seeking needs them.
- **`FDP_USER_DATA`:** setting it points the app at another data folder, so end-to-end tests and smoke runs never touch the real library.
````

11. Replace:

````markdown
  - **State:** Zustand, for UI-local state only (selection, search text)
  - **Drag and drop:** dnd-kit
````

   with:

````markdown
  - **State:** Zustand, for UI-local state only (selection, search text)
  - **Drag and drop:** native HTML5 drag and drop, with the app's own data types (songs, program items). dnd-kit wasn't needed.
````

**`CHANGELOG.md`**

1. Replace:

````markdown
- Settings: choose the default import mapping and edit the list of dance types.
````

   with:

````markdown
- Settings: choose the default import mapping and edit the list of dance types.
- Programs: create one for each dance session (named for today's date), then rename, duplicate (a fresh copy to run again) or delete it. They're listed in the sidebar newest first, with a search box, and adding songs with no program open starts one.
- The Program page: build the program by dragging songs from the library, holding, playlists or Previously played, or with ➕ Add selected; drag items to reorder them; add STOP / teaching markers; choose which dance an item is played as.
- Play the program from the player bar at the top of every page: ▶, pause, stop, next and restart; a seek bar; auto-continue with an adjustable delay right in the player bar; a countdown before the first song; and STOP markers that halt playback until you press ▶.
- Double-click a song in the library, a playlist or holding to preview it; double-click an entry in Previously played to play it again. Previews and replays never continue on their own.
- Slow a song down or speed it up (0.5×–1.5×) without changing its pitch, with a lock to keep the speed for the next song, and set the volume.
- Holding: drop songs on the holding panel to keep them handy for the session.
- Previously played lists what was played in the program, newest first. Played items leave the program but are kept, so a saved program records what was danced.
- When a program is loaded, its files are checked, and missing ones are flagged before the event. A missing file is skipped at play time with a warning.
````

**`AGENTS.md`**

1. Replace:

````markdown
Newest first. Format: **date — decision.** Why. _Rejected:_ alternatives.

````

   with:

````markdown
Newest first. Format: **date — decision.** Why. _Rejected:_ alternatives.

- **2026-10-14 — `PlayerSession` decides what plays; the control window only plays and reports.**
  - **How it works:** the session reaches the database through `SessionPorts` and gets its timers injected, so tests run it over an in-memory database with fake timers. The control window's `<audio>` follows the broadcast `player:state` and reports only `player:ended` and `player:failed`, each with the play's `playId`; a late event from an earlier song is ignored.
  - **STOP markers:** operator commands (▶, ⏭) pass them, marking them played; only automatic continuation halts at one (chosen by the user).
  - **Missing files:** a song whose file is missing is skipped and left unplayed and flagged, so the cursor (the first unplayed item) never gets stuck on it.
  - **Settings:** speed lock and volume live in the session, not settings.
  - _Rejected:_ the renderer deciding the next song (the Flutter app's desync bugs).
- **2026-10-14 — Audio is served by `fdp-media://file/<id>`, with Range handled in `mediaResponse`.** The renderer runs on a dev-server origin, where `file://` media is blocked. Serving by file id means a page can't ask for arbitrary paths. Seeking needs 206 responses, and we answer Range requests ourselves rather than rely on `net.fetch` of a `file://` URL. The CSP allows `media-src fdp-media:`.
- **2026-10-14 — `FDP_USER_DATA` points the app at another data folder.** `--user-data-dir` doesn't move `app.getPath('userData')`. Use the variable for smoke runs and end-to-end tests, so they never touch a real library.
- **2026-10-14 — Drag and drop is native HTML5 with the app's own MIME types** (`FILES_MIME` for songs, `ITEMS_MIME` for program items in `library/drag.ts`). It covers every drag in the app (library to playlists, holding and programs; reordering playlists and programs). _Rejected:_ dnd-kit, as the spec first planned (not needed, and native events also work for drops between panels).
- **2026-10-14 — The Program page has its own store (`createProgramStore`, `ProgramProvider`) beside the library store.** It holds the program list, the loaded program, its play log and the player state. It refetches on `programs:changed` and `library:changed` (labels can change), and takes every `player:state`; the first `player:getState` answer is ignored if a broadcast already arrived (it would be older). The library list, its search and its selection stay in the library store, shared by both pages. Main coalesces the many change notices of one action (a song start marks an item played and writes the log) into one broadcast.
- **2026-10-14 — The player bar is mounted once, above the page tabs (in `App`'s header).** The user wanted to control a preview started on the Music page without switching pages, and the `<audio>` element lives in the player bar, so on the Program page alone it was unmounted (cutting the music) on every page change. The header's height follows the bar (`useElementSize`) so a warning line doesn't overlap the page. _Rejected:_ the player bar on the Program page only.
- **2026-10-14 — The sidebar is one component per section** (`components/sidebar/`: `LibrarySection`, `PlaylistsSection`, `ProgramsSection`, plus `DropTarget`, `FilterEntry` and `SectionHeading`). `Sidebar.tsx` only composes them, so each section can grow without the file becoming unwieldy.
````

- [ ] **Step 2: Run everything**

Run: `npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: 399 tests pass; typecheck, formatting and build are clean.

- [ ] **Step 3: Manual check in the real app, on a copy of the library**

Never run this against the real library. Copy it into a separate data folder first:

```bash
mkdir -p /tmp/fdp-check
cp "$HOME/Library/Application Support/Folk Dance Player/folk-dance-player.sqlite" /tmp/fdp-check/
npm run build && FDP_USER_DATA=/tmp/fdp-check npm start
```

1. **Programs (sidebar):** `+` suggests today's date; create the program, and it loads. Search filters the list. "⋯" renames and duplicates it; delete the copy.
2. **Building:** drag songs from the library into the program, drop one onto an item (it goes before it), and use ➕ Add selected. Reorder by dragging. Add STOPs with "+ STOP" and "Insert STOP before". For a song with two dances, choose the other dance in its menu. Double-click an item: nothing happens.
3. **Holding:** drop songs on Holding, drag one into the program, and release one with ✕.
4. **Playing:**
   - Set the countdown in Settings to 3. Press ▶: "Starting in 3…", then the song plays. Seek with the bar, and use ◀◀.
   - Set auto-continue to 3 s. Let a short song end: "Next: … in 3…", then the next song plays.
   - At a STOP, playback halts and next up shows. ▶ resumes.
   - ⏭ skips at once.
5. **Speed:** 0.75× keeps the pitch. The next song is back at 1× unless 🔒 is on.
6. **Previews and replays:** double-click a library song (on both pages) and a holding song. Each plays marked "Preview", then playback halts with next up queued. Double-click a Previously played entry: "Replay".
7. **The player on every page:** start a preview on the Music page and pause it from the bar there. Change pages while a song plays: the music never stops.
8. **Missing file:** in the copy, rename one program song's file away, then load the program again. It shows ⚠, and at play time it is skipped with a warning while the next song plays. Rename the file back.
9. **Restart:** quit mid-song and start again. The program resumes at the next unplayed item, and nothing plays until ▶.

- [ ] **Step 4: Commit**

```bash
git add docs CHANGELOG.md AGENTS.md
git commit -m "docs: programs and playback in the spec, release notes and decision log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test` passes: 399 tests (307 from Plans 1–3, plus 92 new).
- `npm run typecheck`, `npx prettier --check .` and `npm run build` are clean.
- In the running app the player bar is on every page, and you can build and run a program: create, load, reorder, add STOPs, and choose the dance per item; play with auto-continue, the countdown and STOP halts; preview and replay; change the speed without changing the pitch; and hold songs. Missing files are flagged and skipped, and a restart resumes at the next unplayed item without playing.

---

## Changes after execution

The final whole-branch review found nothing Critical. Six findings were fixed on the branch, each with a test that failed first; the suite grew from 399 to 408.

- **Previewing a missing file during a countdown froze it.** Previews and replays now check the file before interrupting anything (`startNow`), so a missing file only warns.
- **⏹ then ▶ skipped the interrupted dance.** ⏹, a preview or a replay that cuts off a program song now puts it back as next up (`markUnplayed` in `programs.ts`, a new `SessionPorts.markUnplayed`). ⏭ still counts it as played. Two Task 4 tests were updated to expect the interrupted song back.
- **▶ did nothing, silently, when only missing songs were left.** `pick()` now always returns the skipped songs, and `advance()` and `advanceToStop()` warn about them.
- **Unticking auto-continue during the countdown didn't halt.** `finishCountdown()` re-reads the setting.
- **Clicking another program mid-song redirected auto-continue.** The Programs section asks first ("Load another program?").
- **A double-click on ▶ played and then paused.** The second click of a double-click is ignored on ▶ and ⏸.

**Deferred minors from the final review** (for later plans):
- With auto-continue off, a STOP at the head isn't marked played (matters for the projector, plan 5).
- Next up and the countdown can name a missing song that will be skipped.
- The playing song's label doesn't update after a dance edit.
- Program items whose file was deleted would break reordering (latent: nothing deletes files yet).
- A drag just as a song starts can fail with "The program changed".
- Two quick drops with no program loaded can create two programs.
- Speed and volume aren't validated (`Number.isFinite`) in main.
- `fdp-media` is served on the default session; restrict it before Canva content loads (plan 6).
- Errors from a program's Duplicate and Delete are swallowed.

**From the user's testing** (after the review fixes; the suite grew to 413):
- **⏹ keeps the song loaded.** A new `'stopped'` status rewinds the song to its start; ▶ plays it again as the same play (no new log entry), ⏭ moves on, and a second ⏹ does nothing. This replaces the review fix that put a ⏹-ed song back into the program. A preview or replay that interrupts a program song still puts it back as next up.
- **Drawn icons.** `components/icons.tsx` (play, pause, stop, restart, next) replaces ◀◀ ▶ ⏸ ⏹ ▶▶ in the player bar and the ⏸ on STOP rows; ⏸ and ⏹ rendered as blue emoji on macOS.
- **The whole Program panel is the drop zone**; dropping on an item still places songs before it.
- **An ✕ on each program item** (on hover) removes it at once; the "⋯" menu keeps the dance choice, Insert STOP before and Remove.- **Holding uses the program's drag and drop** (the user's request; the suite grew to 419): migration 003 adds `file_prefs.holding_position` (songs already held are numbered in title order); `setHolding(db, fileIds, held, beforeFileId?)` places songs before a held song or at the end and moves songs already held; `library:setHolding` takes the optional `beforeFileId`; the holding filter sorts by position; `HoldingPanel` has the panel-wide drop, the dashed outline and the insertion line. The migration 002 test now upgrades with the first two migrations only.

