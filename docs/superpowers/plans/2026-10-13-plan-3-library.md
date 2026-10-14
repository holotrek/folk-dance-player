# Folk Dance Player — Plan 3: Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers can browse, search and organize their imported library:
- **The Music page table:** browse, sort, search and multi-select, with a side editor for a song and all its dances.
- **Dances:** link, unlink, set the default, merge, and answer "same dance?" suggestions.
- **Labels and suggestions:** `Song | Dance (Choreographer)` labels, and autocomplete for teachers, choreographers, countries and dance types.
- **Playlists and Favorites:** in the sidebar, including drag and drop.
- **Mapping:** "Re-apply mapping to selected", plus Settings for the default import mapping and dance types.

**Architecture:**
- **Main process:** owns all library logic, as plain functions over `node:sqlite`: `list.ts`, `edit.ts`, `playlists.ts`, `mapping.ts`. They are exposed through ~25 typed IPC channels. Every edit runs, then main broadcasts a `library:changed` event, which is also sent after each import.
- **Renderer:** a Zustand store (`createLibraryStore`, provided by `LibraryProvider`) holds what's on screen: filter, search, sort, rows, playlists and selection. It refetches on `library:changed`. The sidebar, the virtualized table (`@tanstack/react-virtual`) and the song editor all read from it. Editing happens only in the side editor; the user chose this over inline cells.

**Tech Stack:** As Plans 1–2, plus `@tanstack/react-virtual` 3.14.13 and `zustand` 5.0.15 (runtime dependencies, bundled into the renderer).

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §4 (data model, "Labels", "Search"), §6.1 (sidebar) and §6.3 (Music page). Task 11 updates the spec with this plan's decisions.

This is plan 3 of 7. Plans 1–2 are merged. **Not in this plan:**
- the Program page, holding panel, programs in the sidebar, and double-click preview: Plan 4
- linking Canva slides and "Refresh slides": Plan 6

## Global Constraints

- **Everything in Plans 1–2 still applies:**
  - exact version pins, at least two weeks old
  - `node:sqlite` only
  - renderers reach main only through `window.api`
  - Mantine components with CSS Modules only
  - Prettier settings
  - CHANGELOG and AGENTS.md kept current
  - conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Schema changes are now new migrations.** Migration 001 is merged and users may have real data, so this plan adds `002-distinct-dances.ts` and never edits 001.
- **A dance shared with other songs is never changed from one song's tags.** This was already true for import (Plan 2), and now also holds for "Re-apply mapping".
- **Search-box text always goes through `toFtsQuery()`.** `listLibrary` does this.
- **Every library or playlist mutation goes through `libraryHandlers`' `edit()` wrapper,** so `library:changed` is broadcast. Never mutate without it.
- **Zustand selectors must return stable values** (state fields, not new arrays). Compute derived lists in handlers with `store.getState()`.
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.**

## Review Focus

These are the five failure modes most likely to bite an organizer. Each has a test in the task that owns it.

1. **Editing a dance shared by many songs:** the editor must say so ("Also used by N other songs"). "Re-apply mapping" must leave a shared dance alone and report it. Task 5: "skips a default dance shared with other songs…"; Task 10: "shows the song and each dance…".
2. **Merging two dances:** songs, teachers, song defaults, program items and play history must all move to the kept dance, and nothing may be lost when both dances are linked to the same song. Task 3: the `mergeDances` tests.
3. **Same-name suggestions:** "Same dance" removes the automatic duplicate only when no other song uses it. "Different dance" must stay answered, in both directions. Task 3: the same-name suggestion tests.
4. **Editing an Apple-imported playlist:** this must mark it edited, so a later re-import asks instead of overwriting. Task 4: "editing an imported Apple playlist marks it as edited".
5. **A field saved twice, or a stale list:** leaving a field must save once, and the table and editor must refresh after any change, including one made elsewhere. Task 10: "saves dance fields…" (one call each) and "refreshes when the library changes"; Task 7: "refreshes when the library changes…".

---

## File Structure

```
src/main/db/migrations/002-distinct-dances.ts   "Different dance" pairs
src/main/db/transaction.ts            inTransaction(db, fn) — composable
src/shared/labels.ts                  labelParts(), formatLabel() — spec §4 Labels
src/shared/library.ts                 LibraryQuery/Row, SongDetail, SongDance, patches, suggestions, playlists
src/main/library/list.ts              listLibrary() + shownPairingSql()/choreographerCountSql()
src/main/library/edit.ts              song detail, edits, link/unlink/create, merge, same-name, searchDances
src/main/library/playlists.ts         playlist CRUD, add/remove/reorder, setFavorite
src/main/library/mapping.ts           reapplyMapping(), getSuggestions()
src/main/ipc/library-handlers.ts      library:* and playlists:* handlers (edits announce library:changed)
src/shared/contract.ts (modify)       new channels + 'library:changed' event
src/main/ipc/handlers.ts (modify)     onLibraryChanged dep, spreads libraryHandlers
src/main/index.ts (modify)            broadcast(); library:changed after edits and imports
src/renderer/src/library/             library-store, LibraryProvider, drag, reorder, LibraryTable(+css),
                                      fields, DancePicker, SongEditor
src/renderer/src/components/          NamePrompt, ConfirmDialog, Sidebar (+css, modify)
src/renderer/src/pages/               MusicPage (+css, modify), SettingsPage (modify)
tests/shared/labels.test.ts, tests/main/library/*.test.ts, tests/main/db/migration-002.test.ts,
tests/main/ipc/library-handlers.test.ts, tests/renderer/library/*.test.ts(x)
tests/renderer/test-theme.ts          jsdom-friendly Mantine theme (hideDetached off)
tests/renderer/library/render-library.tsx   renderWithLibrary()
```

---

### Task 1: Dependencies, migration 002 and labels

**Files:**
- Modify: `package.json` (dependencies), `src/main/db/migrations/index.ts`
- Create: `src/main/db/migrations/002-distinct-dances.ts`, `src/shared/labels.ts`
- Test: `tests/shared/labels.test.ts`, `tests/main/db/migration-002.test.ts`

**Interfaces:**
- Produces:
  - **Migration 2:** table `distinct_dances (dance_a, dance_b)`, with `dance_a < dance_b`, cascading on dance delete. `MIGRATIONS` becomes `[initial, distinctDances]`.
  - **Labels:** `labelParts({ songTitle, danceName, choreographer, choreographerCount }): { song: string | null; dance: string; choreographer: string | null }` and `formatLabel(parts): string`, which produces `Song | Dance (Choreographer)`.
    - The song part is omitted when it matches the dance name, ignoring case and surrounding spaces.
    - The choreographer is shown only when `choreographerCount > 1` and it is non-empty.
    - A missing dance gives the song title.

- [ ] **Step 1: Add the dependencies**

```bash
npm install --save-exact @tanstack/react-virtual@3.14.13 zustand@5.0.15
```

Expected: both appear in `dependencies` with exact versions; `npm test` still passes (203).

- [ ] **Step 2: Write the failing tests**

`tests/shared/labels.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { formatLabel, labelParts } from '@shared/labels'

// Spec §4 "Labels".
describe('labelParts / formatLabel', () => {
  test.each([
    ['Hora de la Munte', 'Hora Mare', null, 0, 'Hora de la Munte | Hora Mare'],
    ['Svornato', 'Svornato', 'Jaap Leegwater', 2, 'Svornato (Jaap Leegwater)'],
    [
      'Pusteno Ludo',
      'Pravo Rhodopsko Oro',
      'Yves Moreau',
      2,
      'Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)'
    ],
    ['Hora Fetelor', 'Hora Fetelor', 'Someone', 1, 'Hora Fetelor']
  ])('%s / %s / %s (%i choreographers) → %s', (song, dance, choreographer, count, label) => {
    expect(
      formatLabel(
        labelParts({
          songTitle: song,
          danceName: dance,
          choreographer,
          choreographerCount: count
        })
      )
    ).toBe(label)
  })

  test('treats song and dance names that differ only in case or spacing as the same', () => {
    expect(
      labelParts({
        songTitle: ' hora fetelor ',
        danceName: 'Hora Fetelor',
        choreographer: null,
        choreographerCount: 0
      })
    ).toEqual({ song: null, dance: 'Hora Fetelor', choreographer: null })
  })

  test('never shows empty parentheses for a traditional dance', () => {
    expect(
      formatLabel(
        labelParts({
          songTitle: 'Svornato',
          danceName: 'Svornato',
          choreographer: null,
          choreographerCount: 3
        })
      )
    ).toBe('Svornato')
  })

  test('a song with no dance is labelled by its title', () => {
    expect(
      labelParts({
        songTitle: 'Untitled',
        danceName: null,
        choreographer: null,
        choreographerCount: 0
      })
    ).toEqual({ song: null, dance: 'Untitled', choreographer: null })
  })
})
```

`tests/main/db/migration-002.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

describe('migration 002: distinct dances', () => {
  test('a library already at schema 1 is upgraded without losing data', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 1))
    const d = addDance(db, { name: 'Svornato' })
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 1, to: 2 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(db.prepare('SELECT name FROM dances WHERE id = ?').get(d)).toEqual({ name: 'Svornato' })
  })

  test('records a pair of dances the user said are different, once, in a fixed order', () => {
    const db = createTestDb()
    const a = addDance(db, { name: 'Svornato' })
    const b = addDance(db, { name: 'Svornato' })
    const add = db.prepare('INSERT INTO distinct_dances (dance_a, dance_b) VALUES (?, ?)')
    add.run(a, b)
    expect(() => add.run(a, b)).toThrow(/UNIQUE|PRIMARY/)
    expect(() => add.run(b, a)).toThrow(/CHECK/)
    db.prepare('DELETE FROM dances WHERE id = ?').run(a)
    expect(db.prepare('SELECT COUNT(*) n FROM distinct_dances').get()).toEqual({ n: 0 })
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/shared tests/main/db/migration-002.test.ts`
Expected: FAIL. `@shared/labels` can't be resolved, `migrate` returns `{ from: 1, to: 1 }`, and the second migration test fails with `no such table: distinct_dances`.

- [ ] **Step 4: Implement**

`src/main/db/migrations/002-distinct-dances.ts`:

```ts
import type { Migration } from '../migrate'

// Pairs of same-named dances the user confirmed are different ("Different dance" on a same-name
// suggestion, spec §6.3), so the suggestion isn't shown again. Stored once per pair, smaller id first.
export const distinctDances: Migration = {
  version: 2,
  name: 'distinct-dances',
  sql: `
    CREATE TABLE distinct_dances (
      dance_a INTEGER NOT NULL REFERENCES dances (id) ON DELETE CASCADE,
      dance_b INTEGER NOT NULL REFERENCES dances (id) ON DELETE CASCADE,
      PRIMARY KEY (dance_a, dance_b),
      CHECK (dance_a < dance_b)
    );
    CREATE INDEX distinct_dances_b ON distinct_dances (dance_b);
  `
}
```

Replace `src/main/db/migrations/index.ts` with:

```ts
import type { Migration } from '../migrate'
import { initial } from './001-initial'
import { distinctDances } from './002-distinct-dances'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial, distinctDances]
```

`src/shared/labels.ts`:

```ts
// Spec §4 "Labels": how a song and the dance shown for it are named everywhere.

export interface LabelInput {
  songTitle: string
  danceName: string | null
  choreographer: string | null
  // How many different choreographers the song's linked dances have.
  choreographerCount: number
}

export interface LabelParts {
  song: string | null // omitted when it's the same as the dance name
  dance: string
  choreographer: string | null // only when needed to tell the song's dances apart
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export function labelParts(input: LabelInput): LabelParts {
  const songTitle = input.songTitle.trim()
  const dance = input.danceName?.trim()
  if (!dance) return { song: null, dance: songTitle, choreographer: null }
  return {
    song: same(songTitle, dance) ? null : songTitle,
    dance,
    choreographer:
      input.choreographerCount > 1 && input.choreographer?.trim()
        ? input.choreographer.trim()
        : null
  }
}

// The one-line form used in the control window: "Song | Dance (Choreographer)".
export function formatLabel(parts: LabelParts): string {
  const main = parts.song ? `${parts.song} | ${parts.dance}` : parts.dance
  return parts.choreographer ? `${main} (${parts.choreographer})` : main
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/shared tests/main/db && npm test && npm run typecheck && npx prettier --check .`
Expected:
- `tests/shared` + `tests/main/db`: 75 pass.
- The whole suite: 212.
- Typecheck and formatting are clean.

```bash
git add package.json package-lock.json src/main/db/migrations src/shared/labels.ts tests/shared tests/main/db/migration-002.test.ts
git commit -m "feat(library): song/dance labels and migration 002 for distinct dances

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Listing the library

**Files:**
- Create: `src/shared/library.ts`, `src/main/library/list.ts`
- Modify: `tests/main/helpers/library-fixtures.ts` (adds `addLibrarySong`, `setDefaultDance`)
- Test: `tests/main/library/list.test.ts`

**Interfaces:**
- Consumes: `labelParts`/`formatLabel` (Task 1), `toFtsQuery` (Plan 1), `library_fts` (Plan 2).
- Produces:
  - **`@shared/library`:** every library type used by later tasks: `LibraryFilter`, `SortColumn`, `LibrarySort`, `LibraryQuery`, `LibraryRow`, `SongDance`, `SameNameSuggestion`, `SongDetail`, `SongPatch`, `DancePatch`, `DanceSearchResult`, `PlaylistSummary`, `Suggestions`, `ReapplyResult`.
  - **`list.ts`:**
    - `listLibrary(db, query): LibraryRow[]`
    - `shownPairingSql(songIdExpr)`: the default pairing if still linked, else the earliest link
    - `choreographerCountSql(songIdExpr)`
  - **Fixtures:**
    - `addLibrarySong(db, { title, path?, artist?, durationMs?, dance?: { name, country?, choreographer?, teacher? } })` returns `{ fileId, songId, danceId }`
    - `setDefaultDance(db, songId, danceId)`

**Query notes:**
- **Search:** uses `library_fts MATCH toFtsQuery(search)`; a blank search lists everything.
- **Filters:** Favorites joins `file_prefs`. A playlist joins `playlist_items` and returns `playlistItemId`.
- **Sorting:** empty values sort last in both directions, with title as the tie-breaker. `position` outside a playlist falls back to title.

- [ ] **Step 1: Write the shared types and the fixtures**

`src/shared/library.ts`:

```ts
// Types for the library (Music page, sidebar) shared by main and renderer. Spec §4, §6.

export type LibraryFilter =
  { kind: 'all' } | { kind: 'favorites' } | { kind: 'playlist'; playlistId: number }

export type SortColumn =
  | 'title'
  | 'dance'
  | 'country'
  | 'teacher'
  | 'choreographer'
  | 'danceType'
  | 'difficulty'
  | 'duration'
  | 'position' // playlist order; only meaningful with a playlist filter

export interface LibrarySort {
  column: SortColumn
  direction: 'asc' | 'desc'
}

export interface LibraryQuery {
  search: string
  filter: LibraryFilter
  sort: LibrarySort
}

// One song as the table shows it: with its default dance (spec §4) and that pairing's teacher.
export interface LibraryRow {
  fileId: number
  songId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: boolean
  isFavorite: boolean
  danceId: number | null
  danceName: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
  danceType: string | null
  difficulty: number | null
  danceCount: number
  label: string
  playlistItemId: number | null // set when listing a playlist
}

// A dance linked to a song, as the side editor shows it (spec §6.3).
export interface SongDance {
  danceId: number
  pairingId: number
  name: string
  country: string | null
  choreographer: string | null
  danceType: string | null
  difficulty: number | null
  notes: string | null
  teacher: string | null // on this dance–song pairing
  songCount: number // songs this dance is linked to ("also used by N songs")
  isDefault: boolean
  label: string
}

// "Another dance called X exists — same dance?" (spec §6.3)
export interface SameNameSuggestion {
  forDanceId: number
  candidate: {
    danceId: number
    name: string
    choreographer: string | null
    country: string | null
    songTitles: string[]
  }
}

export interface SongDetail {
  songId: number
  fileId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: boolean
  isFavorite: boolean
  dances: SongDance[]
  suggestions: SameNameSuggestion[]
}

export interface SongPatch {
  title?: string
  artist?: string | null
}

export interface DancePatch {
  name?: string
  country?: string | null
  choreographer?: string | null
  danceType?: string | null
  difficulty?: number | null
  notes?: string | null
}

// A dance offered by "Link an existing dance…".
export interface DanceSearchResult {
  danceId: number
  name: string
  choreographer: string | null
  country: string | null
  songCount: number
}

export interface PlaylistSummary {
  id: number
  name: string
  source: 'local' | 'apple_xml'
  itemCount: number
}

// Autocomplete lists (spec §4): teachers and choreographers share one list.
export interface Suggestions {
  people: string[]
  countries: string[]
  danceTypes: string[]
}

export interface ReapplyResult {
  songs: number
  skippedSharedDances: number // dances used by other songs too, left unchanged
}
```

Replace `tests/main/helpers/library-fixtures.ts` with:

```ts
import type { DatabaseSync } from 'node:sqlite'

// Builders for songs, dances and pairings in schema and search tests.

export function addFile(db: DatabaseSync, path = '/music/a.mp3'): number {
  return Number(
    db
      .prepare("INSERT INTO files (path, file_size, mtime_ms, source) VALUES (?, 1, 1, 'files')")
      .run(path).lastInsertRowid
  )
}

export function addSong(
  db: DatabaseSync,
  fileId: number,
  song: { title: string; artist?: string | null }
): number {
  return Number(
    db
      .prepare('INSERT INTO songs (file_id, uuid, title, artist) VALUES (?, ?, ?, ?)')
      .run(fileId, crypto.randomUUID(), song.title, song.artist ?? null).lastInsertRowid
  )
}

export function addDance(
  db: DatabaseSync,
  dance: { name: string; country?: string | null; choreographer?: string | null }
): number {
  return Number(
    db
      .prepare('INSERT INTO dances (uuid, name, country, choreographer) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), dance.name, dance.country ?? null, dance.choreographer ?? null)
      .lastInsertRowid
  )
}

// Links a dance to a song; returns the dance_songs id.
export function link(db: DatabaseSync, danceId: number, songId: number, teacher?: string): number {
  const id = Number(
    db.prepare('INSERT INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(danceId, songId)
      .lastInsertRowid
  )
  if (teacher) {
    db.prepare('INSERT INTO dance_song_prefs (dance_song_id, teacher) VALUES (?, ?)').run(
      id,
      teacher
    )
  }
  return id
}

// Titles of the songs matching an FTS5 query, in title order.
export function searchSongs(db: DatabaseSync, query: string): string[] {
  return db
    .prepare(
      `SELECT s.title FROM library_fts JOIN songs s ON s.id = library_fts.rowid
       WHERE library_fts MATCH ? ORDER BY s.title`
    )
    .all(query)
    .map((r) => r.title as string)
}

export interface SongView {
  title: string
  artist: string | null
  dance: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
}

// A file's song as the library shows it: with its default dance and that pairing's teacher.
export function songView(db: DatabaseSync, fileId: number): SongView {
  return db
    .prepare(
      `SELECT s.title, s.artist, d.name AS dance, d.country, d.choreographer, p.teacher
       FROM songs s
       LEFT JOIN song_prefs sp ON sp.song_id = s.id
       LEFT JOIN dances d ON d.id = sp.default_dance_id
       LEFT JOIN dance_songs ds ON ds.song_id = s.id AND ds.dance_id = d.id
       LEFT JOIN dance_song_prefs p ON p.dance_song_id = ds.id
       WHERE s.file_id = ?`
    )
    .get(fileId) as unknown as SongView
}

export interface LibrarySongSpec {
  title: string
  path?: string
  artist?: string
  durationMs?: number
  dance?: { name: string; country?: string; choreographer?: string; teacher?: string }
}

// A file + song + (optionally) one dance linked to it as the song's default, as an import makes.
export function addLibrarySong(
  db: DatabaseSync,
  spec: LibrarySongSpec
): { fileId: number; songId: number; danceId: number | null } {
  const fileId = addFile(db, spec.path ?? `/music/${spec.title}.mp3`)
  if (spec.durationMs !== undefined) {
    db.prepare('UPDATE files SET duration_ms = ? WHERE id = ?').run(spec.durationMs, fileId)
  }
  const songId = addSong(db, fileId, { title: spec.title, artist: spec.artist })
  if (!spec.dance) return { fileId, songId, danceId: null }
  const danceId = addDance(db, spec.dance)
  link(db, danceId, songId, spec.dance.teacher)
  setDefaultDance(db, songId, danceId)
  return { fileId, songId, danceId }
}

export function setDefaultDance(db: DatabaseSync, songId: number, danceId: number): void {
  db.prepare(
    `INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)
     ON CONFLICT (song_id) DO UPDATE SET default_dance_id = excluded.default_dance_id`
  ).run(songId, danceId)
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/library/list.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { LibraryQuery } from '@shared/library'
import { listLibrary } from '../../../src/main/library/list'
import { addDance, addLibrarySong, link, setDefaultDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

const all: LibraryQuery = {
  search: '',
  filter: { kind: 'all' },
  sort: { column: 'title', direction: 'asc' }
}
const titles = (q: Partial<LibraryQuery> = {}): string[] =>
  listLibrary(db, { ...all, ...q }).map((r) => r.title)

beforeEach(() => {
  db = createTestDb()
})

describe('listLibrary', () => {
  test('lists each song with its default dance, that pairing’s teacher and a label', () => {
    const { fileId, songId, danceId } = addLibrarySong(db, {
      title: 'Hora de la Munte',
      artist: 'Taraf',
      durationMs: 183_000,
      dance: { name: 'Hora Mare', country: 'Romania', teacher: 'Sonia Dion' }
    })
    expect(listLibrary(db, all)).toEqual([
      {
        fileId,
        songId,
        title: 'Hora de la Munte',
        artist: 'Taraf',
        path: '/music/Hora de la Munte.mp3',
        durationMs: 183_000,
        isMissing: false,
        isFavorite: false,
        danceId,
        danceName: 'Hora Mare',
        country: 'Romania',
        choreographer: null,
        teacher: 'Sonia Dion',
        danceType: null,
        difficulty: null,
        danceCount: 1,
        label: 'Hora de la Munte | Hora Mare',
        playlistItemId: null
      }
    ])
  })

  test('shows the default dance of a song with several, and the choreographer to tell them apart', () => {
    const { songId } = addLibrarySong(db, {
      title: 'Svornato',
      dance: { name: 'Svornato', choreographer: 'Jaap Leegwater' }
    })
    link(db, addDance(db, { name: 'Svornato', choreographer: 'Someone Else' }), songId)
    const [row] = listLibrary(db, all)
    expect(row).toMatchObject({ danceCount: 2, choreographer: 'Jaap Leegwater' })
    expect(row.label).toBe('Svornato (Jaap Leegwater)')
  })

  test('falls back to the earliest-linked dance when the default is no longer linked', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora Mare' } })
    const other = addDance(db, { name: 'Sârba', country: 'Romania' })
    link(db, other, songId)
    db.prepare('DELETE FROM dance_songs WHERE dance_id = ?').run(danceId)
    expect(listLibrary(db, all)[0]).toMatchObject({
      danceId: other,
      danceName: 'Sârba',
      danceCount: 1
    })
  })

  test('labels a song with no dance by its title', () => {
    addLibrarySong(db, { title: 'Untitled Tune' })
    expect(listLibrary(db, all)[0]).toMatchObject({
      danceId: null,
      danceCount: 0,
      label: 'Untitled Tune'
    })
  })

  test('searches song, dance, teacher, choreographer and country, ignoring accents', () => {
    addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo Rhodopsko Oro', country: 'Bulgaria', choreographer: 'Yves Moreau' }
    })
    addLibrarySong(db, {
      title: 'Ali Paşa',
      dance: { name: 'Ali Paşa', country: 'Turkey', teacher: 'Bora Özkök' }
    })
    expect(titles({ search: 'rhodopsko' })).toEqual(['Pusteno Ludo'])
    expect(titles({ search: 'moreau' })).toEqual(['Pusteno Ludo'])
    expect(titles({ search: 'ozkok' })).toEqual(['Ali Paşa'])
    expect(titles({ search: 'pasa turk' })).toEqual(['Ali Paşa'])
    expect(titles({ search: '  ' })).toEqual(['Ali Paşa', 'Pusteno Ludo'])
    expect(titles({ search: '"4-Wall' })).toEqual([])
  })

  test('filters to favorites', () => {
    const { fileId } = addLibrarySong(db, { title: 'Hora' })
    addLibrarySong(db, { title: 'Kolo' })
    db.prepare('INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, 1)').run(fileId)
    expect(titles({ filter: { kind: 'favorites' } })).toEqual(['Hora'])
    expect(listLibrary(db, all).find((r) => r.title === 'Hora')?.isFavorite).toBe(true)
  })

  test('lists a playlist in its own order, with each item’s id', () => {
    const a = addLibrarySong(db, { title: 'A' })
    const b = addLibrarySong(db, { title: 'B' })
    const p = Number(
      db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
        .lastInsertRowid
    )
    const add = db.prepare(
      'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
    )
    const itemB = Number(add.run(p, 1, b.fileId).lastInsertRowid)
    add.run(p, 2, a.fileId)
    const rows = listLibrary(db, {
      ...all,
      filter: { kind: 'playlist', playlistId: p },
      sort: { column: 'position', direction: 'asc' }
    })
    expect(rows.map((r) => r.title)).toEqual(['B', 'A'])
    expect(rows[0].playlistItemId).toBe(itemB)
  })

  test('sorts by a column in either direction, keeping empty values last', () => {
    addLibrarySong(db, { title: 'A', dance: { name: 'A', country: 'Serbia' } })
    addLibrarySong(db, { title: 'B', dance: { name: 'B', country: 'bulgaria' } })
    addLibrarySong(db, { title: 'C', dance: { name: 'C' } })
    expect(titles({ sort: { column: 'country', direction: 'asc' } })).toEqual(['B', 'A', 'C'])
    expect(titles({ sort: { column: 'country', direction: 'desc' } })).toEqual(['A', 'B', 'C'])
  })

  test('sorts by duration numerically', () => {
    addLibrarySong(db, { title: 'Long', durationMs: 300_000 })
    addLibrarySong(db, { title: 'Short', durationMs: 90_000 })
    expect(titles({ sort: { column: 'duration', direction: 'asc' } })).toEqual(['Short', 'Long'])
  })

  test('flags missing files', () => {
    const { fileId } = addLibrarySong(db, { title: 'Gone' })
    db.prepare('UPDATE files SET is_missing = 1 WHERE id = ?').run(fileId)
    expect(listLibrary(db, all)[0].isMissing).toBe(true)
  })

  test('uses the song’s own default even when another dance was linked first', () => {
    const { songId } = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    const pravo = addDance(db, { name: 'Pravo Rhodopsko Oro' })
    link(db, pravo, songId)
    setDefaultDance(db, songId, pravo)
    expect(listLibrary(db, all)[0].danceName).toBe('Pravo Rhodopsko Oro')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/library/list.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/library/list'`.

- [ ] **Step 4: Implement**

`src/main/library/list.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { formatLabel, labelParts } from '@shared/labels'
import type { LibraryQuery, LibraryRow, SortColumn } from '@shared/library'
import { toFtsQuery } from '../db/fts'

// The pairing a song is shown with (spec §4): its default dance if still linked, else its
// earliest-linked dance. `songId` is a SQL expression for the song's id.
export const shownPairingSql = (songId: string): string => `COALESCE(
  (SELECT ds.id FROM dance_songs ds JOIN song_prefs sp
     ON sp.song_id = ds.song_id AND sp.default_dance_id = ds.dance_id
   WHERE ds.song_id = ${songId}),
  (SELECT ds.id FROM dance_songs ds WHERE ds.song_id = ${songId} ORDER BY ds.id LIMIT 1))`

// How many different (non-empty) choreographers a song's dances have; drives the label.
export const choreographerCountSql = (songId: string): string => `(
  SELECT COUNT(DISTINCT trim(d2.choreographer)) FROM dance_songs x JOIN dances d2 ON d2.id = x.dance_id
  WHERE x.song_id = ${songId} AND trim(COALESCE(d2.choreographer, '')) <> '')`

const SORT_SQL: Record<SortColumn, string> = {
  title: 's.title COLLATE NOCASE',
  dance: 'd.name COLLATE NOCASE',
  country: 'd.country COLLATE NOCASE',
  teacher: 'dsp.teacher COLLATE NOCASE',
  choreographer: 'd.choreographer COLLATE NOCASE',
  danceType: 'd.dance_type COLLATE NOCASE',
  difficulty: 'dp.difficulty',
  duration: 'f.duration_ms',
  position: 'pi.position'
}

interface Row {
  fileId: number
  songId: number
  title: string
  artist: string | null
  path: string
  durationMs: number | null
  isMissing: number
  isFavorite: number
  danceId: number | null
  danceName: string | null
  country: string | null
  choreographer: string | null
  teacher: string | null
  danceType: string | null
  difficulty: number | null
  danceCount: number
  choreographerCount: number
  playlistItemId: number | null
}

// The Music page's rows (spec §6.3): search, sidebar filter and sort are all done here.
export function listLibrary(db: DatabaseSync, query: LibraryQuery): LibraryRow[] {
  const where: string[] = []
  const params: (string | number)[] = []
  const fts = toFtsQuery(query.search)
  if (fts) {
    where.push('s.id IN (SELECT rowid FROM library_fts WHERE library_fts MATCH ?)')
    params.push(fts)
  }
  if (query.filter.kind === 'favorites') where.push('fp.is_favorite = 1')

  const playlistId = query.filter.kind === 'playlist' ? query.filter.playlistId : null
  const playlist = playlistId !== null
  const playlistJoin = playlist
    ? 'JOIN playlist_items pi ON pi.file_id = f.id AND pi.playlist_id = ?'
    : ''
  if (playlistId !== null) params.unshift(playlistId)
  // Sorting by playlist position outside a playlist falls back to title.
  const sortExpr =
    query.sort.column === 'position' && !playlist ? SORT_SQL.title : SORT_SQL[query.sort.column]
  const direction = query.sort.direction === 'desc' ? 'DESC' : 'ASC'

  const rows = db
    .prepare(
      `SELECT f.id AS fileId, s.id AS songId, s.title, s.artist, f.path, f.duration_ms AS durationMs,
         f.is_missing AS isMissing, COALESCE(fp.is_favorite, 0) AS isFavorite,
         d.id AS danceId, d.name AS danceName, d.country, d.choreographer, dsp.teacher,
         d.dance_type AS danceType, dp.difficulty,
         (SELECT COUNT(*) FROM dance_songs c WHERE c.song_id = s.id) AS danceCount,
         ${choreographerCountSql('s.id')} AS choreographerCount,
         ${playlist ? 'pi.id' : 'NULL'} AS playlistItemId
       FROM songs s
       JOIN files f ON f.id = s.file_id
       ${playlistJoin}
       LEFT JOIN file_prefs fp ON fp.file_id = f.id
       LEFT JOIN dance_songs p ON p.id = ${shownPairingSql('s.id')}
       LEFT JOIN dances d ON d.id = p.dance_id
       LEFT JOIN dance_prefs dp ON dp.dance_id = d.id
       LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = p.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY (${sortExpr}) IS NULL OR (${sortExpr}) = '', ${sortExpr} ${direction},
         s.title COLLATE NOCASE, s.id`
    )
    .all(...params) as unknown as Row[]

  return rows.map(({ choreographerCount, isMissing, isFavorite, ...r }) => ({
    ...r,
    isMissing: isMissing === 1,
    isFavorite: isFavorite === 1,
    label: formatLabel(
      labelParts({
        songTitle: r.title,
        danceName: r.danceName,
        choreographer: r.choreographer,
        choreographerCount
      })
    )
  }))
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/library && npm test && npm run typecheck && npx prettier --check .`
Expected: 11 pass, the suite passes (223), and typecheck and formatting are clean.

```bash
git add src/shared/library.ts src/main/library/list.ts tests/main/helpers/library-fixtures.ts tests/main/library/list.test.ts
git commit -m "feat(library): list songs with their default dance, search, filters and sorting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Editing songs and dances

**Files:**
- Create: `src/main/db/transaction.ts`, `src/main/library/edit.ts`
- Test: `tests/main/library/edit.test.ts`

**Interfaces:**
- Consumes: Task 2 types and `shownPairingSql`; `foldSearchText` (Plan 1).
- Produces:
  - **`inTransaction(db, fn)`:** joins an already-open transaction, so operations compose.
  - **`edit.ts`:**
    - `class LibraryEditError`
    - `getSongDetail(db, songId): SongDetail | null`, with the default dance first, `songCount` per dance, and labels
    - `updateSong(db, songId, SongPatch)` (a title is required)
    - `updateDance(db, danceId, DancePatch)` (a name is required; difficulty 1–5 or null; facts go to `dances`, difficulty and notes to `dance_prefs`)
    - `setTeacher(db, pairingId, teacher | null)`
    - `setDefaultDance(db, songId, danceId | null)` (the dance must be linked)
    - `linkDance(db, songId, danceId)`
    - `createDance(db, songId, name): number`
    - `unlinkDance(db, songId, danceId)` (keeps the dance; the default falls back to the earliest remaining dance)
    - `mergeDances(db, keepId, removeId)`
    - `sameDance(db, songId, ownId, otherId)`
    - `markDifferentDances(db, a, b)`
    - `searchDances(db, text, limit = 50): DanceSearchResult[]` (case-, accent- and letter-folding, every word must match)
  - **A song's first dance always becomes its default.**

**Merge rules:**
- **Links move one by one** (delete and re-insert, so the search triggers fire). A teacher is copied when the kept pairing has none.
- **References move:** `song_prefs.default_dance_id`, `program_items.dance_id` and `play_log.dance_id` move to the kept dance.
- **Empty fields are filled:** the kept dance's empty `country`, `choreographer` and `dance_type`, and its empty `dance_prefs` fields, are filled from the removed dance.
- **Then the removed dance is deleted.**

**"Same dance":**
- If no other song uses the song's own dance, it is merged into the other dance.
- Otherwise the other dance is just linked.
- Either way, it becomes the default.

- [ ] **Step 1: Write the failing tests**

`tests/main/library/edit.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  createDance,
  getSongDetail,
  linkDance,
  LibraryEditError,
  markDifferentDances,
  mergeDances,
  sameDance,
  searchDances,
  setDefaultDance,
  setTeacher,
  unlinkDance,
  updateDance,
  updateSong
} from '../../../src/main/library/edit'
import { addDance, addLibrarySong, link, searchSongs } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { toFtsQuery } from '../../../src/main/db/fts'

let db: DatabaseSync

const detail = (songId: number) => getSongDetail(db, songId)!
const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

beforeEach(() => {
  db = createTestDb()
})

describe('getSongDetail', () => {
  test('returns the song with every linked dance, default first', () => {
    const { songId, danceId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: {
        name: 'Pravo Rhodopsko Oro',
        country: 'Bulgaria',
        choreographer: 'Yves Moreau',
        teacher: 'Sonia'
      }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto', choreographer: 'Someone' })
    link(db, lesnoto, songId)
    const d = detail(songId)
    expect(d).toMatchObject({ songId, title: 'Pusteno Ludo', isFavorite: false, suggestions: [] })
    expect(d.dances.map((x) => [x.danceId, x.isDefault, x.teacher, x.label])).toEqual([
      [danceId, true, 'Sonia', 'Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)'],
      [lesnoto, false, null, 'Pusteno Ludo | Lesnoto (Someone)']
    ])
  })

  test('counts how many songs share each dance', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto 1', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, { title: 'Lesnoto 2' })
    link(db, a.danceId!, b.songId)
    expect(detail(a.songId).dances[0].songCount).toBe(2)
  })

  test('returns null for an unknown song', () => {
    expect(getSongDetail(db, 999)).toBeNull()
  })
})

describe('editing', () => {
  test('updates the song; a title is required', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora' })
    updateSong(db, songId, { title: '  Hora Veche ', artist: 'Taraf' })
    expect(detail(songId)).toMatchObject({ title: 'Hora Veche', artist: 'Taraf' })
    expect(() => updateSong(db, songId, { title: '  ' })).toThrow(LibraryEditError)
  })

  test('updates dance facts and personal fields, and keeps search current', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    updateDance(db, danceId!, {
      name: 'Hora Mare',
      country: 'Romania',
      choreographer: '',
      danceType: 'Open Circle',
      difficulty: 3,
      notes: 'W, 2 figures'
    })
    expect(detail(songId).dances[0]).toMatchObject({
      name: 'Hora Mare',
      country: 'Romania',
      choreographer: null,
      danceType: 'Open Circle',
      difficulty: 3,
      notes: 'W, 2 figures'
    })
    expect(searchSongs(db, toFtsQuery('romania')!)).toEqual(['Hora'])
  })

  test('rejects a blank dance name and an out-of-range difficulty', () => {
    const { danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(() => updateDance(db, danceId!, { name: ' ' })).toThrow(LibraryEditError)
    expect(() => updateDance(db, danceId!, { difficulty: 6 })).toThrow(LibraryEditError)
  })

  test('sets and clears the teacher on a pairing', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const pairingId = detail(songId).dances[0].pairingId
    setTeacher(db, pairingId, ' Sonia Dion ')
    expect(detail(songId).dances[0].teacher).toBe('Sonia Dion')
    setTeacher(db, pairingId, '')
    expect(detail(songId).dances[0].teacher).toBeNull()
  })

  test('sets the default dance, which must be linked', () => {
    const { songId } = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    const pravo = addDance(db, { name: 'Pravo Rhodopsko Oro' })
    expect(() => setDefaultDance(db, songId, pravo)).toThrow(LibraryEditError)
    link(db, pravo, songId)
    setDefaultDance(db, songId, pravo)
    expect(detail(songId).dances[0]).toMatchObject({ danceId: pravo, isDefault: true })
  })
})

describe('linking', () => {
  test('links an existing dance (once) and creates a new one', () => {
    const { songId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo Rhodopsko Oro' }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    linkDance(db, songId, lesnoto)
    linkDance(db, songId, lesnoto)
    const created = createDance(db, songId, 'Pravo Horo')
    expect(detail(songId).dances.map((d) => d.name)).toEqual([
      'Pravo Rhodopsko Oro',
      'Lesnoto',
      'Pravo Horo'
    ])
    expect(detail(songId).dances.find((d) => d.danceId === created)?.isDefault).toBe(false)
  })

  test('a song’s first dance becomes its default', () => {
    const { songId } = addLibrarySong(db, { title: 'Tune' })
    const id = createDance(db, songId, 'Lesnoto')
    expect(detail(songId).dances[0]).toMatchObject({ danceId: id, isDefault: true })
  })

  test('unlinking the default moves the default to the earliest remaining dance and keeps the dance', () => {
    const { songId, danceId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo' }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    linkDance(db, songId, lesnoto)
    unlinkDance(db, songId, danceId!)
    expect(detail(songId).dances).toMatchObject([{ danceId: lesnoto, isDefault: true }])
    expect(db.prepare('SELECT COUNT(*) n FROM dances WHERE id = ?').get(danceId)).toEqual({ n: 1 })
  })
})

describe('mergeDances', () => {
  test('moves songs, teachers, defaults and history to the kept dance and fills its empty fields', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto A', dance: { name: 'Lesnoto', teacher: 'T1' } })
    const b = addLibrarySong(db, {
      title: 'Lesnoto B',
      dance: { name: 'Lesnoto', country: 'Macedonia', teacher: 'T2' }
    })
    db.prepare("INSERT INTO dance_prefs (dance_id, notes) VALUES (?, 'basic 3-measure')").run(
      b.danceId
    )
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('x')").run().lastInsertRowid)
    db.prepare(
      "INSERT INTO program_items (program_id, position, kind, file_id, dance_id) VALUES (?, 1, 'track', ?, ?)"
    ).run(p, b.fileId, b.danceId)
    db.prepare("INSERT INTO play_log (file_id, dance_id, kind) VALUES (?, ?, 'preview')").run(
      b.fileId,
      b.danceId
    )

    mergeDances(db, a.danceId!, b.danceId!)

    expect(count('dances')).toBe(1)
    expect(detail(b.songId).dances).toMatchObject([
      {
        danceId: a.danceId,
        isDefault: true,
        teacher: 'T2',
        country: 'Macedonia',
        notes: 'basic 3-measure',
        songCount: 2
      }
    ])
    expect(detail(a.songId).dances[0].teacher).toBe('T1')
    expect(db.prepare('SELECT dance_id FROM program_items').get()).toEqual({ dance_id: a.danceId })
    expect(db.prepare('SELECT dance_id FROM play_log').get()).toEqual({ dance_id: a.danceId })
    expect(searchSongs(db, toFtsQuery('macedonia')!)).toEqual(['Lesnoto A', 'Lesnoto B'])
  })

  test('a song linked to both dances keeps one pairing, keeping a teacher', () => {
    const a = addLibrarySong(db, { title: 'Tune', dance: { name: 'Lesnoto' } })
    const other = addDance(db, { name: 'Lesnoto' })
    link(db, other, a.songId, 'T2')
    mergeDances(db, a.danceId!, other)
    expect(detail(a.songId).dances).toMatchObject([{ danceId: a.danceId, teacher: 'T2' }])
  })

  test('refuses to merge a dance into itself', () => {
    const a = addLibrarySong(db, { title: 'Tune', dance: { name: 'Lesnoto' } })
    expect(() => mergeDances(db, a.danceId!, a.danceId!)).toThrow(LibraryEditError)
  })
})

describe('same-name suggestions', () => {
  test('suggests another dance with the same name, with the songs it is used for', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'lesnoto ', choreographer: 'X' }
    })
    expect(detail(a.songId).suggestions).toEqual([
      {
        forDanceId: a.danceId,
        candidate: {
          danceId: b.danceId,
          name: 'lesnoto ',
          choreographer: 'X',
          country: null,
          songTitles: ['Pusteno Ludo']
        }
      }
    ])
  })

  test('"Same dance" links the song to it and removes the unused automatic duplicate', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto', teacher: 'T' } })
    const b = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    sameDance(db, a.songId, a.danceId!, b.danceId!)
    expect(detail(a.songId).dances).toMatchObject([
      { danceId: b.danceId, isDefault: true, teacher: 'T' }
    ])
    expect(count('dances')).toBe(1)
    expect(detail(a.songId).suggestions).toEqual([])
  })

  test('"Same dance" keeps the song’s own dance when other songs still use it', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const c = addLibrarySong(db, { title: 'Third' })
    link(db, a.danceId!, c.songId)
    const b = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    sameDance(db, a.songId, a.danceId!, b.danceId!)
    expect(detail(a.songId).dances.map((d) => [d.danceId, d.isDefault])).toEqual([
      [b.danceId, true],
      [a.danceId, false]
    ])
    expect(count('dances')).toBe(2)
  })

  test('"Different dance" stops the suggestion, in both directions', () => {
    const a = addLibrarySong(db, {
      title: 'Svornato',
      dance: { name: 'Svornato', choreographer: 'A' }
    })
    const b = addLibrarySong(db, {
      title: 'Svornato 2',
      dance: { name: 'Svornato', choreographer: 'B' }
    })
    markDifferentDances(db, b.danceId!, a.danceId!)
    markDifferentDances(db, a.danceId!, b.danceId!)
    expect(detail(a.songId).suggestions).toEqual([])
    expect(detail(b.songId).suggestions).toEqual([])
  })
})

describe('searchDances', () => {
  test('finds dances by name, choreographer or country, ignoring case and accents', () => {
    addLibrarySong(db, { title: 'x', dance: { name: 'Ali Paşa', country: 'Turkey' } })
    addLibrarySong(db, {
      title: 'y',
      dance: { name: 'Pravo Rhodopsko Oro', choreographer: 'Yves Moreau' }
    })
    expect(searchDances(db, 'pasa').map((d) => d.name)).toEqual(['Ali Paşa'])
    expect(searchDances(db, 'MOREAU').map((d) => d.name)).toEqual(['Pravo Rhodopsko Oro'])
    expect(searchDances(db, 'turk')[0]).toMatchObject({ name: 'Ali Paşa', songCount: 1 })
    expect(searchDances(db, '').length).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/library/edit.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/library/edit'`.

- [ ] **Step 3: Implement**

`src/main/db/transaction.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'

// Runs `fn` in a transaction: all of its writes happen, or none do. Joins a transaction that is
// already open (so operations can be composed).
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN')
  try {
    const value = fn()
    db.exec('COMMIT')
    return value
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw err
  }
}
```

`src/main/library/edit.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { formatLabel, labelParts } from '@shared/labels'
import type {
  DancePatch,
  DanceSearchResult,
  SameNameSuggestion,
  SongDance,
  SongDetail,
  SongPatch
} from '@shared/library'
import { foldSearchText } from '../db/fts'
import { inTransaction } from '../db/transaction'
import { shownPairingSql } from './list'

export class LibraryEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LibraryEditError'
  }
}

// Optional text: trimmed, with blank meaning "none".
const optional = (value: string | null | undefined): string | null => value?.trim() || null

function required(value: string, what: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new LibraryEditError(`${what} can't be empty.`)
  return trimmed
}

function update(
  db: DatabaseSync,
  table: string,
  key: string,
  id: number,
  values: Record<string, unknown>
): void {
  const cols = Object.keys(values)
  if (cols.length === 0) return
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${key} = ?`).run(
    ...(cols.map((c) => values[c]) as (string | number | null)[]),
    id
  )
}

// ---- Reading ----------------------------------------------------------------------------------

interface DanceRow {
  danceId: number
  pairingId: number
  name: string
  country: string | null
  choreographer: string | null
  danceType: string | null
  difficulty: number | null
  notes: string | null
  teacher: string | null
  songCount: number
  isDefault: number
}

export function getSongDetail(db: DatabaseSync, songId: number): SongDetail | null {
  const song = db
    .prepare(
      `SELECT s.id AS songId, f.id AS fileId, s.title, s.artist, f.path, f.duration_ms AS durationMs,
         f.is_missing AS isMissing, COALESCE(fp.is_favorite, 0) AS isFavorite,
         ${shownPairingSql('s.id')} AS shownPairingId
       FROM songs s JOIN files f ON f.id = s.file_id LEFT JOIN file_prefs fp ON fp.file_id = f.id
       WHERE s.id = ?`
    )
    .get(songId) as
    | (Omit<SongDetail, 'dances' | 'suggestions' | 'isMissing' | 'isFavorite'> & {
        isMissing: number
        isFavorite: number
        shownPairingId: number | null
      })
    | undefined
  if (!song) return null

  const rows = db
    .prepare(
      `SELECT d.id AS danceId, ds.id AS pairingId, d.name, d.country, d.choreographer,
         d.dance_type AS danceType, dp.difficulty, dp.notes, dsp.teacher,
         (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = d.id) AS songCount,
         ds.id = ? AS isDefault
       FROM dance_songs ds JOIN dances d ON d.id = ds.dance_id
       LEFT JOIN dance_prefs dp ON dp.dance_id = d.id
       LEFT JOIN dance_song_prefs dsp ON dsp.dance_song_id = ds.id
       WHERE ds.song_id = ?
       ORDER BY isDefault DESC, ds.id`
    )
    .all(song.shownPairingId, songId) as unknown as DanceRow[]

  const choreographerCount = new Set(
    rows.map((r) => r.choreographer?.trim()).filter((c): c is string => !!c)
  ).size
  const dances: SongDance[] = rows.map((r) => ({
    ...r,
    isDefault: r.isDefault === 1,
    label: formatLabel(
      labelParts({
        songTitle: song.title,
        danceName: r.name,
        choreographer: r.choreographer,
        choreographerCount
      })
    )
  }))

  const { shownPairingId: _, isMissing, isFavorite, ...rest } = song
  return {
    ...rest,
    isMissing: isMissing === 1,
    isFavorite: isFavorite === 1,
    dances,
    suggestions: sameNameSuggestions(db, songId, dances)
  }
}

// Other dances with the same name (ignoring case and surrounding spaces) that aren't linked to
// this song and weren't marked "different" (spec §6.3).
function sameNameSuggestions(
  db: DatabaseSync,
  songId: number,
  dances: SongDance[]
): SameNameSuggestion[] {
  const candidates = db.prepare(
    `SELECT c.id AS danceId, c.name, c.choreographer, c.country FROM dances c
     WHERE lower(trim(c.name)) = lower(trim(?)) AND c.id <> ?
       AND c.id NOT IN (SELECT dance_id FROM dance_songs WHERE song_id = ?)
       AND NOT EXISTS (SELECT 1 FROM distinct_dances x
         WHERE x.dance_a = min(c.id, ?) AND x.dance_b = max(c.id, ?))
     ORDER BY c.id`
  )
  const titles = db.prepare(
    `SELECT s.title FROM dance_songs ds JOIN songs s ON s.id = ds.song_id
     WHERE ds.dance_id = ? ORDER BY s.title COLLATE NOCASE`
  )
  return dances.flatMap((d) =>
    (
      candidates.all(
        d.name,
        d.danceId,
        songId,
        d.danceId,
        d.danceId
      ) as unknown as SameNameSuggestion['candidate'][]
    ).map((c) => ({
      forDanceId: d.danceId,
      candidate: { ...c, songTitles: titles.all(c.danceId).map((t) => t.title as string) }
    }))
  )
}

// Folds case, accents and letters like ı/ł/ø so "pasa" matches "Paşa".
const normalize = (text: string): string =>
  (foldSearchText(text) ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export function searchDances(db: DatabaseSync, text: string, limit = 50): DanceSearchResult[] {
  const words = normalize(text).split(/\s+/).filter(Boolean)
  const rows = db
    .prepare(
      `SELECT d.id AS danceId, d.name, d.choreographer, d.country,
         (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = d.id) AS songCount
       FROM dances d ORDER BY d.name COLLATE NOCASE, d.id`
    )
    .all() as unknown as DanceSearchResult[]
  return rows
    .filter((d) => {
      const haystack = normalize([d.name, d.choreographer, d.country].filter(Boolean).join(' '))
      return words.every((w) => haystack.includes(w))
    })
    .slice(0, limit)
}

// ---- Editing ----------------------------------------------------------------------------------

export function updateSong(db: DatabaseSync, songId: number, patch: SongPatch): void {
  const values: Record<string, unknown> = {}
  if (patch.title !== undefined) values.title = required(patch.title, 'A song title')
  if (patch.artist !== undefined) values.artist = optional(patch.artist)
  update(db, 'songs', 'id', songId, values)
}

export function updateDance(db: DatabaseSync, danceId: number, patch: DancePatch): void {
  const facts: Record<string, unknown> = {}
  if (patch.name !== undefined) facts.name = required(patch.name, 'A dance name')
  if (patch.country !== undefined) facts.country = optional(patch.country)
  if (patch.choreographer !== undefined) facts.choreographer = optional(patch.choreographer)
  if (patch.danceType !== undefined) facts.dance_type = optional(patch.danceType)
  const prefs: Record<string, unknown> = {}
  if (patch.difficulty !== undefined) {
    if (
      patch.difficulty !== null &&
      !(Number.isInteger(patch.difficulty) && patch.difficulty >= 1 && patch.difficulty <= 5)
    ) {
      throw new LibraryEditError('Difficulty must be from 1 to 5.')
    }
    prefs.difficulty = patch.difficulty
  }
  if (patch.notes !== undefined) prefs.notes = optional(patch.notes)
  inTransaction(db, () => {
    update(db, 'dances', 'id', danceId, facts)
    if (Object.keys(prefs).length) {
      db.prepare('INSERT OR IGNORE INTO dance_prefs (dance_id) VALUES (?)').run(danceId)
      update(db, 'dance_prefs', 'dance_id', danceId, prefs)
    }
  })
}

export function setTeacher(db: DatabaseSync, pairingId: number, teacher: string | null): void {
  inTransaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(pairingId)
    update(db, 'dance_song_prefs', 'dance_song_id', pairingId, { teacher: optional(teacher) })
  })
}

const isLinked = (db: DatabaseSync, songId: number, danceId: number): boolean =>
  !!db.prepare('SELECT 1 FROM dance_songs WHERE song_id = ? AND dance_id = ?').get(songId, danceId)

export function setDefaultDance(db: DatabaseSync, songId: number, danceId: number | null): void {
  if (danceId !== null && !isLinked(db, songId, danceId)) {
    throw new LibraryEditError('That dance is not linked to this song.')
  }
  db.prepare(
    `INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)
     ON CONFLICT (song_id) DO UPDATE SET default_dance_id = excluded.default_dance_id`
  ).run(songId, danceId)
}

// The song's first dance becomes its default.
function linkAndMaybeDefault(db: DatabaseSync, songId: number, danceId: number): void {
  const hadDances = !!db.prepare('SELECT 1 FROM dance_songs WHERE song_id = ?').get(songId)
  db.prepare('INSERT OR IGNORE INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(
    danceId,
    songId
  )
  if (!hadDances) setDefaultDance(db, songId, danceId)
}

export function linkDance(db: DatabaseSync, songId: number, danceId: number): void {
  inTransaction(db, () => linkAndMaybeDefault(db, songId, danceId))
}

export function createDance(db: DatabaseSync, songId: number, name: string): number {
  const danceName = required(name, 'A dance name')
  return inTransaction(db, () => {
    const danceId = Number(
      db.prepare('INSERT INTO dances (uuid, name) VALUES (?, ?)').run(randomUUID(), danceName)
        .lastInsertRowid
    )
    linkAndMaybeDefault(db, songId, danceId)
    return danceId
  })
}

// Removes the link only; the dance itself is kept (spec §4: a dance with no songs is kept).
export function unlinkDance(db: DatabaseSync, songId: number, danceId: number): void {
  inTransaction(db, () => {
    db.prepare('DELETE FROM dance_songs WHERE song_id = ? AND dance_id = ?').run(songId, danceId)
    const current = db
      .prepare('SELECT default_dance_id AS id FROM song_prefs WHERE song_id = ?')
      .get(songId) as { id: number | null } | undefined
    if (current?.id === danceId) {
      const next = db
        .prepare('SELECT dance_id AS id FROM dance_songs WHERE song_id = ? ORDER BY id LIMIT 1')
        .get(songId) as { id: number } | undefined
      setDefaultDance(db, songId, next?.id ?? null)
    }
  })
}

// Combines `removeId` into `keepId`: its songs (with their teachers), song defaults, program items
// and history move to the kept dance; the kept dance's empty fields are filled from it.
export function mergeDances(db: DatabaseSync, keepId: number, removeId: number): void {
  if (keepId === removeId) throw new LibraryEditError("A dance can't be merged into itself.")
  inTransaction(db, () => {
    const links = db
      .prepare(
        `SELECT ds.id, ds.song_id AS songId, p.teacher FROM dance_songs ds
         LEFT JOIN dance_song_prefs p ON p.dance_song_id = ds.id WHERE ds.dance_id = ? ORDER BY ds.id`
      )
      .all(removeId) as unknown as { id: number; songId: number; teacher: string | null }[]
    for (const l of links) {
      db.prepare('DELETE FROM dance_songs WHERE id = ?').run(l.id)
      db.prepare('INSERT OR IGNORE INTO dance_songs (dance_id, song_id) VALUES (?, ?)').run(
        keepId,
        l.songId
      )
      if (l.teacher) {
        const kept = db
          .prepare('SELECT id FROM dance_songs WHERE dance_id = ? AND song_id = ?')
          .get(keepId, l.songId) as { id: number }
        const existing = db
          .prepare('SELECT teacher FROM dance_song_prefs WHERE dance_song_id = ?')
          .get(kept.id) as { teacher: string | null } | undefined
        if (!existing?.teacher) setTeacher(db, kept.id, l.teacher)
      }
    }
    for (const table of ['song_prefs', 'program_items', 'play_log']) {
      const col = table === 'song_prefs' ? 'default_dance_id' : 'dance_id'
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(keepId, removeId)
    }
    fillEmptyFrom(db, 'dances', 'id', keepId, removeId, ['country', 'choreographer', 'dance_type'])
    db.prepare('INSERT OR IGNORE INTO dance_prefs (dance_id) VALUES (?)').run(keepId)
    fillEmptyFrom(db, 'dance_prefs', 'dance_id', keepId, removeId, [
      'difficulty',
      'notes',
      'canva_deck_id',
      'canva_page_id',
      'canva_page_index'
    ])
    db.prepare('DELETE FROM dances WHERE id = ?').run(removeId)
  })
}

function fillEmptyFrom(
  db: DatabaseSync,
  table: string,
  key: string,
  keepId: number,
  fromId: number,
  cols: string[]
): void {
  const read = db.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE ${key} = ?`)
  const keep = read.get(keepId) as Record<string, unknown> | undefined
  const from = read.get(fromId) as Record<string, unknown> | undefined
  if (!keep || !from) return
  const fill = Object.fromEntries(
    cols.filter((c) => (keep[c] ?? '') === '' && (from[c] ?? '') !== '').map((c) => [c, from[c]])
  )
  update(db, table, key, keepId, fill)
}

// "Same dance" on a suggestion (spec §6.3): the song is linked to `otherId` and it becomes the
// default. The song's own dance is merged into it when no other song uses it.
export function sameDance(db: DatabaseSync, songId: number, ownId: number, otherId: number): void {
  inTransaction(db, () => {
    const ownSongs = (
      db.prepare('SELECT COUNT(*) AS n FROM dance_songs WHERE dance_id = ?').get(ownId) as {
        n: number
      }
    ).n
    if (ownSongs <= 1) {
      mergeDances(db, otherId, ownId)
    } else {
      linkAndMaybeDefault(db, songId, otherId)
    }
    setDefaultDance(db, songId, otherId)
  })
}

// "Different dance": remember the pair so the suggestion isn't shown again.
export function markDifferentDances(db: DatabaseSync, a: number, b: number): void {
  db.prepare('INSERT OR IGNORE INTO distinct_dances (dance_a, dance_b) VALUES (?, ?)').run(
    Math.min(a, b),
    Math.max(a, b)
  )
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/library && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/library`: 30 pass; the suite: 242; typecheck and formatting are clean.

```bash
git add src/main/db/transaction.ts src/main/library/edit.ts tests/main/library/edit.test.ts
git commit -m "feat(library): edit songs and dances; link, unlink, merge and same-name suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Playlists and favorites

**Files:**
- Create: `src/main/library/playlists.ts`
- Test: `tests/main/library/playlists.test.ts`

**Interfaces:**
- Consumes: `inTransaction` and `LibraryEditError` (Task 3), `PlaylistSummary` (Task 2), and `saveApplePlaylists`/`findEditedApplePlaylists` (Plan 2), used in the tests.
- Produces:
  - `listPlaylists(db)` (by name)
  - `createPlaylist(db, name): number`
  - `renamePlaylist(db, id, name)`
  - `duplicatePlaylist(db, id): number` ("Name copy", a local playlist)
  - `deletePlaylist(db, id)`
  - `addToPlaylist(db, id, fileIds)` (appends, skipping songs already present)
  - `removeFromPlaylist(db, id, itemIds)`
  - `reorderPlaylist(db, id, itemIds)` (the complete new order; anything else throws)
  - `setFavorite(db, fileIds, favorite)`

**Every edit bumps `playlists.modified_at`.** That protects an edited Apple playlist on re-import (spec §5.3).

- [ ] **Step 1: Write the failing tests**

`tests/main/library/playlists.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { LibraryEditError } from '../../../src/main/library/edit'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  listPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  setFavorite
} from '../../../src/main/library/playlists'
import {
  findEditedApplePlaylists,
  saveApplePlaylists
} from '../../../src/main/import/save-playlists'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let a: number, b: number, c: number

const files = (playlistId: number): number[] =>
  db
    .prepare('SELECT file_id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.file_id as number)
const itemIds = (playlistId: number): number[] =>
  db
    .prepare('SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.id as number)

beforeEach(() => {
  db = createTestDb()
  a = addLibrarySong(db, { title: 'A' }).fileId
  b = addLibrarySong(db, { title: 'B' }).fileId
  c = addLibrarySong(db, { title: 'C' }).fileId
})

describe('playlists', () => {
  test('creates, lists (by name) and renames playlists; a name is required', () => {
    const z = createPlaylist(db, 'Zemer set')
    createPlaylist(db, ' couple dances ')
    renamePlaylist(db, z, 'Beginner night')
    expect(listPlaylists(db).map((p) => [p.name, p.source, p.itemCount])).toEqual([
      ['Beginner night', 'local', 0],
      ['couple dances', 'local', 0]
    ])
    expect(() => createPlaylist(db, '  ')).toThrow(LibraryEditError)
  })

  test('adds songs at the end, skipping ones already in the playlist', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [b, a])
    addToPlaylist(db, p, [a, c])
    expect(files(p)).toEqual([b, a, c])
    expect(listPlaylists(db)[0].itemCount).toBe(3)
  })

  test('removes and reorders items', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a, b, c])
    const [ia, ib, ic] = itemIds(p)
    removeFromPlaylist(db, p, [ib])
    expect(files(p)).toEqual([a, c])
    reorderPlaylist(db, p, [ic, ia])
    expect(files(p)).toEqual([c, a])
  })

  test('reorder must list exactly the playlist’s items', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a, b])
    expect(() => reorderPlaylist(db, p, [itemIds(p)[0]])).toThrow(LibraryEditError)
  })

  test('duplicates a playlist as a local copy with the same songs', () => {
    const p = createPlaylist(db, 'Balkan')
    addToPlaylist(db, p, [c, a])
    const copy = duplicatePlaylist(db, p)
    expect(listPlaylists(db).find((x) => x.id === copy)).toMatchObject({
      name: 'Balkan copy',
      source: 'local'
    })
    expect(files(copy)).toEqual([c, a])
  })

  test('deletes a playlist and its items, not the songs', () => {
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a])
    deletePlaylist(db, p)
    expect(listPlaylists(db)).toEqual([])
    expect(db.prepare('SELECT COUNT(*) n FROM playlist_items').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM files').get()).toEqual({ n: 3 })
  })

  // Spec §5.3: local edits to an Apple playlist must be protected on re-import.
  test('editing an imported Apple playlist marks it as edited', () => {
    saveApplePlaylists(
      db,
      [{ persistentId: 'BAL', name: 'Balkan', trackIds: [1] }],
      new Map([[1, a]]),
      {},
      '2020-01-01T00:00:00.000Z'
    )
    const [p] = listPlaylists(db)
    expect(findEditedApplePlaylists(db, ['BAL'])).toEqual([])
    addToPlaylist(db, p.id, [b])
    expect(findEditedApplePlaylists(db, ['BAL'])).toEqual([{ persistentId: 'BAL', name: 'Balkan' }])
  })
})

describe('setFavorite', () => {
  test('marks and unmarks recordings as favorites', () => {
    setFavorite(db, [a, b], true)
    setFavorite(db, [b], false)
    expect(
      db.prepare('SELECT file_id, is_favorite FROM file_prefs ORDER BY file_id').all()
    ).toEqual([
      { file_id: a, is_favorite: 1 },
      { file_id: b, is_favorite: 0 }
    ])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/library/playlists.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/library/playlists'`.

- [ ] **Step 3: Implement**

`src/main/library/playlists.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { PlaylistSummary } from '@shared/library'
import { inTransaction } from '../db/transaction'
import { LibraryEditError } from './edit'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

function name(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new LibraryEditError("A playlist name can't be empty.")
  return trimmed
}

// Every local edit bumps modified_at, which protects edited Apple playlists on re-import (§5.3).
const touch = (db: DatabaseSync, playlistId: number): void => {
  db.prepare(`UPDATE playlists SET modified_at = ${NOW} WHERE id = ?`).run(playlistId)
}

export function listPlaylists(db: DatabaseSync): PlaylistSummary[] {
  return db
    .prepare(
      `SELECT p.id, p.name, p.source, (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS itemCount
       FROM playlists p ORDER BY p.name COLLATE NOCASE, p.id`
    )
    .all() as unknown as PlaylistSummary[]
}

export function createPlaylist(db: DatabaseSync, playlistName: string): number {
  return Number(
    db.prepare("INSERT INTO playlists (name, source) VALUES (?, 'local')").run(name(playlistName))
      .lastInsertRowid
  )
}

export function renamePlaylist(db: DatabaseSync, playlistId: number, playlistName: string): void {
  db.prepare(`UPDATE playlists SET name = ?, modified_at = ${NOW} WHERE id = ?`).run(
    name(playlistName),
    playlistId
  )
}

export function deletePlaylist(db: DatabaseSync, playlistId: number): void {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId)
}

export function duplicatePlaylist(db: DatabaseSync, playlistId: number): number {
  return inTransaction(db, () => {
    const source = db.prepare('SELECT name FROM playlists WHERE id = ?').get(playlistId) as
      { name: string } | undefined
    if (!source) throw new LibraryEditError('That playlist no longer exists.')
    const copy = createPlaylist(db, `${source.name} copy`)
    db.prepare(
      `INSERT INTO playlist_items (playlist_id, position, file_id)
       SELECT ?, position, file_id FROM playlist_items WHERE playlist_id = ? ORDER BY position`
    ).run(copy, playlistId)
    return copy
  })
}

// Appends songs to the end of a playlist; songs already in it are skipped.
export function addToPlaylist(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  inTransaction(db, () => {
    const present = new Set(
      db
        .prepare('SELECT file_id FROM playlist_items WHERE playlist_id = ?')
        .all(playlistId)
        .map((r) => r.file_id as number)
    )
    let position = (
      db
        .prepare('SELECT COALESCE(MAX(position), 0) AS n FROM playlist_items WHERE playlist_id = ?')
        .get(playlistId) as {
        n: number
      }
    ).n
    const insert = db.prepare(
      'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
    )
    for (const fileId of fileIds) {
      if (present.has(fileId)) continue
      present.add(fileId)
      insert.run(playlistId, ++position, fileId)
    }
    touch(db, playlistId)
  })
}

export function removeFromPlaylist(db: DatabaseSync, playlistId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const remove = db.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND id = ?')
    for (const id of itemIds) remove.run(playlistId, id)
    touch(db, playlistId)
  })
}

// `itemIds` is the playlist's complete new order.
export function reorderPlaylist(db: DatabaseSync, playlistId: number, itemIds: number[]): void {
  inTransaction(db, () => {
    const current = db
      .prepare('SELECT id FROM playlist_items WHERE playlist_id = ?')
      .all(playlistId)
      .map((r) => r.id as number)
    const same = current.length === itemIds.length && current.every((id) => itemIds.includes(id))
    if (!same) throw new LibraryEditError('The playlist changed; please try again.')
    const set = db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?')
    itemIds.forEach((id, i) => set.run(i + 1, id))
    touch(db, playlistId)
  })
}

export function setFavorite(db: DatabaseSync, fileIds: number[], favorite: boolean): void {
  inTransaction(db, () => {
    const upsert = db.prepare(
      `INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, ?)
       ON CONFLICT (file_id) DO UPDATE SET is_favorite = excluded.is_favorite`
    )
    for (const fileId of fileIds) upsert.run(fileId, favorite ? 1 : 0)
  })
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/library && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/library`: 38 pass; the suite: 250; typecheck and formatting are clean.

```bash
git add src/main/library/playlists.ts tests/main/library/playlists.test.ts
git commit -m "feat(library): playlists and favorites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Re-apply mapping and suggestions

**Files:**
- Create: `src/main/library/mapping.ts`
- Test: `tests/main/library/mapping.test.ts`

**Interfaces:**
- Consumes: `mapTags` (Plan 2), `shownPairingSql` (Task 2), `inTransaction` (Task 3).
- Produces:
  - `reapplyMapping(db, songIds, mapping): ReapplyResult`
  - `getSuggestions(db, danceTypeSuggestions): Suggestions`

**Rules:**
- **Only the fields the mapping targets are overwritten:**
  - the song's artist, if a tag targets Artist
  - the shown pairing's teacher, if a tag targets Teacher
  - the shown dance's choreographer, if a tag targets Choreographer
  - its country, if Genre → Country is on
- **A shown dance shared with other songs is skipped** for its choreographer and country, and counted in `skippedSharedDances`.
- **Suggestions:**
  - `people` is the distinct teachers plus choreographers, combined, trimmed and sorted case-insensitively
  - `countries` is the distinct dance countries
  - `danceTypes` is the settings list plus the types already in use

- [ ] **Step 1: Write the failing tests**

`tests/main/library/mapping.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import { getSongDetail } from '../../../src/main/library/edit'
import { getSuggestions, reapplyMapping } from '../../../src/main/library/mapping'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

const tag = (fileId: number, tags: { artist?: string; albumArtist?: string; genre?: string }) =>
  db
    .prepare('UPDATE files SET tag_artist = ?, tag_album_artist = ?, tag_genre = ? WHERE id = ?')
    .run(tags.artist ?? null, tags.albumArtist ?? null, tags.genre ?? null, fileId)

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'teacher',
  genreIsCountry: true
}

beforeEach(() => {
  db = createTestDb()
})

describe('reapplyMapping', () => {
  test('overwrites the mapped fields from the raw tags', () => {
    const s = addLibrarySong(db, {
      title: 'Hora',
      artist: 'old',
      dance: { name: 'Hora', country: 'old', teacher: 'old' }
    })
    tag(s.fileId, { artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' })
    expect(reapplyMapping(db, [s.songId], mapping)).toEqual({ songs: 1, skippedSharedDances: 0 })
    const d = getSongDetail(db, s.songId)!
    expect(d.artist).toBe('Taraf')
    expect(d.dances[0]).toMatchObject({ country: 'Romania', teacher: 'Sonia Dion' })
  })

  test('leaves fields the mapping does not target alone', () => {
    const s = addLibrarySong(db, {
      title: 'Hora',
      dance: { name: 'Hora', country: 'Moldova', choreographer: 'Kept' }
    })
    tag(s.fileId, { artist: 'Taraf', genre: 'Romania' })
    reapplyMapping(db, [s.songId], { ...mapping, genreIsCountry: false })
    expect(getSongDetail(db, s.songId)!.dances[0]).toMatchObject({
      country: 'Moldova',
      choreographer: 'Kept'
    })
  })

  test('skips a default dance shared with other songs, but still updates the song and its teacher', () => {
    const s = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const other = addLibrarySong(db, { title: 'Other' })
    link(db, s.danceId!, other.songId)
    tag(s.fileId, { artist: 'Band', albumArtist: 'T', genre: 'Macedonia' })
    expect(reapplyMapping(db, [s.songId], mapping)).toEqual({ songs: 1, skippedSharedDances: 1 })
    const d = getSongDetail(db, s.songId)!
    expect(d.artist).toBe('Band')
    expect(d.dances[0]).toMatchObject({ country: null, teacher: 'T' })
  })

  test('routes tags to the choreographer when configured', () => {
    const s = addLibrarySong(db, { title: 'Pravo', dance: { name: 'Pravo' } })
    tag(s.fileId, { artist: 'Yves Moreau' })
    reapplyMapping(db, [s.songId], { ...mapping, artistTagTarget: 'choreographer' })
    expect(getSongDetail(db, s.songId)!.dances[0].choreographer).toBe('Yves Moreau')
  })
})

describe('getSuggestions', () => {
  test('one list for teachers and choreographers, countries, and dance types (settings + used)', () => {
    addLibrarySong(db, {
      title: 'A',
      dance: { name: 'A', country: 'Serbia', choreographer: 'Yves Moreau', teacher: 'Sonia Dion' }
    })
    const b = addLibrarySong(db, {
      title: 'B',
      dance: { name: 'B', country: 'bulgaria', teacher: 'Yves Moreau' }
    })
    db.prepare("UPDATE dances SET dance_type = 'Hora line' WHERE id = ?").run(b.danceId)
    addDance(db, { name: 'Unused', country: ' ' })
    expect(getSuggestions(db, ['Line', 'Couple'])).toEqual({
      people: ['Sonia Dion', 'Yves Moreau'],
      countries: ['bulgaria', 'Serbia'],
      danceTypes: ['Couple', 'Hora line', 'Line']
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/library/mapping.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/library/mapping'`.

- [ ] **Step 3: Implement**

`src/main/library/mapping.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { ImportMapping } from '@shared/import'
import type { ReapplyResult, Suggestions } from '@shared/library'
import { inTransaction } from '../db/transaction'
import { mapTags } from '../import/mapping'
import { shownPairingSql } from './list'

interface SongTags {
  songId: number
  path: string
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
  pairingId: number | null
  danceId: number | null
  danceSongs: number
}

// "Re-apply mapping to selected" (spec §5.2): deliberately overwrites the fields the current
// mapping targets, from each file's raw tags. A default dance shared with other songs is left
// unchanged (its country/choreographer would change for all of them) and counted as skipped.
export function reapplyMapping(
  db: DatabaseSync,
  songIds: number[],
  mapping: ImportMapping
): ReapplyResult {
  const targets = new Set([mapping.artistTagTarget, mapping.albumArtistTagTarget])
  const read = db.prepare(
    `SELECT s.id AS songId, f.path, f.tag_title AS title, f.tag_artist AS artist,
       f.tag_album_artist AS albumArtist, f.tag_genre AS genre, p.id AS pairingId, p.dance_id AS danceId,
       (SELECT COUNT(*) FROM dance_songs c WHERE c.dance_id = p.dance_id) AS danceSongs
     FROM songs s JOIN files f ON f.id = s.file_id
     LEFT JOIN dance_songs p ON p.id = ${shownPairingSql('s.id')}
     WHERE s.id = ?`
  )
  const result: ReapplyResult = { songs: 0, skippedSharedDances: 0 }
  inTransaction(db, () => {
    for (const songId of songIds) {
      const row = read.get(songId) as SongTags | undefined
      if (!row) continue
      const mapped = mapTags(row, row.path, mapping)
      result.songs += 1
      if (targets.has('artist')) {
        db.prepare('UPDATE songs SET artist = ? WHERE id = ?').run(mapped.song.artist, songId)
      }
      if (row.pairingId === null || row.danceId === null) continue
      if (targets.has('teacher')) {
        db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(
          row.pairingId
        )
        db.prepare('UPDATE dance_song_prefs SET teacher = ? WHERE dance_song_id = ?').run(
          mapped.teacher,
          row.pairingId
        )
      }
      const danceFields: Record<string, string | null> = {}
      if (targets.has('choreographer')) danceFields.choreographer = mapped.dance.choreographer
      if (mapping.genreIsCountry) danceFields.country = mapped.dance.country
      if (Object.keys(danceFields).length === 0) continue
      if (row.danceSongs > 1) {
        result.skippedSharedDances += 1
        continue
      }
      const cols = Object.keys(danceFields)
      db.prepare(`UPDATE dances SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
        ...cols.map((c) => danceFields[c]),
        row.danceId
      )
    }
  })
  return result
}

const distinct = (db: DatabaseSync, sql: string): string[] =>
  db
    .prepare(sql)
    .all()
    .map((r) => (r.value as string).trim())
    .filter(Boolean)

const sorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

export function getSuggestions(db: DatabaseSync, danceTypeSuggestions: string[]): Suggestions {
  return {
    people: sorted([
      ...distinct(
        db,
        'SELECT DISTINCT teacher AS value FROM dance_song_prefs WHERE teacher IS NOT NULL'
      ),
      ...distinct(
        db,
        'SELECT DISTINCT choreographer AS value FROM dances WHERE choreographer IS NOT NULL'
      )
    ]),
    countries: sorted(
      distinct(db, 'SELECT DISTINCT country AS value FROM dances WHERE country IS NOT NULL')
    ),
    danceTypes: sorted([
      ...danceTypeSuggestions,
      ...distinct(
        db,
        'SELECT DISTINCT dance_type AS value FROM dances WHERE dance_type IS NOT NULL'
      )
    ])
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/library && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/library`: 43 pass; the suite: 255; typecheck and formatting are clean.

```bash
git add src/main/library/mapping.ts tests/main/library/mapping.test.ts
git commit -m "feat(library): re-apply mapping to selected songs; autocomplete suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: IPC channels and change events

**Files:**
- Create: `src/main/ipc/library-handlers.ts`
- Modify: `src/shared/contract.ts` (replace), `src/main/ipc/handlers.ts` (replace), `src/main/index.ts` (replace), `tests/main/ipc/handlers.test.ts`
- Test: `tests/main/ipc/library-handlers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - **New invoke channels:**
    - library: `list`, `song`, `updateSong`, `updateDance`, `setTeacher`, `setDefaultDance`, `linkDance`, `createDance`, `unlinkDance`, `mergeDances`, `sameDance`, `markDifferent`, `searchDances`, `setFavorite`, `reapplyMapping`, `suggestions`
    - playlists: `list`, `create`, `rename`, `duplicate`, `delete`, `add`, `remove`, `reorder`
    - Argument and result types are in the contract.
  - **New event:** `'library:changed': null`.
  - **`HandlerDeps`** gains `onLibraryChanged: () => void`.
  - **In `main/index.ts`:** a `broadcast(channel, payload)` helper. `library:changed` is sent after every edit and when an import finishes (`progress.phase === 'done'`).
  - **`library:reapplyMapping`** reads the mapping from settings. **`library:suggestions`** reads `danceTypeSuggestions`.

- [ ] **Step 1: Write the failing tests**

`tests/main/ipc/library-handlers.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

function setup() {
  const db = createTestDb()
  let changes = 0
  const deps: HandlerDeps = {
    db,
    settings: new SettingsStore(db),
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 2 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    onLibraryChanged: () => void changes++
  }
  return {
    db,
    h: createHandlers(deps) as InvokeHandlers,
    changes: () => changes,
    settings: deps.settings
  }
}

const query = {
  search: '',
  filter: { kind: 'all' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

describe('library handlers', () => {
  test('list and detail read the library', async () => {
    const { db, h } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora Mare' } })
    expect((await h['library:list'](query)).map((r) => r.label)).toEqual(['Hora | Hora Mare'])
    expect((await h['library:song'](s.songId))?.dances[0].name).toBe('Hora Mare')
  })

  test('every edit announces that the library changed', async () => {
    const { db, h, changes } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:updateSong'](s.songId, { artist: 'Taraf' })
    await h['library:updateDance'](s.danceId!, { country: 'Romania' })
    const created = await h['library:createDance'](s.songId, 'Sârba')
    await h['library:setDefaultDance'](s.songId, created)
    await h['library:unlinkDance'](s.songId, created)
    await h['library:setFavorite']([s.fileId], true)
    const p = await h['playlists:create']('Mine')
    await h['playlists:add'](p, [s.fileId])
    expect(changes()).toBe(8)
    expect((await h['playlists:list']()).map((x) => [x.name, x.itemCount])).toEqual([['Mine', 1]])
  })

  test('re-apply mapping uses the saved import mapping', async () => {
    const { db, h, settings } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    db.prepare("UPDATE files SET tag_artist = 'Yves Moreau' WHERE id = ?").run(s.fileId)
    settings.set('import.artistTagTarget', 'choreographer')
    expect(await h['library:reapplyMapping']([s.songId])).toEqual({
      songs: 1,
      skippedSharedDances: 0
    })
    expect((await h['library:song'](s.songId))?.dances[0].choreographer).toBe('Yves Moreau')
  })

  test('suggestions include the dance types from settings', async () => {
    const { h, settings } = setup()
    settings.set('danceTypeSuggestions', ['Line'])
    expect(await h['library:suggestions']()).toEqual({
      people: [],
      countries: [],
      danceTypes: ['Line']
    })
  })
})
```

In `tests/main/ipc/handlers.test.ts`, add `onLibraryChanged` to the `makeDeps` defaults. Change:

```ts
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    ...overrides
```

to:

```ts
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    onLibraryChanged: () => undefined,
    ...overrides
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/ipc/library-handlers.test.ts`
Expected: FAIL. All 4 tests fail, because the handlers don't exist (`h['library:list'] is not a function`).

- [ ] **Step 3: Extend the contract and add the handlers**

Replace `src/shared/contract.ts` with:

```ts
import type {
  ApplePlaylistConflict,
  ApplePreview,
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
  SongPatch,
  Suggestions
} from './library'
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
  'library:reapplyMapping': { args: [songIds: number[]]; result: ReapplyResult }
  'library:suggestions': { args: []; result: Suggestions }
  'playlists:list': { args: []; result: PlaylistSummary[] }
  'playlists:create': { args: [name: string]; result: number }
  'playlists:rename': { args: [playlistId: number, name: string]; result: void }
  'playlists:duplicate': { args: [playlistId: number]; result: number }
  'playlists:delete': { args: [playlistId: number]; result: void }
  'playlists:add': { args: [playlistId: number, fileIds: number[]]; result: void }
  'playlists:remove': { args: [playlistId: number, itemIds: number[]]; result: void }
  'playlists:reorder': { args: [playlistId: number, itemIds: number[]]; result: void }
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
  'library:reapplyMapping',
  'library:suggestions',
  'playlists:list',
  'playlists:create',
  'playlists:rename',
  'playlists:duplicate',
  'playlists:delete',
  'playlists:add',
  'playlists:remove',
  'playlists:reorder'
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
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed'
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

`src/main/ipc/library-handlers.ts`:

```ts
import type { InvokeHandlers } from '@shared/contract'
import {
  createDance,
  getSongDetail,
  linkDance,
  markDifferentDances,
  mergeDances,
  sameDance,
  searchDances,
  setDefaultDance,
  setTeacher,
  unlinkDance,
  updateDance,
  updateSong
} from '../library/edit'
import { listLibrary } from '../library/list'
import { getSuggestions, reapplyMapping } from '../library/mapping'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  listPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  setFavorite
} from '../library/playlists'
import type { HandlerDeps } from './handlers'

type LibraryChannel = Extract<keyof InvokeHandlers, `library:${string}` | `playlists:${string}`>

// Handlers for the library and playlists (spec §6). Every edit runs, then announces the change.
export function libraryHandlers(
  deps: HandlerDeps
): Omit<Pick<InvokeHandlers, LibraryChannel>, 'library:stats'> {
  const { db } = deps
  const edit =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      deps.onLibraryChanged()
      return result
    }
  const mapping = () => ({
    artistTagTarget: deps.settings.get('import.artistTagTarget'),
    albumArtistTagTarget: deps.settings.get('import.albumArtistTagTarget'),
    genreIsCountry: deps.settings.get('import.genreIsCountry')
  })

  return {
    'library:list': (query) => listLibrary(db, query),
    'library:song': (songId) => getSongDetail(db, songId),
    'library:searchDances': (text) => searchDances(db, text),
    'library:suggestions': () => getSuggestions(db, deps.settings.get('danceTypeSuggestions')),
    'library:updateSong': edit((songId, patch) => updateSong(db, songId, patch)),
    'library:updateDance': edit((danceId, patch) => updateDance(db, danceId, patch)),
    'library:setTeacher': edit((pairingId, teacher) => setTeacher(db, pairingId, teacher)),
    'library:setDefaultDance': edit((songId, danceId) => setDefaultDance(db, songId, danceId)),
    'library:linkDance': edit((songId, danceId) => linkDance(db, songId, danceId)),
    'library:createDance': edit((songId, name) => createDance(db, songId, name)),
    'library:unlinkDance': edit((songId, danceId) => unlinkDance(db, songId, danceId)),
    'library:mergeDances': edit((keepId, removeId) => mergeDances(db, keepId, removeId)),
    'library:sameDance': edit((songId, ownId, otherId) => sameDance(db, songId, ownId, otherId)),
    'library:markDifferent': edit((a, b) => markDifferentDances(db, a, b)),
    'library:setFavorite': edit((fileIds, favorite) => setFavorite(db, fileIds, favorite)),
    'library:reapplyMapping': edit((songIds) => reapplyMapping(db, songIds, mapping())),
    'playlists:list': () => listPlaylists(db),
    'playlists:create': edit((name) => createPlaylist(db, name)),
    'playlists:rename': edit((id, name) => renamePlaylist(db, id, name)),
    'playlists:duplicate': edit((id) => duplicatePlaylist(db, id)),
    'playlists:delete': edit((id) => deletePlaylist(db, id)),
    'playlists:add': edit((id, fileIds) => addToPlaylist(db, id, fileIds)),
    'playlists:remove': edit((id, itemIds) => removeFromPlaylist(db, id, itemIds)),
    'playlists:reorder': edit((id, itemIds) => reorderPlaylist(db, id, itemIds))
  }
}
```

Replace `src/main/ipc/handlers.ts` with:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { ImportService } from '../import/import-service'
import { getLibraryStats } from '../library/stats'
import { libraryHandlers } from './library-handlers'
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
  // Called after every change to songs, dances, playlists or favorites.
  onLibraryChanged: () => void
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
    ...libraryHandlers(deps)
  }
}
```

Replace `src/main/index.ts` with:

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import type { EventChannel, EventContract } from '@shared/contract'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { importDialogs } from './import/dialogs'
import { ImportService } from './import/import-service'
import { startUtilityWorker } from './import/utility-worker'
import { createHandlers } from './ipc/handlers'
import { guardNavigation } from './navigation'
import { registerHandlers } from './ipc/register'
import { SettingsStore } from './settings/settings-store'

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
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    onProgress: (progress) => {
      broadcast('import:progress', progress)
      if (progress.phase === 'done') broadcast('library:changed', null)
    }
  })
  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs,
      onLibraryChanged: () => broadcast('library:changed', null)
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

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/ipc && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/ipc`: 14 pass; the suite: 259; typecheck and formatting are clean.

```bash
git add src/shared/contract.ts src/main/ipc src/main/index.ts tests/main/ipc
git commit -m "feat(ipc): library and playlist channels; library:changed after edits and imports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The library store

**Files:**
- Create: `src/renderer/src/library/library-store.ts`, `src/renderer/src/library/LibraryProvider.tsx`
- Modify: `vitest.config.ts` (renderer tests may be `.test.ts`), `tests/renderer/fake-api.ts` (library defaults)
- Test: `tests/renderer/library/library-store.test.ts`

**Interfaces:**
- Consumes: Task 6 channels and event; `createFakeApi` (Plan 2).
- Produces:
  - **`createLibraryStore(api): LibraryStore`.** The store has:
    - state: `filter`, `search`, `sort`, `rows`, `playlists`, `selected` (song ids), `anchor`
    - `refresh()`, which ignores out-of-date responses and drops selected songs that disappeared
    - `setFilter()`: a playlist switches to `position` order; leaving one returns to title order
    - `setSearch()`, `setSort()`
    - `select(songId, 'single' | 'toggle' | 'range')`, `clearSelection()`
    - `selectedRows()`, in table order
    - `watch()`, which subscribes to `library:changed` and returns the unsubscribe function
  - **`LibraryProvider({ api })`:** creates the store once; watches and refreshes in an effect.
  - **Hooks:** `useLibrary(selector)`, `useLibraryApi()`, `useLibraryStore()`.
  - **`createFakeApi` defaults:** `library:list` and `playlists:list` return `[]`, `library:stats` returns `{ fileCount: 0 }`, and `library:suggestions` returns empty lists.

- [ ] **Step 1: Let renderer tests be plain `.ts`, and give the fake API library defaults**

Replace `vitest.config.ts` with:

```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/*.test.ts', 'tests/main/**/*.test.ts', 'tests/shared/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/renderer/setup.ts']
        }
      }
    ]
  }
})
```

Replace `tests/renderer/fake-api.ts` with:

```ts
import type { EventChannel, EventContract, InvokeChannel, RendererApi } from '@shared/contract'
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

- [ ] **Step 2: Write the failing tests**

`tests/renderer/library/library-store.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import { createLibraryStore, type LibraryStore } from '@renderer/library/library-store'
import { createFakeApi } from '../fake-api'

const row = (songId: number, extra: Partial<LibraryRow> = {}): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
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
  danceCount: 0,
  label: `Song ${songId}`,
  playlistItemId: null,
  ...extra
})

let store: LibraryStore
let stopWatching: () => void = () => undefined
afterEach(() => stopWatching())

function setup(rows: LibraryRow[] = [row(1), row(2), row(3), row(4)]) {
  const fake = createFakeApi({
    'library:list': () => rows,
    'playlists:list': [{ id: 7, name: 'Balkan', source: 'local', itemCount: 2 }]
  })
  store = createLibraryStore(fake.api)
  return fake
}

describe('library store', () => {
  test('loads rows and playlists', async () => {
    setup()
    await store.getState().refresh()
    expect(store.getState().rows.map((r) => r.songId)).toEqual([1, 2, 3, 4])
    expect(store.getState().playlists.map((p) => p.name)).toEqual(['Balkan'])
  })

  test('refetches with the new filter, search and sort', async () => {
    const fake = setup()
    await store.getState().setFilter({ kind: 'playlist', playlistId: 7 })
    await store.getState().setSearch('hora')
    await store.getState().setSort({ column: 'country', direction: 'desc' })
    const last = fake.callsTo('library:list').at(-1)![0] as LibraryQuery
    expect(last).toEqual({
      search: 'hora',
      filter: { kind: 'playlist', playlistId: 7 },
      sort: { column: 'country', direction: 'desc' }
    })
  })

  test('a playlist is shown in its own order until another sort is chosen', async () => {
    const fake = setup()
    await store.getState().setFilter({ kind: 'playlist', playlistId: 7 })
    expect((fake.callsTo('library:list').at(-1)![0] as LibraryQuery).sort.column).toBe('position')
    await store.getState().setFilter({ kind: 'all' })
    expect((fake.callsTo('library:list').at(-1)![0] as LibraryQuery).sort.column).toBe('title')
  })

  test('selects with click, toggle (⌘) and range (shift)', async () => {
    setup()
    await store.getState().refresh()
    const { select } = store.getState()
    select(2, 'single')
    expect(store.getState().selected).toEqual([2])
    select(4, 'range')
    expect(store.getState().selected).toEqual([2, 3, 4])
    select(3, 'toggle')
    expect(store.getState().selected).toEqual([2, 4])
    select(1, 'toggle')
    expect(store.getState().selected).toEqual([2, 4, 1])
  })

  test('drops selected songs that disappear after a refresh', async () => {
    let rows = [row(1), row(2)]
    const fake = createFakeApi({ 'library:list': () => rows, 'playlists:list': [] })
    store = createLibraryStore(fake.api)
    await store.getState().refresh()
    store.getState().select(2, 'single')
    rows = [row(1)]
    await store.getState().refresh()
    expect(store.getState().selected).toEqual([])
  })

  test('refreshes when the library changes, until it stops watching', async () => {
    const fake = setup()
    stopWatching = store.getState().watch()
    await store.getState().refresh()
    const before = fake.callsTo('library:list').length
    fake.emit('library:changed', null)
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.callsTo('library:list').length).toBe(before + 1)
    stopWatching()
    fake.emit('library:changed', null)
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.callsTo('library:list').length).toBe(before + 1)
  })

  test('selected rows are the selected songs in table order', async () => {
    setup()
    await store.getState().refresh()
    store.getState().select(3, 'single')
    store.getState().select(1, 'toggle')
    expect(
      store
        .getState()
        .selectedRows()
        .map((r) => r.songId)
    ).toEqual([1, 3])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library`
Expected: FAIL — `Failed to resolve import "@renderer/library/library-store"`.

- [ ] **Step 4: Implement**

`src/renderer/src/library/library-store.ts`:

```ts
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { RendererApi } from '@shared/contract'
import type { LibraryFilter, LibraryRow, LibrarySort, PlaylistSummary } from '@shared/library'

export type SelectMode = 'single' | 'toggle' | 'range'

export interface LibraryState {
  filter: LibraryFilter
  search: string
  sort: LibrarySort
  rows: LibraryRow[]
  playlists: PlaylistSummary[]
  selected: number[] // song ids, in the order they were selected
  anchor: number | null // last clicked song, for shift-click ranges
  refresh(): Promise<void>
  setFilter(filter: LibraryFilter): Promise<void>
  setSearch(search: string): Promise<void>
  setSort(sort: LibrarySort): Promise<void>
  select(songId: number, mode: SelectMode): void
  clearSelection(): void
  selectedRows(): LibraryRow[]
  // Refetches whenever main reports a library change; returns the unsubscribe function.
  watch(): () => void
}

export type LibraryStore = StoreApi<LibraryState>

const TITLE_SORT: LibrarySort = { column: 'title', direction: 'asc' }
const PLAYLIST_SORT: LibrarySort = { column: 'position', direction: 'asc' }

// The library state shared by the sidebar, the Music page table and the song editor (spec §6).
// Main owns the data; this store only holds what's on screen and refetches when it changes.
export function createLibraryStore(api: RendererApi): LibraryStore {
  let latest = 0
  const store = createStore<LibraryState>()((set, get) => ({
    filter: { kind: 'all' },
    search: '',
    sort: TITLE_SORT,
    rows: [],
    playlists: [],
    selected: [],
    anchor: null,

    async refresh() {
      const request = ++latest
      const { search, filter, sort } = get()
      const [rows, playlists] = await Promise.all([
        api.invoke('library:list', { search, filter, sort }),
        api.invoke('playlists:list')
      ])
      if (request !== latest) return // a newer refresh already started
      const present = new Set(rows.map((r) => r.songId))
      set((s) => ({
        rows,
        playlists,
        selected: s.selected.filter((id) => present.has(id)),
        anchor: s.anchor !== null && present.has(s.anchor) ? s.anchor : null
      }))
    },

    async setFilter(filter) {
      // A playlist opens in its own order; leaving one returns to title order.
      const sort =
        filter.kind === 'playlist'
          ? PLAYLIST_SORT
          : get().sort.column === 'position'
            ? TITLE_SORT
            : get().sort
      set({ filter, sort, selected: [], anchor: null })
      await get().refresh()
    },

    async setSearch(search) {
      set({ search })
      await get().refresh()
    },

    async setSort(sort) {
      set({ sort })
      await get().refresh()
    },

    select(songId, mode) {
      const { rows, selected, anchor } = get()
      if (mode === 'toggle') {
        set({
          selected: selected.includes(songId)
            ? selected.filter((id) => id !== songId)
            : [...selected, songId],
          anchor: songId
        })
      } else if (mode === 'range' && anchor !== null) {
        const ids = rows.map((r) => r.songId)
        const [from, to] = [ids.indexOf(anchor), ids.indexOf(songId)].sort((a, b) => a - b)
        set({ selected: from < 0 ? [songId] : ids.slice(from, to + 1) })
      } else {
        set({ selected: [songId], anchor: songId })
      }
    },

    clearSelection: () => set({ selected: [], anchor: null }),

    selectedRows() {
      const { rows, selected } = get()
      const chosen = new Set(selected)
      return rows.filter((r) => chosen.has(r.songId))
    },

    watch: () => api.on('library:changed', () => void get().refresh())
  }))
  return store
}
```

`src/renderer/src/library/LibraryProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { RendererApi } from '@shared/contract'
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store'

const LibraryContext = createContext<{ store: LibraryStore; api: RendererApi } | null>(null)

// Provides the library store (and the API it uses) to the sidebar, table and editor.
export function LibraryProvider({
  api,
  children
}: {
  api: RendererApi
  children: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => createLibraryStore(api))
  useEffect(() => {
    const stop = store.getState().watch()
    void store.getState().refresh()
    return stop
  }, [store])
  return <LibraryContext.Provider value={{ store, api }}>{children}</LibraryContext.Provider>
}

function useLibraryContext() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return context
}

// Selectors must return stable values (state fields, not new arrays/objects).
export function useLibrary<T>(selector: (state: LibraryState) => T): T {
  return useStore(useLibraryContext().store, selector)
}

export const useLibraryApi = (): RendererApi => useLibraryContext().api
export const useLibraryStore = (): LibraryStore => useLibraryContext().store
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected: the store tests pass (7); the suite: 266; typecheck and formatting are clean.

```bash
git add vitest.config.ts tests/renderer/fake-api.ts src/renderer/src/library tests/renderer/library
git commit -m "feat(library): renderer library store and provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The sidebar: Library, Favorites and playlists

**Files:**
- Create: `src/renderer/src/library/drag.ts`, `src/renderer/src/components/NamePrompt.tsx`, `src/renderer/src/components/ConfirmDialog.tsx`, `tests/renderer/test-theme.ts`, `tests/renderer/library/render-library.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx` and `Sidebar.module.css` (replace), `tests/renderer/render.tsx` (replace), `tests/renderer/setup.ts` (replace), `src/renderer/src/App.tsx`
- Test: `tests/renderer/library/sidebar.test.tsx`

**Interfaces:**
- Consumes: Task 7 store, provider and hooks.
- Produces:
  - **Drag helpers:** `FILES_MIME = 'application/x-fdp-files'`, `setDraggedFiles(dataTransfer, fileIds)`, `carriesFiles(dataTransfer)`, `getDraggedFiles(dataTransfer): number[]`. Plan 4's program list reuses them.
  - **Dialogs:** `NamePrompt({ opened, title, initialValue?, submitLabel, onSubmit, onClose })` (shows `onSubmit`'s error) and `ConfirmDialog({ opened, title, message, confirmLabel, danger?, onConfirm, onClose })`.
  - **`Sidebar()`:**
    - Library entries with `aria-current="page"` on the active one.
    - Songs dropped on Favorites become favorites; dropped on a playlist, they're added to it.
    - `[+]` "New playlist" asks for a name.
    - Each playlist has an options menu: a "⋯" button shown on hover, or right-click. It offers Rename…, Duplicate and Delete… (with a confirmation; deleting the open playlist returns to All Music).
    - Apple-imported playlists show a  marked "From Apple Music".
  - **`renderWithLibrary(ui, api)`:** Mantine (test theme) plus `LibraryProvider`.

**jsdom gaps** (test-only changes; the app keeps Mantine's defaults):
- Mantine popovers hide their dropdown when the anchor looks detached, and in jsdom every element measures 0×0. So `tests/renderer/test-theme.ts` turns `hideDetached` off for Menu and Popover, and `tests/renderer/render.tsx` switches to it.
- `tests/renderer/setup.ts` also gives elements a non-zero `getBoundingClientRect` and `offsetWidth`/`offsetHeight`. Task 9's virtualized table needs them too.
- A controlled Menu opened from `contextmenu` was unreliable, so right-click clicks the "⋯" button, which uses Mantine's normal Menu.

- [ ] **Step 1: Write the test infrastructure**

`tests/renderer/test-theme.ts`:

```ts
import { Menu, mergeThemeOverrides, Popover } from '@mantine/core'
import { theme } from '@renderer/theme'

// The app theme, adjusted for jsdom: with no real layout, Mantine thinks every popover's anchor
// is detached and hides the dropdown (display: none). The app itself keeps Mantine's default.
export const testTheme = mergeThemeOverrides(theme, {
  components: {
    Menu: Menu.extend({ defaultProps: { hideDetached: false } }),
    Popover: Popover.extend({ defaultProps: { hideDetached: false } })
  }
})
```

Replace `tests/renderer/render.tsx` with:

```tsx
import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import { testTheme } from './test-theme'

export function renderWithMantine(ui: React.ReactElement): RenderResult {
  return render(<MantineProvider theme={testTheme}>{ui}</MantineProvider>)
}
```

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

afterEach(() => cleanup())
```

`tests/renderer/library/render-library.tsx`:

```tsx
import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import type { RendererApi } from '@shared/contract'
import { LibraryProvider } from '@renderer/library/LibraryProvider'
import { testTheme } from '../test-theme'

// Renders `ui` the way the app does: Mantine + the library store backed by `api`.
export function renderWithLibrary(ui: React.ReactElement, api: RendererApi): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <LibraryProvider api={api}>{ui}</LibraryProvider>
    </MantineProvider>
  )
}
```

Run: `npm test`
Expected: still passes (266). The theme and size stubs don't change any existing behavior.

- [ ] **Step 2: Write the failing sidebar tests**

`tests/renderer/library/sidebar.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, PlaylistSummary } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import { FILES_MIME } from '@renderer/library/drag'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const playlists: PlaylistSummary[] = [
  { id: 1, name: 'Balkan', source: 'apple_xml', itemCount: 12 },
  { id: 2, name: 'Couple dances', source: 'local', itemCount: 3 }
]

function setup(extra = {}) {
  const fake = createFakeApi({
    'library:list': [],
    'playlists:list': playlists,
    'playlists:create': 3,
    'playlists:rename': undefined,
    'playlists:duplicate': 4,
    'playlists:delete': undefined,
    'playlists:add': undefined,
    'library:setFavorite': undefined,
    ...extra
  })
  renderWithLibrary(<Sidebar />, fake.api)
  return fake
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery

const dropFiles = (target: HTMLElement, fileIds: number[]) =>
  fireEvent.drop(target, {
    dataTransfer: {
      types: [FILES_MIME],
      getData: (type: string) => (type === FILES_MIME ? JSON.stringify(fileIds) : '')
    }
  })

describe('Sidebar', () => {
  test('lists playlists, marking ones imported from Apple Music', async () => {
    setup()
    expect(await screen.findByText('Balkan')).toBeInTheDocument()
    expect(screen.getByText('Couple dances')).toBeInTheDocument()
    expect(screen.getByLabelText('From Apple Music')).toBeInTheDocument()
  })

  test('choosing an entry filters the library and marks it as current', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByText('★ Favorites'))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'favorites' }))
    await userEvent.click(screen.getByText('Couple dances'))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'playlist', playlistId: 2 }))
    expect(screen.getByText('Couple dances').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('creates a playlist after asking for its name', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New playlist' }))
    const dialog = await screen.findByRole('dialog', { name: 'New playlist' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Beginner night')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('playlists:create')).toEqual([['Beginner night']])
  })

  test('right-click offers rename, duplicate and delete', async () => {
    const fake = setup()
    fireEvent.contextMenu(await screen.findByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename playlist' })
    const input = within(dialog).getByLabelText('Name')
    expect(input).toHaveValue('Couple dances')
    await userEvent.clear(input)
    await userEvent.type(input, 'Couples')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('playlists:rename')).toEqual([[2, 'Couples']])
    // Wait for the dialog's closing transition before using the page again.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.contextMenu(screen.getByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(fake.callsTo('playlists:duplicate')).toEqual([[2]])

    fireEvent.contextMenu(screen.getByText('Couple dances'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete playlist?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(fake.callsTo('playlists:delete')).toEqual([[2]])
  })

  test('songs dropped on a playlist are added to it; dropped on Favorites, they become favorites', async () => {
    const fake = setup()
    dropFiles(await screen.findByText('Couple dances'), [101, 102])
    dropFiles(screen.getByText('★ Favorites'), [101])
    await waitFor(() => expect(fake.callsTo('playlists:add')).toEqual([[2, [101, 102]]]))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library/sidebar.test.tsx`
Expected: FAIL — `Failed to resolve import "@renderer/library/drag"`.

- [ ] **Step 4: Implement the drag helpers, dialogs and sidebar**

`src/renderer/src/library/drag.ts`:

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
```

`src/renderer/src/components/NamePrompt.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { errorMessage } from '../ipc-error'

// A small dialog asking for a name (new playlist, rename…). `onSubmit` may throw; its message is shown.
export default function NamePrompt(props: {
  opened: boolean
  title: string
  initialValue?: string
  submitLabel: string
  onSubmit: (name: string) => Promise<unknown> | unknown
  onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(props.initialValue ?? '')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (props.opened) {
      setValue(props.initialValue ?? '')
      setError(null)
    }
  }, [props.opened, props.initialValue])

  const submit = async (): Promise<void> => {
    try {
      await props.onSubmit(value)
      props.onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Stack>
          <TextInput
            label="Name"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            data-autofocus
          />
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {props.submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
```

`src/renderer/src/components/ConfirmDialog.tsx`:

```tsx
import { Button, Group, Modal, Stack, Text } from '@mantine/core'

export default function ConfirmDialog(props: {
  opened: boolean
  title: string
  message: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <Stack>
        <Text>{props.message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            color={props.danger ? 'red' : undefined}
            onClick={() => {
              props.onConfirm()
              props.onClose()
            }}
          >
            {props.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
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

.playlist {
  position: relative;
}

.playlist > div:first-child {
  padding-right: 28px;
}

.options {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  opacity: 0;
}

.playlist:hover .options,
.options[aria-expanded='true'],
.options:focus-visible {
  opacity: 1;
}
```

Replace `src/renderer/src/components/Sidebar.tsx` with:

```tsx
import { useRef, useState } from 'react'
import { ActionIcon, Group, Menu, NavLink, ScrollArea, Text, TextInput } from '@mantine/core'
import type { LibraryFilter, PlaylistSummary } from '@shared/library'
import { carriesFiles, getDraggedFiles } from '../library/drag'
import { useLibrary, useLibraryApi } from '../library/LibraryProvider'
import ConfirmDialog from './ConfirmDialog'
import NamePrompt from './NamePrompt'
import classes from './Sidebar.module.css'

const sameFilter = (a: LibraryFilter, b: LibraryFilter): boolean =>
  a.kind === b.kind && (a.kind !== 'playlist' || a.playlistId === (b as typeof a).playlistId)

// A sidebar entry that songs can be dropped onto.
function DropTarget(props: { onFiles: (fileIds: number[]) => void; children: React.ReactNode }) {
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

// A playlist in the sidebar: a drop target, with an options menu ("⋯", or right-click).
function PlaylistEntry(props: {
  playlist: PlaylistSummary
  link: React.ReactNode
  onDropFiles: (fileIds: number[]) => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const options = useRef<HTMLButtonElement>(null)
  return (
    <div
      className={classes.playlist}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <DropTarget onFiles={props.onDropFiles}>{props.link}</DropTarget>
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${props.playlist.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
          <Menu.Item onClick={props.onDuplicate}>Duplicate</Menu.Item>
          <Menu.Item color="red" onClick={props.onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

const heading = (text: string): React.JSX.Element => (
  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
    {text}
  </Text>
)

// Spec §6.1. Programs arrive in plan 4.
export default function Sidebar(): React.JSX.Element {
  const api = useLibraryApi()
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  const playlists = useLibrary((s) => s.playlists)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; playlist: PlaylistSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null)

  const entry = (label: string, target: LibraryFilter, extra?: React.ReactNode) => {
    const active = sameFilter(filter, target)
    return (
      <NavLink
        label={label}
        rightSection={extra}
        active={active}
        aria-current={active ? 'page' : undefined}
        onClick={() => void setFilter(target)}
      />
    )
  }

  return (
    <nav className={classes.root} aria-label="Library">
      {heading('Library')}
      {entry('♪ All Music', { kind: 'all' })}
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        {entry('★ Favorites', { kind: 'favorites' })}
      </DropTarget>

      <Group justify="space-between" mt="md">
        {heading('Playlists')}
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New playlist"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      {playlists.length === 0 && (
        <Text size="sm" c="dimmed">
          No playlists yet
        </Text>
      )}
      {playlists.map((p) => (
        <PlaylistEntry
          key={p.id}
          playlist={p}
          link={entry(
            p.name,
            { kind: 'playlist', playlistId: p.id },
            p.source === 'apple_xml' ? (
              <Text
                span
                size="xs"
                c="dimmed"
                aria-label="From Apple Music"
                title="Imported from Apple Music"
              ></Text>
            ) : undefined
          )}
          onDropFiles={(ids) => void api.invoke('playlists:add', p.id, ids)}
          onRename={() => setPrompt({ mode: 'rename', playlist: p })}
          onDuplicate={() => void api.invoke('playlists:duplicate', p.id)}
          onDelete={() => setDeleting(p)}
        />
      ))}

      {heading('Programs')}
      <TextInput size="xs" placeholder="Search programs…" aria-label="Search programs" my="xs" />
      <ScrollArea className={classes.programs}>
        <Text size="sm" c="dimmed">
          No programs yet
        </Text>
      </ScrollArea>

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
    </nav>
  )
}
```

- [ ] **Step 5: Provide the library store to the app**

The sidebar now reads the store, so the app shell must provide it. In `src/renderer/src/App.tsx`:
1. Add `import { LibraryProvider } from './library/LibraryProvider'` after the `Sidebar` import.
2. Wrap the returned `<AppShell>…</AppShell>` in `<LibraryProvider api={window.api}>…</LibraryProvider>`.

Leave `<MusicPage api={window.api} />` as it is; Task 9 changes it.

- [ ] **Step 6: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: sidebar 5 pass; the suite: 271; typecheck, formatting and build are clean.

```bash
git add -A
git commit -m "feat(library): sidebar with favorites and playlists (create, rename, duplicate, delete, drop songs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Music page library table

**Files:**
- Create: `src/renderer/src/library/reorder.ts`, `src/renderer/src/library/LibraryTable.tsx`, `src/renderer/src/library/LibraryTable.module.css`, `src/renderer/src/pages/MusicPage.module.css`
- Modify: `src/renderer/src/pages/MusicPage.tsx` (replace), `src/renderer/src/App.tsx`, `tests/renderer/music-import.test.tsx` (replace)
- Test: `tests/renderer/library/reorder.test.ts`, `tests/renderer/library/music-page.test.tsx`

**Interfaces:**
- Consumes: the Task 7 store; the Task 8 drag helpers, dialogs and `renderWithLibrary`; `useImportFlow`, `ImportDialog`, `DropZone` and `errorMessage` (Plan 2).
- Produces:
  - **`moveBefore(order, moving, before | null)`:** keeps the moving items' relative order; dropping an item onto itself is a no-op.
  - **`LibraryTable()`:**
    - virtualized rows (32 px), with `initialRect` so it renders before measuring
    - sortable column headers with `aria-sort`
    - click, ⌘/Ctrl-click and Shift-click selection
    - rows drag the selected recordings
    - in a playlist (position order), dropping onto a row moves the dragged rows before it
  - **`MusicPage()`:** takes no props; the API comes from context.
    - a debounced search (150 ms)
    - the import buttons, and the drop zone kept from Plan 2
    - selection actions: Favorite/Unfavorite; Re-apply mapping… (with a confirmation and a result notice); Remove from playlist (in a playlist)

- [ ] **Step 1: Write the failing reorder test, then implement it**

`tests/renderer/library/reorder.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { moveBefore } from '@renderer/library/reorder'

describe('moveBefore', () => {
  test('moves items before a target, keeping their relative order', () => {
    expect(moveBefore([1, 2, 3, 4, 5], [4, 2], 1)).toEqual([2, 4, 1, 3, 5])
  })
  test('moves items to the end when there is no target', () => {
    expect(moveBefore([1, 2, 3], [1], null)).toEqual([2, 3, 1])
  })
  test('dropping an item onto itself changes nothing', () => {
    expect(moveBefore([1, 2, 3], [2], 2)).toEqual([1, 2, 3])
  })
})
```

Run: `npx vitest run tests/renderer/library/reorder.test.ts`
Expected: FAIL — `Failed to resolve import "@renderer/library/reorder"`.

`src/renderer/src/library/reorder.ts`:

```ts
// Moves `moving` (kept in their current relative order) to just before `before`, or to the end.
// Dropping onto one of the moving items leaves the order unchanged.
export function moveBefore(order: number[], moving: number[], before: number | null): number[] {
  if (before !== null && moving.includes(before)) return order
  const set = new Set(moving)
  const moved = order.filter((id) => set.has(id))
  const rest = order.filter((id) => !set.has(id))
  const at = before === null ? rest.length : rest.indexOf(before)
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
}
```

Run it again. Expected: 3 pass.

- [ ] **Step 2: Write the failing Music page tests, and move the import tests onto the library provider**

The Music page now reads from the library store, so the Plan 2 import tests render it with `renderWithLibrary`.

Replace `tests/renderer/music-import.test.tsx` with:

```tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { emptySummary, type ImportSummary } from '@shared/import'
import { DEFAULT_SETTINGS } from '@shared/settings'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from './fake-api'
import { renderWithLibrary } from './library/render-library'

const preview = {
  trackCount: 3,
  playlists: [
    { persistentId: 'BAL', name: 'Balkan', trackCount: 2 },
    { persistentId: 'CPL', name: 'Couple dances', trackCount: 1 }
  ]
}

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return { ...emptySummary(), ...overrides }
}

describe('Music page import', () => {
  test('shows how many songs are in the library', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 42 } })
    renderWithLibrary(<MusicPage />, fake.api)
    expect(await screen.findByText('42 songs in your library')).toBeInTheDocument()
  })

  test('Add Music: pick, confirm the mapping, import, and see the summary', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music/Balkan'],
      'import:start': summary({
        added: [{ path: '/Music/Balkan/Ajde Jano.mp3' }, { path: '/Music/Balkan/Kolo.mp3' }],
        unsupported: [{ path: '/Music/Balkan/Old.aiff', detail: 'Format not supported' }]
      })
    })
    renderWithLibrary(<MusicPage />, fake.api)

    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })
    expect(within(dialog).getByLabelText('Genre is Country')).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([[{ kind: 'paths', paths: ['/Music/Balkan'] }]])
    expect(await screen.findByText('Added (2)')).toBeInTheDocument()
    expect(screen.getByText('Unsupported format (1)')).toBeInTheDocument()
  })

  test('saves the mapping the user chose before importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })

    await userEvent.click(within(dialog).getByLabelText('Genre is Country'))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Album Artist → Teacher' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(fake.callsTo('import:start')).toHaveLength(1))
    expect(fake.settings['import.genreIsCountry']).toBe(false)
    expect(fake.settings['import.albumArtistTagTarget']).toBe('teacher')
  })

  test('does nothing when the picker is cancelled', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:pickMusic': [] })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await waitFor(() => expect(fake.callsTo('import:pickMusic')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows progress and can cancel a running import', async () => {
    let finish: (s: ImportSummary) => void = () => undefined
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': () => new Promise<ImportSummary>((resolve) => (finish = resolve)),
      'import:cancel': undefined
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )

    act(() =>
      fake.emit('import:progress', {
        phase: 'reading',
        done: 3,
        total: 10,
        currentPath: '/Music/Kolo.mp3'
      })
    )
    expect(await screen.findByText('3 of 10')).toBeInTheDocument()
    expect(screen.getByText('Kolo.mp3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }))
    expect(fake.callsTo('import:cancel')).toHaveLength(1)

    await act(async () => finish(summary({ cancelled: true, added: [{ path: '/Music/a.mp3' }] })))
    expect(
      await screen.findByText(/songs imported before you stopped it were kept/)
    ).toBeInTheDocument()
  })

  test('dropping files opens the import with their paths', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:start': summary() }, [
      '/Users/me/Desktop/Hora.mp3'
    ])
    renderWithLibrary(<MusicPage />, fake.api)
    const zone = await screen.findByText(/Drop music files or folders here/)
    const file = new File(['x'], 'Hora.mp3')
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    expect(fake.callsTo('import:start')).toEqual([
      [{ kind: 'paths', paths: ['/Users/me/Desktop/Hora.mp3'] }]
    ])
  })

  test('refreshes the song count after an import', async () => {
    let count = 0
    const fake = createFakeApi({
      'library:stats': () => ({ fileCount: count }),
      'import:pickMusic': ['/Music'],
      'import:start': () => {
        count = 5
        return summary({ added: [{ path: '/Music/a.mp3' }] })
      }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(await screen.findByText('5 songs in your library')).toBeInTheDocument()
  })
})

describe('import dialog robustness', () => {
  test('double-clicking Import starts only one import', async () => {
    // Real IPC takes a few milliseconds; the second click lands while settings are saving.
    const slowSet = async () => {
      await new Promise((r) => setTimeout(r, 50))
      return DEFAULT_SETTINGS
    }
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'settings:set': slowSet,
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.dblClick(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    await screen.findByText('Import finished')
    expect(fake.callsTo('import:start')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('a result that arrives after the dialog was closed does not reopen it', async () => {
    let resolvePreview: (p: typeof preview) => void = () => undefined
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': () => new Promise((resolve) => (resolvePreview = resolve))
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    await screen.findByText('Reading your Apple Music library…')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => resolvePreview(preview))
    // Give the modal's open transition time to mount if it (wrongly) reopens.
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Apple Music import', () => {
  test('imports chosen playlists and asks about playlists edited since the last import', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [{ persistentId: 'BAL', name: 'Balkan' }],
      'import:start': summary({
        playlists: { created: [], replaced: [], kept: [], duplicated: ['Balkan (Apple Music)'] }
      })
    })
    renderWithLibrary(<MusicPage />, fake.api)

    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import from Apple Music' })
    expect(await within(dialog).findByText('3 songs with files on this Mac')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Choose playlists' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Balkan (2 songs)' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL']]])
    expect(await screen.findByText(/changed since you last imported/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Keep both' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([
      [
        {
          kind: 'apple',
          xmlPath: '/Users/me/Library.xml',
          selection: { mode: 'playlists', persistentIds: ['BAL'] },
          decisions: { BAL: 'both' }
        }
      ]
    ])
    expect(await screen.findByText(/imported as a copy: 1/)).toBeInTheDocument()
  })

  test('whole library with no conflicts goes straight to importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [],
      'import:start': summary()
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL', 'CPL']]])
    await waitFor(() =>
      expect(fake.callsTo('import:start')).toEqual([
        [
          {
            kind: 'apple',
            xmlPath: '/Users/me/Library.xml',
            selection: { mode: 'all' },
            decisions: {}
          }
        ]
      ])
    )
  })

  test('explains when the file is not an Apple Music library', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/notes.xml',
      'import:previewApple': () => {
        throw new Error(
          "Error invoking remote method 'import:previewApple': Error: This file is not an Apple Music library export (Library.xml)."
        )
      }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not an Apple Music library export (Library.xml).'
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('invoking remote method')
  })
})
```

`tests/renderer/library/music-page.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import { FILES_MIME } from '@renderer/library/drag'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const row = (songId: number, extra: Partial<LibraryRow> = {}): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: 183_000,
  isMissing: false,
  isFavorite: false,
  danceId: songId + 500,
  danceName: `Dance ${songId}`,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  label: `Song ${songId} | Dance ${songId}`,
  playlistItemId: null,
  ...extra
})

const rows = [
  row(1, {
    title: 'Pusteno Ludo',
    label: 'Pusteno Ludo | Pravo Rhodopsko Oro',
    country: 'Bulgaria',
    teacher: 'Sonia Dion',
    danceCount: 2
  }),
  row(2, { title: 'Hora Fetelor', label: 'Hora Fetelor', country: 'Romania', isFavorite: true }),
  row(3, { title: 'Gone', label: 'Gone', isMissing: true })
]

function setup(extra: Record<string, unknown> = {}, withSidebar = false) {
  const fake = createFakeApi({
    'library:list': rows,
    'library:stats': { fileCount: 3 },
    'library:setFavorite': undefined,
    'library:reapplyMapping': { songs: 2, skippedSharedDances: 1 },
    'library:song': null,
    ...extra
  })
  renderWithLibrary(
    withSidebar ? (
      <>
        <Sidebar />
        <MusicPage />
      </>
    ) : (
      <MusicPage />
    ),
    fake.api
  )
  return fake
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery
const rowFor = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement

describe('Music page library table', () => {
  test('shows each song’s label, country and teacher, flagging missing files and extra dances', async () => {
    setup()
    expect(await screen.findByText('Pusteno Ludo | Pravo Rhodopsko Oro')).toBeInTheDocument()
    const pusteno = rowFor('Pusteno Ludo | Pravo Rhodopsko Oro')
    expect(within(pusteno).getByText('Bulgaria')).toBeInTheDocument()
    expect(within(pusteno).getByText('Sonia Dion')).toBeInTheDocument()
    expect(within(pusteno).getByText('+1')).toBeInTheDocument()
    expect(within(pusteno).getByText('3:03')).toBeInTheDocument()
    expect(within(rowFor('Gone')).getByLabelText('File missing')).toBeInTheDocument()
  })

  test('sorts by a column header, toggling the direction', async () => {
    const fake = setup()
    const header = await screen.findByRole('columnheader', { name: /Country/ })
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'asc' })
    )
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'desc' })
    )
  })

  test('searches as you type', async () => {
    const fake = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search music' }), 'hora')
    await waitFor(() => expect(lastQuery(fake).search).toBe('hora'))
  })

  test('selects with click, ⌘-click and shift-click', async () => {
    setup()
    await screen.findByText('Gone')
    await userEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Gone'), { shiftKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2)
  })

  test('dragging rows carries the selected recordings', async () => {
    setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    const data: Record<string, string> = {}
    fireEvent.dragStart(rowFor('Hora Fetelor'), {
      dataTransfer: { setData: (t: string, v: string) => (data[t] = v), effectAllowed: '' }
    })
    expect(JSON.parse(data[FILES_MIME])).toEqual([101, 102])
  })

  test('marks the selection as favorites', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    await userEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })

  test('re-applies the mapping to the selection after confirming, and reports skipped dances', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Re-apply mapping…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Re-apply mapping?' })
    expect(dialog).toHaveTextContent('2 songs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-apply' }))
    expect(fake.callsTo('library:reapplyMapping')).toEqual([[[1, 2]]])
    expect(await screen.findByText(/Updated 2 songs/)).toHaveTextContent(
      '1 dance used by other songs was left unchanged'
    )
  })
})

describe('Music page in a playlist', () => {
  const inPlaylist = [
    row(1, { label: 'A', playlistItemId: 11 }),
    row(2, { label: 'B', playlistItemId: 12 }),
    row(3, { label: 'C', playlistItemId: 13 })
  ]

  const playlist = [{ id: 7, name: 'Mine', source: 'local', itemCount: 3 }]

  async function openPlaylist(): Promise<void> {
    await userEvent.click(await screen.findByText('Mine'))
    await screen.findByText('A')
  }

  test('removes the selected songs from the playlist', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:remove': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('B'))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from playlist' }))
    expect(fake.callsTo('playlists:remove')).toEqual([[7, [12]]])
  })

  test('dropping songs onto a row moves them before it', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:reorder': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('C'))
    fireEvent.drop(rowFor('A'), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([103]) }
    })
    await waitFor(() => expect(fake.callsTo('playlists:reorder')).toEqual([[7, [13, 11, 12]]]))
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library/music-page.test.tsx tests/renderer/music-import.test.tsx`
Expected: FAIL. The Music page still takes an `api` prop and has no table, so rows, headers and selection actions aren't found.

- [ ] **Step 4: Implement the table and the Music page**

`src/renderer/src/library/LibraryTable.module.css`:

```css
.table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-md);
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 28px minmax(220px, 3fr) repeat(4, minmax(90px, 1fr)) 80px 56px;
  align-items: center;
  column-gap: var(--mantine-spacing-xs);
  padding: 0 var(--mantine-spacing-xs);
  height: 32px;
  font-size: var(--mantine-font-size-sm);
  user-select: none;
}

.header {
  composes: row;
  font-weight: 600;
  border-bottom: 1px solid var(--mantine-color-default-border);
  background: var(--mantine-color-default);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.body {
  position: relative;
  width: 100%;
}

.item {
  composes: row;
  position: absolute;
  left: 0;
  right: 0;
  cursor: default;
}

.item:hover {
  background: var(--mantine-color-default-hover);
}

.item[aria-selected='true'] {
  background: var(--mantine-primary-color-light);
}

.missing {
  color: var(--mantine-color-dimmed);
}

.cell {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dropBefore {
  box-shadow: inset 0 2px 0 var(--mantine-primary-color-filled);
}
```

`src/renderer/src/library/LibraryTable.tsx`:

```tsx
import { useRef, useState } from 'react'
import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryRow, SortColumn } from '@shared/library'
import { carriesFiles, getDraggedFiles, setDraggedFiles } from './drag'
import { useLibrary, useLibraryApi, useLibraryStore } from './LibraryProvider'
import { moveBefore } from './reorder'
import classes from './LibraryTable.module.css'

const duration = (ms: number | null): string => {
  if (ms === null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Column {
  sort: SortColumn | null
  label: string
  render: (row: LibraryRow) => React.ReactNode
}

const COLUMNS: Column[] = [
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
  { sort: 'duration', label: 'Time', render: (r) => duration(r.durationMs) }
]

// Spec §6.3: browse, sort, search and select songs; drag them onto playlists. Virtualized, so
// large libraries stay fast. In a playlist (in its own order), dropping songs on a row moves them.
export default function LibraryTable(): React.JSX.Element {
  const api = useLibraryApi()
  const store = useLibraryStore()
  const rows = useLibrary((s) => s.rows)
  const selected = useLibrary((s) => s.selected)
  const sort = useLibrary((s) => s.sort)
  const filter = useLibrary((s) => s.filter)
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
  const reorderable = filter.kind === 'playlist' && sort.column === 'position'

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
    <div className={classes.table} role="table" aria-label="Songs" aria-rowcount={rows.length}>
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

`src/renderer/src/pages/MusicPage.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-sm);
  height: 100%;
  min-height: 0;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--mantine-spacing-sm);
}
```

Replace `src/renderer/src/pages/MusicPage.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { ReapplyResult } from '@shared/library'
import ConfirmDialog from '../components/ConfirmDialog'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'
import { errorMessage } from '../ipc-error'
import LibraryTable from '../library/LibraryTable'
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
  const setSearch = useLibrary((s) => s.setSearch)
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [search, setSearchText] = useState('')
  const [debounced] = useDebouncedValue(search, 150)
  const [confirmReapply, setConfirmReapply] = useState(false)
  const [notice, setNotice] = useState<{ color: string; text: string } | null>(null)

  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  useEffect(() => {
    void setSearch(debounced)
  }, [debounced, setSearch])
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
        <TextInput
          type="search"
          role="searchbox"
          aria-label="Search music"
          placeholder="Search song, dance, teacher, choreographer or country"
          value={search}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
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
            <Button variant="default" onClick={() => setConfirmReapply(true)}>
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
      </div>
      <ImportDialog flow={flow} />
      <ConfirmDialog
        opened={confirmReapply}
        title="Re-apply mapping?"
        message={`Re-apply the import mapping to ${selected.length} ${
          selected.length === 1 ? 'song' : 'songs'
        }? Their artist, teacher, choreographer and country are replaced from the files' tags, using the mapping in Settings.`}
        confirmLabel="Re-apply"
        onConfirm={() =>
          act(async () => {
            const ids = store
              .getState()
              .selectedRows()
              .map((r) => r.songId)
            const result = await api.invoke('library:reapplyMapping', ids)
            setNotice({ color: 'blue', text: reapplyMessage(result) })
          })
        }
        onClose={() => setConfirmReapply(false)}
      />
    </div>
  )
}
```

In `src/renderer/src/App.tsx`, change `{page === 'music' && <MusicPage api={window.api} />}` to `{page === 'music' && <MusicPage />}`.

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected:
- Music page: 9 pass.
- Import UI: 12 pass.
- The suite: 283.
- Typecheck, formatting and build are clean.

```bash
git add -A
git commit -m "feat(library): Music page table with search, sorting, selection, drag, favorites and re-apply mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The song editor

**Files:**
- Create: `src/renderer/src/library/fields.tsx`, `src/renderer/src/library/DancePicker.tsx`, `src/renderer/src/library/SongEditor.tsx`
- Modify: `src/renderer/src/pages/MusicPage.tsx` and `MusicPage.module.css` (replace), `tests/renderer/setup.ts` (replace), `tests/renderer/library/music-page.test.tsx` (replace)
- Test: `tests/renderer/library/song-editor.test.tsx`

**Interfaces:**
- Consumes: Task 6 channels, Task 8 dialogs, Task 7 hooks.
- Produces:
  - **`TextField`, `SuggestField` (Mantine `Autocomplete`), `NotesField`:** each keeps a draft and saves on blur **once per change**. It remembers the value it last saved, so a second blur before the reload arrives doesn't save again.
  - **`DancePicker({ opened, title, actionLabel, exclude, onPick, onClose })`:** a debounced `library:searchDances` search. Each result is a button labelled `` `${actionLabel} ${name} (${details})` ``.
  - **`SongEditor({ songId })`:**
    - loads the song and the suggestions, and reloads on `library:changed`
    - each dance is a `role="group"` labelled with its label
    - controls: make default; "⋯" with Merge into another dance… and Unlink from this song; Link a dance…; New dance…
    - same-name suggestions with Same dance / Different dance
    - errors are shown through `errorMessage`
  - **`MusicPage`:** shows the editor in an `<aside aria-label="Song editor">` when exactly one song is selected.

**jsdom notes:**
- Mantine's auto-growing `Textarea` listens on `document.fonts`, so `setup.ts` stubs it.
- Mantine's `Rating` takes clicks on each star's **label**, and its first radio is a hidden "0", so the test clicks `getByRole('radio', { name: '4' }).labels[0]`.

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

afterEach(() => cleanup())
```

`tests/renderer/library/song-editor.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { SongDetail } from '@shared/library'
import SongEditor from '@renderer/library/SongEditor'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const detail = (overrides: Partial<SongDetail> = {}): SongDetail => ({
  songId: 1,
  fileId: 101,
  title: 'Pusteno Ludo',
  artist: 'Trakia',
  path: '/Music/Pusteno Ludo.mp3',
  durationMs: 183_000,
  isMissing: false,
  isFavorite: false,
  dances: [
    {
      danceId: 11,
      pairingId: 21,
      name: 'Pravo Rhodopsko Oro',
      country: 'Bulgaria',
      choreographer: 'Yves Moreau',
      danceType: null,
      difficulty: 2,
      notes: null,
      teacher: 'Sonia Dion',
      songCount: 3,
      isDefault: true,
      label: 'Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)'
    },
    {
      danceId: 12,
      pairingId: 22,
      name: 'Lesnoto',
      country: null,
      choreographer: 'Someone',
      danceType: null,
      difficulty: null,
      notes: null,
      teacher: null,
      songCount: 1,
      isDefault: false,
      label: 'Pusteno Ludo | Lesnoto (Someone)'
    }
  ],
  suggestions: [],
  ...overrides
})

function setup(song: SongDetail = detail(), extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'library:song': song,
    'library:suggestions': {
      people: ['Sonia Dion', 'Yves Moreau'],
      countries: ['Bulgaria'],
      danceTypes: ['Line']
    },
    'library:updateSong': undefined,
    'library:updateDance': undefined,
    'library:setTeacher': undefined,
    'library:setDefaultDance': undefined,
    'library:unlinkDance': undefined,
    'library:linkDance': undefined,
    'library:createDance': 13,
    'library:mergeDances': undefined,
    'library:sameDance': undefined,
    'library:markDifferent': undefined,
    'library:searchDances': [
      { danceId: 12, name: 'Lesnoto', choreographer: 'Someone', country: null, songCount: 1 },
      { danceId: 30, name: 'Lesnoto', choreographer: null, country: 'Macedonia', songCount: 9 }
    ],
    ...extra
  })
  renderWithLibrary(<SongEditor songId={1} />, fake.api)
  return fake
}

const danceCard = (name: string) => screen.getByRole('group', { name }) as HTMLElement

async function edit(input: HTMLElement, value: string): Promise<void> {
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
  fireEvent.blur(input)
}

describe('SongEditor', () => {
  test('shows the song and each dance by its label, with the default first', async () => {
    setup()
    expect(await screen.findByDisplayValue('Pusteno Ludo')).toBeInTheDocument()
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)',
      'Pusteno Ludo | Lesnoto (Someone)'
    ])
    expect(
      within(danceCard('Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)')).getByText(/Default/)
    ).toBeInTheDocument()
    expect(
      screen.getByText('Also used by 2 other songs: changes apply to all of them.')
    ).toBeInTheDocument()
  })

  test('saves the song title when you leave the field, only if it changed', async () => {
    const fake = setup()
    const title = await screen.findByLabelText('Title')
    fireEvent.blur(title)
    await edit(title, 'Pusteno Ludo (live)')
    await waitFor(() =>
      expect(fake.callsTo('library:updateSong')).toEqual([[1, { title: 'Pusteno Ludo (live)' }]])
    )
  })

  test('saves dance fields and the pairing’s teacher', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const card = within(danceCard('Pusteno Ludo | Pravo Rhodopsko Oro (Yves Moreau)'))
    await edit(card.getByLabelText('Country'), 'Bulgaria (Rhodopes)')
    await edit(card.getByLabelText('Teacher'), '')
    await waitFor(() =>
      expect(fake.callsTo('library:updateDance')).toEqual([
        [11, { country: 'Bulgaria (Rhodopes)' }]
      ])
    )
    expect(fake.callsTo('library:setTeacher')).toEqual([[21, '']])
  })

  test('sets the difficulty', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const card = within(danceCard('Pusteno Ludo | Lesnoto (Someone)'))
    // Mantine's Rating takes the click on each star's label.
    const four = card.getByRole('radio', { name: '4' }) as HTMLInputElement
    await userEvent.click(four.labels![0])
    expect(fake.callsTo('library:updateDance')).toEqual([[12, { difficulty: 4 }]])
  })

  test('makes another dance the default, and unlinks one', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const lesnoto = within(danceCard('Pusteno Ludo | Lesnoto (Someone)'))
    await userEvent.click(lesnoto.getByRole('button', { name: 'Make default' }))
    expect(fake.callsTo('library:setDefaultDance')).toEqual([[1, 12]])
    await userEvent.click(lesnoto.getByRole('button', { name: 'Dance options' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Unlink from this song' }))
    expect(fake.callsTo('library:unlinkDance')).toEqual([[1, 12]])
  })

  test('links an existing dance found by searching', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Link a dance…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Link a dance' })
    await userEvent.type(within(dialog).getByLabelText('Search dances'), 'lesn')
    await waitFor(() => expect(fake.callsTo('library:searchDances').at(-1)).toEqual(['lesn']))
    // Dances already linked to the song aren't offered.
    const options = await within(dialog).findAllByRole('button', { name: /^Link / })
    expect(options).toHaveLength(1)
    await userEvent.click(options[0])
    expect(fake.callsTo('library:linkDance')).toEqual([[1, 30]])
  })

  test('creates a new dance for the song', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New dance…' }))
    const dialog = await screen.findByRole('dialog', { name: 'New dance' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Pravo Horo')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('library:createDance')).toEqual([[1, 'Pravo Horo']])
  })

  test('merges a dance into another after confirming', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const lesnoto = within(danceCard('Pusteno Ludo | Lesnoto (Someone)'))
    await userEvent.click(lesnoto.getByRole('button', { name: 'Dance options' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Merge into another dance…' })
    )
    const picker = await screen.findByRole('dialog', { name: 'Merge “Lesnoto” into…' })
    await userEvent.type(within(picker).getByLabelText('Search dances'), 'lesnoto')
    await userEvent.click(
      await within(picker).findByRole('button', { name: /^Merge into Lesnoto/ })
    )
    const confirm = await screen.findByRole('dialog', { name: 'Merge dances?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Merge' }))
    expect(fake.callsTo('library:mergeDances')).toEqual([[30, 12]])
  })

  test('answers a same-name suggestion', async () => {
    const fake = setup(
      detail({
        suggestions: [
          {
            forDanceId: 12,
            candidate: {
              danceId: 30,
              name: 'Lesnoto',
              choreographer: null,
              country: 'Macedonia',
              songTitles: ['Lesnoto Oro', 'Gaida']
            }
          }
        ]
      })
    )
    const alert = await screen.findByText(/Another dance called “Lesnoto” exists/)
    expect(alert).toHaveTextContent('Lesnoto Oro, Gaida')
    await userEvent.click(screen.getByRole('button', { name: 'Same dance' }))
    expect(fake.callsTo('library:sameDance')).toEqual([[1, 12, 30]])
    await userEvent.click(screen.getByRole('button', { name: 'Different dance' }))
    expect(fake.callsTo('library:markDifferent')).toEqual([[12, 30]])
  })

  test('shows why a change was refused', async () => {
    setup(detail(), {
      'library:updateSong': () => {
        throw new Error(
          "Error invoking remote method 'library:updateSong': LibraryEditError: A song title can't be empty."
        )
      }
    })
    await edit(await screen.findByLabelText('Title'), ' ')
    expect(await screen.findByRole('alert')).toHaveTextContent("A song title can't be empty.")
  })

  test('refreshes when the library changes', async () => {
    const fake = setup()
    await screen.findByDisplayValue('Pusteno Ludo')
    const before = fake.callsTo('library:song').length
    fake.emit('library:changed', null)
    await waitFor(() => expect(fake.callsTo('library:song').length).toBe(before + 1))
  })
})
```

This version of the Music page tests adds "opens the song editor beside the table…".

Replace `tests/renderer/library/music-page.test.tsx` with:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import { FILES_MIME } from '@renderer/library/drag'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const row = (songId: number, extra: Partial<LibraryRow> = {}): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: 183_000,
  isMissing: false,
  isFavorite: false,
  danceId: songId + 500,
  danceName: `Dance ${songId}`,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  label: `Song ${songId} | Dance ${songId}`,
  playlistItemId: null,
  ...extra
})

const rows = [
  row(1, {
    title: 'Pusteno Ludo',
    label: 'Pusteno Ludo | Pravo Rhodopsko Oro',
    country: 'Bulgaria',
    teacher: 'Sonia Dion',
    danceCount: 2
  }),
  row(2, { title: 'Hora Fetelor', label: 'Hora Fetelor', country: 'Romania', isFavorite: true }),
  row(3, { title: 'Gone', label: 'Gone', isMissing: true })
]

function setup(extra: Record<string, unknown> = {}, withSidebar = false) {
  const fake = createFakeApi({
    'library:list': rows,
    'library:stats': { fileCount: 3 },
    'library:setFavorite': undefined,
    'library:reapplyMapping': { songs: 2, skippedSharedDances: 1 },
    'library:song': null,
    ...extra
  })
  renderWithLibrary(
    withSidebar ? (
      <>
        <Sidebar />
        <MusicPage />
      </>
    ) : (
      <MusicPage />
    ),
    fake.api
  )
  return fake
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery
const rowFor = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement

describe('Music page library table', () => {
  test('shows each song’s label, country and teacher, flagging missing files and extra dances', async () => {
    setup()
    expect(await screen.findByText('Pusteno Ludo | Pravo Rhodopsko Oro')).toBeInTheDocument()
    const pusteno = rowFor('Pusteno Ludo | Pravo Rhodopsko Oro')
    expect(within(pusteno).getByText('Bulgaria')).toBeInTheDocument()
    expect(within(pusteno).getByText('Sonia Dion')).toBeInTheDocument()
    expect(within(pusteno).getByText('+1')).toBeInTheDocument()
    expect(within(pusteno).getByText('3:03')).toBeInTheDocument()
    expect(within(rowFor('Gone')).getByLabelText('File missing')).toBeInTheDocument()
  })

  test('sorts by a column header, toggling the direction', async () => {
    const fake = setup()
    const header = await screen.findByRole('columnheader', { name: /Country/ })
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'asc' })
    )
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'desc' })
    )
  })

  test('searches as you type', async () => {
    const fake = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search music' }), 'hora')
    await waitFor(() => expect(lastQuery(fake).search).toBe('hora'))
  })

  test('selects with click, ⌘-click and shift-click', async () => {
    setup()
    await screen.findByText('Gone')
    await userEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Gone'), { shiftKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2)
  })

  test('dragging rows carries the selected recordings', async () => {
    setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    const data: Record<string, string> = {}
    fireEvent.dragStart(rowFor('Hora Fetelor'), {
      dataTransfer: { setData: (t: string, v: string) => (data[t] = v), effectAllowed: '' }
    })
    expect(JSON.parse(data[FILES_MIME])).toEqual([101, 102])
  })

  test('opens the song editor beside the table when exactly one song is selected', async () => {
    const fake = setup({
      'library:song': {
        songId: 2,
        fileId: 102,
        title: 'Hora Fetelor',
        artist: null,
        path: '/m/2.mp3',
        durationMs: 1,
        isMissing: false,
        isFavorite: true,
        dances: [],
        suggestions: []
      }
    })
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Hora Fetelor'))
    expect(await screen.findByDisplayValue('Hora Fetelor')).toBeInTheDocument()
    expect(fake.callsTo('library:song')).toEqual([[2]])
    fireEvent.click(rowFor('Gone'), { metaKey: true })
    await waitFor(() => expect(screen.queryByDisplayValue('Hora Fetelor')).not.toBeInTheDocument())
  })

  test('marks the selection as favorites', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    await userEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })

  test('re-applies the mapping to the selection after confirming, and reports skipped dances', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Re-apply mapping…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Re-apply mapping?' })
    expect(dialog).toHaveTextContent('2 songs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-apply' }))
    expect(fake.callsTo('library:reapplyMapping')).toEqual([[[1, 2]]])
    expect(await screen.findByText(/Updated 2 songs/)).toHaveTextContent(
      '1 dance used by other songs was left unchanged'
    )
  })
})

describe('Music page in a playlist', () => {
  const inPlaylist = [
    row(1, { label: 'A', playlistItemId: 11 }),
    row(2, { label: 'B', playlistItemId: 12 }),
    row(3, { label: 'C', playlistItemId: 13 })
  ]

  const playlist = [{ id: 7, name: 'Mine', source: 'local', itemCount: 3 }]

  async function openPlaylist(): Promise<void> {
    await userEvent.click(await screen.findByText('Mine'))
    await screen.findByText('A')
  }

  test('removes the selected songs from the playlist', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:remove': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('B'))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from playlist' }))
    expect(fake.callsTo('playlists:remove')).toEqual([[7, [12]]])
  })

  test('dropping songs onto a row moves them before it', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:reorder': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('C'))
    fireEvent.drop(rowFor('A'), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([103]) }
    })
    await waitFor(() => expect(fake.callsTo('playlists:reorder')).toEqual([[7, [13, 11, 12]]]))
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library/song-editor.test.tsx tests/renderer/library/music-page.test.tsx`
Expected: FAIL. `@renderer/library/SongEditor` can't be resolved, and "opens the song editor…" fails because no editor appears.

- [ ] **Step 3: Implement the fields, the picker and the editor**

`src/renderer/src/library/fields.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Autocomplete, Textarea, TextInput } from '@mantine/core'

// Inputs that keep their own value while you type and save once you leave the field, only if
// the value changed. They follow the saved value when it changes underneath them.

interface FieldProps {
  label: string
  value: string | null
  onSave: (value: string) => void
}

// The field's text while editing, and a blur handler that saves it once if it changed. A value
// already saved isn't saved again while the reloaded value is on its way.
function useDraft(value: string | null, onSave: (v: string) => void) {
  const [draft, setDraft] = useState(value ?? '')
  const saved = useRef(value ?? '')
  useEffect(() => {
    setDraft(value ?? '')
    saved.current = value ?? ''
  }, [value])
  const onBlur = (): void => {
    if (draft === saved.current) return
    saved.current = draft
    onSave(draft)
  }
  return { draft, setDraft, onBlur }
}

export function TextField(props: FieldProps): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <TextInput
      label={props.label}
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
    />
  )
}

export function SuggestField(props: FieldProps & { suggestions: string[] }): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <Autocomplete
      label={props.label}
      data={props.suggestions}
      value={draft}
      onChange={setDraft}
      onBlur={onBlur}
      limit={8}
    />
  )
}

export function NotesField(props: FieldProps): React.JSX.Element {
  const { draft, setDraft, onBlur } = useDraft(props.value, props.onSave)
  return (
    <Textarea
      label={props.label}
      autosize
      minRows={2}
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
    />
  )
}
```

`src/renderer/src/library/DancePicker.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { DanceSearchResult } from '@shared/library'
import { useLibraryApi } from './LibraryProvider'

const describe = (d: DanceSearchResult): string =>
  [
    d.choreographer && `by ${d.choreographer}`,
    d.country,
    `${d.songCount} ${d.songCount === 1 ? 'song' : 'songs'}`
  ]
    .filter(Boolean)
    .join(' · ')

// Finds an existing dance (by name, choreographer or country) for "Link a dance" and "Merge into".
export default function DancePicker(props: {
  opened: boolean
  title: string
  actionLabel: string // e.g. "Link" or "Merge into"
  exclude: number[]
  onPick: (dance: DanceSearchResult) => void
  onClose: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, 150)
  const [results, setResults] = useState<DanceSearchResult[]>([])

  useEffect(() => {
    if (!props.opened) return
    let current = true
    api.invoke('library:searchDances', debounced).then((r) => current && setResults(r))
    return () => {
      current = false
    }
  }, [api, debounced, props.opened])
  useEffect(() => {
    if (props.opened) setText('')
  }, [props.opened])

  const shown = results.filter((d) => !props.exclude.includes(d.danceId))
  return (
    <Modal opened={props.opened} onClose={props.onClose} title={props.title}>
      <Stack>
        <TextInput
          label="Search dances"
          placeholder="Name, choreographer or country"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <ScrollArea.Autosize mah={320}>
          <Stack gap={4}>
            {shown.length === 0 && <Text c="dimmed">No dances found.</Text>}
            {shown.map((d) => (
              <Button
                key={d.danceId}
                variant="subtle"
                justify="space-between"
                aria-label={`${props.actionLabel} ${d.name} (${describe(d)})`}
                onClick={() => props.onPick(d)}
                rightSection={
                  <Text span size="xs" c="dimmed">
                    {describe(d)}
                  </Text>
                }
              >
                {d.name}
              </Button>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  )
}
```

`src/renderer/src/library/SongEditor.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Rating,
  Stack,
  Text,
  Title
} from '@mantine/core'
import type { DanceSearchResult, SongDance, SongDetail, Suggestions } from '@shared/library'
import ConfirmDialog from '../components/ConfirmDialog'
import NamePrompt from '../components/NamePrompt'
import { errorMessage } from '../ipc-error'
import DancePicker from './DancePicker'
import { NotesField, SuggestField, TextField } from './fields'
import { useLibraryApi } from './LibraryProvider'

const NO_SUGGESTIONS: Suggestions = { people: [], countries: [], danceTypes: [] }

// Spec §6.3: edit one song and every dance linked to it.
export default function SongEditor({ songId }: { songId: number }): React.JSX.Element | null {
  const api = useLibraryApi()
  const [song, setSong] = useState<SongDetail | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestions>(NO_SUGGESTIONS)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<
    { mode: 'link' } | { mode: 'merge'; dance: SongDance } | null
  >(null)
  const [merging, setMerging] = useState<{ from: SongDance; into: DanceSearchResult } | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [detail, lists] = await Promise.all([
      api.invoke('library:song', songId),
      api.invoke('library:suggestions')
    ])
    setSong(detail)
    setSuggestions(lists)
  }, [api, songId])

  useEffect(() => {
    setError(null)
    void load()
    return api.on('library:changed', () => void load())
  }, [api, load])

  // Runs an edit; main announces the change, which reloads this editor.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null)
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!song) return null
  const linked = song.dances.map((d) => d.danceId)

  return (
    <Stack gap="sm">
      {error && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Title order={4}>Song</Title>
      {song.isMissing && <Alert color="yellow">The file for this song can't be found.</Alert>}
      <TextField
        label="Title"
        value={song.title}
        onSave={(title) => run(() => api.invoke('library:updateSong', songId, { title }))}
      />
      <TextField
        label="Artist"
        value={song.artist}
        onSave={(artist) => run(() => api.invoke('library:updateSong', songId, { artist }))}
      />
      <Text size="xs" c="dimmed" truncate title={song.path}>
        {song.path}
      </Text>

      <Group justify="space-between" mt="sm">
        <Title order={4}>Dances</Title>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => setPicker({ mode: 'link' })}>
            Link a dance…
          </Button>
          <Button size="xs" variant="default" onClick={() => setCreating(true)}>
            New dance…
          </Button>
        </Group>
      </Group>
      {song.dances.length === 0 && <Text c="dimmed">No dances linked to this song.</Text>}

      {song.suggestions.map((s) => {
        const dance = song.dances.find((d) => d.danceId === s.forDanceId)
        return (
          <Alert key={`${s.forDanceId}-${s.candidate.danceId}`} color="blue">
            <Text size="sm">
              Another dance called “{s.candidate.name}” exists
              {s.candidate.songTitles.length > 0 && ` (${s.candidate.songTitles.join(', ')})`}. Same
              dance as “{dance?.name}”?
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                size="xs"
                onClick={() =>
                  run(() =>
                    api.invoke('library:sameDance', songId, s.forDanceId, s.candidate.danceId)
                  )
                }
              >
                Same dance
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() =>
                  run(() => api.invoke('library:markDifferent', s.forDanceId, s.candidate.danceId))
                }
              >
                Different dance
              </Button>
            </Group>
          </Alert>
        )
      })}

      {song.dances.map((d) => (
        <Paper key={d.danceId} withBorder p="sm" role="group" aria-label={d.label}>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {d.label}
              </Text>
              <Group gap={4} wrap="nowrap">
                {d.isDefault ? (
                  <Badge size="sm" variant="light">
                    ★ Default
                  </Badge>
                ) : (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() =>
                      run(() => api.invoke('library:setDefaultDance', songId, d.danceId))
                    }
                  >
                    Make default
                  </Button>
                )}
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="sm" aria-label="Dance options">
                      ⋯
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setPicker({ mode: 'merge', dance: d })}>
                      Merge into another dance…
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      onClick={() =>
                        run(() => api.invoke('library:unlinkDance', songId, d.danceId))
                      }
                    >
                      Unlink from this song
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
            {d.songCount > 1 && (
              <Text size="xs" c="dimmed">
                Also used by {d.songCount - 1} other {d.songCount === 2 ? 'song' : 'songs'}: changes
                apply to all of them.
              </Text>
            )}
            <TextField
              label="Dance name"
              value={d.name}
              onSave={(name) => run(() => api.invoke('library:updateDance', d.danceId, { name }))}
            />
            <SuggestField
              label="Country"
              value={d.country}
              suggestions={suggestions.countries}
              onSave={(country) =>
                run(() => api.invoke('library:updateDance', d.danceId, { country }))
              }
            />
            <SuggestField
              label="Choreographer"
              value={d.choreographer}
              suggestions={suggestions.people}
              onSave={(choreographer) =>
                run(() => api.invoke('library:updateDance', d.danceId, { choreographer }))
              }
            />
            <SuggestField
              label="Teacher"
              value={d.teacher}
              suggestions={suggestions.people}
              onSave={(teacher) =>
                run(() => api.invoke('library:setTeacher', d.pairingId, teacher))
              }
            />
            <SuggestField
              label="Dance type"
              value={d.danceType}
              suggestions={suggestions.danceTypes}
              onSave={(danceType) =>
                run(() => api.invoke('library:updateDance', d.danceId, { danceType }))
              }
            />
            <Group gap="xs">
              <Text size="sm">Difficulty</Text>
              <Rating
                value={d.difficulty ?? 0}
                onChange={(difficulty) =>
                  run(() => api.invoke('library:updateDance', d.danceId, { difficulty }))
                }
              />
              {d.difficulty !== null && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    run(() => api.invoke('library:updateDance', d.danceId, { difficulty: null }))
                  }
                >
                  Clear
                </Button>
              )}
            </Group>
            <NotesField
              label="Notes"
              value={d.notes}
              onSave={(notes) => run(() => api.invoke('library:updateDance', d.danceId, { notes }))}
            />
          </Stack>
        </Paper>
      ))}

      <DancePicker
        opened={picker !== null}
        title={picker?.mode === 'merge' ? `Merge “${picker.dance.name}” into…` : 'Link a dance'}
        actionLabel={picker?.mode === 'merge' ? 'Merge into' : 'Link'}
        exclude={picker?.mode === 'merge' ? [picker.dance.danceId] : linked}
        onPick={(dance) => {
          const current = picker
          setPicker(null)
          if (current?.mode === 'merge') setMerging({ from: current.dance, into: dance })
          else void run(() => api.invoke('library:linkDance', songId, dance.danceId))
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmDialog
        opened={merging !== null}
        title="Merge dances?"
        message={`“${merging?.from.name}” will be merged into “${merging?.into.name}”: its songs, teachers and history move there, and “${merging?.from.name}” is deleted.`}
        confirmLabel="Merge"
        onConfirm={() =>
          merging &&
          run(() => api.invoke('library:mergeDances', merging.into.danceId, merging.from.danceId))
        }
        onClose={() => setMerging(null)}
      />
      <NamePrompt
        opened={creating}
        title="New dance"
        submitLabel="Create"
        onSubmit={(name) => api.invoke('library:createDance', songId, name)}
        onClose={() => setCreating(false)}
      />
    </Stack>
  )
}
```

- [ ] **Step 4: Show the editor on the Music page**

Replace `src/renderer/src/pages/MusicPage.module.css` with:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-sm);
  height: 100%;
  min-height: 0;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--mantine-spacing-sm);
}

.editor {
  width: 380px;
  flex-shrink: 0;
  overflow: auto;
  padding-right: var(--mantine-spacing-xs);
}
```

Replace `src/renderer/src/pages/MusicPage.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text, TextInput, Title } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { ReapplyResult } from '@shared/library'
import ConfirmDialog from '../components/ConfirmDialog'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'
import { errorMessage } from '../ipc-error'
import LibraryTable from '../library/LibraryTable'
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
  const setSearch = useLibrary((s) => s.setSearch)
  const [fileCount, setFileCount] = useState<number | null>(null)
  const [search, setSearchText] = useState('')
  const [debounced] = useDebouncedValue(search, 150)
  const [confirmReapply, setConfirmReapply] = useState(false)
  const [notice, setNotice] = useState<{ color: string; text: string } | null>(null)

  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  useEffect(() => {
    void setSearch(debounced)
  }, [debounced, setSearch])
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
        <TextInput
          type="search"
          role="searchbox"
          aria-label="Search music"
          placeholder="Search song, dance, teacher, choreographer or country"
          value={search}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
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
            <Button variant="default" onClick={() => setConfirmReapply(true)}>
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
      <ConfirmDialog
        opened={confirmReapply}
        title="Re-apply mapping?"
        message={`Re-apply the import mapping to ${selected.length} ${
          selected.length === 1 ? 'song' : 'songs'
        }? Their artist, teacher, choreographer and country are replaced from the files' tags, using the mapping in Settings.`}
        confirmLabel="Re-apply"
        onConfirm={() =>
          act(async () => {
            const ids = store
              .getState()
              .selectedRows()
              .map((r) => r.songId)
            const result = await api.invoke('library:reapplyMapping', ids)
            setNotice({ color: 'blue', text: reapplyMessage(result) })
          })
        }
        onClose={() => setConfirmReapply(false)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected:
- Song editor: 11 pass.
- Music page: 10 pass.
- The suite: 295.
- Typecheck, formatting and build are clean.

```bash
git add -A
git commit -m "feat(library): song editor with dances, teachers, merging and same-name suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Settings, spec and release notes

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx` (replace), `tests/renderer/settings-page.test.tsx` (replace), the spec, `CHANGELOG.md`, `AGENTS.md`

**Interfaces:**
- Consumes: `ImportMappingFields` (Plan 2), `errorMessage` (Plan 2).
- Produces:
  - **The Settings page:**
    - an **Import** section with the mapping defaults (`ImportMappingFields`; only the changed key is saved)
    - a **Library** section with a `TagsInput` labelled "Dance type suggestions", with placeholder "Add a dance type"
    - error text goes through `errorMessage` (a Plan 1 deferred minor)

- [ ] **Step 1: Write the failing tests**

Replace `tests/renderer/settings-page.test.tsx` with:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { RendererApi } from '@shared/contract'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import SettingsPage from '@renderer/pages/SettingsPage'
import { renderWithMantine } from './render'

function fakeApi(initial: Settings = DEFAULT_SETTINGS) {
  let current: Settings = { ...initial }
  const calls: unknown[][] = []
  const api: RendererApi = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      if (channel === 'settings:getAll') return current
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
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/settings-page.test.tsx`
Expected: FAIL. The 3 new tests fail: no Album Artist radio, no dance-type input, and the error text includes "Error invoking remote method".

- [ ] **Step 3: Implement**

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

Run: `npx vitest run tests/renderer/settings-page.test.tsx`
Expected: 7 pass.

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`, make these replacements (each "before" text appears exactly once):

1. Replace:

````markdown
slide_cache      (local)      deck_id, page_id, image_path, captured_at, last_error  PK (deck_id, page_id)
playlists        (personal)   id, name, source ('local'|'apple_xml'), apple_persistent_id,
````

   with:

````markdown
slide_cache      (local)      deck_id, page_id, image_path, captured_at, last_error  PK (deck_id, page_id)
distinct_dances  (personal)   dance_a, dance_b (dance_a < dance_b): same-named dances the user said are different
playlists        (personal)   id, name, source ('local'|'apple_xml'), apple_persistent_id,
````

2. Replace:

````markdown
- **Library and playlist entries** filter the library list. Songs can be dropped onto a playlist (or Favorites) to add them.
- **Right-clicking a playlist** offers rename, duplicate and delete.
- **Programs** are loaded only from the sidebar; there is no dropdown.
````

   with:

````markdown
- **Library and playlist entries** filter the library list. Songs can be dropped onto a playlist (or Favorites) to add them.
- **Each playlist's options** are on a "⋯" button that appears on hover, or by right-clicking: Rename…, Duplicate, and Delete… (with a confirmation).
- **Programs** are loaded only from the sidebar; there is no dropdown.
````

3. Replace:

````markdown

- **Table:** full-width and editable, one row per song.
  - **Columns:** song title, artist, dance (the default dance's name), country, teacher, choreographer, dance type, difficulty, favorite, slide, duration, path and status.
  - **Dance columns** edit the default dance. If that dance is linked to other songs too, the editor says so ("also used by 3 songs"), because the change applies to all of them.
- **Selected song:** a side editor with two sections.
````

   with:

````markdown

- **Table:** one row per song, for browsing, sorting, searching and selecting. It is virtualized, so it stays fast with large libraries. Editing happens in the side editor, not in the table. Click selects, ⌘-click adds to the selection, and Shift-click selects a range. Selected rows can be dragged onto a playlist or Favorites.
  - **Columns:** song title, artist, dance (the default dance's name), country, teacher, choreographer, dance type, difficulty, favorite, slide, duration, path and status.
  - **Song / Dance** shows the label (§4), with a "+N" badge when the song has more than one dance.
  - **In a playlist** (shown in its own order), dropping rows onto another row moves them there, and **Remove from playlist** removes the selection.
  - **When one song is selected,** the side editor opens beside the table. A dance shared with other songs says so ("Also used by 2 other songs"), because edits apply to all of them.
- **Selected song:** a side editor with two sections.
````

4. Replace:

````markdown
  - **Same dance:** links this song to that dance and removes the automatic duplicate, if nothing else uses it.
  - **Different dance:** dismisses the suggestion for that pair.
  - **Merge dances:** a general action for combining any two dances.
- **Actions:** Add Music…, Import from Apple Music…, Re-apply mapping to selected, Refresh slides.
- **Missing and unsupported files** are visibly flagged.
````

   with:

````markdown
  - **Same dance:** links this song to that dance and removes the automatic duplicate, if nothing else uses it.
  - **Different dance:** dismisses the suggestion for that pair, permanently (`distinct_dances`).
  - **Merge dances:** a general action for combining any two dances.
- **Actions:** Add Music…, Import from Apple Music…, Favorite/Unfavorite (selection), Re-apply mapping… (selection, after a confirmation), Refresh slides (plan 6).
- **Re-apply mapping** overwrites only the fields the current mapping targets: the song's artist, the default pairing's teacher, and the default dance's choreographer and country. If Genre → Country is off, countries are left alone. A default dance shared with other songs is left unchanged (it would change every song using it), and the result reports how many were skipped.
- **Missing and unsupported files** are visibly flagged.
````


- [ ] **Step 5: Release notes and decision log**

Append to the `### Added` list under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
- The Music page lists your whole library: search by song, dance, teacher, choreographer or country (accents don't matter), sort by any column, and select songs with click, ⌘-click or Shift-click.
- Edit a song and its dances in a side panel: dance name, country, choreographer, teacher, dance type, difficulty and notes, with suggestions from what you've entered before.
- Link a song to more dances, make one its default, unlink one, or merge two dances that are really the same. When two dances share a name, the app asks whether they're the same dance.
- Make playlists: create, rename, duplicate and delete them, drag songs onto them, reorder them, and remove songs. Mark favorites, and drag songs onto Favorites.
- Re-apply the import mapping to selected songs, after changing it in Settings.
- Settings: choose the default import mapping and edit the list of dance types.
```

Add these entries to the top of the Decisions list in `AGENTS.md` (newest first):

```markdown
- **2026-10-13 — Library UI state lives in a Zustand store created per API (`createLibraryStore`), provided by `LibraryProvider`.** The sidebar, table and editor share the filter, search, sort, rows and selection. Main stays the source of truth: every library or playlist edit returns, then main broadcasts `library:changed` (also after each import), and the store and editor refetch. `watch()` subscribes from an effect, so StrictMode's double mount doesn't drop the listener. Zustand selectors must return stable values; use `store.getState().selectedRows()` in handlers, never inside a selector.
- **2026-10-13 — The Music page table is browse-only; all editing is in the side editor.** Chosen by the user: it keeps the virtualized table (`@tanstack/react-virtual`) fast with large libraries and puts autocomplete editing in one place. Fields save on blur, once per change. _Rejected:_ spreadsheet-style inline cells.
- **2026-10-13 — Migration 002 adds `distinct_dances` ("Different dance" answers).** This is the first migration after 001 was merged; from here on, schema changes are new migrations, because users may have real data.
- **2026-10-13 — Re-apply mapping overwrites only the fields the current mapping targets, and skips a default dance shared with other songs.** This is consistent with the import rule that one song's tags never change a shared dance; the result reports the skipped count.
- **2026-10-13 — Renderer tests run in jsdom, which lacks layout and some browser APIs; the test setup fills the gaps.**
  - **Test theme:** Mantine menus and popovers get `hideDetached: false` (otherwise every dropdown is `display: none`).
  - **Size stubs:** elements report a non-zero `getBoundingClientRect` and `offsetWidth`/`offsetHeight`, so virtualized lists render rows.
  - **Other stubs:** `document.fonts` (for auto-growing textareas), plus `matchMedia`, `ResizeObserver` and `scrollIntoView` from Plan 1.
  - **Two quirks:** Mantine's Rating takes clicks on each star's _label_, and TagsInput labels two inputs, so find it by placeholder.
```

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run typecheck && npx prettier --check . && npm run build`
Expected: 298 tests pass; typecheck, formatting and build are clean.

- [ ] **Step 7: Manual check in the real app**

```bash
npm start
```

With some music imported (Plan 2):
1. **Music page:** the table lists songs.
   - Typing in the search box filters as you type.
   - Clicking a column header sorts, and clicking again reverses.
   - ⌘-click and Shift-click select several songs.
2. **Select one song:** the editor opens on the right.
   - Change a dance's country and press Tab. The table updates.
   - Make another dance the default.
   - Link a dance…, then New dance….
3. **Two songs with dances of the same name:** the "same dance?" suggestion appears. Same dance merges them.
4. **Sidebar:**
   - `+` creates a playlist.
   - Drag songs onto it, open it, drag a row to reorder, and remove a song.
   - Hover a playlist, use "⋯" to rename and duplicate it, then delete the copy.
   - Drag a song onto ★ Favorites.
5. **Re-apply mapping:** change the import mapping in Settings, select songs, choose Re-apply mapping…, and read the result.

```bash
git add -A
git commit -m "feat(settings): import mapping defaults and dance types; docs for the library

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test` passes: 298 tests (203 from Plans 1–2, plus 95 new).
- `npm run typecheck`, `npx prettier --check .` and `npm run build` are clean.
- In the running app you can search, sort and select songs, edit songs and dances, link, merge and answer same-name suggestions, manage playlists and favorites from the sidebar, and re-apply the mapping.

---

## Changes after execution

These were made on the same branch after the tasks above, from the final review and from manual testing. The spec and AGENTS.md are updated to match. The suite grew from 298 to 307 tests.

**Final review fixes** (each with a test that failed first):
- A merge, including "Same dance", carries the removed dance's "Different dance" answers over to the kept dance. Before, the cascade on `distinct_dances` deleted them, and dismissed suggestions came back.
- A merge adds the removed dance's notes after the kept dance's notes instead of dropping them. The merge dialog now mentions notes.
- Same-name suggestions skip dances that no song uses.
- Playlist rows can't be reordered while a search is active. Before, the drop sent only the visible rows, which main rejected, and nothing showed.

**From manual testing:**
- **Re-apply mapping…** opens `ReapplyDialog`: the selected songs' tags (up to 50) and the mapping fields. The fields start from the import settings, and the choice applies to that run only.
  - `library:reapplyMapping` now takes `(songIds, mapping)`.
  - A new channel, `library:songTags`, reads the tags (`getSongTags`).
  - Step 7's check 5 becomes: select songs, choose Re-apply mapping…, pick a mapping in the dialog, and read the result.
- **Apple Music import:** the mapping step shows `ApplePreview.tagSample`, up to 50 local tracks' tags from `Library.xml`. They're chosen at random by `previewAppleLibrary(lib, random)` when there are more, and sorted by title.
- **Shared tag table:** `TagPreviewTable` serves both of the above, with a header that stays in place while the rows scroll.
- **Sidebar:**
  - The playlist list is its own scroll container (`role="group"`, "Playlists"), at most 40% of the sidebar.
  - The "⋯" button is centered with auto margins instead of a transform, so it no longer jumps when pressed.
- **Select all:** ⌘A or Ctrl+A in the table selects every song shown (`selectAll` in the library store). The table is focusable for this.

**Deferred minors from the final review** (for later plans):
- Sidebar and table actions fail silently.
- A no-op drop marks an Apple playlist as edited.
- A rejected field save leaves the field blank.
- Editing the field you searched for closes the editor.
- "Same dance" on a shared dance leaves two same-named dances linked to the song.
- Duplicate React keys for repeated Apple playlist tracks.
- Every field you leave refetches the whole list, and dance search runs in JavaScript.
- The last field's edit is lost on window close.
