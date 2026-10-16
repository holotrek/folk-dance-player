# Folk Dance Player — Plan 10: Sync with Apple Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the Music library directly and keep the app's library current, with no `Library.xml`
export:
- **Turning sync on** (Settings → Apple Music) asks macOS for access once, shows the mapping step with
  tags from the live library, and brings in every local music track and every user playlist.
- **Sync runs again** at launch, when the control window is focused (at most every 10 s) and on
  **Sync now** (Settings, File → Sync with Apple Music, ⌘⇧S). A toast says what changed.
- **Tags follow Music** unless the field was edited in the app. Songs Music no longer has wait in a
  **Removed from Apple Music** review list (Keep / Remove). Remove is a soft delete; the same file
  coming back restores the song with all its data.
- **Music's playlists** become read-only mirrors, in collapsible folders. "Duplicate as my playlist"
  makes an editable copy.
- **Nothing is duplicated:** a local song that turns up in Music is adopted, and Add Music… skips
  copies of synced songs.

**Architecture:** One new main-process folder, `src/main/apple-sync/`, of small modules over the
database, plus a Swift helper:
- **`fdp-music-library`** (`native/music-library/main.swift`): prints one JSON snapshot of the Music
  library through the iTunesLibrary framework. Bundled in `Contents/Resources`.
- **`LibrarySource`:** `createHelperSource` runs the helper; `createFileSource` reads the JSON file
  named by `FDP_APPLE_LIBRARY` (development and end-to-end tests).
- **The sync engine (`runSync`):** sorts the snapshot's tracks (`sortTracks`), matches each to a file
  row, stats unchanged files, sends new, moved or changed files through the existing import worker
  (`ImportService.readTracks`), saves each file in its own transaction (`saveSyncedTrack`, with
  `applyMusicTags` for the baseline rule), then marks gone songs (`markGone`) and mirrors playlists and
  folders (`syncPlaylists`), each in one transaction.
- **`AppleSync`:** triggers, one sync at a time (plus one queued), the states, the identity check, the
  notices, and turning sync on and off.
- **The renderer:** `useAppleSync` (status), an Apple Music section in Settings with the turn-on dialog,
  the review list (a library filter, `{ kind: 'review' }`), folders and read-only mirrors in the
  sidebar, and toasts from `@mantine/notifications`.

**Tech Stack:** As Plans 1–9, plus Swift (`swiftc`, the iTunesLibrary framework, API 1.1) for the
helper and `@mantine/notifications` 9.6.3 for toasts.

**Spec:** `docs/superpowers/specs/2026-10-15-apple-music-sync-design.md` (the sync spec; read all of
it). It extends `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md` (the main
spec): read §4 (data model), §5 (importing), §6.1–6.4 (sidebar, program page, Music page, Settings),
§7.2 (missing files in a program) and §10.1 (failures never stop the music). Task 19 updates both.

**Found while planning:**
- **Plan 9 isn't on `main` yet.** This branch starts from `main` (17652f9). Plan 9 (branch
  `plan-9-fixes`) also touches the sidebar, the library table and the song menus (`<SongMenu>`,
  `openRowMenu`). Whichever merges second rebases over the other; the conflicts will be in
  `LibraryTable.tsx`, `PlaylistsSection.tsx`, `MusicPage.tsx`, `CHANGELOG.md` and `AGENTS.md`.
- **No toasts exist yet.** The app shows notices as `Alert`s. The spec's toast (§6.5) needs a
  notification system; AGENTS.md says not to hand-roll one, so this plan adds
  `@mantine/notifications` 9.6.3 (published 2026-09-26, the same version as `@mantine/core`).
- **There is no File menu.** Task 13 adds one with **Sync with Apple Music** (⌘⇧S), only on macOS.
- **The spike's code isn't in the repository,** only its findings (sync spec §9). The helper is
  written fresh in Task 5. Its raw enum values are checked against the SDK's headers in a step, and
  how "access denied" is reported is confirmed on hardware (Task 19's checklist).
- **`execFile` buffers 1 MB of stdout by default.** A snapshot of 2,169 tracks is about 0.7 MB, so a
  larger library would fail; `createHelperSource` raises `maxBuffer` to 256 MB.

**Settled while planning (spec gaps; each becomes an AGENTS.md decision in Task 19):**
- **The playlist decisions (sync spec §5.8 step 4) are asked before the first sync,** right after the
  mapping step. The spec lists them after the first sync, but the first sync writes the mirrors, so
  the decisions have to exist by then. The dialog is the same.
- **The worker reads new, moved and changed files with Music's tags** (as `Library.xml` imports do,
  `KnownTags`). Only size, mtime, duration and the fingerprint come from the file. Sync spec §5.3
  says both "tags read from the file" and "tag values come from Music"; Music's win.
- **"Unchanged" means the same path (compared in NFC) and the same size and mtime,** from an async
  `stat` in main. That also notices a file deleted from disk (marked missing) or replaced (re-read),
  without reading it.
- **Reading the library while turning sync on waits up to 5 minutes** (`PERMISSION_TIMEOUT_MS`): that
  first read is what makes macOS show its permission dialog, and the helper waits while the dialog is
  up. Other reads keep the spec's 30 s.
- **A sync waits for a running import, and an import is refused while a sync runs** (the existing
  `ImportBusyError`). Both write the same tables through the same worker. A sync blocked by an import
  runs as soon as the import finishes.
- **Two Music tracks pointing at one file** (rare): the first keeps the file; the second is counted as
  unreadable ("Another Apple Music track uses this file"). `files.path` is unique.
- **Remove all asks for confirmation;** Remove (the selection), Keep and Keep all don't.
- **Which folders are open is a setting** (`playlistFolders.open`, folder persistent IDs), so it
  survives restarts and turning sync off and on.
- **File → Sync with Apple Music while sync is off opens Settings** (where the switch is).

## Global Constraints

- **Everything in Plans 1–9 still applies.** Exact pins, each at least two weeks old; Prettier;
  test-first (Vitest); conventional commits ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; a CHANGELOG line under `Unreleased` for
  every user-facing change in the same commit; AGENTS.md decisions and spec sections kept current.
- **The main process owns all state.** The renderer asks main and refetches on `library:changed` and
  `appleSync:state`.
- **Use `node:sqlite`.** Schema changes are migration 004 only; released migrations 001–003 are never
  edited.
- **Keep the data layers separate.** `apple_sync`, `removed_at` and `sync_baseline` are local facts on
  `files`; `playlist_folders` and the mirror flag are personal or local data.
- **UI comes from Mantine components;** custom CSS only in co-located `*.module.css` files. Icons are
  inline SVG components in `components/icons.tsx`, never Unicode symbols.
- **macOS only.** On other platforms (unless `FDP_APPLE_LIBRARY` is set) the Settings section, the File
  menu item and the review entry are hidden, and `appleSync:*` handlers report `available: false`.
- **Sync never deletes a song by itself, and never overwrites a field edited in the app** (sync spec
  §1 success criteria 3).
- **Side failures never stop the music** (main spec §10.1): a sync failure is logged and noticed, never
  thrown at the player, and the playing song is never interrupted.
- **Exit codes of the helper:** `0` success; `2` access denied; `3` the library couldn't be opened.
  Anything else, a crash, invalid output or no exit within 30 s is a failed read.
- **Persistent IDs** are 16 uppercase hex digits. Paths are compared in Unicode NFC form.
- **Copy, verbatim from the spec:** "Removed from Apple Music (N)", "File still on disk", "File gone",
  "Keep", "Remove", "Keep all", "Remove all", "Duplicate as my playlist", "Edit this playlist in
  Music.", "Music has a different library open", "Keep waiting", "Switch to this library", "Folk Dance
  Player isn't allowed to read your Music library", "Open Privacy Settings", "Sync now", "Already in
  library (Apple Music)", "Replace with Apple version", "Keep my edits as a copy", "Name (my edits)",
  "Songs and playlists stay; playlists become editable".
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.**
- **Ask the user before any test that opens windows on their screen** (the end-to-end tests, the app)
  **or needs them** (the real Music library, `FDP_TEST_REAL_MUSIC=1`).

## Review Focus

These are the inputs most likely to bite an organizer that the spec implies but its test list doesn't
name. Each has a test in the task that owns the code:

1. **The permission dialog stays up while the organizer reads it.** The first read must not time out
   after 30 s and report "failed" (Task 4: a read with `timeoutMs` waits past 30 s; Task 12: `preview()`
   passes `PERMISSION_TIMEOUT_MS`).
2. **A large library prints more than 1 MB of JSON.** The read must still succeed (Task 4: a stub
   helper prints a 3 MB snapshot).
3. **Turning sync off while a sync runs.** Off must wait for the sync, then leave nothing synced and
   no further syncs (Task 12).
4. **A track whose file is on an unplugged drive.** It is marked missing, keeps its data and stays
   synced; it never enters the review list (Task 10).
5. **A song that goes "gone" while it is in tonight's program.** It stays in the program, playable,
   until the organizer decides; only a removed song is skipped (Task 2 and Task 10).

---

## File map

**Create (main):**
- `src/main/db/migrations/004-apple-sync.ts`: migration 004
- `src/main/apple-sync/snapshot.ts`: the snapshot's types and `parseSnapshot`
- `src/main/apple-sync/eligible.ts`: `sortTracks` (sync spec §5.2) and `previewSnapshot`
- `src/main/apple-sync/library-source.ts`: `LibrarySource`, `createHelperSource`, `createFileSource`
- `src/main/apple-sync/sync-tags.ts`: `applyMusicTags` (§5.4)
- `src/main/apple-sync/save-synced.ts`: `findSyncRow`, `saveSyncedTrack` (§5.3)
- `src/main/apple-sync/sync-playlists.ts`: `syncPlaylists` (§5.6, §5.8 step 4)
- `src/main/apple-sync/review.ts`: `markGone`, `resolveReview`, `resolveAllReview`, `reviewCount`,
  `disableSync` (§5.5, §5.9)
- `src/main/apple-sync/engine.ts`: `runSync`
- `src/main/apple-sync/apple-sync.ts`: `AppleSync`
- `src/main/ipc/apple-sync-handlers.ts`
- `native/music-library/main.swift`, `scripts/build-helper.sh`

**Create (shared, renderer):**
- `src/shared/apple-sync.ts`: types and the summary helpers
- `src/renderer/src/apple-sync/useAppleSync.ts`, `AppleMusicSection.tsx`, `AppleSyncDialog.tsx`,
  `useAppleSyncFlow.ts`, `SyncSummaryView.tsx`, `MirrorDecisionsStep.tsx`, `AppleSyncNotices.tsx`
- `src/renderer/src/components/sidebar/PlaylistTree.tsx`

**Modify:** the migrations index, `shared/settings.ts`, `shared/library.ts`, `shared/program.ts`,
`shared/import.ts`, `shared/contract.ts`, `main/library/list.ts`, `main/library/playlists.ts`,
`main/library/edit.ts`, `main/library/stats.ts`, `main/programs/tracks.ts`,
`main/session/player-session.ts`, `main/import/save-file.ts`, `main/import/save-playlists.ts`,
`main/import/import-service.ts`, `main/import/worker-core.ts`, `main/import/worker-protocol.ts`,
`main/import/apple-library.ts`, `main/ipc/handlers.ts`, `main/menu.ts`, `main/index.ts`, the
renderer's library store, sidebar, Music page, library table, program list, played list, import
summary and progress steps, Settings page, `App.tsx`, `main.tsx`, `package.json`,
`electron-builder.yml`, `.gitignore`, `.github/workflows/pr-gate.yml`, `e2e/app.ts`,
`e2e/app.spec.ts`, and the docs in Task 19.

**Tests:** one test file per new module under `tests/main/apple-sync/`, plus additions to the existing
test files named in each task.

---

### Task 1: Migration 004, settings keys and shared types

**Files:**
- Create: `src/main/db/migrations/004-apple-sync.ts`
- Modify: `src/main/db/migrations/index.ts`
- Create: `src/shared/apple-sync.ts`
- Modify: `src/shared/settings.ts`
- Test: `tests/main/db/migration-004.test.ts`, `tests/shared/apple-sync.test.ts`,
  `tests/main/settings/settings-store.test.ts`

**Interfaces:**
- Produces (schema): `files.apple_sync` (`NULL` | `'synced'` | `'gone'`), `files.removed_at` (ISO
  text or `NULL`), `files.sync_baseline` (JSON text or `NULL`), `playlists.apple_sync` (`0` | `1`,
  default `0`), `playlists.folder_id`, and table `playlist_folders (id, name, parent_id,
  apple_persistent_id, position)`.
- Produces (`@shared/apple-sync`):
  ```ts
  export type AppleSyncState = 'off' | 'idle' | 'syncing' | 'paused-denied' | 'paused-other-library'
  export interface SyncSummary {
    finishedAt: string
    added: ImportSummaryItem[]; updated: ImportSummaryItem[]; relinked: ImportSummaryItem[]
    adopted: ImportSummaryItem[]; restored: ImportSummaryItem[]; gone: ImportSummaryItem[]
    missing: ImportSummaryItem[]; unsupported: ImportSummaryItem[]; unreadable: ImportSummaryItem[]
    skipped: { reason: string; count: number }[]
    playlists: { created: string[]; updated: string[]; deleted: string[] }
  }
  export interface AppleSyncStatus { available: boolean; state: AppleSyncState; lastResult: SyncSummary | null; reviewCount: number }
  export type AppleSyncNotice = { kind: 'changed'; message: string } | { kind: 'denied' } | { kind: 'other-library' } | { kind: 'failed'; detail: string }
  export type MirrorDecision = 'replace' | 'copy'
  export type ReviewAction = 'keep' | 'remove'
  export type SyncPreview = { ok: true; preview: ApplePreview; conflicts: ApplePlaylistConflict[] } | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }
  export interface PlaylistFolder { id: number; name: string; parentId: number | null; persistentId: string | null }
  export function emptySyncSummary(finishedAt: string): SyncSummary
  export function syncChanged(summary: SyncSummary): boolean
  export function syncParts(summary: SyncSummary): string[]
  export function syncMessage(summary: SyncSummary, reviewCount: number): string
  export function isSyncSummary(value: unknown): value is SyncSummary
  export const APPLE_SYNC_OFF: AppleSyncStatus
  ```
- Produces (settings): `'appleSync.enabled': boolean` (default `false`), `'appleSync.libraryId':
  string | null` (default `null`), `'appleSync.lastResult': SyncSummary | null` (default `null`),
  `'playlistFolders.open': string[]` (default `[]`).

- [ ] **Step 1: Write the failing migration test**

`tests/main/db/migration-004.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addLibrarySong } from '../helpers/library-fixtures'

describe('migration 004: Apple Music sync', () => {
  test('existing songs and playlists start unsynced, and folders can be stored', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 3))
    const song = addLibrarySong(db, { title: 'Kolo' })
    db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 3, to: 4 })
    expect(getSchemaVersion(db)).toBe(4)

    expect(
      db
        .prepare('SELECT apple_sync, removed_at, sync_baseline FROM files WHERE id = ?')
        .get(song.fileId)
    ).toEqual({ apple_sync: null, removed_at: null, sync_baseline: null })
    expect(db.prepare('SELECT apple_sync, folder_id FROM playlists').get()).toEqual({
      apple_sync: 0,
      folder_id: null
    })

    const parent = Number(
      db
        .prepare(
          "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'F1', 1)"
        )
        .run().lastInsertRowid
    )
    db.prepare(
      "INSERT INTO playlist_folders (name, parent_id, apple_persistent_id, position) VALUES ('Week', ?, 'F2', 2)"
    ).run(parent)
    db.prepare('UPDATE playlists SET folder_id = ?').run(parent)
    // Deleting a folder deletes its subfolders; its playlists stay, outside any folder.
    db.prepare('DELETE FROM playlist_folders WHERE id = ?').run(parent)
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlist_folders').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT folder_id FROM playlists').get()).toEqual({ folder_id: null })
  })

  test('apple_sync accepts only synced and gone', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    const song = addLibrarySong(db, { title: 'Kolo' })
    expect(() =>
      db.prepare("UPDATE files SET apple_sync = 'other' WHERE id = ?").run(song.fileId)
    ).toThrow(/CHECK/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/main/db/migration-004.test.ts`
Expected: FAIL — `migrate` returns `{ from: 3, to: 3 }` (there is no migration 4).

- [ ] **Step 3: Write the migration**

`src/main/db/migrations/004-apple-sync.ts`:

```ts
import type { Migration } from '../migrate'

// Sync with Apple Music (sync spec §4). Columns instead of new `source` values: `source` has a CHECK
// constraint SQLite can't change without rebuilding the table, and it keeps saying where a row first
// came from; `apple_sync` says whether Music owns it now.
// files.apple_sync: NULL not synced, 'synced' follows Music, 'gone' Music no longer has it.
// files.removed_at: the soft delete; files.sync_baseline: JSON of the mapped values sync last wrote.
export const appleSync: Migration = {
  version: 4,
  name: 'apple-sync',
  sql: `
    ALTER TABLE files ADD COLUMN apple_sync TEXT
      CHECK (apple_sync IS NULL OR apple_sync IN ('synced', 'gone'));
    ALTER TABLE files ADD COLUMN removed_at TEXT;
    ALTER TABLE files ADD COLUMN sync_baseline TEXT;
    CREATE INDEX files_apple_sync ON files (apple_sync) WHERE apple_sync IS NOT NULL;

    CREATE TABLE playlist_folders (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES playlist_folders (id) ON DELETE CASCADE,
      apple_persistent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX playlist_folders_apple_persistent_id ON playlist_folders (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    ALTER TABLE playlists ADD COLUMN apple_sync INTEGER NOT NULL DEFAULT 0
      CHECK (apple_sync IN (0, 1));
    ALTER TABLE playlists ADD COLUMN folder_id INTEGER
      REFERENCES playlist_folders (id) ON DELETE SET NULL;
  `
}
```

In `src/main/db/migrations/index.ts`, import it and append it:

```ts
import { appleSync } from './004-apple-sync'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial, distinctDances, holdingOrder, appleSync]
```

Add `'playlist_folders'` to the table list in `tests/main/db/schema.test.ts` ("creates every table").

- [ ] **Step 4: Run the database tests**

Run: `npx vitest run tests/main/db`
Expected: PASS. (Tests that hard-code `schemaVersion` or `{ from: 0, to: 3 }` now see 4: update
those numbers.)

- [ ] **Step 5: Write the failing shared-types test**

`tests/shared/apple-sync.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  emptySyncSummary,
  isSyncSummary,
  syncChanged,
  syncMessage,
  syncParts
} from '@shared/apple-sync'

const at = '2026-10-16T11:42:00.000Z'
const item = (path: string) => ({ path })

describe('sync summaries', () => {
  test('an empty sync changed nothing', () => {
    const s = emptySyncSummary(at)
    expect(syncChanged(s)).toBe(false)
    expect(syncParts(s)).toEqual([])
    expect(syncMessage(s, 0)).toBe('Synced with Apple Music')
  })

  test('skipped, missing and unreadable tracks are not changes', () => {
    const s = emptySyncSummary(at)
    s.skipped = [{ reason: 'In the cloud or streamed', count: 17 }]
    s.missing = [item('/m/a.mp3')]
    s.unreadable = [item('/m/b.mp3')]
    s.unsupported = [item('/m/c.aiff')]
    expect(syncChanged(s)).toBe(false)
  })

  test('the message counts added, updated (any kind) and playlists, then the review list', () => {
    const s = emptySyncSummary(at)
    s.added = [item('/m/1.mp3'), item('/m/2.mp3'), item('/m/3.mp3')]
    s.updated = [item('/m/4.mp3')]
    s.relinked = [item('/m/5.mp3')]
    s.playlists.updated = ['Week 3']
    expect(syncChanged(s)).toBe(true)
    expect(syncParts(s)).toEqual(['3 added', '2 updated', '1 playlist changed'])
    expect(syncMessage(s, 2)).toBe(
      'Synced with Apple Music: 3 added, 2 updated, 1 playlist changed · 2 to review'
    )
  })

  test('a sync that only sent songs to review still changed something', () => {
    const s = emptySyncSummary(at)
    s.gone = [item('/m/a.mp3')]
    expect(syncChanged(s)).toBe(true)
    expect(syncMessage(s, 1)).toBe('Synced with Apple Music · 1 to review')
  })

  test('isSyncSummary accepts a summary and rejects other shapes', () => {
    expect(isSyncSummary(emptySyncSummary(at))).toBe(true)
    expect(isSyncSummary(null)).toBe(false)
    expect(isSyncSummary({ finishedAt: at })).toBe(false)
    expect(isSyncSummary({ ...emptySyncSummary(at), added: 'x' })).toBe(false)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/shared/apple-sync.test.ts`
Expected: FAIL — cannot resolve `@shared/apple-sync`.

- [ ] **Step 7: Write the shared module**

`src/shared/apple-sync.ts`:

```ts
// Types for Sync with Apple Music, shared by main and renderer. Sync spec §3.3, §6, §7.1.
import type { ApplePlaylistConflict, ApplePreview, ImportSummaryItem } from './import'

export type AppleSyncState = 'off' | 'idle' | 'syncing' | 'paused-denied' | 'paused-other-library'

// One sync's result (§7.1), kept in the appleSync.lastResult setting and shown by Details.
export interface SyncSummary {
  finishedAt: string
  added: ImportSummaryItem[]
  updated: ImportSummaryItem[]
  relinked: ImportSummaryItem[] // Music moved the file
  adopted: ImportSummaryItem[] // a local song that turned up in Music
  restored: ImportSummaryItem[] // a removed song whose file came back
  gone: ImportSummaryItem[] // sent to the review list by this sync
  missing: ImportSummaryItem[] // still in Music, but the file isn't on disk
  unsupported: ImportSummaryItem[]
  unreadable: ImportSummaryItem[]
  skipped: { reason: string; count: number }[] // cloud items, videos, booklets…
  playlists: { created: string[]; updated: string[]; deleted: string[] }
}

export interface AppleSyncStatus {
  available: boolean // macOS (or a FDP_APPLE_LIBRARY file); the feature is hidden otherwise
  state: AppleSyncState
  lastResult: SyncSummary | null
  reviewCount: number // songs in "Removed from Apple Music"
}

export const APPLE_SYNC_OFF: AppleSyncStatus = {
  available: false,
  state: 'off',
  lastResult: null,
  reviewCount: 0
}

// Shown once per occurrence (§6.5): a toast after a sync that changed something, or a notice.
export type AppleSyncNotice =
  | { kind: 'changed'; message: string }
  | { kind: 'denied' }
  | { kind: 'other-library' }
  | { kind: 'failed'; detail: string }

// A playlist edited locally since a Library.xml import, when sync is turned on (§5.8 step 4).
export type MirrorDecision = 'replace' | 'copy'

export type ReviewAction = 'keep' | 'remove'

// Reading the library before turning sync on: the mapping step's tag preview and the playlists
// that need a decision.
export type SyncPreview =
  | { ok: true; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }

// One of Music's playlist folders (§6.2).
export interface PlaylistFolder {
  id: number
  name: string
  parentId: number | null
  persistentId: string | null
}

export function emptySyncSummary(finishedAt: string): SyncSummary {
  return {
    finishedAt,
    added: [],
    updated: [],
    relinked: [],
    adopted: [],
    restored: [],
    gone: [],
    missing: [],
    unsupported: [],
    unreadable: [],
    skipped: [],
    playlists: { created: [], updated: [], deleted: [] }
  }
}

const updatedCount = (s: SyncSummary): number =>
  s.updated.length + s.relinked.length + s.adopted.length + s.restored.length

const playlistCount = (s: SyncSummary): number =>
  s.playlists.created.length + s.playlists.updated.length + s.playlists.deleted.length

// Whether the library changed: songs added, updated, sent to review, or playlists changed.
export function syncChanged(s: SyncSummary): boolean {
  return s.added.length + updatedCount(s) + s.gone.length + playlistCount(s) > 0
}

// "3 added", "2 updated", "1 playlist changed": the status line and the toast.
export function syncParts(s: SyncSummary): string[] {
  const playlists = playlistCount(s)
  return [
    s.added.length ? `${s.added.length} added` : null,
    updatedCount(s) ? `${updatedCount(s)} updated` : null,
    playlists ? `${playlists} ${playlists === 1 ? 'playlist' : 'playlists'} changed` : null
  ].filter((p): p is string => p !== null)
}

// The toast after a sync that changed something (§6.5).
export function syncMessage(s: SyncSummary, reviewCount: number): string {
  const parts = syncParts(s)
  const head = parts.length ? `Synced with Apple Music: ${parts.join(', ')}` : 'Synced with Apple Music'
  return reviewCount > 0 ? `${head} · ${reviewCount} to review` : head
}

const LISTS = [
  'added',
  'updated',
  'relinked',
  'adopted',
  'restored',
  'gone',
  'missing',
  'unsupported',
  'unreadable',
  'skipped'
] as const

// For the settings validator: a stored summary of the wrong shape falls back to null.
export function isSyncSummary(value: unknown): value is SyncSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const playlists = v.playlists as Record<string, unknown> | undefined
  return (
    typeof v.finishedAt === 'string' &&
    LISTS.every((key) => Array.isArray(v[key])) &&
    typeof playlists === 'object' &&
    playlists !== null &&
    ['created', 'updated', 'deleted'].every((key) => Array.isArray(playlists[key]))
  )
}
```

- [ ] **Step 8: Add the settings keys**

In `src/shared/settings.ts`, import `isSyncSummary` and `SyncSummary` from `./apple-sync`, and add
to `Settings`, `DEFAULT_SETTINGS` and `VALIDATORS`:

```ts
  // Sync with Apple Music (sync spec §4).
  'appleSync.enabled': boolean
  'appleSync.libraryId': string | null
  'appleSync.lastResult': SyncSummary | null
  // Music's playlist folders that are open in the sidebar, by persistent ID.
  'playlistFolders.open': string[]
```

```ts
  'appleSync.enabled': false,
  'appleSync.libraryId': null,
  'appleSync.lastResult': null,
  'playlistFolders.open': []
```

```ts
const isPersistentId = (v: unknown): boolean => typeof v === 'string' && /^[0-9A-F]{16}$/.test(v)

  'appleSync.enabled': isBool,
  'appleSync.libraryId': (v) => v === null || isPersistentId(v),
  'appleSync.lastResult': (v) => v === null || isSyncSummary(v),
  'playlistFolders.open': (v) => Array.isArray(v) && v.length <= 1000 && v.every(isPersistentId)
```

Add a test to `tests/main/settings/settings-store.test.ts`:

```ts
test('Apple Music sync settings are validated', () => {
  const store = new SettingsStore(createTestDb())
  expect(store.get('appleSync.enabled')).toBe(false)
  store.set('appleSync.libraryId', '0123456789ABCDEF')
  expect(store.get('appleSync.libraryId')).toBe('0123456789ABCDEF')
  expect(() => store.set('appleSync.libraryId', 'not-an-id')).toThrow(InvalidSettingError)
  expect(() => store.set('appleSync.lastResult', { finishedAt: 'x' })).toThrow(InvalidSettingError)
  expect(() => store.set('playlistFolders.open', ['abc'])).toThrow(InvalidSettingError)
})
```

(Import `createTestDb` and `InvalidSettingError` if the file doesn't already.)

- [ ] **Step 9: Run the tests and checks**

Run: `npx vitest run tests/shared tests/main/settings tests/main/db && npm run typecheck`
Expected: PASS. Fix any renderer test that builds a full `Settings` object literal by spreading
`DEFAULT_SETTINGS` (most already do).

- [ ] **Step 10: Commit**

No CHANGELOG line: nothing an organizer can see yet.

```bash
git add src/main/db/migrations src/shared/apple-sync.ts src/shared/settings.ts tests
git commit -m "feat(sync): migration 004, sync settings and summary types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Removed songs are hidden, and skipped in a program

A removed song (`files.removed_at` set) is hidden from the library and everything that lists songs,
but its history still shows it. Sync spec §6.4.

**Files:**
- Modify: `src/main/library/list.ts`, `src/main/library/stats.ts`, `src/main/library/edit.ts`,
  `src/main/library/playlists.ts` (only `listPlaylists`' count), `src/main/programs/tracks.ts`,
  `src/shared/program.ts`, `src/main/session/player-session.ts`
- Modify: `src/renderer/src/program/ProgramList.tsx`, `src/renderer/src/program/PlayedList.tsx`
- Test: `tests/main/library/list.test.ts`, `tests/main/library/edit.test.ts`,
  `tests/main/programs/programs.test.ts`, `tests/main/programs/history.test.ts`,
  `tests/main/session/player-session.test.ts`, `tests/renderer/program/program-list.test.tsx`,
  `tests/renderer/program/played-list.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `files.removed_at` (Task 1).
- Produces: `Track.isRemoved: boolean` (every `Track`, so program items and played entries carry it).
  `listLibrary` never returns removed songs. Test helper `removeSong(db, fileId)` in
  `tests/main/helpers/library-fixtures.ts`.

- [ ] **Step 1: Add the test helper**

In `tests/main/helpers/library-fixtures.ts`:

```ts
// Soft-removes a song, as the review list's Remove does (sync spec §5.5).
export function removeSong(db: DatabaseSync, fileId: number): void {
  db.prepare(
    "UPDATE files SET apple_sync = 'gone', removed_at = '2026-10-16T12:00:00.000Z' WHERE id = ?"
  ).run(fileId)
}
```

- [ ] **Step 2: Write the failing main tests**

In `tests/main/library/list.test.ts` (import `setFavorite`, `setHolding`, `createPlaylist`,
`addToPlaylist` and `listPlaylists` from `src/main/library/playlists`, `getLibraryStats` from
`src/main/library/stats`, `LibraryFilter` from `@shared/library` and `removeSong` from the fixtures,
where the file doesn't already):

```ts
test('a removed song is hidden from every list and from search', () => {
  const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
  addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
  setFavorite(db, [kolo.fileId], true)
  setHolding(db, [kolo.fileId], true)
  const playlist = createPlaylist(db, 'Mine')
  addToPlaylist(db, playlist, [kolo.fileId])
  removeSong(db, kolo.fileId)

  const titles = (filter: LibraryFilter, search = '') =>
    listLibrary(db, { search, filter, sort: { column: 'title', direction: 'asc' } }).map(
      (r) => r.title
    )
  expect(titles({ kind: 'all' })).toEqual(['Hora'])
  expect(titles({ kind: 'all' }, 'kolo')).toEqual([])
  expect(titles({ kind: 'favorites' })).toEqual([])
  expect(titles({ kind: 'holding' })).toEqual([])
  expect(titles({ kind: 'playlist', playlistId: playlist })).toEqual([])
  expect(listPlaylists(db).find((p) => p.id === playlist)?.itemCount).toBe(0)
  expect(getLibraryStats(db).fileCount).toBe(1)
})
```

In `tests/main/library/edit.test.ts`:

```ts
test('same-dance suggestions skip dances only removed songs use', () => {
  const mine = addLibrarySong(db, { title: 'Lesnoto A', dance: { name: 'Lesnoto' } })
  const other = addLibrarySong(db, { title: 'Lesnoto B', dance: { name: 'Lesnoto' } })
  expect(getSongDetail(db, mine.songId)?.suggestions).toHaveLength(1)
  removeSong(db, other.fileId)
  expect(getSongDetail(db, mine.songId)?.suggestions).toEqual([])
})
```

In `tests/main/programs/programs.test.ts`:

```ts
test('a removed song stays in the program, flagged removed', () => {
  const program = createProgram(db, 'Tonight')
  const kolo = addLibrarySong(db, { title: 'Kolo' })
  addTracks(db, program, [kolo.fileId])
  removeSong(db, kolo.fileId)
  const items = getProgram(db, program)!.items
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ kind: 'track', isRemoved: true })
})
```

In `tests/main/programs/history.test.ts`:

```ts
test('Previously played still shows a removed song, flagged removed', () => {
  const program = createProgram(db, 'Tonight')
  const kolo = addLibrarySong(db, { title: 'Kolo' })
  logPlay(db, { fileId: kolo.fileId, danceId: null, programId: program, kind: 'program' })
  removeSong(db, kolo.fileId)
  expect(listPlayed(db, program)[0].track).toMatchObject({ title: 'Kolo', isRemoved: true })
})
```

In `tests/main/session/player-session.test.ts`, inside `describe('missing and unreadable files')`
(its `songs`, `program`, `setup`, `playing`, `state` and `unplayed` helpers):

```ts
  test('a removed song is skipped and left in the program, with a warning', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    removeSong(db, songs.a.fileId)
    setup()
    session.play()
    expect(playing()).toBe('B')
    expect(state().warning).toBe('Skipped removed song: A')
    expect(unplayed()).toEqual(['A'])
  })

  test('a song gone from Apple Music but not removed still plays', () => {
    addTracks(db, program, [songs.a.fileId, songs.b.fileId])
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(songs.a.fileId)
    setup()
    session.play()
    expect(playing()).toBe('A')
  })
```

(Import `removeSong` from `../helpers/library-fixtures`.)

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/library tests/main/programs tests/main/session`
Expected: FAIL — the removed song is still listed, and `isRemoved` is undefined.

- [ ] **Step 4: Hide removed songs**

`src/main/library/list.ts`, in `listLibrary`, before the other filters:

```ts
  // A removed song (sync spec §6.4) is never listed; the review list shows songs Music no longer
  // has that haven't been decided yet.
  where.push('f.removed_at IS NULL')
  if (query.filter.kind === 'review') where.push("f.apple_sync = 'gone'")
```

`src/shared/library.ts`: add `| { kind: 'review' } // "Removed from Apple Music" (sync spec §6.2)` to
`LibraryFilter`.

`src/main/library/stats.ts`: `WHERE is_missing = 0 AND removed_at IS NULL`.

`src/main/library/playlists.ts`, `listPlaylists`' count:

```sql
(SELECT COUNT(*) FROM playlist_items i JOIN files f ON f.id = i.file_id
 WHERE i.playlist_id = p.id AND f.removed_at IS NULL) AS itemCount
```

`src/main/library/edit.ts`, `sameNameSuggestions`: a candidate must be used by a song that isn't
removed, and its titles leave removed songs out:

```sql
       AND EXISTS (SELECT 1 FROM dance_songs u JOIN songs us ON us.id = u.song_id
         JOIN files uf ON uf.id = us.file_id WHERE u.dance_id = c.id AND uf.removed_at IS NULL)
```

```sql
    `SELECT s.title FROM dance_songs ds JOIN songs s ON s.id = ds.song_id
     JOIN files f ON f.id = s.file_id
     WHERE ds.dance_id = ? AND f.removed_at IS NULL ORDER BY s.title COLLATE NOCASE`
```

- [ ] **Step 5: Flag removed songs on tracks**

`src/main/programs/tracks.ts`: add `(f.removed_at IS NOT NULL) AS isRemoved` to `TRACK_COLUMNS`,
`isRemoved: number` to `TrackRow`, and `isRemoved: row.isRemoved === 1` in `toTrack`.

`src/shared/program.ts`, in `Track`:

```ts
  isRemoved: boolean // removed from the library (sync spec §6.4): shown greyed, never played
```

Then run `npm run typecheck` and add `isRemoved: false` wherever a `Track` literal is built (the
compiler lists them: `player-session.ts`, `tests/renderer/program/fixtures.ts`, and test helpers).

- [ ] **Step 6: Skip removed songs in the session**

`src/main/session/player-session.ts`, in `pick()`, before the file check, and in `warnSkipped`:

```ts
      if (item.isRemoved) {
        removed.push(item.label)
        continue
      }
      if (this.ports.checkFile(item.fileId)) return { item, skipped, removed }
      skipped.push(item.label)
```

Return `removed: string[]` beside `skipped` from every exit of `pick()`, pass both to
`warnSkipped`, and build the warning from the non-empty parts:

```ts
  private warnSkipped(skipped: string[], removed: string[]): void {
    const parts = [
      skipped.length ? `Skipped missing file: ${skipped.join(', ')}` : null,
      removed.length ? `Skipped removed song: ${removed.join(', ')}` : null
    ].filter(Boolean)
    if (parts.length) this.update({ warning: parts.join(' · ') })
  }
```

Update the comment above `pick()`: "songs whose file is missing, and removed songs, are skipped and
left in the program".

- [ ] **Step 7: Run the main tests**

Run: `npx vitest run tests/main`
Expected: PASS.

- [ ] **Step 8: Write the failing renderer tests**

In `tests/renderer/program/program-list.test.tsx` (its `setup`, `item` and `track`):

```ts
test('a removed song is shown greyed and labeled removed', async () => {
  const sarba = track(103, 'Sârba', { isRemoved: true })
  setup({ programs: { ...program, items: [item(1, hora), item(4, sarba)] } })
  await screen.findByText('Sârba')
  const rows = within(screen.getByRole('list', { name: 'Program items' })).getAllByRole('listitem')
  expect(rows[1]).toHaveAttribute('data-removed', 'true')
  expect(within(rows[1]).getByText('removed')).toBeInTheDocument()
  expect(rows[0]).not.toHaveAttribute('data-removed')
})
```

In `tests/renderer/program/played-list.test.tsx` (its `track` and `playerState`):

```ts
test('a removed song is labeled removed and cannot be replayed', async () => {
  const fake = createFakeApi({
    'player:getState': playerState(),
    'programs:played': [
      { logId: 4, kind: 'program', playedAt: '2026-10-14T20:15:00Z', track: track(103, 'Sârba', { isRemoved: true }) }
    ],
    'player:replay': undefined
  })
  renderWithLibrary(<PlayedList />, fake.api)
  await userEvent.dblClick(await screen.findByText('Sârba'))
  expect(fake.callsTo('player:replay')).toEqual([])
  expect(screen.getByText('removed')).toBeInTheDocument()
})
```

If `PlayedList` only renders once a program is loaded, pass the same `playerState(...)` arguments
the file's `setup()` uses.

- [ ] **Step 9: Show removed songs greyed**

`ProgramList.tsx`, on the track row: `data-removed={item.kind === 'track' && item.isRemoved ? 'true' :
undefined}`, and after the label:

```tsx
                {item.isRemoved && (
                  <Badge size="xs" variant="light" color="gray">
                    removed
                  </Badge>
                )}
```

In `ProgramList.module.css` add:

```css
.item[data-removed='true'] {
  opacity: 0.55;
}
```

(Use the row's existing class name in place of `.item` if it differs.)

`PlayedList.tsx`: a removed track can't be dragged or replayed, and is labeled:

```tsx
  const playable = entry.track !== null && !entry.track.isRemoved
```

Use `playable` for `draggable`, the drag start, the double-click and its `title`. After the label add
the same gray `removed` badge when `entry.track?.isRemoved`, and dim the row with a `data-removed`
attribute and a matching rule in a `PlayedList.module.css` (create it; co-located).

- [ ] **Step 10: Run the renderer tests and checks**

Run: `npx vitest run tests/renderer/program && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

CHANGELOG (Unreleased → Added; create the `### Added` heading if missing):

```markdown
- Songs removed from the library stay in past programs and Previously played, greyed and labeled "removed", and a program skips them.
```

```bash
git add src tests CHANGELOG.md
git commit -m "feat(library): removed songs are hidden, and shown greyed in program history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The snapshot and which tracks are synced

**Files:**
- Create: `src/main/apple-sync/snapshot.ts`, `src/main/apple-sync/eligible.ts`
- Modify: `src/main/import/apple-library.ts` (extract the tag sampling)
- Test: `tests/main/apple-sync/snapshot.test.ts`, `tests/main/apple-sync/eligible.test.ts`,
  `tests/main/apple-sync/fixtures.ts` (shared by later tasks)

**Interfaces:**
- Produces:
  ```ts
  // snapshot.ts
  export interface SnapshotTrack { persistentId: string; location: string | null; locationType: string; mediaKind: string; kind: string | null; title: string | null; artist: string | null; albumArtist: string | null; genre: string | null; durationMs: number | null }
  export interface SnapshotFolder { persistentId: string; name: string; parentId: string | null }
  export interface SnapshotPlaylist { persistentId: string; name: string; parentId: string | null; itemIds: string[] }
  export interface Snapshot { version: 1; libraryId: string; tracks: SnapshotTrack[]; folders: SnapshotFolder[]; playlists: SnapshotPlaylist[] }
  export class SnapshotError extends Error {}
  export function parseSnapshot(value: unknown): Snapshot
  // eligible.ts
  export interface EligibleTrack { persistentId: string; path: string; tags: RawTags; durationMs: number | null; kind: string | null }
  export interface SortedTracks { eligible: EligibleTrack[]; skipped: { reason: string; count: number }[]; unsupported: ImportSummaryItem[] }
  export function sortTracks(tracks: SnapshotTrack[]): SortedTracks
  export function previewSnapshot(snapshot: Snapshot, random?: () => number): ApplePreview
  // apple-library.ts
  export function sampleTags(tags: TagSample[], random?: () => number): TagSample[]
  ```
- Produces (test fixtures, `tests/main/apple-sync/fixtures.ts`): `pid(n: number): string`,
  `snapTrack(n: number, path: string, over?: Partial<SnapshotTrack>): SnapshotTrack`,
  `snapshot(parts: Partial<Snapshot>): Snapshot`, `LIBRARY_ID`.

- [ ] **Step 1: Write the fixtures**

`tests/main/apple-sync/fixtures.ts`:

```ts
import { pathToFileURL } from 'url'
import type { Snapshot, SnapshotTrack } from '../../../src/main/apple-sync/snapshot'

export const LIBRARY_ID = 'AAAAAAAAAAAAAAA1'

// A persistent ID: 16 uppercase hex digits.
export const pid = (n: number): string => n.toString(16).toUpperCase().padStart(16, '0')

// A local music track at `path`, as the helper reports it.
export function snapTrack(n: number, path: string, over: Partial<SnapshotTrack> = {}): SnapshotTrack {
  return {
    persistentId: pid(n),
    location: pathToFileURL(path).href,
    locationType: 'file',
    mediaKind: 'music',
    kind: 'MPEG audio file',
    title: `Track ${n}`,
    artist: null,
    albumArtist: null,
    genre: null,
    durationMs: 1000,
    ...over
  }
}

export function snapshot(parts: Partial<Snapshot> = {}): Snapshot {
  return { version: 1, libraryId: LIBRARY_ID, tracks: [], folders: [], playlists: [], ...parts }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/apple-sync/snapshot.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseSnapshot, SnapshotError } from '../../../src/main/apple-sync/snapshot'
import { pid, snapTrack, snapshot } from './fixtures'

describe('parseSnapshot', () => {
  test('accepts the helper format', () => {
    const value = snapshot({
      tracks: [snapTrack(1, '/m/a.mp3', { title: 'Kolo', genre: 'Serbia' })],
      folders: [{ persistentId: pid(100), name: 'IFD2026', parentId: null }],
      playlists: [{ persistentId: pid(200), name: 'Week 3', parentId: pid(100), itemIds: [pid(1)] }]
    })
    expect(parseSnapshot(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  test.each([
    ['not an object', 'x'],
    ['another version', { ...snapshot(), version: 2 }],
    ['a bad library id', { ...snapshot(), libraryId: 'abc' }],
    ['tracks missing', { ...snapshot(), tracks: undefined }],
    ['a track without an id', snapshot({ tracks: [{ ...snapTrack(1, '/m/a.mp3'), persistentId: 1 }] } as never)],
    ['a playlist with bad items', snapshot({ playlists: [{ persistentId: pid(2), name: 'P', parentId: null, itemIds: [3] }] } as never)]
  ])('rejects %s', (_, value) => {
    expect(() => parseSnapshot(value)).toThrow(SnapshotError)
  })
})
```

`tests/main/apple-sync/eligible.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { previewSnapshot, sortTracks } from '../../../src/main/apple-sync/eligible'
import { pid, snapTrack, snapshot } from './fixtures'

describe('sortTracks (sync spec §5.2)', () => {
  test('local music files in a playable format are synced, with Music tags', () => {
    const { eligible, skipped, unsupported } = sortTracks([
      snapTrack(1, '/m/Kolo.mp3', { title: 'Kolo', artist: 'Taraf', genre: 'Serbia' })
    ])
    expect(eligible).toEqual([
      {
        persistentId: pid(1),
        path: '/m/Kolo.mp3',
        tags: { title: 'Kolo', artist: 'Taraf', albumArtist: null, genre: 'Serbia' },
        durationMs: 1000,
        kind: 'MPEG audio file'
      }
    ])
    expect(skipped).toEqual([])
    expect(unsupported).toEqual([])
  })

  test('cloud items and other media kinds are skipped and counted by reason', () => {
    const { eligible, skipped } = sortTracks([
      snapTrack(1, '/m/a.mp3', { locationType: 'remote', location: 'https://x' }),
      snapTrack(2, '/m/b.mp3', { locationType: 'remote', location: null }),
      snapTrack(3, '/m/c.m4v', { mediaKind: 'music video' }),
      snapTrack(4, '/m/d.pdf', { mediaKind: 'PDF or booklet' })
    ])
    expect(eligible).toEqual([])
    expect(skipped).toEqual([
      { reason: 'In the cloud or streamed', count: 2 },
      { reason: 'Not music: music video', count: 1 },
      { reason: 'Not music: PDF or booklet', count: 1 }
    ])
  })

  test('Apple Lossless and AIFF are unsupported formats', () => {
    const { eligible, unsupported } = sortTracks([
      snapTrack(1, '/m/a.m4a', { kind: 'Apple Lossless audio file' }),
      snapTrack(2, '/m/b.aiff', { kind: 'AIFF audio file' })
    ])
    expect(eligible).toEqual([])
    expect(unsupported.map((u) => u.path)).toEqual(['/m/a.m4a', '/m/b.aiff'])
  })

  test('a music track that is not an audio file is skipped', () => {
    expect(sortTracks([snapTrack(1, '/m/notes.txt')]).skipped).toEqual([
      { reason: 'Not an audio file', count: 1 }
    ])
  })
})

describe('previewSnapshot', () => {
  test('counts synced tracks per playlist and samples tags', () => {
    const preview = previewSnapshot(
      snapshot({
        tracks: [
          snapTrack(1, '/m/a.mp3', { title: 'B' }),
          snapTrack(2, '/m/b.mp3', { title: 'A' }),
          snapTrack(3, '/m/c.mp3', { locationType: 'remote' })
        ],
        playlists: [
          { persistentId: pid(9), name: 'Week', parentId: null, itemIds: [pid(1), pid(3)] }
        ]
      }),
      () => 0
    )
    expect(preview.trackCount).toBe(2)
    expect(preview.playlists).toEqual([{ persistentId: pid(9), name: 'Week', trackCount: 1 }])
    expect(preview.tagSample.map((t) => t.title)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `snapshot.ts`**

```ts
// The helper's JSON snapshot of the Music library, version 1 (sync spec §3.1). Validated before
// anything is applied: a snapshot of the wrong shape is a failed read.

export interface SnapshotTrack {
  persistentId: string
  location: string | null // a file:// URL for local files
  locationType: string // 'file', 'remote', …
  mediaKind: string // 'music', or another kind's name
  kind: string | null // Music's "Kind", e.g. "MPEG audio file"
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
  durationMs: number | null
}

export interface SnapshotFolder {
  persistentId: string
  name: string
  parentId: string | null
}

export interface SnapshotPlaylist {
  persistentId: string
  name: string
  parentId: string | null // its folder
  itemIds: string[] // track persistent IDs, in order
}

export interface Snapshot {
  version: 1
  libraryId: string // the master playlist's persistent ID
  tracks: SnapshotTrack[]
  folders: SnapshotFolder[]
  playlists: SnapshotPlaylist[]
}

export class SnapshotError extends Error {
  constructor(detail: string) {
    super(`The Music library snapshot is invalid: ${detail}`)
    this.name = 'SnapshotError'
  }
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-F]{16}$/.test(v)
const isText = (v: unknown): boolean => v === null || typeof v === 'string'

function list<T>(value: unknown, what: string, check: (v: Dict) => boolean): T[] {
  if (!Array.isArray(value)) throw new SnapshotError(`${what} is not a list`)
  value.forEach((v, i) => {
    if (!isDict(v) || !check(v)) throw new SnapshotError(`${what}[${i}] is malformed`)
  })
  return value as T[]
}

const isTrack = (t: Dict): boolean =>
  isId(t.persistentId) &&
  isText(t.location) &&
  typeof t.locationType === 'string' &&
  typeof t.mediaKind === 'string' &&
  ['kind', 'title', 'artist', 'albumArtist', 'genre'].every((k) => isText(t[k])) &&
  (t.durationMs === null || typeof t.durationMs === 'number')

const isFolder = (f: Dict): boolean =>
  isId(f.persistentId) && typeof f.name === 'string' && (f.parentId === null || isId(f.parentId))

const isPlaylist = (p: Dict): boolean =>
  isFolder(p) && Array.isArray(p.itemIds) && p.itemIds.every(isId)

export function parseSnapshot(value: unknown): Snapshot {
  if (!isDict(value)) throw new SnapshotError('not an object')
  if (value.version !== 1) throw new SnapshotError(`unknown version ${String(value.version)}`)
  if (!isId(value.libraryId)) throw new SnapshotError('no library ID')
  return {
    version: 1,
    libraryId: value.libraryId,
    tracks: list<SnapshotTrack>(value.tracks, 'tracks', isTrack),
    folders: list<SnapshotFolder>(value.folders, 'folders', isFolder),
    playlists: list<SnapshotPlaylist>(value.playlists, 'playlists', isPlaylist)
  }
}
```

- [ ] **Step 5: Extract the tag sampling**

In `src/main/import/apple-library.ts`, move the partial Fisher–Yates shuffle out of
`previewAppleLibrary` into an exported function, and call it there:

```ts
// Up to TAG_SAMPLE_SIZE tracks' tags, chosen at random when there are more; sorted by title.
export function sampleTags(tags: TagSample[], random: () => number = Math.random): TagSample[] {
  // A partial Fisher–Yates shuffle: the first TAG_SAMPLE_SIZE slots end up a random sample.
  const pool = [...tags]
  const size = Math.min(TAG_SAMPLE_SIZE, pool.length)
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
    .slice(0, size)
    .map((t) => ({ ...t }))
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
}
```

`previewAppleLibrary` then returns `tagSample: sampleTags(local.map((t) => t.tags), random)`. Import
`TagSample` from `@shared/import`. Run `npx vitest run tests/main/import/apple-library.test.ts`: it
must still pass unchanged.

- [ ] **Step 6: Write `eligible.ts`**

```ts
import { fileURLToPath } from 'url'
import type { ApplePreview, ImportSummaryItem } from '@shared/import'
import { sampleTags } from '../import/apple-library'
import { classifyPath } from '../import/formats'
import type { RawTags } from '../import/mapping'
import type { Snapshot, SnapshotTrack } from './snapshot'

// A track sync brings in: a local music file in a supported format (sync spec §5.2).
export interface EligibleTrack {
  persistentId: string
  path: string
  tags: RawTags // Music's tags, which win over the file's (§5.3)
  durationMs: number | null
  kind: string | null
}

export interface SortedTracks {
  eligible: EligibleTrack[]
  skipped: { reason: string; count: number }[]
  unsupported: ImportSummaryItem[]
}

// The same rule as readAudioFile's: Music's Kind names Apple Lossless and AIFF.
const UNPLAYABLE_KINDS = /apple lossless|aiff/i

function localPath(track: SnapshotTrack): string | null {
  if (track.locationType !== 'file' || !track.location?.startsWith('file://')) return null
  try {
    return fileURLToPath(track.location)
  } catch {
    return null
  }
}

export function sortTracks(tracks: SnapshotTrack[]): SortedTracks {
  const eligible: EligibleTrack[] = []
  const unsupported: ImportSummaryItem[] = []
  const skipped = new Map<string, number>()
  const skip = (reason: string): void => void skipped.set(reason, (skipped.get(reason) ?? 0) + 1)

  for (const track of tracks) {
    const path = localPath(track)
    if (path === null) {
      skip('In the cloud or streamed')
      continue
    }
    if (track.mediaKind !== 'music') {
      skip(`Not music: ${track.mediaKind}`)
      continue
    }
    const kind = classifyPath(path)
    if (kind === 'ignore') {
      skip('Not an audio file')
      continue
    }
    if (kind === 'unsupported' || (track.kind && UNPLAYABLE_KINDS.test(track.kind))) {
      unsupported.push({ path, detail: track.kind ? `${track.kind} is not supported` : undefined })
      continue
    }
    eligible.push({
      persistentId: track.persistentId,
      path,
      tags: {
        title: track.title,
        artist: track.artist,
        albumArtist: track.albumArtist,
        genre: track.genre
      },
      durationMs: track.durationMs,
      kind: track.kind
    })
  }
  return {
    eligible,
    unsupported,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count }))
  }
}

// The turn-on dialog's mapping step (§5.8 step 2): the synced tracks' tags, sampled like
// Library.xml's, and how many synced tracks each playlist has.
export function previewSnapshot(snapshot: Snapshot, random: () => number = Math.random): ApplePreview {
  const { eligible } = sortTracks(snapshot.tracks)
  const synced = new Set(eligible.map((t) => t.persistentId))
  return {
    trackCount: eligible.length,
    playlists: snapshot.playlists.map((p) => ({
      persistentId: p.persistentId,
      name: p.name,
      trackCount: p.itemIds.filter((id) => synced.has(id)).length
    })),
    tagSample: sampleTags(
      eligible.map((t) => t.tags),
      random
    )
  }
}
```

`unsupported` items with no detail: drop the `detail` key instead of setting `undefined` if the
`toEqual` in Step 2 complains (`{ path, ...(track.kind && { detail: … }) }`).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/main/apple-sync tests/main/import && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/apple-sync src/main/import/apple-library.ts tests/main/apple-sync
git commit -m "feat(sync): parse the Music library snapshot and choose the tracks to sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `LibrarySource`: the helper and the fixture file

**Files:**
- Create: `src/main/apple-sync/library-source.ts`
- Test: `tests/main/apple-sync/library-source.test.ts`

**Interfaces:**
- Consumes: `parseSnapshot`, `SnapshotError` (Task 3).
- Produces:
  ```ts
  export type SnapshotResult = { ok: true; snapshot: Snapshot } | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }
  export interface LibrarySource { read(options?: { timeoutMs?: number }): Promise<SnapshotResult> }
  export const READ_TIMEOUT_MS = 30_000
  export const PERMISSION_TIMEOUT_MS = 300_000
  export interface HelperRun { code: number | null; stdout: string; stderr: string; timedOut: boolean; error: string | null }
  export type RunHelper = (path: string, options: { timeoutMs: number; maxBuffer: number }) => Promise<HelperRun>
  export const runHelper: RunHelper
  export function createHelperSource(helperPath: string, run?: RunHelper): LibrarySource
  export function createFileSource(path: string): LibrarySource
  ```

- [ ] **Step 1: Write the failing tests**

The helper is tested with stub executables (shell scripts) run through the real `execFile`.

`tests/main/apple-sync/library-source.test.ts`:

```ts
import { chmodSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createFileSource,
  createHelperSource,
  runHelper
} from '../../../src/main/apple-sync/library-source'
import { tempDir, type TempDir } from '../helpers/audio-fixtures'
import { snapTrack, snapshot } from './fixtures'

let dir: TempDir
beforeEach(() => (dir = tempDir()))
afterEach(() => dir.cleanup())

// A stub helper: a shell script with the given body.
function stub(body: string): string {
  const path = join(dir.path, 'fdp-music-library')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

const good = JSON.stringify(snapshot({ tracks: [snapTrack(1, '/m/a.mp3')] }))

describe('createHelperSource', () => {
  test('exit 0 with a valid snapshot', async () => {
    const json = dir.file('out.json', good)
    const result = await createHelperSource(stub(`cat '${json}'`)).read()
    expect(result).toMatchObject({ ok: true, snapshot: { tracks: [{ persistentId: '0000000000000001' }] } })
  })

  test('exit 2 is access denied', async () => {
    const result = await createHelperSource(stub('echo "TCC not granted" >&2; exit 2')).read()
    expect(result).toEqual({ ok: false, reason: 'denied', detail: 'TCC not granted' })
  })

  test('exit 3 is an unavailable library', async () => {
    const result = await createHelperSource(stub('echo nope >&2; exit 3')).read()
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  test('another exit code, invalid JSON, or a wrong shape is a failed read', async () => {
    expect(await createHelperSource(stub('exit 1')).read()).toMatchObject({ reason: 'failed' })
    expect(await createHelperSource(stub('echo "{not json"')).read()).toMatchObject({
      reason: 'failed'
    })
    expect(await createHelperSource(stub(`echo '{"version":2}'`)).read()).toMatchObject({
      reason: 'failed',
      detail: expect.stringContaining('unknown version')
    })
  })

  test('a missing helper is a failed read', async () => {
    expect(await createHelperSource(join(dir.path, 'nothing')).read()).toMatchObject({
      reason: 'failed'
    })
  })

  test('a helper that hangs times out', async () => {
    const source = createHelperSource(stub('sleep 5'))
    expect(await source.read({ timeoutMs: 200 })).toMatchObject({
      ok: false,
      reason: 'failed',
      detail: expect.stringContaining('did not finish')
    })
  })

  // Review Focus 1: the permission dialog can be up for a while.
  test('a read given a longer timeout waits past the default', async () => {
    const json = dir.file('out.json', good)
    const calls: number[] = []
    const source = createHelperSource(stub(`cat '${json}'`), (path, options) => {
      calls.push(options.timeoutMs)
      return runHelper(path, options)
    })
    await source.read()
    await source.read({ timeoutMs: 300_000 })
    expect(calls).toEqual([30_000, 300_000])
  })

  // Review Focus 2: a large library prints more than execFile's default 1 MB.
  test('a snapshot larger than 1 MB is read', async () => {
    const tracks = Array.from({ length: 12_000 }, (_, i) =>
      snapTrack(i + 1, `/Users/someone/Music/Media/Music/Artist ${i}/Album/${i} Song.mp3`)
    )
    const json = dir.file('big.json', JSON.stringify(snapshot({ tracks })))
    const result = await createHelperSource(stub(`cat '${json}'`)).read()
    expect(result.ok && result.snapshot.tracks.length).toBe(12_000)
  })
})

describe('createFileSource', () => {
  test('reads the file fresh on every read', async () => {
    const path = dir.file('library.json', good)
    const source = createFileSource(path)
    expect((await source.read()).ok).toBe(true)
    writeFileSync(path, JSON.stringify(snapshot()))
    const again = await source.read()
    expect(again.ok && again.snapshot.tracks).toEqual([])
  })

  test('a missing or invalid file is a failed read', async () => {
    expect(await createFileSource(join(dir.path, 'none.json')).read()).toMatchObject({
      reason: 'failed'
    })
    expect(await createFileSource(dir.file('bad.json', '{')).read()).toMatchObject({
      reason: 'failed'
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/library-source.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `library-source.ts`**

```ts
import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { parseSnapshot, type Snapshot } from './snapshot'

// Where sync reads the Music library from (sync spec §3.2): the bundled helper, or, when
// FDP_APPLE_LIBRARY is set (development and end-to-end tests), a JSON file read fresh every time.

export type SnapshotResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }

export interface LibrarySource {
  read(options?: { timeoutMs?: number }): Promise<SnapshotResult>
}

export const READ_TIMEOUT_MS = 30_000
// Turning sync on: the first read shows macOS's permission dialog, and waits while it is up.
export const PERMISSION_TIMEOUT_MS = 300_000
// A snapshot is about 330 bytes a track; execFile's default (1 MB) is too small for big libraries.
const MAX_OUTPUT = 256 * 1024 * 1024

export interface HelperRun {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error: string | null // the process couldn't be started
}

export type RunHelper = (
  path: string,
  options: { timeoutMs: number; maxBuffer: number }
) => Promise<HelperRun>

export const runHelper: RunHelper = (path, { timeoutMs, maxBuffer }) =>
  new Promise((resolve) => {
    execFile(
      path,
      [],
      { timeout: timeoutMs, maxBuffer, killSignal: 'SIGKILL', encoding: 'utf8' },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: unknown }) | null
        resolve({
          code: e ? (typeof e.code === 'number' ? e.code : null) : 0,
          stdout,
          stderr,
          timedOut: e?.killed === true,
          error: e && typeof e.code === 'string' ? e.message : null
        })
      }
    )
  })

function parse(text: string): SnapshotResult {
  try {
    return { ok: true, snapshot: parseSnapshot(JSON.parse(text)) }
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}

// Exit codes (§3.1): 0 success, 2 access denied, 3 the library couldn't be opened.
export function createHelperSource(helperPath: string, run: RunHelper = runHelper): LibrarySource {
  return {
    async read(options = {}) {
      const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS
      const result = await run(helperPath, { timeoutMs, maxBuffer: MAX_OUTPUT })
      const detail = result.stderr.trim()
      if (result.error) return { ok: false, reason: 'failed', detail: result.error }
      if (result.timedOut) {
        return {
          ok: false,
          reason: 'failed',
          detail: `The Music library reader did not finish within ${Math.round(timeoutMs / 1000)} s`
        }
      }
      if (result.code === 2) return { ok: false, reason: 'denied', detail }
      if (result.code === 3) return { ok: false, reason: 'unavailable', detail }
      if (result.code !== 0) {
        return {
          ok: false,
          reason: 'failed',
          detail: `The Music library reader stopped (exit ${result.code ?? 'signal'}): ${detail}`
        }
      }
      return parse(result.stdout)
    }
  }
}

export function createFileSource(path: string): LibrarySource {
  return {
    async read() {
      try {
        return parse(await readFile(path, 'utf8'))
      } catch (err) {
        return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) }
      }
    }
  }
}
```

Note on `runHelper`: when the process exits non-zero, Node sets `err.code` to the exit code (a
number); when it can't start, `err.code` is a string like `'ENOENT'`. A timeout kills the process
(`err.killed === true`). A `maxBuffer` overflow also kills it; that reports as `timedOut` too, which
is wrong but harmless at 256 MB. If the test "a missing helper" fails because `ENOENT` arrives as a
thrown error rather than the callback, wrap the `execFile` call in `try`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/apple-sync/library-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/apple-sync/library-source.ts tests/main/apple-sync/library-source.test.ts
git commit -m "feat(sync): read the Music library from the helper or a fixture file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Swift helper and packaging

**Files:**
- Create: `native/music-library/main.swift`, `scripts/build-helper.sh`
- Modify: `package.json` (scripts), `electron-builder.yml`, `.gitignore`,
  `.github/workflows/pr-gate.yml`, `CONTRIBUTING.md`
- Test: `tests/main/apple-sync/helper-real.test.ts` (runs only with `FDP_TEST_REAL_MUSIC=1`),
  `tests/project.test.ts`

**Interfaces:**
- Produces: `resources/bin/fdp-music-library` (built, not committed), copied to
  `Contents/Resources/fdp-music-library` in the packaged app. `npm run build:helper`. The app's
  Info.plist carries `NSAppleMusicUsageDescription`.

- [ ] **Step 1: Write the project test**

`tests/project.test.ts` already checks the project's configuration; add (reading the files the way
the file's other tests do):

```ts
test('the Music library helper is bundled, and the app explains Music access', () => {
  const builder = readFileSync('electron-builder.yml', 'utf8')
  expect(builder).toMatch(/from: resources\/bin\/fdp-music-library/)
  expect(builder).toMatch(/NSAppleMusicUsageDescription:/)
  expect(builder).toMatch(/x64ArchFiles: Contents\/Resources\/fdp-music-library/)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.scripts['build:helper']).toBe('sh scripts/build-helper.sh')
  expect(pkg.scripts.dist).toContain('npm run build:helper')
  expect(readFileSync('.gitignore', 'utf8')).toMatch(/^resources\/bin\/$/m)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/project.test.ts`
Expected: FAIL — `electron-builder.yml` has no `extraResources`.

- [ ] **Step 3: Write the helper**

`native/music-library/main.swift` (this exact file compiles without warnings with Swift 6.3 for
`arm64-apple-macos12.0` and `x86_64-apple-macos12.0`):

```swift
// fdp-music-library: prints the Music library as one JSON snapshot on stdout (Apple Music sync spec
// §3.1). It only reads. Exit codes: 0 success, 2 access denied, 3 the library couldn't be opened.
// Built by `npm run build:helper` (scripts/build-helper.sh) as a Universal binary.
import Foundation
import iTunesLibrary

// Persistent IDs as Library.xml writes them: 16 uppercase hex digits.
func hex(_ id: NSNumber) -> String { String(format: "%016llX", id.uint64Value) }

// "music" for music; a readable name otherwise (the app counts skipped tracks by it).
func mediaKindName(_ kind: ITLibMediaItemMediaKind) -> String {
  switch kind {
  case .kindSong: return "music"
  case .kindMusicVideo: return "music video"
  case .kindMovie, .kindHomeVideo: return "video"
  case .kindTVShow: return "TV show"
  case .kindPodcast: return "podcast"
  case .kindAudiobook, .kindBook: return "audiobook"
  case .kindPDFBooklet, .kindPDFBook, .kindDigitalBooklet, .kindInteractiveBooklet:
    return "PDF or booklet"
  case .kindVoiceMemo: return "voice memo"
  case .kindRingtone, .kindAlertTone: return "ringtone"
  default: return "other"
  }
}

func locationTypeName(_ type: ITLibMediaItemLocationType) -> String {
  switch type {
  case .file: return "file"
  case .URL: return "url"
  case .remote: return "remote"
  default: return "unknown"
  }
}

// Every value is written, as null when absent (JSONEncoder would leave optional keys out).
struct Track: Encodable {
  let item: ITLibMediaItem
  enum Key: String, CodingKey {
    case persistentId, location, locationType, mediaKind, kind, title, artist, albumArtist, genre,
      durationMs
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(item.persistentID), forKey: .persistentId)
    try c.encode(item.location?.absoluteString, forKey: .location)
    try c.encode(locationTypeName(item.locationType), forKey: .locationType)
    try c.encode(mediaKindName(item.mediaKind), forKey: .mediaKind)
    try c.encode(item.kind, forKey: .kind)
    try c.encode(item.title, forKey: .title)
    try c.encode(item.artist?.name, forKey: .artist)
    try c.encode(item.album.albumArtist, forKey: .albumArtist)
    try c.encode(item.genre.isEmpty ? nil : item.genre, forKey: .genre)
    try c.encode(item.totalTime > 0 ? item.totalTime : nil, forKey: .durationMs)
  }
}

struct Folder: Encodable {
  let playlist: ITLibPlaylist
  enum Key: String, CodingKey { case persistentId, name, parentId }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(playlist.persistentID), forKey: .persistentId)
    try c.encode(playlist.name, forKey: .name)
    try c.encode(playlist.parentID.map(hex), forKey: .parentId)
  }
}

struct Playlist: Encodable {
  let playlist: ITLibPlaylist
  enum Key: String, CodingKey { case persistentId, name, parentId, itemIds }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(playlist.persistentID), forKey: .persistentId)
    try c.encode(playlist.name, forKey: .name)
    try c.encode(playlist.parentID.map(hex), forKey: .parentId)
    try c.encode(playlist.items.map { hex($0.persistentID) }, forKey: .itemIds)
  }
}

struct Snapshot: Encodable {
  let version = 1
  let libraryId: String
  let tracks: [Track]
  let folders: [Folder]
  let playlists: [Playlist]
}

func fail(_ code: Int32, _ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(code)
}

let library: ITLibrary
do {
  library = try ITLibrary(apiVersion: "1.1")
} catch {
  // macOS reports a refused Media & Apple Music permission through TCC ("TCC not granted" in the
  // spike); anything else means the library couldn't be opened.
  let text = String(describing: error)
  fail(text.contains("TCC") || text.lowercased().contains("not authorized") ? 2 : 3, text)
}

let all = library.allPlaylists
guard let primary = all.first(where: { $0.isPrimary }) else {
  fail(3, "The Music library has no main playlist")
}
// The user's own playlists (sync spec §3.1): not the library itself, built-in playlists, folders or
// hidden playlists. Smart playlists are included with their current items.
let folders = all.filter { $0.kind == .folder }
let playlists = all.filter {
  !$0.isPrimary && $0.distinguishedKind == .kindNone && $0.kind != .folder && $0.isVisible
}
let snapshot = Snapshot(
  libraryId: hex(primary.persistentID),
  tracks: library.allMediaItems.map(Track.init),
  folders: folders.map(Folder.init),
  playlists: playlists.map(Playlist.init)
)
do {
  FileHandle.standardOutput.write(try JSONEncoder().encode(snapshot))
} catch {
  fail(1, "Couldn't write the snapshot: \(error)")
}
```

The denial check reads the error's text: the spike saw "TCC not granted", but which `NSError` macOS
returns isn't documented. Task 19's hardware checklist confirms that a refused permission shows the
Settings help (exit 2), not "sync failed" (exit 3); if it doesn't, match on what the log shows.

- [ ] **Step 4: Write the build script**

`scripts/build-helper.sh`:

```sh
#!/bin/sh
# Builds the Music library helper (Apple Music sync spec §3.1) as a Universal binary in
# resources/bin/, which electron-builder copies into the app. Needs Xcode's command line tools.
set -eu
cd "$(dirname "$0")/.."
src=native/music-library/main.swift
work=out/helper
mkdir -p "$work" resources/bin
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12.0" -framework iTunesLibrary -o "$work/$arch" "$src"
done
lipo -create -output resources/bin/fdp-music-library "$work/arm64" "$work/x86_64"
echo "Built resources/bin/fdp-music-library"
```

macOS 12 is Electron 44's minimum, and `ITLibPlaylist.isPrimary` needs it.

`package.json` scripts:

```json
    "build:helper": "sh scripts/build-helper.sh",
    "dist": "npm run build && npm run build:helper && env -u ELECTRON_RUN_AS_NODE electron-builder --mac --publish never",
```

`.gitignore`, after `out/`:

```
# Built by npm run build:helper
resources/bin/
```

- [ ] **Step 5: Bundle it and declare Music access**

`electron-builder.yml`, under `mac:` (after `hardenedRuntime`):

```yaml
  # The Music library helper (Apple Music sync spec §3.1). It is already Universal, so the Universal
  # merge must take it from the x64 copy as is (x64ArchFiles), or @electron/universal stops on a
  # Mach-O file that is the same in both builds.
  extraResources:
    - from: resources/bin/fdp-music-library
      to: fdp-music-library
  x64ArchFiles: Contents/Resources/fdp-music-library
  # Without this key macOS refuses Music access without asking (sync spec §9).
  extendInfo:
    NSAppleMusicUsageDescription: Folk Dance Player reads your Music library to keep its songs and playlists in step with Apple Music.
```

`.github/workflows/pr-gate.yml`, in the `e2e` job (macOS), before `npm run test:e2e`:

```yaml
      # The Swift helper must build on macOS (sync spec §8); the release's npm run dist builds it too.
      - run: npm run build:helper
```

`CONTRIBUTING.md`, in the development setup section: "Building the packaged app (`npm run dist`)
needs Xcode's command line tools (`xcode-select --install`): it compiles the Music library helper in
`native/music-library/` with `swiftc`. `npm run dev` started from Visual Studio Code's terminal
can't read the Music library (macOS asks on behalf of Visual Studio Code, which doesn't declare
Music use), so test sync there with `FDP_APPLE_LIBRARY=<a snapshot JSON file> npm run dev`, and the
real helper in the packaged app."

- [ ] **Step 6: Build it**

Run: `npm run build:helper && lipo -info resources/bin/fdp-music-library`
Expected: "Built resources/bin/fdp-music-library", then "Architectures in the fat file: … are:
x86_64 arm64".

- [ ] **Step 7: Write the real-library test**

`tests/main/apple-sync/helper-real.test.ts`:

```ts
import { existsSync } from 'fs'
import { describe, expect, test } from 'vitest'
import { createHelperSource } from '../../../src/main/apple-sync/library-source'

// Reads the real Music library through the built helper (sync spec §8). It needs Music access,
// which macOS grants only to an app that declares it, so it runs only when asked:
//   npm run build:helper && FDP_TEST_REAL_MUSIC=1 npx vitest run tests/main/apple-sync/helper-real.test.ts
// From a terminal that macOS lets read Music (Terminal.app after granting it access).
const helper = 'resources/bin/fdp-music-library'

describe.runIf(process.env['FDP_TEST_REAL_MUSIC'] === '1')('the real Music library', () => {
  test('the helper prints a valid snapshot', async () => {
    expect(existsSync(helper)).toBe(true)
    const result = await createHelperSource(helper).read({ timeoutMs: 120_000 })
    if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
    expect(result.snapshot.tracks.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 8: Run the tests and checks**

Run: `npx vitest run tests/project.test.ts tests/main/apple-sync && npx prettier --check .`
Expected: PASS; the real-library test is skipped.

Ask the user before running `FDP_TEST_REAL_MUSIC=1` (it reads their Music library and may show a
permission dialog). It is optional here: the hardware checklist covers the packaged app.

- [ ] **Step 9: Commit**

```bash
git add native scripts/build-helper.sh package.json electron-builder.yml .gitignore .github CONTRIBUTING.md tests
git commit -m "build(sync): the Music library helper, bundled in the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tags follow Music unless edited in the app

Sync spec §5.4. One function compares Music's mapped values with the baseline (what sync last wrote)
and the app's current values.

**Files:**
- Create: `src/main/apple-sync/sync-tags.ts`
- Modify: `src/main/import/save-file.ts` (export `defaultPairing`)
- Test: `tests/main/apple-sync/sync-tags.test.ts`

**Interfaces:**
- Consumes: `mapTags`, `RawTags`, `ImportMapping` (`src/main/import/mapping.ts`); `defaultPairing`
  (now exported from `save-file.ts`); `files.sync_baseline` (Task 1).
- Produces:
  ```ts
  export type SyncField = 'title' | 'artist' | 'danceName' | 'country' | 'choreographer' | 'teacher'
  export type SyncBaseline = Record<SyncField, string | null>
  export function applyMusicTags(db: DatabaseSync, fileId: number, tags: RawTags, mapping: ImportMapping): boolean
  ```
  It writes the fields Music changed that the app didn't, moves the baseline to Music's values,
  refreshes the raw `tag_*` columns, and returns whether any app value changed.

- [ ] **Step 1: Write the failing tests**

`tests/main/apple-sync/sync-tags.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import { applyMusicTags } from '../../../src/main/apple-sync/sync-tags'
import { updateDance, updateSong } from '../../../src/main/library/edit'
import { addLibrarySong, link, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'choreographer',
  genreIsCountry: true
}
const tags = (over: Partial<Record<'title' | 'artist' | 'albumArtist' | 'genre', string | null>>) => ({
  title: 'Kolo',
  artist: 'Taraf',
  albumArtist: null,
  genre: 'Serbia',
  ...over
})

let db: DatabaseSync
let kolo: { fileId: number; songId: number; danceId: number | null }

// A song as an import of those tags makes it: raw tags stored, mapped values written.
beforeEach(() => {
  db = createTestDb()
  kolo = addLibrarySong(db, {
    title: 'Kolo',
    path: '/m/Kolo.mp3',
    artist: 'Taraf',
    dance: { name: 'Kolo', country: 'Serbia' }
  })
  db.prepare(
    "UPDATE files SET tag_title = 'Kolo', tag_artist = 'Taraf', tag_genre = 'Serbia' WHERE id = ?"
  ).run(kolo.fileId)
})

const baseline = () =>
  JSON.parse(
    (db.prepare('SELECT sync_baseline FROM files WHERE id = ?').get(kolo.fileId) as {
      sync_baseline: string
    }).sync_baseline
  )

describe('applyMusicTags (sync spec §5.4)', () => {
  test('unchanged tags change nothing but record the baseline', () => {
    expect(applyMusicTags(db, kolo.fileId, tags({}), mapping)).toBe(false)
    expect(baseline()).toEqual({
      title: 'Kolo',
      artist: 'Taraf',
      danceName: 'Kolo',
      country: 'Serbia',
      choreographer: null,
      teacher: null
    })
  })

  test('a tag changed in Music updates a field nobody edited here', () => {
    expect(applyMusicTags(db, kolo.fileId, tags({ genre: 'Macedonia', albumArtist: 'Atanas' }), mapping)).toBe(true)
    expect(songView(db, kolo.fileId)).toMatchObject({ country: 'Macedonia', choreographer: 'Atanas' })
    expect(baseline()).toMatchObject({ country: 'Macedonia', choreographer: 'Atanas' })
  })

  test('a field edited in the app keeps its value, now and after a later Music edit', () => {
    updateSong(db, kolo.songId, { artist: 'Taraf de Haïdouks' })
    expect(applyMusicTags(db, kolo.fileId, tags({ artist: 'Taraf!' }), mapping)).toBe(false)
    expect(songView(db, kolo.fileId).artist).toBe('Taraf de Haïdouks')
    expect(baseline().artist).toBe('Taraf!')
    applyMusicTags(db, kolo.fileId, tags({ artist: 'Taraf again' }), mapping)
    expect(songView(db, kolo.fileId).artist).toBe('Taraf de Haïdouks')
  })

  test('a title change in Music renames the song and its own dance', () => {
    applyMusicTags(db, kolo.fileId, tags({ title: 'Kolo (Serbia)' }), mapping)
    expect(songView(db, kolo.fileId)).toMatchObject({ title: 'Kolo (Serbia)', dance: 'Kolo (Serbia)' })
  })

  test('a dance shared with other songs is never changed by one song', () => {
    const other = addLibrarySong(db, { title: 'Kolo 2' })
    link(db, kolo.danceId!, other.songId)
    applyMusicTags(db, kolo.fileId, tags({ genre: 'Croatia', title: 'Kolo B' }), mapping)
    expect(songView(db, kolo.fileId)).toMatchObject({ title: 'Kolo B', dance: 'Kolo', country: 'Serbia' })
  })

  test('the teacher on the pairing follows its tag', () => {
    const teach: ImportMapping = { ...mapping, albumArtistTagTarget: 'teacher' }
    applyMusicTags(db, kolo.fileId, tags({}), teach)
    applyMusicTags(db, kolo.fileId, tags({ albumArtist: 'Yves' }), teach)
    expect(songView(db, kolo.fileId).teacher).toBe('Yves')
  })

  test('a song with no baseline gets one from its stored raw tags first', () => {
    // The file's raw tags say Serbia; the dance was edited to Bosnia; Music now says Croatia.
    updateDance(db, kolo.danceId!, { country: 'Bosnia' })
    applyMusicTags(db, kolo.fileId, tags({ genre: 'Croatia' }), mapping)
    expect(songView(db, kolo.fileId).country).toBe('Bosnia')
  })

  test('the raw tag columns are refreshed from Music', () => {
    applyMusicTags(db, kolo.fileId, tags({ albumArtist: 'Atanas' }), mapping)
    expect(
      db.prepare('SELECT tag_album_artist AS a FROM files WHERE id = ?').get(kolo.fileId)
    ).toEqual({ a: 'Atanas' })
  })

  test('a song whose default dance was unlinked only follows song fields', () => {
    const solo = addLibrarySong(db, { title: 'Solo', path: '/m/Solo.mp3' })
    db.prepare("UPDATE files SET tag_title = 'Solo' WHERE id = ?").run(solo.fileId)
    expect(applyMusicTags(db, solo.fileId, { title: 'Solo 2', artist: null, albumArtist: null, genre: 'X' }, mapping)).toBe(true)
    expect(songView(db, solo.fileId)).toMatchObject({ title: 'Solo 2', dance: null })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/sync-tags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Export `defaultPairing`**

In `src/main/import/save-file.ts`, change `function defaultPairing(` to `export function
defaultPairing(`.

- [ ] **Step 4: Write `sync-tags.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import { mapTags, type ImportMapping, type MappedTags, type RawTags } from '../import/mapping'
import { defaultPairing } from '../import/save-file'

// The fields sync keeps in step with Music's tags (sync spec §5.4): the song's title and artist, its
// default dance's name, country and choreographer (only while that dance has this one song), and
// that pairing's teacher.
export type SyncField = 'title' | 'artist' | 'danceName' | 'country' | 'choreographer' | 'teacher'
export type SyncBaseline = Record<SyncField, string | null>

const FIELDS: readonly SyncField[] = [
  'title',
  'artist',
  'danceName',
  'country',
  'choreographer',
  'teacher'
]

const norm = (v: string | null | undefined): string | null => v?.trim() || null

const baselineOf = (m: MappedTags): SyncBaseline => ({
  title: m.song.title,
  artist: m.song.artist,
  danceName: m.dance.name,
  country: m.dance.country,
  choreographer: m.dance.choreographer,
  teacher: m.teacher
})

function parseBaseline(text: string | null): SyncBaseline | null {
  if (!text) return null
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    return FIELDS.every((f) => value[f] === null || typeof value[f] === 'string')
      ? (value as SyncBaseline)
      : null
  } catch {
    return null
  }
}

interface FileTags {
  path: string
  sync_baseline: string | null
  tag_title: string | null
  tag_artist: string | null
  tag_album_artist: string | null
  tag_genre: string | null
}

// A field changes only when Music changed it and the app still has the value sync last wrote; the
// baseline always moves to Music's value, so a field edited here is never overridden later.
export function applyMusicTags(
  db: DatabaseSync,
  fileId: number,
  tags: RawTags,
  mapping: ImportMapping
): boolean {
  const file = db
    .prepare(
      'SELECT path, sync_baseline, tag_title, tag_artist, tag_album_artist, tag_genre FROM files WHERE id = ?'
    )
    .get(fileId) as FileTags | undefined
  const song = db.prepare('SELECT id, title, artist FROM songs WHERE file_id = ?').get(fileId) as
    { id: number; title: string; artist: string | null } | undefined
  if (!file || !song) return false

  const next = baselineOf(mapTags(tags, file.path, mapping))
  // Songs imported before sync, or adopted local songs: what an import of their stored tags wrote.
  const base =
    parseBaseline(file.sync_baseline) ??
    baselineOf(
      mapTags(
        {
          title: file.tag_title,
          artist: file.tag_artist,
          albumArtist: file.tag_album_artist,
          genre: file.tag_genre
        },
        file.path,
        mapping
      )
    )

  const pairing = defaultPairing(db, song.id)
  const dance =
    pairing && pairing.songCount === 1
      ? (db
          .prepare('SELECT name, country, choreographer FROM dances WHERE id = ?')
          .get(pairing.danceId) as { name: string; country: string | null; choreographer: string | null })
      : null
  const current: Partial<SyncBaseline> = { title: song.title, artist: song.artist }
  if (dance) {
    current.danceName = dance.name
    current.country = dance.country
    current.choreographer = dance.choreographer
  }
  if (pairing) {
    const row = db
      .prepare('SELECT teacher FROM dance_song_prefs WHERE dance_song_id = ?')
      .get(pairing.id) as { teacher: string | null } | undefined
    current.teacher = row?.teacher ?? null
  }

  const writes = FIELDS.filter(
    (f) =>
      f in current && norm(next[f]) !== norm(base[f]) && norm(current[f]) === norm(base[f])
  )
  const set = (table: string, column: string, where: string, value: string | null, id: number) =>
    db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${where} = ?`).run(value, id)
  for (const f of writes) {
    if (f === 'title') set('songs', 'title', 'id', next.title, song.id)
    else if (f === 'artist') set('songs', 'artist', 'id', next.artist, song.id)
    else if (f === 'danceName') set('dances', 'name', 'id', next.danceName, pairing!.danceId)
    else if (f === 'country') set('dances', 'country', 'id', next.country, pairing!.danceId)
    else if (f === 'choreographer')
      set('dances', 'choreographer', 'id', next.choreographer, pairing!.danceId)
    else {
      db.prepare('INSERT OR IGNORE INTO dance_song_prefs (dance_song_id) VALUES (?)').run(pairing!.id)
      set('dance_song_prefs', 'teacher', 'dance_song_id', next.teacher, pairing!.id)
    }
  }
  db.prepare(
    `UPDATE files SET sync_baseline = ?, tag_title = ?, tag_artist = ?, tag_album_artist = ?,
       tag_genre = ? WHERE id = ?`
  ).run(JSON.stringify(next), tags.title, tags.artist, tags.albumArtist, tags.genre, fileId)
  return writes.length > 0
}
```

`mapTags` always gives a title (the file name when the tag is empty), so `songs.title` (NOT NULL)
never gets null.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/apple-sync/sync-tags.test.ts tests/main/import && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/apple-sync/sync-tags.ts src/main/import/save-file.ts tests/main/apple-sync/sync-tags.test.ts
git commit -m "feat(sync): tags follow Music unless the field was edited in the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Matching and saving a synced track

Sync spec §5.3: a synced file with the same persistent ID; otherwise same path, then persistent ID,
then fingerprint, with adoption and restoring.

**Files:**
- Create: `src/main/apple-sync/save-synced.ts`
- Modify: `src/main/import/save-file.ts` (export `insertFile` and `FileRow`)
- Test: `tests/main/apple-sync/save-synced.test.ts`

**Interfaces:**
- Consumes: `EligibleTrack` (Task 3), `applyMusicTags` (Task 6), `insertFile`, `FileFacts`
  (`read-file.ts`), `mapTags`.
- Produces:
  ```ts
  export type SyncOutcome = 'added' | 'updated' | 'relinked' | 'adopted' | 'restored' | 'unchanged' | 'missing' | 'taken'
  export const TAKEN_DETAIL = 'Another Apple Music track uses this file'
  export type RowMatch = { kind: 'row'; row: FileRow } | { kind: 'none' } | { kind: 'taken' }
  export function samePath(a: string, b: string): boolean
  export function findSyncRow(db: DatabaseSync, track: EligibleTrack, livePids: ReadonlySet<string>): RowMatch
  export interface SyncTrackInput { track: EligibleTrack; facts: FileFacts | null; rowId: number | null; missing: boolean }
  export interface SyncSaveContext { mapping: ImportMapping; livePids: ReadonlySet<string> }
  export function saveSyncedTrack(db: DatabaseSync, input: SyncTrackInput, ctx: SyncSaveContext): { outcome: SyncOutcome; fileId: number }
  ```
  `findSyncRow` runs before reading: by persistent ID, then by path (NFC or NFD). `'taken'` means the
  path belongs to another track Music still has. `saveSyncedTrack` runs after reading (or with
  `facts: null` for an unchanged or missing file) in the caller's transaction. It returns `'taken'`
  (writing nothing) when the path it would write is another song's: two tracks of one sync can
  point at the same file, and neither has been saved when `findSyncRow` runs.

- [ ] **Step 1: Write the failing tests**

`tests/main/apple-sync/save-synced.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import type { EligibleTrack } from '../../../src/main/apple-sync/eligible'
import {
  findSyncRow,
  samePath,
  saveSyncedTrack,
  type SyncTrackInput
} from '../../../src/main/apple-sync/save-synced'
import type { FileFacts } from '../../../src/main/import/read-file'
import { addToPlaylist, createPlaylist, setFavorite } from '../../../src/main/library/playlists'
import { addLibrarySong, removeSong, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid } from './fixtures'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'ignore',
  genreIsCountry: true
}

let db: DatabaseSync
beforeEach(() => (db = createTestDb()))

const track = (n: number, path: string, title = `Track ${n}`): EligibleTrack => ({
  persistentId: pid(n),
  path,
  tags: { title, artist: null, albumArtist: null, genre: 'Serbia' },
  durationMs: 1000,
  kind: 'MPEG audio file'
})
const facts = (path: string, hash: string, size = 10): FileFacts => ({
  path,
  fileSize: size,
  mtimeMs: 5,
  durationMs: 1000,
  contentHash: hash,
  tags: { title: null, artist: null, albumArtist: null, genre: null }
})
const file = (id: number) =>
  db
    .prepare(
      'SELECT path, apple_persistent_id AS pid, apple_sync AS sync, removed_at AS removed, is_missing AS missing FROM files WHERE id = ?'
    )
    .get(id)
const ctx = (live: number[] = []) => ({ mapping, livePids: new Set(live.map(pid)) })
const save = (input: Partial<SyncTrackInput> & { track: EligibleTrack }, live: number[] = []) =>
  saveSyncedTrack(db, { facts: null, rowId: null, missing: false, ...input }, ctx(live))

// A local song with a fingerprint, as Add Music… makes it.
function local(title: string, path: string, hash: string) {
  const s = addLibrarySong(db, { title, path, dance: { name: title } })
  db.prepare('UPDATE files SET content_hash = ?, file_size = 10, mtime_ms = 5 WHERE id = ?').run(
    hash,
    s.fileId
  )
  return s
}

describe('samePath', () => {
  test('compares accented names in either Unicode form', () => {
    expect(samePath('/m/Paşa.mp3', '/m/Paşa.mp3')).toBe(true)
    expect(samePath('/m/a.mp3', '/m/b.mp3')).toBe(false)
  })
})

describe('findSyncRow', () => {
  test('finds by persistent ID first, then by path in either form', () => {
    const a = local('A', '/m/Paşa.mp3', 'h1')
    expect(findSyncRow(db, track(1, '/m/Paşa.mp3'), new Set())).toMatchObject({
      kind: 'row',
      row: { id: a.fileId }
    })
    db.prepare('UPDATE files SET apple_persistent_id = ? WHERE id = ?').run(pid(7), a.fileId)
    expect(findSyncRow(db, track(7, '/elsewhere.mp3'), new Set())).toMatchObject({
      row: { id: a.fileId }
    })
  })

  test("a path owned by another track Music still has is taken", () => {
    const a = local('A', '/m/a.mp3', 'h1')
    db.prepare('UPDATE files SET apple_persistent_id = ? WHERE id = ?').run(pid(1), a.fileId)
    expect(findSyncRow(db, track(2, '/m/a.mp3'), new Set([pid(1), pid(2)]))).toEqual({
      kind: 'taken'
    })
  })

  test('nothing matches a new file', () => {
    expect(findSyncRow(db, track(1, '/m/new.mp3'), new Set())).toEqual({ kind: 'none' })
  })
})

describe('saveSyncedTrack (sync spec §5.3)', () => {
  test('a new track becomes a synced song with its dance', () => {
    const { outcome, fileId } = save({ track: track(1, '/m/Kolo.mp3', 'Kolo'), facts: facts('/m/Kolo.mp3', 'h1') })
    expect(outcome).toBe('added')
    expect(file(fileId)).toMatchObject({ pid: pid(1), sync: 'synced', removed: null })
    expect(songView(db, fileId)).toMatchObject({ title: 'Kolo', dance: 'Kolo', country: 'Serbia' })
  })

  test('an unchanged synced track is unchanged', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId }, [1]).outcome).toBe('unchanged')
  })

  test('Music moving the file relinks it', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    const moved = save({ track: track(1, '/m/new/a.mp3'), rowId: fileId, facts: facts('/m/new/a.mp3', 'h1') }, [1])
    expect(moved).toEqual({ outcome: 'relinked', fileId })
    expect(file(fileId)).toMatchObject({ path: '/m/new/a.mp3' })
  })

  test('a path that differs only in Unicode form is kept as stored', () => {
    const { fileId } = save({ track: track(1, '/m/Paşa.mp3'), facts: facts('/m/Paşa.mp3', 'h1') })
    const again = save({ track: track(1, '/m/Paşa.mp3'), rowId: fileId, facts: facts('/m/Paşa.mp3', 'h1') }, [1])
    expect(again.outcome).toBe('unchanged')
    expect(file(fileId)).toMatchObject({ path: '/m/Paşa.mp3' })
  })

  test('a local song at the same path is adopted with its data', () => {
    const a = local('Kolo', '/m/Kolo.mp3', 'h1')
    setFavorite(db, [a.fileId], true)
    const result = save({ track: track(1, '/m/Kolo.mp3', 'Kolo'), rowId: a.fileId }, [1])
    expect(result).toEqual({ outcome: 'adopted', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ pid: pid(1), sync: 'synced' })
  })

  test('a local copy elsewhere is adopted by fingerprint, even though it still exists', () => {
    const a = local('Kolo', '/Users/me/Downloads/Kolo.mp3', 'h1')
    const result = save({ track: track(1, '/m/Music/Kolo.mp3', 'Kolo'), facts: facts('/m/Music/Kolo.mp3', 'h1') }, [1])
    expect(result).toEqual({ outcome: 'adopted', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ path: '/m/Music/Kolo.mp3', sync: 'synced' })
  })

  test('of two local copies, the oldest is adopted and the other stays local', () => {
    const first = local('Kolo', '/d/1.mp3', 'h1')
    const second = local('Kolo copy', '/d/2.mp3', 'h1')
    expect(save({ track: track(1, '/m/Kolo.mp3'), facts: facts('/m/Kolo.mp3', 'h1') }, [1]).fileId).toBe(first.fileId)
    expect(file(second.fileId)).toMatchObject({ sync: null })
  })

  test('a removed song whose file comes back is restored, with its playlists', () => {
    const a = local('Kolo', '/m/Kolo.mp3', 'h1')
    const p = createPlaylist(db, 'Mine')
    addToPlaylist(db, p, [a.fileId])
    removeSong(db, a.fileId)
    const result = save({ track: track(9, '/m/Kolo again.mp3'), facts: facts('/m/Kolo again.mp3', 'h1') }, [9])
    expect(result).toEqual({ outcome: 'restored', fileId: a.fileId })
    expect(file(a.fileId)).toMatchObject({ removed: null, sync: 'synced', pid: pid(9) })
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlist_items WHERE file_id = ?').get(a.fileId)).toEqual({ n: 1 })
  })

  test('a gone song whose track comes back is synced again, quietly', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(fileId)
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId }, [1]).outcome).toBe('unchanged')
    expect(file(fileId)).toMatchObject({ sync: 'synced' })
  })

  test('Music re-adding a deleted track (a new ID) relinks the gone song by fingerprint', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(fileId)
    const result = save({ track: track(2, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [2])
    expect(result.fileId).toBe(fileId)
    expect(file(fileId)).toMatchObject({ pid: pid(2), sync: 'synced' })
  })

  test('two Music tracks with identical audio are two songs', () => {
    const one = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    const two = save({ track: track(2, '/m/b.mp3'), facts: facts('/m/b.mp3', 'h1') }, [1, 2])
    expect(two.outcome).toBe('added')
    expect(two.fileId).not.toBe(one.fileId)
  })

  test('a second track of the same sync at the same path is taken, and writes nothing', () => {
    const one = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    const two = save({ track: track(2, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') }, [1, 2])
    expect(two).toEqual({ outcome: 'taken', fileId: one.fileId })
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 1 })
  })

  test('a synced track whose file is gone from disk is marked missing, still synced', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId, missing: true }, [1]).outcome).toBe('missing')
    expect(file(fileId)).toMatchObject({ missing: 1, sync: 'synced' })
  })

  test('a replaced file (new size or fingerprint) is updated', () => {
    const { fileId } = save({ track: track(1, '/m/a.mp3'), facts: facts('/m/a.mp3', 'h1') })
    expect(save({ track: track(1, '/m/a.mp3'), rowId: fileId, facts: facts('/m/a.mp3', 'h2', 20) }, [1]).outcome).toBe('updated')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/save-synced.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Export from `save-file.ts`**

Export `FileRow` (`export interface FileRow`) and `insertFile` (`export function insertFile(`). Add
the new columns to `FileRow`:

```ts
  apple_sync: 'synced' | 'gone' | null
  removed_at: string | null
```

- [ ] **Step 4: Write `save-synced.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { ImportMapping } from '@shared/import'
import { mapTags } from '../import/mapping'
import type { FileFacts } from '../import/read-file'
import { insertFile, type FileRow } from '../import/save-file'
import type { EligibleTrack } from './eligible'
import { applyMusicTags } from './sync-tags'

export type SyncOutcome =
  | 'added'
  | 'updated'
  | 'relinked'
  | 'adopted'
  | 'restored'
  | 'unchanged'
  | 'missing'
  | 'taken' // another song has the file's path; nothing was written

export const TAKEN_DETAIL = 'Another Apple Music track uses this file'

export type RowMatch = { kind: 'row'; row: FileRow } | { kind: 'none' } | { kind: 'taken' }

// Music and the file system can store the same accented name in different Unicode forms (§5.3).
export const samePath = (a: string, b: string): boolean => a.normalize('NFC') === b.normalize('NFC')

// The row at `path` in either Unicode form, other than `exceptId`.
function pathOwner(db: DatabaseSync, path: string, exceptId: number | null): number | undefined {
  const row = db
    .prepare('SELECT id FROM files WHERE path IN (?, ?) AND id IS NOT ? LIMIT 1')
    .get(path.normalize('NFC'), path.normalize('NFD'), exceptId) as { id: number } | undefined
  return row?.id
}

const ownedByLiveTrack = (row: FileRow, pid: string, live: ReadonlySet<string>): boolean =>
  row.apple_persistent_id !== null && row.apple_persistent_id !== pid && live.has(row.apple_persistent_id)

// Before reading: the file row with the track's persistent ID, else the one at its path. A path
// that belongs to another track Music still has is 'taken' (files.path is unique).
export function findSyncRow(
  db: DatabaseSync,
  track: EligibleTrack,
  livePids: ReadonlySet<string>
): RowMatch {
  const byPid = db
    .prepare('SELECT * FROM files WHERE apple_persistent_id = ?')
    .get(track.persistentId) as FileRow | undefined
  if (byPid) return { kind: 'row', row: byPid }
  const byPath = db
    .prepare('SELECT * FROM files WHERE path IN (?, ?) ORDER BY id LIMIT 1')
    .get(track.path.normalize('NFC'), track.path.normalize('NFD')) as FileRow | undefined
  if (!byPath) return { kind: 'none' }
  return ownedByLiveTrack(byPath, track.persistentId, livePids)
    ? { kind: 'taken' }
    : { kind: 'row', row: byPath }
}

// After reading a file that matched nothing: a song with the same audio. A Music track re-added
// with a new ID (its old song is gone, or synced under an ID Music no longer has) comes first, then
// a removed song (restored), then the oldest local song (adopted, even if its copy still exists).
// Rows owned by a track Music still has never match: two tracks with the same audio are two songs.
function findByFingerprint(
  db: DatabaseSync,
  hash: string,
  pid: string,
  live: ReadonlySet<string>
): FileRow | undefined {
  const rows = (
    db.prepare('SELECT * FROM files WHERE content_hash = ? ORDER BY id').all(hash) as unknown as FileRow[]
  ).filter((r) => !ownedByLiveTrack(r, pid, live))
  return (
    rows.find((r) => r.apple_sync !== null && r.removed_at === null) ??
    rows.find((r) => r.removed_at !== null) ??
    rows.find((r) => r.apple_sync === null)
  )
}

export interface SyncTrackInput {
  track: EligibleTrack
  facts: FileFacts | null // null when the file wasn't read (unchanged, or missing)
  rowId: number | null // what findSyncRow found before reading
  missing: boolean // the file isn't on disk
}

export interface SyncSaveContext {
  mapping: ImportMapping
  livePids: ReadonlySet<string>
}

// Saves one track (the caller runs it in a transaction). Every match keeps the song and all its
// data: the file row is pointed at Music's track and copy, marked synced, and un-removed.
export function saveSyncedTrack(
  db: DatabaseSync,
  input: SyncTrackInput,
  ctx: SyncSaveContext
): { outcome: SyncOutcome; fileId: number } {
  const { track, facts } = input
  const row =
    (input.rowId !== null
      ? (db.prepare('SELECT * FROM files WHERE id = ?').get(input.rowId) as FileRow | undefined)
      : undefined) ??
    (facts ? findByFingerprint(db, facts.contentHash, track.persistentId, ctx.livePids) : undefined)

  if (!row) {
    if (!facts) throw new Error(`A new track must be read first: ${track.path}`)
    const owner = pathOwner(db, facts.path, null)
    if (owner !== undefined) return { outcome: 'taken', fileId: owner }
    const known = { ...facts, tags: track.tags }
    const fileId = insertFile(
      db,
      known,
      { source: 'apple_xml', applePersistentId: track.persistentId, mapping: ctx.mapping },
      mapTags(track.tags, facts.path, ctx.mapping)
    )
    db.prepare("UPDATE files SET apple_sync = 'synced' WHERE id = ?").run(fileId)
    applyMusicTags(db, fileId, track.tags, ctx.mapping)
    return { outcome: 'added', fileId }
  }

  const moved = facts !== null && !samePath(row.path, facts.path)
  if (moved) {
    const owner = pathOwner(db, facts.path, row.id)
    if (owner !== undefined) return { outcome: 'taken', fileId: owner }
  }
  if (row.apple_persistent_id !== track.persistentId) {
    // The ID is unique; only a row findSyncRow didn't pick can hold it (none, in practice).
    db.prepare('UPDATE files SET apple_persistent_id = NULL WHERE apple_persistent_id = ?').run(
      track.persistentId
    )
  }
  const replaced =
    facts !== null &&
    (facts.fileSize !== row.file_size ||
      facts.mtimeMs !== row.mtime_ms ||
      facts.contentHash !== row.content_hash)
  const next: Record<string, string | number | null> = {
    apple_persistent_id: track.persistentId,
    apple_sync: 'synced',
    removed_at: null,
    is_missing: input.missing ? 1 : 0,
    missing_reason: input.missing ? 'not_found' : null
  }
  if (facts) {
    next.path = moved ? facts.path : row.path
    next.file_size = facts.fileSize
    next.mtime_ms = facts.mtimeMs
    next.duration_ms = facts.durationMs ?? row.duration_ms
    next.content_hash = facts.contentHash
  }
  const cols = Object.keys(next)
  db.prepare(`UPDATE files SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...cols.map((c) => next[c]),
    row.id
  )
  const tagsChanged = applyMusicTags(db, row.id, track.tags, ctx.mapping)

  const outcome: SyncOutcome =
    row.removed_at !== null
      ? 'restored'
      : row.apple_sync === null
        ? 'adopted'
        : input.missing
          ? 'missing'
          : moved
            ? 'relinked'
            : tagsChanged || replaced
              ? 'updated'
              : 'unchanged'
  return { outcome, fileId: row.id }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/apple-sync tests/main/import && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/apple-sync/save-synced.ts src/main/import/save-file.ts tests/main/apple-sync/save-synced.test.ts
git commit -m "feat(sync): match each Music track to its song, adopting and restoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Playlist mirrors and folders

Sync spec §5.6 (mirrors match Music exactly) and §5.8 step 4 (playlists edited locally since a
`Library.xml` import).

**Files:**
- Create: `src/main/apple-sync/sync-playlists.ts`
- Modify: `src/main/import/save-playlists.ts` (export `isEdited`)
- Test: `tests/main/apple-sync/sync-playlists.test.ts`

**Interfaces:**
- Consumes: `Snapshot` (Task 3), `MirrorDecision`, `SyncSummary` (Task 1), `isEdited`.
- Produces:
  ```ts
  export function syncedFileIds(db: DatabaseSync): Map<string, number>
  export function syncPlaylists(db: DatabaseSync, snapshot: Snapshot, fileIdByPid: Map<string, number>, decisions: Record<string, MirrorDecision>, now: string): SyncSummary['playlists']
  ```

- [ ] **Step 1: Write the failing tests**

`tests/main/apple-sync/sync-playlists.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { syncedFileIds, syncPlaylists } from '../../../src/main/apple-sync/sync-playlists'
import { addToPlaylist, renamePlaylist } from '../../../src/main/library/playlists'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid, snapshot } from './fixtures'

let db: DatabaseSync
let ids: Map<string, number>
const NOW = '2026-10-16T12:00:00.000Z'

beforeEach(() => {
  db = createTestDb()
  for (const n of [1, 2, 3]) {
    const s = addLibrarySong(db, { title: `T${n}` })
    db.prepare("UPDATE files SET apple_persistent_id = ?, apple_sync = 'synced' WHERE id = ?").run(pid(n), s.fileId)
  }
  ids = syncedFileIds(db)
})

const playlist = (n: number, name: string, items: number[], parent: number | null = null) => ({
  persistentId: pid(1000 + n),
  name,
  parentId: parent === null ? null : pid(2000 + parent),
  itemIds: items.map(pid)
})
const folder = (n: number, name: string, parent: number | null = null) => ({
  persistentId: pid(2000 + n),
  name,
  parentId: parent === null ? null : pid(2000 + parent)
})
const mirrors = () =>
  db
    .prepare(
      `SELECT p.name, p.apple_sync AS mirror, f.name AS folder,
         (SELECT group_concat(s.title, ',') FROM (SELECT s.title FROM playlist_items i
            JOIN songs s ON s.file_id = i.file_id WHERE i.playlist_id = p.id ORDER BY i.position) s) AS items
       FROM playlists p LEFT JOIN playlist_folders f ON f.id = p.folder_id ORDER BY p.name`
    )
    .all()
const folders = () =>
  db
    .prepare(
      `SELECT f.name, p.name AS parent, f.position FROM playlist_folders f
       LEFT JOIN playlist_folders p ON p.id = f.parent_id ORDER BY f.position`
    )
    .all()
const run = (s: ReturnType<typeof snapshot>, decisions = {}) => syncPlaylists(db, s, ids, decisions, NOW)

describe('syncPlaylists (sync spec §5.6)', () => {
  test('creates mirrors and folders, nested and in order', () => {
    const result = run(
      snapshot({
        folders: [folder(1, 'IFD2026'), folder(2, 'Week 3', 1)],
        playlists: [playlist(1, 'Monday', [2, 1], 2), playlist(2, 'Loose', [3])]
      })
    )
    expect(result).toEqual({ created: ['Monday', 'Loose'], updated: [], deleted: [] })
    expect(folders()).toEqual([
      { name: 'IFD2026', parent: null, position: 1 },
      { name: 'Week 3', parent: 'IFD2026', position: 2 }
    ])
    expect(mirrors()).toEqual([
      { name: 'Loose', mirror: 1, folder: null, items: 'T3' },
      { name: 'Monday', mirror: 1, folder: 'Week 3', items: 'T2,T1' }
    ])
  })

  test('renames, refills, moves and deletes with Music; an unchanged run reports nothing', () => {
    run(snapshot({ folders: [folder(1, 'A')], playlists: [playlist(1, 'P', [1, 2], 1), playlist(2, 'Q', [1])] }))
    expect(run(snapshot({ folders: [folder(1, 'A')], playlists: [playlist(1, 'P', [1, 2], 1), playlist(2, 'Q', [1])] }))).toEqual({ created: [], updated: [], deleted: [] })
    const result = run(snapshot({ folders: [folder(1, 'A renamed')], playlists: [playlist(1, 'P2', [2, 3], null)] }))
    expect(result).toEqual({ created: [], updated: ['P2'], deleted: ['Q'] })
    expect(mirrors()).toEqual([{ name: 'P2', mirror: 1, folder: null, items: 'T2,T3' }])
    expect(folders()).toEqual([{ name: 'A renamed', parent: null, position: 1 }])
    // Deleting a mirror keeps its songs.
    expect(db.prepare('SELECT COUNT(*) AS n FROM songs').get()).toEqual({ n: 3 })
  })

  test('a folder Music deleted is deleted; its playlists move out', () => {
    run(snapshot({ folders: [folder(1, 'Old')], playlists: [playlist(1, 'P', [1], 1)] }))
    run(snapshot({ playlists: [playlist(1, 'P', [1])] }))
    expect(folders()).toEqual([])
    expect(mirrors()).toEqual([{ name: 'P', mirror: 1, folder: null, items: 'T1' }])
  })

  test('items of tracks that are not synced are left out', () => {
    run(snapshot({ playlists: [playlist(1, 'P', [1, 99, 2])] }))
    expect(mirrors()).toEqual([{ name: 'P', mirror: 1, folder: null, items: 'T1,T2' }])
  })

  test('a local playlist is never touched', () => {
    db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
    run(snapshot())
    expect(mirrors()).toEqual([{ name: 'Mine', mirror: 0, folder: null, items: null }])
  })
})

describe('playlists from a Library.xml import (sync spec §5.8 step 4)', () => {
  // An Apple playlist imported from Library.xml, then (optionally) edited.
  function imported(edited: boolean): number {
    const id = Number(
      db
        .prepare(
          `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at)
           VALUES ('Week', 'apple_xml', ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`
        )
        .run(pid(1001)).lastInsertRowid
    )
    addToPlaylist(db, id, [ids.get(pid(1))!])
    if (!edited) db.prepare('UPDATE playlists SET modified_at = imported_at WHERE id = ?').run(id)
    return id
  }

  test('an unedited one becomes the mirror', () => {
    imported(false)
    run(snapshot({ playlists: [playlist(1, 'Week', [2])] }))
    expect(mirrors()).toEqual([{ name: 'Week', mirror: 1, folder: null, items: 'T2' }])
  })

  test('an edited one is kept as "(my edits)" by default, beside a new mirror', () => {
    const id = imported(true)
    renamePlaylist(db, id, 'Week')
    const result = run(snapshot({ playlists: [playlist(1, 'Week', [2])] }))
    expect(result.created).toEqual(['Week'])
    expect(mirrors()).toEqual([
      { name: 'Week', mirror: 1, folder: null, items: 'T2' },
      { name: 'Week (my edits)', mirror: 0, folder: null, items: 'T1' }
    ])
  })

  test('"Replace with Apple version" turns the edited one into the mirror', () => {
    imported(true)
    run(snapshot({ playlists: [playlist(1, 'Week', [2])] }), { [pid(1001)]: 'replace' })
    expect(mirrors()).toEqual([{ name: 'Week', mirror: 1, folder: null, items: 'T2' }])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/sync-playlists.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Export `isEdited`**

In `src/main/import/save-playlists.ts`, export `isEdited` and its `PlaylistRow` type
(`export interface PlaylistRow`, `export const isEdited`).

- [ ] **Step 4: Write `sync-playlists.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { MirrorDecision, SyncSummary } from '@shared/apple-sync'
import { isEdited } from '../import/save-playlists'
import type { Snapshot } from './snapshot'

type Result = SyncSummary['playlists']

interface MirrorRow {
  id: number
  name: string
  folder_id: number | null
  apple_sync: number
  imported_at: string | null
  modified_at: string
}

// Synced songs by their track's persistent ID: what a mirror's items point at.
export function syncedFileIds(db: DatabaseSync): Map<string, number> {
  const rows = db
    .prepare(
      "SELECT id, apple_persistent_id AS pid FROM files WHERE apple_sync = 'synced' AND removed_at IS NULL"
    )
    .all() as { id: number; pid: string }[]
  return new Map(rows.map((r) => [r.pid, r.id]))
}

function itemsOf(db: DatabaseSync, playlistId: number): number[] {
  return db
    .prepare('SELECT file_id AS id FROM playlist_items WHERE playlist_id = ? ORDER BY position')
    .all(playlistId)
    .map((r) => r.id as number)
}

function writeItems(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
  const insert = db.prepare(
    'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
  )
  fileIds.forEach((fileId, i) => insert.run(playlistId, i + 1, fileId))
}

const same = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

// Folders follow Music's names, nesting and order; folders Music no longer has are deleted (their
// subfolders with them; their playlists move out). Returns folder ids by persistent ID.
function syncFolders(db: DatabaseSync, snapshot: Snapshot): Map<string, number> {
  const ids = new Map<string, number>()
  snapshot.folders.forEach((f, i) => {
    const row = db
      .prepare('SELECT id FROM playlist_folders WHERE apple_persistent_id = ?')
      .get(f.persistentId) as { id: number } | undefined
    if (row) {
      db.prepare('UPDATE playlist_folders SET name = ?, position = ? WHERE id = ?').run(
        f.name,
        i + 1,
        row.id
      )
      ids.set(f.persistentId, row.id)
    } else {
      const id = db
        .prepare(
          'INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES (?, ?, ?)'
        )
        .run(f.name, f.persistentId, i + 1).lastInsertRowid
      ids.set(f.persistentId, Number(id))
    }
  })
  // Parents after every folder exists, so a folder moved out of a deleted one is saved first.
  for (const f of snapshot.folders) {
    db.prepare('UPDATE playlist_folders SET parent_id = ? WHERE id = ?').run(
      f.parentId ? (ids.get(f.parentId) ?? null) : null,
      ids.get(f.persistentId)!
    )
  }
  const live = new Set(ids.values())
  const stale = db
    .prepare('SELECT id FROM playlist_folders WHERE apple_persistent_id IS NOT NULL')
    .all()
    .map((r) => r.id as number)
    .filter((id) => !live.has(id))
  for (const id of stale) db.prepare('DELETE FROM playlist_folders WHERE id = ?').run(id)
  return ids
}

function createMirror(
  db: DatabaseSync,
  name: string,
  persistentId: string,
  folderId: number | null,
  now: string
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO playlists (name, source, apple_persistent_id, apple_sync, folder_id,
           imported_at, modified_at, created_at)
         VALUES (?, 'apple_xml', ?, 1, ?, ?, ?, ?)`
      )
      .run(name, persistentId, folderId, now, now, now).lastInsertRowid
  )
}

// Mirrors match Music exactly (sync spec §5.6); a playlist imported from Library.xml becomes the
// mirror, unless it was edited here: then the decision (default "Keep my edits as a copy") applies.
export function syncPlaylists(
  db: DatabaseSync,
  snapshot: Snapshot,
  fileIdByPid: Map<string, number>,
  decisions: Record<string, MirrorDecision>,
  now: string
): Result {
  const result: Result = { created: [], updated: [], deleted: [] }
  const folderIds = syncFolders(db, snapshot)

  for (const p of snapshot.playlists) {
    const fileIds = p.itemIds
      .map((id) => fileIdByPid.get(id))
      .filter((id): id is number => id !== undefined)
    const folderId = p.parentId ? (folderIds.get(p.parentId) ?? null) : null
    const row = db
      .prepare(
        `SELECT id, name, folder_id, apple_sync, imported_at, modified_at FROM playlists
         WHERE apple_persistent_id = ?`
      )
      .get(p.persistentId) as MirrorRow | undefined

    const keepCopy =
      row !== undefined &&
      row.apple_sync === 0 &&
      isEdited(row) &&
      (decisions[p.persistentId] ?? 'copy') === 'copy'
    if (!row || keepCopy) {
      if (row) {
        db.prepare(
          "UPDATE playlists SET name = ?, apple_persistent_id = NULL, source = 'local' WHERE id = ?"
        ).run(`${row.name} (my edits)`, row.id)
      }
      writeItems(db, createMirror(db, p.name, p.persistentId, folderId, now), fileIds)
      result.created.push(p.name)
      continue
    }

    const itemsChanged = !same(itemsOf(db, row.id), fileIds)
    const changed = row.name !== p.name || row.folder_id !== folderId || itemsChanged
    if (row.apple_sync === 0 || changed) {
      db.prepare(
        `UPDATE playlists SET name = ?, folder_id = ?, apple_sync = 1, imported_at = ?,
           modified_at = ? WHERE id = ?`
      ).run(p.name, folderId, now, now, row.id)
      if (itemsChanged) writeItems(db, row.id, fileIds)
      if (changed) result.updated.push(p.name)
    }
  }

  const live = new Set(snapshot.playlists.map((p) => p.persistentId))
  const stale = db
    .prepare('SELECT id, name, apple_persistent_id AS pid FROM playlists WHERE apple_sync = 1')
    .all() as { id: number; name: string; pid: string }[]
  for (const m of stale.filter((m) => !live.has(m.pid))) {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(m.id)
    result.deleted.push(m.name)
  }
  return result
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/apple-sync tests/main/import && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/apple-sync/sync-playlists.ts src/main/import/save-playlists.ts tests/main/apple-sync/sync-playlists.test.ts
git commit -m "feat(sync): Music's playlists and folders become mirrors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The review list, turning off, and read-only mirrors in main

Sync spec §5.5 (disappearances and the review list), §5.9 (turning off), §6.3 (main rejects writes
to a mirror).

**Files:**
- Create: `src/main/apple-sync/review.ts`
- Modify: `src/main/library/playlists.ts`, `src/shared/library.ts`
- Test: `tests/main/apple-sync/review.test.ts`, `tests/main/library/playlists.test.ts`

**Interfaces:**
- Consumes: `ReviewAction`, `PlaylistFolder` (Task 1).
- Produces:
  ```ts
  // review.ts
  export function markGone(db: DatabaseSync, livePids: ReadonlySet<string>, exists?: (path: string) => boolean): ImportSummaryItem[]
  export function reviewCount(db: DatabaseSync): number
  export function resolveReview(db: DatabaseSync, fileIds: number[], action: ReviewAction, now: string): void
  export function resolveAllReview(db: DatabaseSync, action: ReviewAction, now: string): void
  export function disableSync(db: DatabaseSync): void
  // playlists.ts
  export function listPlaylistFolders(db: DatabaseSync): PlaylistFolder[]
  ```
  `PlaylistSummary` gains `mirror: boolean` and `folderId: number | null`; `listPlaylists` lists
  mirrors first (by name), then local playlists. `renamePlaylist`, `deletePlaylist`,
  `addToPlaylist`, `removeFromPlaylist` and `reorderPlaylist` throw
  `LibraryEditError('Edit this playlist in Music.')` for a mirror.

- [ ] **Step 1: Write the failing review tests**

`tests/main/apple-sync/review.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  disableSync,
  markGone,
  resolveAllReview,
  resolveReview,
  reviewCount
} from '../../../src/main/apple-sync/review'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid } from './fixtures'

const NOW = '2026-10-16T12:00:00.000Z'
let db: DatabaseSync
let a: number
let b: number
let local: number

const synced = (n: number, title: string): number => {
  const s = addLibrarySong(db, { title, path: `/m/${title}.mp3` })
  db.prepare("UPDATE files SET apple_persistent_id = ?, apple_sync = 'synced' WHERE id = ?").run(
    pid(n),
    s.fileId
  )
  return s.fileId
}
const state = (id: number) =>
  db
    .prepare(
      'SELECT apple_sync AS sync, removed_at AS removed, is_missing AS missing FROM files WHERE id = ?'
    )
    .get(id)

beforeEach(() => {
  db = createTestDb()
  a = synced(1, 'A')
  b = synced(2, 'B')
  local = addLibrarySong(db, { title: 'Local' }).fileId
})

describe('markGone (sync spec §5.5)', () => {
  test('synced songs Music no longer has go to the review list, noting whether the file exists', () => {
    const gone = markGone(db, new Set([pid(1)]), (path) => path !== '/m/B.mp3')
    expect(gone).toEqual([{ path: '/m/B.mp3' }])
    expect(state(a)).toMatchObject({ sync: 'synced' })
    expect(state(b)).toMatchObject({ sync: 'gone', missing: 1 })
    expect(state(local)).toMatchObject({ sync: null })
    expect(reviewCount(db)).toBe(1)
  })

  test('a song already in the review list is not reported again', () => {
    markGone(db, new Set([pid(1)]), () => true)
    expect(markGone(db, new Set([pid(1)]), () => true)).toEqual([])
  })
})

describe('the review list', () => {
  beforeEach(() => void markGone(db, new Set(), () => true))

  test('Remove soft-deletes and takes the song out of the list', () => {
    resolveReview(db, [a], 'remove', NOW)
    expect(state(a)).toMatchObject({ sync: 'gone', removed: NOW })
    expect(reviewCount(db)).toBe(1)
  })

  test('Keep makes it an ordinary local song', () => {
    resolveReview(db, [a], 'keep', NOW)
    expect(state(a)).toMatchObject({ sync: null, removed: null })
  })

  test('Keep all and Remove all apply to the whole list, and only to it', () => {
    resolveAllReview(db, 'remove', NOW)
    expect([state(a), state(b)]).toMatchObject([{ removed: NOW }, { removed: NOW }])
    expect(state(local)).toMatchObject({ removed: null })
    expect(reviewCount(db)).toBe(0)
  })

  test('resolving ignores songs that are not in the list', () => {
    resolveReview(db, [local], 'remove', NOW)
    expect(state(local)).toMatchObject({ removed: null })
  })
})

describe('disableSync (sync spec §5.9)', () => {
  test('songs become local, gone songs are kept, removed songs stay removed, mirrors become editable', () => {
    markGone(db, new Set([pid(1)]), () => true)
    const removed = synced(3, 'C')
    db.prepare("UPDATE files SET apple_sync = 'gone', removed_at = ? WHERE id = ?").run(NOW, removed)
    db.prepare(
      "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES ('M', 'apple_xml', ?, 1)"
    ).run(pid(100))
    disableSync(db)
    expect([state(a), state(b)]).toMatchObject([{ sync: null }, { sync: null }])
    expect(state(removed)).toMatchObject({ sync: 'gone', removed: NOW })
    expect(db.prepare('SELECT apple_sync, apple_persistent_id AS pid FROM playlists').get()).toEqual(
      { apple_sync: 0, pid: pid(100) }
    )
    expect(reviewCount(db)).toBe(0)
  })
})
```

- [ ] **Step 2: Write the failing playlist tests**

In `tests/main/library/playlists.test.ts`:

```ts
describe('mirrors of Music playlists (sync spec §6.3)', () => {
  function mirror(name: string): number {
    return Number(
      db
        .prepare(
          "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES (?, 'apple_xml', ?, 1)"
        )
        .run(name, `00000000000000${name.length}A`).lastInsertRowid
    )
  }

  test('are read-only', () => {
    const song = addLibrarySong(db, { title: 'Kolo' })
    const m = mirror('Week')
    for (const write of [
      () => renamePlaylist(db, m, 'X'),
      () => deletePlaylist(db, m),
      () => addToPlaylist(db, m, [song.fileId]),
      () => removeFromPlaylist(db, m, [1]),
      () => reorderPlaylist(db, m, [])
    ]) {
      expect(write).toThrow('Edit this playlist in Music.')
    }
  })

  test('can be duplicated as an editable playlist', () => {
    const copy = duplicatePlaylist(db, mirror('Week'))
    expect(listPlaylists(db).find((p) => p.id === copy)).toMatchObject({
      name: 'Week copy',
      mirror: false
    })
  })

  test('are listed first, with their folder; folders are listed in order', () => {
    createPlaylist(db, 'Alpha')
    const m = mirror('Zeta')
    const folder = Number(
      db
        .prepare(
          "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'FFFFFFFFFFFFFFF1', 1)"
        )
        .run().lastInsertRowid
    )
    db.prepare('UPDATE playlists SET folder_id = ? WHERE id = ?').run(folder, m)
    expect(listPlaylists(db).map((p) => [p.name, p.mirror, p.folderId])).toEqual([
      ['Zeta', true, folder],
      ['Alpha', false, null]
    ])
    expect(listPlaylistFolders(db)).toEqual([
      { id: folder, name: 'IFD', parentId: null, persistentId: 'FFFFFFFFFFFFFFF1' }
    ])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/review.test.ts tests/main/library/playlists.test.ts`
Expected: FAIL — `review.ts` not found; mirrors are writable.

- [ ] **Step 4: Write `review.ts`**

```ts
import { existsSync } from 'fs'
import type { DatabaseSync } from 'node:sqlite'
import type { ReviewAction } from '@shared/apple-sync'
import type { ImportSummaryItem } from '@shared/import'
import { inTransaction } from '../db/transaction'

// "Removed from Apple Music" (sync spec §5.5, §6.2): songs Music no longer has that the organizer
// hasn't decided about. A removed song keeps 'gone' but has left the list.
const IN_REVIEW = "apple_sync = 'gone' AND removed_at IS NULL"

// After every file is saved: synced songs whose track is no longer in the snapshot go to the review
// list, and every song there notes whether its file is still on disk. Returns the newly gone songs.
export function markGone(
  db: DatabaseSync,
  livePids: ReadonlySet<string>,
  exists: (path: string) => boolean = existsSync
): ImportSummaryItem[] {
  const rows = db
    .prepare(
      `SELECT id, path, apple_persistent_id AS pid, apple_sync AS sync FROM files
       WHERE apple_sync IN ('synced', 'gone') AND removed_at IS NULL`
    )
    .all() as { id: number; path: string; pid: string | null; sync: 'synced' | 'gone' }[]
  const update = db.prepare(
    "UPDATE files SET apple_sync = 'gone', is_missing = ?, missing_reason = ? WHERE id = ?"
  )
  const gone: ImportSummaryItem[] = []
  for (const row of rows) {
    if (row.pid !== null && livePids.has(row.pid)) continue
    const missing = !exists(row.path)
    update.run(missing ? 1 : 0, missing ? 'not_found' : null, row.id)
    if (row.sync === 'synced') gone.push({ path: row.path })
  }
  return gone
}

export function reviewCount(db: DatabaseSync): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM files WHERE ${IN_REVIEW}`).get() as { n: number }).n
}

// Remove: the soft delete (§6.4). Keep: an ordinary local song from now on.
const ACTION_SQL: Record<ReviewAction, string> = {
  remove: 'removed_at = ?',
  keep: 'apple_sync = NULL'
}

export function resolveReview(
  db: DatabaseSync,
  fileIds: number[],
  action: ReviewAction,
  now: string
): void {
  inTransaction(db, () => {
    const update = db.prepare(`UPDATE files SET ${ACTION_SQL[action]} WHERE id = ? AND ${IN_REVIEW}`)
    for (const id of fileIds) {
      if (action === 'remove') update.run(now, id)
      else update.run(id)
    }
  })
}

export function resolveAllReview(db: DatabaseSync, action: ReviewAction, now: string): void {
  const update = db.prepare(`UPDATE files SET ${ACTION_SQL[action]} WHERE ${IN_REVIEW}`)
  if (action === 'remove') update.run(now)
  else update.run()
}

// Turning sync off (§5.9): songs become local (gone songs leave the list as kept), removed songs
// stay removed, and mirrors become editable local playlists. Persistent IDs stay, so turning sync on
// again re-adopts them.
export function disableSync(db: DatabaseSync): void {
  inTransaction(db, () => {
    db.prepare(
      'UPDATE files SET apple_sync = NULL WHERE apple_sync IS NOT NULL AND removed_at IS NULL'
    ).run()
    db.prepare('UPDATE playlists SET apple_sync = 0 WHERE apple_sync = 1').run()
  })
}
```

- [ ] **Step 5: Make mirrors read-only and list folders**

`src/shared/library.ts`, in `PlaylistSummary`:

```ts
  mirror: boolean // a read-only mirror of a Music playlist (sync spec §6.3)
  folderId: number | null // its Music folder
```

`src/main/library/playlists.ts`:

```ts
// Main rejects writes to a mirror (sync spec §6.3), so the rule doesn't depend on the UI.
function requireEditable(db: DatabaseSync, playlistId: number): void {
  const row = db.prepare('SELECT apple_sync FROM playlists WHERE id = ?').get(playlistId) as
    { apple_sync: number } | undefined
  if (row?.apple_sync === 1) throw new LibraryEditError('Edit this playlist in Music.')
}
```

Call `requireEditable(db, playlistId)` first thing in `renamePlaylist`, `deletePlaylist`,
`addToPlaylist`, `removeFromPlaylist` and `reorderPlaylist` (inside the transaction where there is
one).

`listPlaylists`:

```ts
// Mirrors first, in name order (their folders come from listPlaylistFolders), then local playlists.
export function listPlaylists(db: DatabaseSync): PlaylistSummary[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.source, p.apple_sync AS mirror, p.folder_id AS folderId,
         (SELECT COUNT(*) FROM playlist_items i JOIN files f ON f.id = i.file_id
          WHERE i.playlist_id = p.id AND f.removed_at IS NULL) AS itemCount
       FROM playlists p ORDER BY p.apple_sync DESC, p.name COLLATE NOCASE, p.id`
    )
    .all() as unknown as (Omit<PlaylistSummary, 'mirror'> & { mirror: number })[]
  return rows.map((r) => ({ ...r, mirror: r.mirror === 1 }))
}

export function listPlaylistFolders(db: DatabaseSync): PlaylistFolder[] {
  return db
    .prepare(
      `SELECT id, name, parent_id AS parentId, apple_persistent_id AS persistentId
       FROM playlist_folders ORDER BY position, id`
    )
    .all() as unknown as PlaylistFolder[]
}
```

Import `PlaylistFolder` from `@shared/apple-sync`. Renderer fixtures that build a `PlaylistSummary`
(`tests/renderer/library/sidebar.test.tsx` and others the typecheck lists) gain
`mirror: false, folderId: null`.

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run tests/main && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(sync): the review list, turning sync off, and read-only mirrors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The sync engine

**Files:**
- Create: `src/main/apple-sync/engine.ts`
- Modify: `src/main/import/worker-protocol.ts`, `src/main/import/worker-core.ts`,
  `src/main/import/import-service.ts`
- Test: `tests/main/apple-sync/engine.test.ts`, `tests/main/import/import-service.test.ts`

**Interfaces:**
- Consumes: `sortTracks` (Task 3), `findSyncRow`, `saveSyncedTrack`, `samePath` (Task 7),
  `syncPlaylists`, `syncedFileIds` (Task 8), `markGone` (Task 9), `emptySyncSummary` (Task 1).
- Produces:
  ```ts
  // worker-protocol.ts
  export interface KnownTrack { key: number; path: string; persistentId: string; tags: RawTags; durationMs: number | null; kind: string | null }
  // WorkerJob gains: | { kind: 'read-known'; tracks: KnownTrack[] }
  // import-service.ts
  ImportService.busy: boolean (getter)
  ImportService.readTracks(tracks: KnownTrack[], onResult: (key: number, result: ReadResult) => void): Promise<void>
  export function savedMapping(settings: SettingsStore): ImportMapping
  // engine.ts
  export interface FileStat { size: number; mtimeMs: number }
  export function statFile(path: string): Promise<FileStat | null>
  export interface SyncEngineDeps { db: DatabaseSync; mapping: ImportMapping; readTracks: ImportService['readTracks']; stat: (path: string) => Promise<FileStat | null>; exists: (path: string) => boolean; now: () => string; onProgress?: (progress: ImportProgress) => void }
  export function runSync(deps: SyncEngineDeps, snapshot: Snapshot, decisions?: Record<string, MirrorDecision>): Promise<SyncSummary>
  ```

- [ ] **Step 1: Write the failing worker test**

In `tests/main/import/import-service.test.ts`:

```ts
describe('ImportService.readTracks (Apple Music sync)', () => {
  test('reads each file with the tags given, reporting results by key', async () => {
    const path = dir.file('Kolo.mp3', mp3Bytes({ title: 'File title' }, 1, 1))
    const results: [number, unknown][] = []
    await service.readTracks(
      [
        {
          key: 7,
          path,
          persistentId: '0000000000000001',
          tags: { title: 'Music title', artist: null, albumArtist: null, genre: null },
          durationMs: 1000,
          kind: 'MPEG audio file'
        },
        {
          key: 8,
          path: join(dir.path, 'gone.mp3'),
          persistentId: '0000000000000002',
          tags: { title: null, artist: null, albumArtist: null, genre: null },
          durationMs: null,
          kind: null
        }
      ],
      (key, result) => results.push([key, result])
    )
    expect(results).toMatchObject([
      [7, { ok: true, facts: { path, tags: { title: 'Music title' } } }],
      [8, { ok: false, reason: 'not_found' }]
    ])
    expect(service.busy).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/main/import/import-service.test.ts`
Expected: FAIL — `readTracks` is not a function.

- [ ] **Step 3: Add the worker job**

`src/main/import/worker-protocol.ts`:

```ts
import type { RawTags } from './mapping'

// A file Sync with Apple Music needs read (new, moved or changed), with Music's tags (sync spec §5.3).
export interface KnownTrack {
  key: number // the caller's reference, echoed as the result's apple.trackId
  path: string
  persistentId: string
  tags: RawTags
  durationMs: number | null
  kind: string | null
}
```

Add `| { kind: 'read-known'; tracks: KnownTrack[] }` to `WorkerJob`.

`src/main/import/worker-core.ts`, a branch before the final `else`:

```ts
    } else if (job.kind === 'read-known') {
      post({ type: 'planned', total: job.tracks.length, unsupported: [], playlists: [] })
      for (const track of job.tracks) {
        if (isCancelled()) break
        const result = await readAudioFile(track.path, {
          tags: track.tags,
          durationMs: track.durationMs,
          kind: track.kind
        })
        post({ type: 'file', result, apple: { trackId: track.key, persistentId: track.persistentId } })
      }
```

`src/main/import/import-service.ts`:

```ts
// The mapping saved in Settings (main spec §5.2): imports and every sync use it.
export function savedMapping(settings: SettingsStore): ImportMapping {
  return {
    artistTagTarget: settings.get('import.artistTagTarget'),
    albumArtistTagTarget: settings.get('import.albumArtistTagTarget'),
    genreIsCountry: settings.get('import.genreIsCountry')
  }
}
```

Use it in `run()` in place of the inline mapping, and add to the class:

```ts
  get busy(): boolean {
    return this.current !== null
  }

  // Reads files for Sync with Apple Music (sync spec §5.3) on the import worker, one job at a time
  // with imports (ImportBusyError while one runs). Each result is passed on as it arrives, so the
  // caller saves files one by one.
  async readTracks(
    tracks: KnownTrack[],
    onResult: (key: number, result: ReadResult) => void
  ): Promise<void> {
    if (tracks.length === 0) return
    await this.runWorker({ kind: 'read-known', tracks }, (message) => {
      if (message.type === 'file' && message.apple) onResult(message.apple.trackId, message.result)
    })
  }
```

(Import `KnownTrack` and `ReadResult`.) Run the import-service tests: PASS.

- [ ] **Step 4: Write the failing engine tests**

`tests/main/apple-sync/engine.test.ts`:

```ts
import { existsSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ImportProgress } from '@shared/import'
import { runSync, statFile, type SyncEngineDeps } from '../../../src/main/apple-sync/engine'
import { reviewCount } from '../../../src/main/apple-sync/review'
import type { Snapshot } from '../../../src/main/apple-sync/snapshot'
import { ImportService, savedMapping } from '../../../src/main/import/import-service'
import { startInProcessWorker } from '../../../src/main/import/in-process-worker'
import { listLibrary } from '../../../src/main/library/list'
import { addTracks, createProgram, getProgram } from '../../../src/main/programs/programs'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid, snapTrack, snapshot } from './fixtures'

const NOW = '2026-10-16T12:00:00.000Z'
let db: DatabaseSync
let dir: TempDir
let service: ImportService
let reads: string[]
let progress: ImportProgress[]
let kolo: string
let hora: string

function deps(): SyncEngineDeps {
  return {
    db,
    mapping: savedMapping(new SettingsStore(db)),
    readTracks: (tracks, onResult) => {
      reads.push(...tracks.map((t) => t.path))
      return service.readTracks(tracks, onResult)
    },
    stat: statFile,
    exists: existsSync,
    now: () => NOW,
    onProgress: (p) => progress.push(p)
  }
}
const sync = (s: Snapshot, decisions = {}) => runSync(deps(), s, decisions)
const titles = () =>
  listLibrary(db, { search: '', filter: { kind: 'all' }, sort: { column: 'title', direction: 'asc' } }).map(
    (r) => r.title
  )
const library = (tracks = [snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' }), snapTrack(2, hora, { title: 'Hora' })]) =>
  snapshot({
    tracks,
    playlists: [{ persistentId: pid(100), name: 'Week 3', parentId: null, itemIds: [pid(2), pid(1)] }]
  })
const fileId = (title: string) =>
  (db.prepare('SELECT file_id AS id FROM songs WHERE title = ?').get(title) as { id: number }).id

beforeEach(() => {
  db = createTestDb()
  dir = tempDir()
  reads = []
  progress = []
  service = new ImportService({
    db,
    settings: new SettingsStore(db),
    startWorker: startInProcessWorker,
    onProgress: () => undefined
  })
  kolo = dir.file('Music/Kolo.mp3', mp3Bytes({ title: 'Kolo' }, 1, 1))
  hora = dir.file('Music/Hora.mp3', mp3Bytes({ title: 'Hora' }, 1, 2))
})
afterEach(() => dir.cleanup())

describe('runSync', () => {
  test('the first sync brings in tracks and playlists, skipping what is not synced', async () => {
    const s = library([
      snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' }),
      snapTrack(2, hora, { title: 'Hora' }),
      snapTrack(3, '/cloud.mp3', { locationType: 'remote', location: null }),
      snapTrack(4, join(dir.path, 'Old.aiff'), { kind: 'AIFF audio file' })
    ])
    const summary = await sync(s)
    expect(summary.added.map((i) => i.path).sort()).toEqual([hora, kolo].sort())
    expect(summary.skipped).toEqual([{ reason: 'In the cloud or streamed', count: 1 }])
    expect(summary.unsupported).toHaveLength(1)
    expect(summary.playlists.created).toEqual(['Week 3'])
    expect(summary.finishedAt).toBe(NOW)
    expect(titles()).toEqual(['Hora', 'Kolo'])
    expect(progress.at(0)?.phase).toBe('scanning')
    expect(progress.at(-1)).toMatchObject({ phase: 'done', done: 2, total: 2 })
  })

  test('a second sync with no changes changes nothing and reads no file', async () => {
    await sync(library())
    reads = []
    const summary = await sync(library())
    expect(reads).toEqual([])
    expect(summary.added).toEqual([])
    expect(summary.updated).toEqual([])
    expect(summary.playlists).toEqual({ created: [], updated: [], deleted: [] })
  })

  test('a tag edited in Music updates the song without reading the file', async () => {
    await sync(library())
    reads = []
    const summary = await sync(library([snapTrack(1, kolo, { title: 'Kolo', genre: 'Macedonia' }), snapTrack(2, hora, { title: 'Hora' })]))
    expect(reads).toEqual([])
    expect(summary.updated.map((i) => i.path)).toEqual([kolo])
  })

  test('a file Music moved is relinked', async () => {
    await sync(library())
    const moved = join(dir.path, 'Music/Serbia/Kolo.mp3')
    dir.file('Music/Serbia/.keep', '')
    renameSync(kolo, moved)
    const summary = await sync(library([snapTrack(1, moved, { title: 'Kolo', genre: 'Serbia' }), snapTrack(2, hora, { title: 'Hora' })]))
    expect(summary.relinked.map((i) => i.path)).toEqual([moved])
    expect(titles()).toEqual(['Hora', 'Kolo'])
  })

  // Review Focus 5.
  test('a track Music deleted goes to review, but stays in the program and playable; back, it is synced', async () => {
    await sync(library())
    const program = createProgram(db, 'Tonight')
    addTracks(db, program, [fileId('Hora')])
    const summary = await sync(library([snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' })]))
    expect(summary.gone.map((i) => i.path)).toEqual([hora])
    expect(reviewCount(db)).toBe(1)
    expect(titles()).toEqual(['Hora', 'Kolo'])
    expect(getProgram(db, program)!.items[0]).toMatchObject({ title: 'Hora', isRemoved: false, isMissing: false })
    expect(summary.playlists.updated).toEqual(['Week 3'])

    const back = await sync(library())
    expect(back.gone).toEqual([])
    expect(reviewCount(db)).toBe(0)
  })

  // Review Focus 4.
  test('a track whose file is gone from disk is missing, not gone', async () => {
    await sync(library())
    rmSync(hora)
    const summary = await sync(library())
    expect(summary.missing.map((i) => i.path)).toEqual([hora])
    expect(summary.gone).toEqual([])
    expect(reviewCount(db)).toBe(0)
    expect(db.prepare('SELECT is_missing AS m, apple_sync AS s FROM files WHERE path = ?').get(hora)).toEqual({ m: 1, s: 'synced' })
  })

  test('a new track whose file is missing is counted, not added', async () => {
    const summary = await sync(library([snapTrack(1, join(dir.path, 'nowhere.mp3'))]))
    expect(summary.missing).toHaveLength(1)
    expect(titles()).toEqual([])
  })

  test('songs already in the library (Add Music…) are adopted without reading them', async () => {
    await service.run({ kind: 'paths', paths: [join(dir.path, 'Music')] })
    reads = []
    const summary = await sync(library())
    expect(reads).toEqual([])
    expect(summary.adopted.map((i) => i.path).sort()).toEqual([hora, kolo].sort())
    expect(summary.added).toEqual([])
  })

  test('a second Music track pointing at the same file is unreadable', async () => {
    const summary = await sync(library([snapTrack(1, kolo, { title: 'Kolo' }), snapTrack(2, kolo, { title: 'Kolo again' })]))
    expect(summary.added).toHaveLength(1)
    expect(summary.unreadable).toEqual([{ path: kolo, detail: 'Another Apple Music track uses this file' }])
  })

  test('playlist decisions are passed on', async () => {
    db.prepare(
      `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at)
       VALUES ('Week 3', 'apple_xml', ?, '2026-10-01', '2026-10-02')`
    ).run(pid(100))
    await sync(library(), { [pid(100)]: 'replace' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlists').get()).toEqual({ n: 1 })
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Write `engine.ts`**

```ts
import { stat } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { emptySyncSummary, type MirrorDecision, type SyncSummary } from '@shared/apple-sync'
import type { ImportMapping, ImportProgress } from '@shared/import'
import { inTransaction } from '../db/transaction'
import type { ImportService } from '../import/import-service'
import type { KnownTrack } from '../import/worker-protocol'
import { sortTracks, type EligibleTrack } from './eligible'
import { markGone } from './review'
import {
  findSyncRow,
  samePath,
  saveSyncedTrack,
  TAKEN_DETAIL,
  type SyncTrackInput
} from './save-synced'
import type { Snapshot } from './snapshot'
import { syncedFileIds, syncPlaylists } from './sync-playlists'

export interface FileStat {
  size: number
  mtimeMs: number
}

export async function statFile(path: string): Promise<FileStat | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? { size: info.size, mtimeMs: Math.round(info.mtimeMs) } : null
  } catch {
    return null
  }
}

export interface SyncEngineDeps {
  db: DatabaseSync
  mapping: ImportMapping
  readTracks: ImportService['readTracks']
  stat: (path: string) => Promise<FileStat | null>
  exists: (path: string) => boolean
  now: () => string
  onProgress?: (progress: ImportProgress) => void
}

// One sync (sync spec §5): every eligible track is matched to its song. Unchanged files (same path,
// size and mtime) are compared from the snapshot alone; new, moved and changed files are read on the
// import worker. Each file is saved in its own transaction; then the gone step and the playlist step
// each run in one, so a crash mid-sync leaves nothing half-done that the next sync can't finish.
export async function runSync(
  deps: SyncEngineDeps,
  snapshot: Snapshot,
  decisions: Record<string, MirrorDecision> = {}
): Promise<SyncSummary> {
  const { db } = deps
  const summary = emptySyncSummary('')
  const { eligible, skipped, unsupported } = sortTracks(snapshot.tracks)
  summary.skipped = skipped
  summary.unsupported = unsupported
  const livePids = new Set(eligible.map((t) => t.persistentId))
  const ctx = { mapping: deps.mapping, livePids }
  const total = eligible.length
  let done = 0
  const report = (currentPath: string | null): void =>
    deps.onProgress?.({ phase: 'reading', done, total, currentPath })

  const save = (input: SyncTrackInput): void => {
    const { outcome } = inTransaction(db, () => saveSyncedTrack(db, input, ctx))
    const path = input.track.path
    if (outcome === 'taken') summary.unreadable.push({ path, detail: TAKEN_DETAIL })
    else if (outcome !== 'unchanged') summary[outcome].push({ path })
  }

  deps.onProgress?.({ phase: 'scanning', done: 0, total: 0, currentPath: null })
  const toRead: KnownTrack[] = []
  const rowFor = new Map<number, number | null>()
  for (const [key, track] of eligible.entries()) {
    const match = findSyncRow(db, track, livePids)
    if (match.kind === 'taken') {
      summary.unreadable.push({ path: track.path, detail: TAKEN_DETAIL })
      done += 1
      continue
    }
    const row = match.kind === 'row' ? match.row : null
    if (row && samePath(row.path, track.path)) {
      const info = await deps.stat(row.path)
      const unchanged = info && info.size === row.file_size && info.mtimeMs === row.mtime_ms
      if (!info || unchanged) {
        save({ track, facts: null, rowId: row.id, missing: !info })
        done += 1
        continue
      }
    }
    rowFor.set(key, row?.id ?? null)
    toRead.push(known(key, track))
  }
  report(null)

  await deps.readTracks(toRead, (key, result) => {
    const track = eligible[key]
    const rowId = rowFor.get(key) ?? null
    if (result.ok) save({ track, facts: result.facts, rowId, missing: false })
    else if (result.reason === 'not_found' && rowId !== null)
      save({ track, facts: null, rowId, missing: true })
    else if (result.reason === 'not_found') summary.missing.push({ path: track.path })
    else summary[result.reason].push({ path: result.path, detail: result.detail })
    done += 1
    report(track.path)
  })

  summary.gone = inTransaction(db, () => markGone(db, livePids, deps.exists))
  summary.playlists = inTransaction(db, () =>
    syncPlaylists(db, snapshot, syncedFileIds(db), decisions, deps.now())
  )
  summary.finishedAt = deps.now()
  deps.onProgress?.({ phase: 'done', done, total, currentPath: null })
  return summary
}

const known = (key: number, t: EligibleTrack): KnownTrack => ({
  key,
  path: t.path,
  persistentId: t.persistentId,
  tags: t.tags,
  durationMs: t.durationMs,
  kind: t.kind
})
```

`ReadFailure` is `'not_found' | 'unsupported' | 'unreadable'`, so `summary[result.reason]` after the
`not_found` branches is `unsupported` or `unreadable`; if TypeScript can't narrow it, write the two
cases out.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/main/apple-sync tests/main/import && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/apple-sync/engine.ts src/main/import tests
git commit -m "feat(sync): the sync engine, reading only new, moved or changed files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Add Music… while sync is on, and restoring removed songs

Sync spec §5.7 and §7.3: a file matching a synced song is "Already in library (Apple Music)"; a
removed song added again is restored as a local song; `Library.xml` imports wait until sync is off.

**Files:**
- Modify: `src/main/import/save-file.ts`, `src/main/import/import-service.ts`,
  `src/shared/import.ts`, `src/renderer/src/import/ImportSummaryStep.tsx`
- Test: `tests/main/import/save-file.test.ts`, `tests/main/import/import-service.test.ts`,
  `tests/renderer/music-import.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: `SaveOutcome` gains `'restored' | 'appleSynced'`; `ImportSummary` gains `restored` and
  `appleSynced` lists; `ImportServiceDeps` gains `syncEnabled?: () => boolean` and
  `isSyncing?: () => boolean`; `ImportBusyError` takes an optional message.

- [ ] **Step 1: Write the failing tests**

In `tests/main/import/save-file.test.ts` (with the file's own `facts(...)` builder and context):

```ts
describe('while Apple Music sync is on (sync spec §5.7)', () => {
  test('the exact file a synced song uses is already present, and nothing changes', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    db.prepare("UPDATE files SET apple_sync = 'synced' WHERE id = ?").run(first.fileId)
    db.prepare("UPDATE songs SET title = 'From Music' WHERE file_id = ?").run(first.fileId)
    expect(saveImportedFile(db, facts('/m/Kolo.mp3', 'h1', { title: 'File tag' }), ctx)).toEqual({
      outcome: 'appleSynced',
      fileId: first.fileId
    })
    expect(songView(db, first.fileId).title).toBe('From Music')
  })

  test('a copy of a synced song is skipped', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    db.prepare("UPDATE files SET apple_sync = 'synced' WHERE id = ?").run(first.fileId)
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe('appleSynced')
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 1 })
  })

  test('copies of local songs behave as before', () => {
    saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe('added')
  })
})

describe('removed songs (sync spec §7.3)', () => {
  test('adding the same file again restores the song as a local song', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    removeSong(db, first.fileId)
    expect(saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)).toEqual({
      outcome: 'restored',
      fileId: first.fileId
    })
    expect(db.prepare('SELECT removed_at, apple_sync FROM files').get()).toEqual({
      removed_at: null,
      apple_sync: null
    })
  })

  test('adding a copy restores it too, pointing at the copy', () => {
    const first = saveImportedFile(db, facts('/m/Kolo.mp3', 'h1'), ctx)
    removeSong(db, first.fileId)
    expect(saveImportedFile(db, facts('/Downloads/Kolo.mp3', 'h1'), ctx).outcome).toBe('restored')
    expect(db.prepare('SELECT path FROM files').get()).toEqual({ path: '/Downloads/Kolo.mp3' })
  })
})
```

If the file's `facts` builder has no tag overrides or hash parameter, extend it to
`facts(path, hash = 'h', tags = {})`.

In `tests/main/import/import-service.test.ts`:

```ts
test('a Library.xml import is refused while sync is on', async () => {
  const s = new ImportService({
    db,
    settings: new SettingsStore(db),
    startWorker: startInProcessWorker,
    onProgress: () => undefined,
    syncEnabled: () => true
  })
  await expect(
    s.run({ kind: 'apple', xmlPath: '/x.xml', selection: { mode: 'all' }, decisions: {} })
  ).rejects.toThrow('Turn off Sync with Apple Music')
})

test('an import is refused while a sync runs', async () => {
  const s = new ImportService({
    db,
    settings: new SettingsStore(db),
    startWorker: startInProcessWorker,
    onProgress: () => undefined,
    isSyncing: () => true
  })
  await expect(s.run({ kind: 'paths', paths: [dir.path] })).rejects.toThrow(ImportBusyError)
})
```

In `tests/renderer/music-import.test.tsx`, following the file's summary test:

```ts
test('the summary lists songs already synced from Apple Music, and restored songs', async () => {
  // drive the flow as the existing summary test does, with import:start resolving to:
  //   { ...emptySummary(), appleSynced: [{ path: '/m/Kolo.mp3' }], restored: [{ path: '/m/Hora.mp3' }] }
  expect(await screen.findByText('Already in library (Apple Music) (1)')).toBeInTheDocument()
  expect(screen.getByText('Restored (1)')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/import tests/renderer/music-import.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the rules**

`src/shared/import.ts`: add to `ImportSummary` and `emptySummary()`:

```ts
  restored: ImportSummaryItem[] // removed songs whose file was added again (sync spec §7.3)
  appleSynced: ImportSummaryItem[] // already in the library through Apple Music sync (§5.7)
```

`src/main/import/save-file.ts`:

```ts
export type SaveOutcome = 'added' | 'updated' | 'relinked' | 'unchanged' | 'restored' | 'appleSynced'

// Sync spec §5.7: while sync is on, Music owns a synced song's file and tags, so Add Music… leaves
// it alone. §7.3: a removed song added again comes back as a local song with all its data.
function findSynced(db: DatabaseSync, facts: FileFacts): FileRow | undefined {
  return db
    .prepare("SELECT * FROM files WHERE content_hash = ? AND apple_sync = 'synced' ORDER BY id LIMIT 1")
    .get(facts.contentHash) as FileRow | undefined
}

function findRemoved(db: DatabaseSync, facts: FileFacts): FileRow | undefined {
  return db
    .prepare('SELECT * FROM files WHERE content_hash = ? AND removed_at IS NOT NULL ORDER BY id LIMIT 1')
    .get(facts.contentHash) as FileRow | undefined
}

const restore = (db: DatabaseSync, fileId: number): void =>
  void db.prepare('UPDATE files SET removed_at = NULL, apple_sync = NULL WHERE id = ?').run(fileId)
```

And `saveImportedFile` becomes:

```ts
export function saveImportedFile(
  db: DatabaseSync,
  facts: FileFacts,
  ctx: SaveContext
): { outcome: SaveOutcome; fileId: number } {
  const mapped = mapTags(facts.tags, facts.path, ctx.mapping)
  const fromFiles = ctx.source === 'files'

  const existing = findExisting(db, facts, ctx)
  if (existing) {
    if (fromFiles && existing.apple_sync === 'synced') {
      return { outcome: 'appleSynced', fileId: existing.id }
    }
    const fileChanged = updateFile(db, existing, facts, ctx)
    const songChanged = fillEmptyFields(db, existing.id, mapped)
    if (existing.removed_at !== null) {
      restore(db, existing.id)
      return { outcome: 'restored', fileId: existing.id }
    }
    return { outcome: fileChanged || songChanged ? 'updated' : 'unchanged', fileId: existing.id }
  }

  if (fromFiles) {
    const synced = findSynced(db, facts)
    if (synced) return { outcome: 'appleSynced', fileId: synced.id }
    const removed = findRemoved(db, facts)
    if (removed) {
      updateFile(db, removed, facts, ctx)
      fillEmptyFields(db, removed.id, mapped)
      restore(db, removed.id)
      return { outcome: 'restored', fileId: removed.id }
    }
  }

  const moved = findMoved(db, facts)
  if (moved) {
    updateFile(db, moved, facts, ctx)
    fillEmptyFields(db, moved.id, mapped)
    return { outcome: 'relinked', fileId: moved.id }
  }

  return { outcome: 'added', fileId: insertFile(db, facts, ctx, mapped) }
}
```

`src/main/import/import-service.ts`:

```ts
export class ImportBusyError extends Error {
  constructor(message = 'An import is already running.') {
    super(message)
    this.name = 'ImportBusyError'
  }
}
```

Add to `ImportServiceDeps`:

```ts
  // Sync with Apple Music (sync spec §5.7): Library.xml imports wait until it is off, and nothing
  // is imported while a sync runs.
  syncEnabled?: () => boolean
  isSyncing?: () => boolean
```

`SUMMARY_KEY` gains `restored: 'restored'` and `appleSynced: 'appleSynced'` (widen its value type to
match). At the top of `run()`:

```ts
    if (this.current) throw new ImportBusyError()
    if (this.deps.isSyncing?.()) {
      throw new ImportBusyError('A sync with Apple Music is running. Try again in a moment.')
    }
    if (request.kind === 'apple' && this.deps.syncEnabled?.()) {
      throw new Error('Turn off Sync with Apple Music to import a Library.xml.')
    }
```

`ImportSummaryStep.tsx`, in `CATEGORIES` after `relinked`:

```ts
  { key: 'restored', label: 'Restored' },
  { key: 'alreadyPresent', label: 'Already in your library' },
  { key: 'appleSynced', label: 'Already in library (Apple Music)' },
```

- [ ] **Step 4: Run the tests and checks**

Run: `npx vitest run tests/main/import tests/renderer && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

CHANGELOG (Unreleased → Added):

```markdown
- Adding a song you removed from the library brings it back with its dances, notes and history.
```

```bash
git add src tests CHANGELOG.md
git commit -m "feat(import): skip copies of synced songs, and restore removed songs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `AppleSync`: triggers, states and turning sync on and off

Sync spec §3.3, §5.1, §5.8, §5.9, §6.5, §7.2.

**Files:**
- Create: `src/main/apple-sync/apple-sync.ts`
- Test: `tests/main/apple-sync/apple-sync.test.ts`

**Interfaces:**
- Consumes: `LibrarySource`, `PERMISSION_TIMEOUT_MS` (Task 4), `previewSnapshot` (Task 3),
  `ImportBusyError` (Task 11), the shared types (Task 1).
- Produces:
  ```ts
  export const FOCUS_INTERVAL_MS = 10_000
  export interface AppleSyncDeps {
    available: boolean
    source: LibrarySource
    settings: SettingsStore
    run: (snapshot: Snapshot, decisions: Record<string, MirrorDecision>, onProgress?: (p: ImportProgress) => void) => Promise<SyncSummary>
    findConflicts: (snapshot: Snapshot) => ApplePlaylistConflict[]
    review: { count(): number; resolve(fileIds: number[], action: ReviewAction): void; resolveAll(action: ReviewAction): void; disable(): void }
    onStatus: (status: AppleSyncStatus) => void
    onNotice: (notice: AppleSyncNotice) => void
    onLibraryChanged: () => void
    onProgress: (progress: ImportProgress) => void
    log: { info(message: string): void; warn(message: string): void; error(message: string, err?: unknown): void }
    clock?: () => number
    random?: () => number
  }
  export class AppleSync {
    status(): AppleSyncStatus
    get syncing(): boolean
    started(): void          // the control window was shown
    focused(): void          // the control window gained focus
    syncNow(): Promise<void>
    importFinished(): void   // a sync blocked by an import runs now
    preview(): Promise<SyncPreview>
    enable(decisions: Record<string, MirrorDecision>): Promise<SyncSummary | null>
    disable(): Promise<void>
    switchLibrary(): Promise<void>
    resolve(fileIds: number[], action: ReviewAction): void
    resolveAll(action: ReviewAction): void
  }
  ```

- [ ] **Step 1: Write the failing tests**

`tests/main/apple-sync/apple-sync.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import {
  emptySyncSummary,
  type AppleSyncNotice,
  type AppleSyncStatus,
  type SyncSummary
} from '@shared/apple-sync'
import { AppleSync, FOCUS_INTERVAL_MS, type AppleSyncDeps } from '../../../src/main/apple-sync/apple-sync'
import type { SnapshotResult } from '../../../src/main/apple-sync/library-source'
import type { Snapshot } from '../../../src/main/apple-sync/snapshot'
import { ImportBusyError } from '../../../src/main/import/import-service'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { LIBRARY_ID, snapTrack, snapshot } from './fixtures'

const OTHER_ID = 'BBBBBBBBBBBBBBB2'
let settings: SettingsStore
let reads: SnapshotResult[]
let readOptions: unknown[]
let runs: { snapshot: Snapshot; decisions: unknown }[]
let runResult: () => Promise<SyncSummary>
let notices: AppleSyncNotice[]
let statuses: AppleSyncStatus[]
let changes: number
let now: number
let review: number
let disabled: number

const ok = (s: Snapshot = snapshot()): SnapshotResult => ({ ok: true, snapshot: s })
const changed = (): SyncSummary => ({ ...emptySyncSummary('t'), added: [{ path: '/m/a.mp3' }] })
// Resolves when every pending promise callback has run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function make(over: Partial<AppleSyncDeps> = {}): AppleSync {
  return new AppleSync({
    available: true,
    source: {
      read: async (options) => {
        readOptions.push(options)
        return reads.shift() ?? ok()
      }
    },
    settings,
    run: (s, decisions) => {
      runs.push({ snapshot: s, decisions })
      return runResult()
    },
    findConflicts: () => [],
    review: {
      count: () => review,
      resolve: () => undefined,
      resolveAll: () => undefined,
      disable: () => void disabled++
    },
    onStatus: (s) => statuses.push(s),
    onNotice: (n) => notices.push(n),
    onLibraryChanged: () => void changes++,
    onProgress: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    clock: () => now,
    random: () => 0,
    ...over
  })
}

beforeEach(() => {
  settings = new SettingsStore(createTestDb())
  reads = []
  readOptions = []
  runs = []
  runResult = async () => emptySyncSummary('t')
  notices = []
  statuses = []
  changes = 0
  now = 100_000
  review = 0
  disabled = 0
})

const enabled = () => {
  settings.set('appleSync.enabled', true)
  settings.set('appleSync.libraryId', LIBRARY_ID)
}

describe('AppleSync', () => {
  test('is off until enabled, and does nothing on triggers', async () => {
    const sync = make()
    expect(sync.status()).toMatchObject({ available: true, state: 'off' })
    sync.started()
    sync.focused()
    await sync.syncNow()
    expect(runs).toEqual([])
  })

  test('is hidden where unavailable', () => {
    enabled()
    expect(make({ available: false }).status()).toMatchObject({ available: false, state: 'off' })
  })

  test('syncs at startup; a sync that changed something saves the result, toasts and refetches', async () => {
    enabled()
    review = 2
    runResult = async () => changed()
    const sync = make()
    sync.started()
    await flush()
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.lastResult')).toMatchObject({ added: [{ path: '/m/a.mp3' }] })
    expect(notices).toEqual([
      { kind: 'changed', message: 'Synced with Apple Music: 1 added · 2 to review' }
    ])
    expect(changes).toBe(1)
    expect(statuses.map((s) => s.state)).toEqual(['syncing', 'idle'])
  })

  test('a sync that changed nothing is quiet', async () => {
    enabled()
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([])
    expect(changes).toBe(0)
  })

  test('focus syncs at most once every 10 seconds', async () => {
    enabled()
    const sync = make()
    sync.focused()
    await flush()
    sync.focused()
    await flush()
    expect(runs).toHaveLength(1)
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(runs).toHaveLength(2)
  })

  test('triggers during a sync queue one more sync, never more', async () => {
    enabled()
    let release!: () => void
    runResult = () => new Promise((resolve) => (release = () => resolve(emptySyncSummary('t'))))
    const sync = make()
    const first = sync.syncNow()
    await flush()
    void sync.syncNow()
    void sync.syncNow()
    release()
    await flush()
    release()
    await first
    await flush()
    expect(runs).toHaveLength(2)
  })

  test('access denied pauses with one notice; focus does nothing; Sync now retries', async () => {
    enabled()
    reads = [{ ok: false, reason: 'denied', detail: 'TCC' }, { ok: false, reason: 'denied', detail: 'TCC' }]
    const sync = make()
    await sync.syncNow()
    expect(sync.status().state).toBe('paused-denied')
    expect(notices).toEqual([{ kind: 'denied' }])
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(readOptions).toHaveLength(1)
    await sync.syncNow()
    expect(readOptions).toHaveLength(2)
    expect(sync.status().state).toBe('paused-denied')
  })

  test('a failed read notices once until a sync succeeds, and the next trigger retries', async () => {
    enabled()
    reads = [
      { ok: false, reason: 'failed', detail: 'crash' },
      { ok: false, reason: 'failed', detail: 'crash' }
    ]
    const sync = make()
    sync.focused()
    await flush()
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(notices).toEqual([{ kind: 'failed', detail: 'crash' }])
    expect(sync.status().state).toBe('idle')
    expect(runs).toEqual([])
  })

  test('a failing engine is a failed sync, logged and noticed', async () => {
    enabled()
    runResult = async () => {
      throw new Error('disk full')
    }
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([{ kind: 'failed', detail: 'disk full' }])
    expect(sync.status().state).toBe('idle')
  })

  test('Music with a different library open pauses before changing anything', async () => {
    enabled()
    reads = [ok({ ...snapshot(), libraryId: OTHER_ID })]
    const sync = make()
    await sync.syncNow()
    expect(runs).toEqual([])
    expect(sync.status().state).toBe('paused-other-library')
    expect(notices).toEqual([{ kind: 'other-library' }])
  })

  test('Switch to this library adopts the new library and syncs it', async () => {
    enabled()
    reads = [ok({ ...snapshot(), libraryId: OTHER_ID }), ok({ ...snapshot(), libraryId: OTHER_ID })]
    const sync = make()
    await sync.syncNow()
    await sync.switchLibrary()
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.libraryId')).toBe(OTHER_ID)
    expect(sync.status().state).toBe('idle')
  })

  test('a sync blocked by an import runs when the import finishes', async () => {
    enabled()
    let busy = true
    runResult = async () => {
      if (busy) throw new ImportBusyError()
      return emptySyncSummary('t')
    }
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([])
    busy = false
    sync.importFinished()
    await flush()
    expect(runs).toHaveLength(2)
  })
})

describe('turning sync on and off', () => {
  // Review Focus 1.
  test('the preview waits for the permission dialog, and the first sync reuses its snapshot', async () => {
    const s = snapshot({ tracks: [snapTrack(1, '/m/a.mp3', { title: 'Kolo' })] })
    reads = [ok(s)]
    const sync = make({ findConflicts: () => [{ persistentId: 'X', name: 'Week' }] })
    const preview = await sync.preview()
    expect(readOptions).toEqual([{ timeoutMs: 300_000 }])
    expect(preview).toMatchObject({
      ok: true,
      preview: { trackCount: 1, tagSample: [{ title: 'Kolo' }] },
      conflicts: [{ name: 'Week' }]
    })
    const summary = await sync.enable({ X: 'replace' })
    expect(readOptions).toHaveLength(1)
    expect(runs).toEqual([{ snapshot: s, decisions: { X: 'replace' } }])
    expect(summary).not.toBeNull()
    expect(settings.get('appleSync.enabled')).toBe(true)
    expect(settings.get('appleSync.libraryId')).toBe(LIBRARY_ID)
    expect(sync.status().state).toBe('idle')
  })

  test('a denied preview is reported, and sync stays off', async () => {
    reads = [{ ok: false, reason: 'denied', detail: 'TCC' }]
    const sync = make()
    expect(await sync.preview()).toEqual({ ok: false, reason: 'denied', detail: 'TCC' })
    expect(sync.status().state).toBe('off')
  })

  test('turning on with a different library than last time pauses', async () => {
    settings.set('appleSync.libraryId', OTHER_ID)
    const sync = make()
    expect(await sync.enable({})).toBeNull()
    expect(sync.status().state).toBe('paused-other-library')
    expect(runs).toEqual([])
  })

  // Review Focus 3.
  test('turning off waits for a running sync, then leaves sync off', async () => {
    enabled()
    let release!: () => void
    runResult = () => new Promise((resolve) => (release = () => resolve(emptySyncSummary('t'))))
    const sync = make()
    const running = sync.syncNow()
    await flush()
    void sync.syncNow() // queued
    const off = sync.disable()
    await flush()
    expect(disabled).toBe(0)
    release()
    await off
    await running
    expect(disabled).toBe(1)
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.enabled')).toBe(false)
    expect(sync.status().state).toBe('off')
    sync.focused()
    await flush()
    expect(runs).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/apple-sync/apple-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apple-sync.ts`**

```ts
import {
  syncChanged,
  syncMessage,
  syncParts,
  type AppleSyncNotice,
  type AppleSyncState,
  type AppleSyncStatus,
  type MirrorDecision,
  type ReviewAction,
  type SyncPreview,
  type SyncSummary
} from '@shared/apple-sync'
import type { ApplePlaylistConflict, ImportProgress } from '@shared/import'
import { ImportBusyError } from '../import/import-service'
import type { SettingsStore } from '../settings/settings-store'
import { previewSnapshot } from './eligible'
import { PERMISSION_TIMEOUT_MS, type LibrarySource, type SnapshotResult } from './library-source'
import type { Snapshot } from './snapshot'

export const FOCUS_INTERVAL_MS = 10_000

export interface AppleSyncDeps {
  available: boolean
  source: LibrarySource
  settings: SettingsStore
  run: (
    snapshot: Snapshot,
    decisions: Record<string, MirrorDecision>,
    onProgress?: (progress: ImportProgress) => void
  ) => Promise<SyncSummary>
  findConflicts: (snapshot: Snapshot) => ApplePlaylistConflict[]
  review: {
    count(): number
    resolve(fileIds: number[], action: ReviewAction): void
    resolveAll(action: ReviewAction): void
    disable(): void
  }
  onStatus: (status: AppleSyncStatus) => void
  onNotice: (notice: AppleSyncNotice) => void
  onLibraryChanged: () => void
  onProgress: (progress: ImportProgress) => void
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string, err?: unknown): void
  }
  clock?: () => number
  random?: () => number
}

const detailOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Sync with Apple Music's controller (sync spec §3.3): triggers (startup, focus at most every 10 s,
// Sync now), one sync at a time with at most one more queued, the paused states, and notices once
// per occurrence. Failures are logged and noticed, never thrown at the caller (main spec §10.1).
export class AppleSync {
  private enabled: boolean
  private state: AppleSyncState
  private running: Promise<void> | null = null
  private again = false
  private lastFocus = -Infinity
  private failing = false // the last sync failed: a repeat failure isn't noticed again
  private noticedPause: AppleSyncState | null = null
  private waitingForImport = false
  private previewed: Snapshot | null = null

  constructor(private readonly deps: AppleSyncDeps) {
    this.enabled = deps.available && deps.settings.get('appleSync.enabled')
    this.state = this.enabled ? 'idle' : 'off'
  }

  status(): AppleSyncStatus {
    return {
      available: this.deps.available,
      state: this.state,
      lastResult: this.deps.settings.get('appleSync.lastResult'),
      reviewCount: this.deps.review.count()
    }
  }

  get syncing(): boolean {
    return this.running !== null
  }

  started(): void {
    if (this.state === 'idle') void this.request()
  }

  focused(): void {
    if (this.state !== 'idle' && this.state !== 'syncing') return
    const now = this.clock()
    if (now - this.lastFocus < FOCUS_INTERVAL_MS) return
    this.lastFocus = now
    void this.request()
  }

  // Sync now (Settings, the File menu) also retries a paused sync, and always reports a failure.
  async syncNow(): Promise<void> {
    if (!this.enabled) return
    this.noticedPause = null
    this.failing = false
    if (this.state !== 'syncing') this.setState('idle')
    await this.request()
  }

  importFinished(): void {
    if (!this.waitingForImport) return
    this.waitingForImport = false
    void this.request()
  }

  async switchLibrary(): Promise<void> {
    if (this.state !== 'paused-other-library') return
    // The next sync records the open library's ID; the old library's songs go to review.
    this.deps.settings.set('appleSync.libraryId', null)
    await this.syncNow()
  }

  resolve(fileIds: number[], action: ReviewAction): void {
    this.deps.review.resolve(fileIds, action)
    this.deps.onLibraryChanged()
    this.emit()
  }

  resolveAll(action: ReviewAction): void {
    this.deps.review.resolveAll(action)
    this.deps.onLibraryChanged()
    this.emit()
  }

  // Turning on (§5.8): reading the library makes macOS ask for access, so this read waits as long as
  // the dialog may be up. The snapshot is kept for enable().
  async preview(): Promise<SyncPreview> {
    const read = await this.deps.source.read({ timeoutMs: PERMISSION_TIMEOUT_MS })
    if (!read.ok) return read
    this.previewed = read.snapshot
    return {
      ok: true,
      preview: previewSnapshot(read.snapshot, this.deps.random),
      conflicts: this.deps.findConflicts(read.snapshot)
    }
  }

  // The first sync, with progress. Returns null when Music has a different library open than the
  // last time sync was on (the status then offers Switch to this library).
  async enable(decisions: Record<string, MirrorDecision>): Promise<SyncSummary | null> {
    if (!this.deps.available) throw new Error('Sync with Apple Music is only available on macOS.')
    const snapshot = this.previewed ?? (await this.readForEnable())
    this.previewed = null
    this.deps.settings.set('appleSync.enabled', true)
    this.enabled = true
    if (this.otherLibrary(snapshot)) {
      this.pause('paused-other-library', { kind: 'other-library' })
      return null
    }
    const job = (async (): Promise<SyncSummary> => {
      this.setState('syncing')
      try {
        const summary = await this.deps.run(snapshot, decisions, this.deps.onProgress)
        this.finished(summary, snapshot.libraryId)
        return summary
      } catch (err) {
        this.setState('idle')
        throw err
      }
    })()
    // Triggers during the first sync find it running and add nothing: it is reading the library now.
    this.running = job.then(
      () => undefined,
      () => undefined
    )
    void this.running.finally(() => (this.running = null))
    return await job
  }

  private async readForEnable(): Promise<Snapshot> {
    const read = await this.deps.source.read({ timeoutMs: PERMISSION_TIMEOUT_MS })
    if (!read.ok) throw new Error(read.detail || 'The Music library could not be read.')
    return read.snapshot
  }

  // Turning off (§5.9) waits for a running sync, so its writes finish before everything becomes
  // local; no further sync starts.
  async disable(): Promise<void> {
    this.enabled = false
    this.again = false
    this.previewed = null
    this.setState('off')
    if (this.running) await this.running
    this.deps.review.disable()
    this.deps.settings.set('appleSync.enabled', false)
    this.noticedPause = null
    this.failing = false
    this.deps.onLibraryChanged()
    this.emit()
  }

  private request(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.loop().finally(() => (this.running = null))
    return this.running
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      await this.syncOnce()
    } while (this.again && this.enabled && this.state === 'idle')
  }

  private async syncOnce(): Promise<void> {
    this.setState('syncing')
    const read: SnapshotResult = await this.deps.source.read()
    if (!this.enabled) return
    if (!read.ok) {
      if (read.reason === 'denied') return this.pause('paused-denied', { kind: 'denied' })
      return this.fail(read.detail)
    }
    if (this.otherLibrary(read.snapshot)) {
      return this.pause('paused-other-library', { kind: 'other-library' })
    }
    try {
      this.finished(await this.deps.run(read.snapshot, {}), read.snapshot.libraryId)
    } catch (err) {
      if (err instanceof ImportBusyError) {
        this.waitingForImport = true
        this.setState('idle')
        return
      }
      this.deps.log.error('Sync with Apple Music failed', err)
      this.fail(detailOf(err))
    }
  }

  private otherLibrary(snapshot: Snapshot): boolean {
    const known = this.deps.settings.get('appleSync.libraryId')
    return known !== null && known !== snapshot.libraryId
  }

  private finished(summary: SyncSummary, libraryId: string): void {
    const { settings, log } = this.deps
    settings.set('appleSync.libraryId', libraryId)
    settings.set('appleSync.lastResult', summary)
    this.failing = false
    this.noticedPause = null
    const parts = syncParts(summary)
    log.info(`Synced with Apple Music${parts.length ? `: ${parts.join(', ')}` : ''}`)
    if (syncChanged(summary)) {
      this.deps.onLibraryChanged()
      this.deps.onNotice({ kind: 'changed', message: syncMessage(summary, this.deps.review.count()) })
    }
    this.setState('idle')
  }

  private pause(state: AppleSyncState, notice: AppleSyncNotice): void {
    this.deps.log.warn(`Sync with Apple Music paused: ${state}`)
    if (this.noticedPause !== state) this.deps.onNotice(notice)
    this.noticedPause = state
    this.setState(state)
  }

  private fail(detail: string): void {
    this.deps.log.warn(`Sync with Apple Music failed: ${detail}`)
    if (!this.failing) this.deps.onNotice({ kind: 'failed', detail })
    this.failing = true
    this.setState('idle')
  }

  private setState(next: AppleSyncState): void {
    this.state = this.enabled ? next : 'off'
    this.emit()
  }

  private emit(): void {
    this.deps.onStatus(this.status())
  }

  private clock(): number {
    return this.deps.clock?.() ?? Date.now()
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/apple-sync/apple-sync.test.ts && npm run typecheck`
Expected: PASS. If the queue test is flaky on timing, add one more `await flush()` between the
releases rather than changing the class.

- [ ] **Step 5: Commit**

```bash
git add src/main/apple-sync/apple-sync.ts tests/main/apple-sync/apple-sync.test.ts
git commit -m "feat(sync): AppleSync runs syncs on triggers, one at a time, and turns sync on and off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: IPC channels, the File menu, and wiring in main

**Files:**
- Modify: `src/shared/contract.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/library-handlers.ts`,
  `src/main/menu.ts`, `src/main/index.ts`
- Create: `src/main/ipc/apple-sync-handlers.ts`
- Test: `tests/main/ipc/apple-sync-handlers.test.ts`, `tests/main/app/menu.test.ts`,
  `tests/main/ipc/library-handlers.test.ts`

**Interfaces:**
- Consumes: `AppleSync` (Task 12), `runSync`, `statFile` (Task 10), `review.ts` (Task 9),
  `listPlaylistFolders` (Task 9), `createHelperSource`, `createFileSource` (Task 4),
  `findEditedApplePlaylists` (`save-playlists.ts`), `savedMapping` (Task 10).
- Produces (invoke channels):
  ```ts
  'appleSync:status': { args: []; result: AppleSyncStatus }
  'appleSync:preview': { args: []; result: SyncPreview }
  'appleSync:enable': { args: [decisions: Record<string, MirrorDecision>]; result: SyncSummary | null }
  'appleSync:disable': { args: []; result: void }
  'appleSync:syncNow': { args: []; result: void }
  'appleSync:switchLibrary': { args: []; result: void }
  'appleSync:resolve': { args: [fileIds: number[], action: ReviewAction]; result: void }
  'appleSync:resolveAll': { args: [action: ReviewAction]; result: void }
  'appleSync:openPrivacySettings': { args: []; result: void }
  'playlists:folders': { args: []; result: PlaylistFolder[] }
  ```
  Events: `'appleSync:state': AppleSyncStatus`, `'appleSync:notice': AppleSyncNotice`.
  `HandlerDeps.appleSync?: AppleSyncHandlerDeps` (absent → status `APPLE_SYNC_OFF`, writes throw).
  `menuTemplate` options gain `appleSync: boolean` and `syncAppleMusic: () => void`.

- [ ] **Step 1: Write the failing tests**

`tests/main/ipc/apple-sync-handlers.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary } from '@shared/apple-sync'
import { appleSyncHandlers } from '../../../src/main/ipc/apple-sync-handlers'

describe('Apple Music sync handlers', () => {
  test('without sync (another platform) the status is off and writes fail', async () => {
    const h = appleSyncHandlers({})
    expect(await h['appleSync:status']()).toEqual(APPLE_SYNC_OFF)
    await expect(Promise.resolve().then(() => h['appleSync:syncNow']())).rejects.toThrow(
      'only available on macOS'
    )
  })

  test('each channel reaches AppleSync', async () => {
    const calls: unknown[][] = []
    const record =
      (name: string, result?: unknown) =>
      (...args: unknown[]) => {
        calls.push([name, ...args])
        return result
      }
    const h = appleSyncHandlers({
      appleSync: {
        status: record('status', { ...APPLE_SYNC_OFF, available: true }) as never,
        preview: record('preview', Promise.resolve({ ok: false, reason: 'denied', detail: '' })) as never,
        enable: record('enable', Promise.resolve(emptySyncSummary('t'))) as never,
        disable: record('disable', Promise.resolve()) as never,
        syncNow: record('syncNow', Promise.resolve()) as never,
        switchLibrary: record('switchLibrary', Promise.resolve()) as never,
        resolve: record('resolve') as never,
        resolveAll: record('resolveAll') as never,
        openPrivacySettings: record('openPrivacySettings') as never
      }
    })
    await h['appleSync:enable']({ X: 'copy' })
    await h['appleSync:resolve']([1, 2], 'remove')
    await h['appleSync:resolveAll']('keep')
    await h['appleSync:openPrivacySettings']()
    expect(calls).toEqual([
      ['enable', { X: 'copy' }],
      ['resolve', [1, 2], 'remove'],
      ['resolveAll', 'keep'],
      ['openPrivacySettings']
    ])
  })
})
```

In `tests/main/app/menu.test.ts` (with the file's own options builder):

```ts
test('File → Sync with Apple Music (⌘⇧S) appears only where sync is available', () => {
  let synced = 0
  const withSync = menuTemplate({ ...options, appleSync: true, syncAppleMusic: () => void synced++ })
  const file = withSync.find((m) => m.label === 'File')!
  const item = (file.submenu as MenuItemConstructorOptions[])[0]
  expect(item).toMatchObject({ label: 'Sync with Apple Music', accelerator: 'CmdOrCtrl+Shift+S' })
  ;(item.click as () => void)()
  expect(synced).toBe(1)
  expect(menuTemplate({ ...options, appleSync: false, syncAppleMusic: () => undefined }).find((m) => m.label === 'File')).toBeUndefined()
})
```

In `tests/main/ipc/library-handlers.test.ts`:

```ts
test('playlists:folders lists Music folders, and a mirror rejects edits', async () => {
  const { db, h } = setup()
  db.prepare(
    "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'FFFFFFFFFFFFFFF1', 1)"
  ).run()
  expect((await h['playlists:folders']()).map((f) => f.name)).toEqual(['IFD'])
  const id = Number(
    db
      .prepare(
        "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES ('M', 'apple_xml', 'AAAAAAAAAAAAAAA9', 1)"
      )
      .run().lastInsertRowid
  )
  expect(() => h['playlists:rename'](id, 'X')).toThrow('Edit this playlist in Music.')
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/ipc tests/main/app`
Expected: FAIL.

- [ ] **Step 3: Add the channels**

`src/shared/contract.ts`: import the types from `./apple-sync`, add the invoke channels above to
`InvokeContract` (after the canva ones, under a comment `// Sync with Apple Music (sync spec §3.3,
§6).`) and to `INVOKE_CHANNELS`; put `'playlists:folders'` beside the other `playlists:` channels.
Add the events to `EventContract` and `EVENT_CHANNELS`:

```ts
  // To the control window: sync's state changed (and with it the review count or last result).
  'appleSync:state': AppleSyncStatus
  // To the control window: a toast or notice, once per occurrence (sync spec §6.5).
  'appleSync:notice': AppleSyncNotice
```

`src/main/ipc/library-handlers.ts`: `'playlists:folders': () => listPlaylistFolders(db),`.

`src/main/ipc/apple-sync-handlers.ts`:

```ts
import { APPLE_SYNC_OFF } from '@shared/apple-sync'
import type { InvokeHandlers } from '@shared/contract'
import type { AppleSync } from '../apple-sync/apple-sync'

export type AppleSyncHandlerDeps = Pick<
  AppleSync,
  | 'status'
  | 'preview'
  | 'enable'
  | 'disable'
  | 'syncNow'
  | 'switchLibrary'
  | 'resolve'
  | 'resolveAll'
> & { openPrivacySettings(): void }

type AppleSyncChannel = Extract<keyof InvokeHandlers, `appleSync:${string}`>

// Sync with Apple Music (sync spec §3.3, §6). Without it (other platforms) the status is off and
// every action fails.
export function appleSyncHandlers(deps: {
  appleSync?: AppleSyncHandlerDeps
}): Pick<InvokeHandlers, AppleSyncChannel> {
  const sync = (): AppleSyncHandlerDeps => {
    if (!deps.appleSync) throw new Error('Sync with Apple Music is only available on macOS.')
    return deps.appleSync
  }
  return {
    'appleSync:status': () => deps.appleSync?.status() ?? APPLE_SYNC_OFF,
    'appleSync:preview': () => sync().preview(),
    'appleSync:enable': (decisions) => sync().enable(decisions),
    'appleSync:disable': () => sync().disable(),
    'appleSync:syncNow': () => sync().syncNow(),
    'appleSync:switchLibrary': () => sync().switchLibrary(),
    'appleSync:resolve': (fileIds, action) => sync().resolve(fileIds, action),
    'appleSync:resolveAll': (action) => sync().resolveAll(action),
    'appleSync:openPrivacySettings': () => sync().openPrivacySettings()
  }
}
```

`src/main/ipc/handlers.ts`: add `appleSync?: AppleSyncHandlerDeps` to `HandlerDeps` (comment:
"Sync with Apple Music (sync spec); reported off when absent.") and spread
`...appleSyncHandlers(deps)` into `createHandlers`.

- [ ] **Step 4: Add the File menu**

`src/main/menu.ts`: add the two options and, after the app menu, a File menu only when available:

```ts
  appleSync: boolean // Sync with Apple Music is available (macOS)
  syncAppleMusic: () => void
```

```ts
    ...(o.appleSync
      ? ([
          {
            label: 'File',
            submenu: [
              {
                label: 'Sync with Apple Music',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: o.syncAppleMusic
              }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
```

Update the comment above `menuTemplate` to mention the File menu.

- [ ] **Step 5: Wire it up in `src/main/index.ts`**

Imports: `existsSync` from `node:fs`; `AppleSync`; `runSync`, `statFile`; `createFileSource`,
`createHelperSource`; `disableSync`, `resolveAllReview`, `resolveReview`, `reviewCount`;
`findEditedApplePlaylists`; `savedMapping`.

After `const importer = …`, change the importer's deps and `onProgress` so a waiting sync runs after
an import, and an import is refused during a sync:

```ts
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    syncEnabled: () => settings.get('appleSync.enabled'),
    isSyncing: () => appleSync.syncing,
    onProgress: (progress) => {
      broadcast('import:progress', progress)
      if (progress.phase === 'done') {
        log.info(`Import finished: ${progress.done} of ${progress.total} files read`)
        libraryChanged()
        appleSync.importFinished()
      }
    }
  })
```

After the player is created (it is needed for `player.refresh()`):

```ts
  // Sync with Apple Music (sync spec §3): the bundled helper, or a snapshot file in development and
  // end-to-end tests. macOS only.
  const appleLibraryFile = process.env['FDP_APPLE_LIBRARY']
  const appleSync: AppleSync = new AppleSync({
    available: process.platform === 'darwin' || appleLibraryFile !== undefined,
    source: appleLibraryFile
      ? createFileSource(appleLibraryFile)
      : createHelperSource(
          app.isPackaged
            ? join(process.resourcesPath, 'fdp-music-library')
            : join(app.getAppPath(), 'resources', 'bin', 'fdp-music-library')
        ),
    settings,
    run: async (snapshot, decisions, onProgress) => {
      if (importer.busy) throw new ImportBusyError()
      return runSync(
        {
          db,
          mapping: savedMapping(settings),
          readTracks: (tracks, onResult) => importer.readTracks(tracks, onResult),
          stat: statFile,
          exists: existsSync,
          now: () => new Date().toISOString(),
          onProgress
        },
        snapshot,
        decisions
      )
    },
    findConflicts: (snapshot) =>
      findEditedApplePlaylists(
        db,
        snapshot.playlists.map((p) => p.persistentId)
      ),
    review: {
      count: () => reviewCount(db),
      resolve: (ids, action) => resolveReview(db, ids, action, new Date().toISOString()),
      resolveAll: (action) => resolveAllReview(db, action, new Date().toISOString()),
      disable: () => disableSync(db)
    },
    onStatus: (status) => broadcast('appleSync:state', status),
    onNotice: (notice) => broadcast('appleSync:notice', notice),
    onLibraryChanged: () => {
      player.refresh() // labels, and whether the next item is removed, may have changed
      libraryChanged()
    },
    onProgress: (progress) => broadcast('import:progress', progress),
    log
  })
```

`importer` is declared before `appleSync`, and its callbacks only run later, so `appleSync` is
initialized by then; TypeScript accepts the forward reference inside the arrow functions.

In `menuTemplate({...})`:

```ts
        appleSync: appleSync.status().available,
        // While sync is off, the menu item opens Settings, where the switch is.
        syncAppleMusic: () => {
          if (appleSync.status().state === 'off') {
            mainWindow.show()
            mainWindow.webContents.send('app:showPage', 'settings')
          } else void appleSync.syncNow()
        },
```

Triggers, after the main window is created:

```ts
  // Sync triggers (sync spec §3.3): once the window is shown, and whenever it gains focus.
  mainWindow.once('show', () => appleSync.started())
  mainWindow.on('focus', () => appleSync.focused())
```

In `createHandlers({...})`:

```ts
      appleSync: {
        status: () => appleSync.status(),
        preview: () => appleSync.preview(),
        enable: (decisions) => appleSync.enable(decisions),
        disable: () => appleSync.disable(),
        syncNow: () => appleSync.syncNow(),
        switchLibrary: () => appleSync.switchLibrary(),
        resolve: (ids, action) => appleSync.resolve(ids, action),
        resolveAll: (action) => appleSync.resolveAll(action),
        // System Settings → Privacy & Security → Media & Apple Music.
        openPrivacySettings: () =>
          void shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Media'
          )
      },
```

- [ ] **Step 6: Run the tests, the checks and a build**

Run: `npm test && npm run typecheck && npx electron-vite build`
Expected: PASS, and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(sync): wire Apple Music sync into main, with File → Sync with Apple Music

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Toasts, and the sync notices

Sync spec §6.5. Adds `@mantine/notifications`, used here and by Task 17.

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/renderer/src/main.tsx`,
  `src/renderer/src/App.tsx`, `tests/renderer/render.tsx`, `tests/renderer/fake-api.ts`
- Create: `src/renderer/src/apple-sync/AppleSyncNotices.tsx`,
  `src/renderer/src/apple-sync/useAppleSync.ts`
- Test: `tests/renderer/apple-sync/notices.test.tsx`

**Interfaces:**
- Consumes: the `appleSync:notice` and `appleSync:state` events, `appleSync:status` (Task 13).
- Produces:
  ```ts
  export function useAppleSync(api: RendererApi): AppleSyncStatus | null   // useAppleSync.ts
  export function noticeContent(notice: AppleSyncNotice): { title?: string; message: string; color: string }
  export default function AppleSyncNotices(props: { api: RendererApi }): null
  ```
  The fake API answers `appleSync:status` with `APPLE_SYNC_OFF` and `playlists:folders` with `[]`.

- [ ] **Step 1: Add the dependency**

Run: `npm install --save-exact @mantine/notifications@9.6.3`

Check `package.json` lists `"@mantine/notifications": "9.6.3"` under `dependencies` (beside
`@mantine/core`), exact. 9.6.3 was published 2026-09-26, more than two weeks ago.

- [ ] **Step 2: Mount it**

`src/renderer/src/main.tsx`:

```tsx
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { Notifications } from '@mantine/notifications'
```

```tsx
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
```

`tests/renderer/render.tsx`:

```tsx
import { Notifications } from '@mantine/notifications'

export function renderWithMantine(ui: React.ReactElement): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <Notifications />
      {ui}
    </MantineProvider>
  )
}
```

(If another test helper renders its own `MantineProvider`, such as
`tests/renderer/library/render-library.tsx`, add `<Notifications />` there too.)

`tests/renderer/fake-api.ts`, with the other defaults:

```ts
        // Sync with Apple Music is unavailable unless a test says otherwise.
        if (channel === 'appleSync:status') return APPLE_SYNC_OFF
        if (channel === 'playlists:folders') return []
```

- [ ] **Step 3: Write the failing test**

`tests/renderer/apple-sync/notices.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AppleSyncNotices from '@renderer/apple-sync/AppleSyncNotices'
import { createFakeApi } from '../fake-api'
import { renderWithMantine } from '../render'

describe('sync notices (sync spec §6.5)', () => {
  test('a sync that changed something shows a toast', async () => {
    const fake = createFakeApi()
    renderWithMantine(<AppleSyncNotices api={fake.api} />)
    fake.emit('appleSync:notice', {
      kind: 'changed',
      message: 'Synced with Apple Music: 3 added, 1 updated · 2 to review'
    })
    expect(
      await screen.findByText('Synced with Apple Music: 3 added, 1 updated · 2 to review')
    ).toBeInTheDocument()
  })

  test.each([
    [{ kind: 'denied' as const }, "Folk Dance Player isn't allowed to read your Music library"],
    [{ kind: 'other-library' as const }, 'Music has a different library open'],
    [{ kind: 'failed' as const, detail: 'crash' }, "Couldn't sync with Apple Music"]
  ])('%o is noticed', async (notice, text) => {
    const fake = createFakeApi()
    renderWithMantine(<AppleSyncNotices api={fake.api} />)
    fake.emit('appleSync:notice', notice)
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/renderer/apple-sync/notices.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the hook and the notices**

`src/renderer/src/apple-sync/useAppleSync.ts`:

```ts
import { useEffect, useState } from 'react'
import type { AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'

// Sync's status from main, kept current by appleSync:state. Null until the first answer. The
// first answer is ignored if a broadcast already arrived (it would be older).
export function useAppleSync(api: RendererApi): AppleSyncStatus | null {
  const [status, setStatus] = useState<AppleSyncStatus | null>(null)
  useEffect(() => {
    let live = true
    let pushed = false
    const off = api.on('appleSync:state', (next) => {
      pushed = true
      setStatus(next)
    })
    void api.invoke('appleSync:status').then((first) => {
      if (live && !pushed) setStatus(first)
    })
    return () => {
      live = false
      off()
    }
  }, [api])
  return status
}
```

`src/renderer/src/apple-sync/AppleSyncNotices.tsx`:

```tsx
import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import type { AppleSyncNotice } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'

const PAUSED = 'Sync with Apple Music is paused'

export function noticeContent(notice: AppleSyncNotice): {
  title?: string
  message: string
  color: string
} {
  switch (notice.kind) {
    case 'changed':
      return { message: notice.message, color: 'blue' }
    case 'denied':
      return {
        title: PAUSED,
        message:
          "Folk Dance Player isn't allowed to read your Music library. Settings → Apple Music shows how to allow it.",
        color: 'yellow'
      }
    case 'other-library':
      return {
        title: PAUSED,
        message: 'Music has a different library open. Settings → Apple Music has the choices.',
        color: 'yellow'
      }
    case 'failed':
      return {
        title: "Couldn't sync with Apple Music",
        message: 'It will try again the next time. The details are in the log.',
        color: 'red'
      }
  }
}

// One toast per notice; main sends each once per occurrence (sync spec §6.5). A sync's summary
// closes by itself; a pause or failure stays until closed.
export default function AppleSyncNotices({ api }: { api: RendererApi }): null {
  useEffect(
    () =>
      api.on('appleSync:notice', (notice) =>
        notifications.show({
          ...noticeContent(notice),
          autoClose: notice.kind === 'changed' ? 6000 : false
        })
      ),
    [api]
  )
  return null
}
```

`src/renderer/src/App.tsx`: render `<AppleSyncNotices api={window.api} />` inside the providers
(beside `<AppShell>`).

- [ ] **Step 6: Run the renderer tests and checks**

Run: `npx vitest run tests/renderer && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

No CHANGELOG line yet: Task 15's line covers sync, toasts included.

```bash
git add package.json package-lock.json src/renderer tests/renderer
git commit -m "feat(sync): toasts for sync results and notices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Settings → Apple Music, and turning sync on and off

Sync spec §5.8, §5.9, §6.1.

**Files:**
- Create: `src/renderer/src/apple-sync/AppleMusicSection.tsx`,
  `src/renderer/src/apple-sync/AppleSyncDialog.tsx`,
  `src/renderer/src/apple-sync/useAppleSyncFlow.ts`,
  `src/renderer/src/apple-sync/MirrorDecisionsStep.tsx`,
  `src/renderer/src/apple-sync/SyncSummaryView.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`,
  `src/renderer/src/import/ImportProgressStep.tsx`
- Test: `tests/renderer/apple-sync/apple-music-section.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `useAppleSync` (Task 14), `ImportMappingFields`, `TagPreviewTable`,
  `ImportProgressStep`, `ConfirmDialog`, `fileName`, `syncParts` (Task 1), the `appleSync:*` channels
  (Task 13).
- Produces:
  ```ts
  export type AppleSyncFlowState =
    | { step: 'closed' } | { step: 'explain' } | { step: 'reading' } | { step: 'denied' }
    | { step: 'error'; message: string }
    | { step: 'mapping'; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
    | { step: 'decisions'; conflicts: ApplePlaylistConflict[] }
    | { step: 'running'; progress: ImportProgress | null }
    | { step: 'summary'; summary: SyncSummary }
    | { step: 'paused' }
  export function useAppleSyncFlow(api: RendererApi): AppleSyncFlow
  export default function SyncSummaryView(props: { summary: SyncSummary }): React.JSX.Element
  ```
  `ImportProgressStep`'s `onCancel` becomes optional (no Cancel button without it).

- [ ] **Step 1: Write the failing tests**

`tests/renderer/apple-sync/apple-music-section.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary, type AppleSyncStatus } from '@shared/apple-sync'
import AppleMusicSection from '@renderer/apple-sync/AppleMusicSection'
import { createFakeApi } from '../fake-api'
import { renderWithMantine } from '../render'

const OFF: AppleSyncStatus = { ...APPLE_SYNC_OFF, available: true }
const preview = {
  ok: true,
  preview: {
    trackCount: 2,
    playlists: [{ persistentId: 'P', name: 'Week 3', trackCount: 2 }],
    tagSample: [{ title: 'Kolo', artist: 'Taraf', albumArtist: null, genre: 'Serbia' }]
  },
  conflicts: []
}
const summary = { ...emptySyncSummary('2026-10-16T11:42:00.000Z'), added: [{ path: '/m/Kolo.mp3' }] }

function setup(status: AppleSyncStatus = OFF, handlers: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'appleSync:status': status,
    'appleSync:preview': preview,
    'appleSync:enable': summary,
    ...handlers
  } as never)
  renderWithMantine(<AppleMusicSection api={fake.api} />)
  return { fake, user: userEvent.setup() }
}

describe('Settings → Apple Music (sync spec §6.1)', () => {
  test('is hidden where sync is unavailable', async () => {
    setup(APPLE_SYNC_OFF)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Apple Music')).not.toBeInTheDocument()
  })

  test('turning on: explanation, mapping with Music tags, first sync, summary', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('switch', { name: 'Sync with Apple Music' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/macOS will ask/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await within(dialog).findByText('Kolo')).toBeInTheDocument() // the tag preview
    expect(within(dialog).getByText(/2 songs and 1 playlist/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Start sync' }))
    expect(await within(dialog).findByText('Added (1)')).toBeInTheDocument()
    expect(fake.callsTo('appleSync:enable')).toEqual([[{}]])
    expect(fake.callsTo('settings:set').map((c) => c[0])).toContain('import.artistTagTarget')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('playlists edited here are asked about, keeping edits as a copy by default', async () => {
    const { fake, user } = setup(OFF, {
      'appleSync:preview': { ...preview, conflicts: [{ persistentId: 'P', name: 'Week 3' }, { persistentId: 'Q', name: 'Week 4' }] }
    })
    await user.click(await screen.findByRole('switch', { name: 'Sync with Apple Music' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    const week4 = await screen.findByRole('radiogroup', { name: 'Week 4' })
    await user.click(within(week4).getByLabelText('Replace with Apple version'))
    expect(within(screen.getByRole('radiogroup', { name: 'Week 3' })).getByLabelText('Keep my edits as a copy')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Start sync' }))
    await screen.findByText('Added (1)')
    expect(fake.callsTo('appleSync:enable')).toEqual([[{ P: 'copy', Q: 'replace' }]])
  })

  test('access denied shows how to allow it', async () => {
    const { fake, user } = setup(OFF, {
      'appleSync:preview': { ok: false, reason: 'denied', detail: 'TCC' }
    })
    await user.click(await screen.findByRole('switch', { name: 'Sync with Apple Music' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/isn't allowed to read your Music library/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Privacy Settings' }))
    expect(fake.callsTo('appleSync:openPrivacySettings')).toHaveLength(1)
    expect(fake.callsTo('appleSync:enable')).toEqual([])
  })

  test('a different library than last time: Keep waiting or Switch to this library', async () => {
    const { fake, user } = setup(OFF, { 'appleSync:enable': null })
    await user.click(await screen.findByRole('switch', { name: 'Sync with Apple Music' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    expect(await screen.findByText('Music has a different library open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to this library' }))
    expect(fake.callsTo('appleSync:switchLibrary')).toHaveLength(1)
  })

  test('turning off asks first', async () => {
    const { fake, user } = setup({ ...OFF, state: 'idle' })
    await user.click(await screen.findByRole('switch', { name: 'Sync with Apple Music' }))
    expect(await screen.findByText('Songs and playlists stay; playlists become editable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(fake.callsTo('appleSync:disable')).toHaveLength(1)
  })

  test('the status line: last sync with Details, and Sync now', async () => {
    const last = { ...emptySyncSummary('2026-10-16T11:42:00.000Z'), added: [1, 2, 3].map((n) => ({ path: `/m/${n}.mp3` })), updated: [{ path: '/m/4.mp3' }] }
    const { fake, user } = setup({ ...OFF, state: 'idle', lastResult: last, reviewCount: 2 })
    expect(await screen.findByText(/^Last synced .+ — 3 added, 1 updated, 2 to review$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText('Added (3)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(fake.callsTo('appleSync:syncNow')).toHaveLength(1)
  })

  test.each([
    ['paused-other-library', 'Paused: Music has a different library open', 'Switch to this library', 'appleSync:switchLibrary'],
    ['paused-denied', "Folk Dance Player isn't allowed to read your Music library", 'Open Privacy Settings', 'appleSync:openPrivacySettings']
  ] as const)('the %s status offers its fix', async (state, text, button, channel) => {
    const { fake, user } = setup({ ...OFF, state })
    expect(await screen.findByText(text)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: button }))
    expect(fake.callsTo(channel)).toHaveLength(1)
  })

  test('the status follows appleSync:state', async () => {
    const { fake } = setup()
    await screen.findByRole('switch', { name: 'Sync with Apple Music' })
    fake.emit('appleSync:state', { ...OFF, state: 'syncing' })
    expect(await screen.findByText('Syncing…')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/apple-sync/apple-music-section.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Make the progress step's Cancel optional**

`ImportProgressStep.tsx`: `onCancel?: () => void`, and render the `<Group justify="flex-end">`
with the Cancel button only when `props.onCancel` is set.

- [ ] **Step 4: Write the flow**

`src/renderer/src/apple-sync/useAppleSyncFlow.ts`:

```ts
import { useRef, useState } from 'react'
import type { MirrorDecision, SyncSummary } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress
} from '@shared/import'
import { errorMessage } from '../ipc-error'

export type AppleSyncFlowState =
  | { step: 'closed' }
  | { step: 'explain' }
  | { step: 'reading' }
  | { step: 'denied' }
  | { step: 'error'; message: string }
  | { step: 'mapping'; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
  | { step: 'decisions'; conflicts: ApplePlaylistConflict[] }
  | { step: 'running'; progress: ImportProgress | null }
  | { step: 'summary'; summary: SyncSummary }
  | { step: 'paused' }

// Turning sync on (sync spec §5.8): explanation → reading the library (macOS asks for access) →
// the mapping step with Music's tags → decisions for playlists edited here → the first sync →
// its summary. A late answer after the dialog was closed is ignored.
export function useAppleSyncFlow(api: RendererApi) {
  const [state, setState] = useState<AppleSyncFlowState>({ step: 'closed' })
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const session = useRef(0)

  const guarded =
    <A extends unknown[]>(fn: (live: () => boolean, ...args: A) => Promise<void>) =>
    (...args: A): Promise<void> => {
      const id = session.current
      return fn(() => session.current === id, ...args)
    }

  const start = guarded(async (live, decisions: Record<string, MirrorDecision>) => {
    setState({ step: 'running', progress: null })
    const off = api.on('import:progress', (progress) =>
      setState((s) => (s.step === 'running' ? { step: 'running', progress } : s))
    )
    try {
      const summary = await api.invoke('appleSync:enable', decisions)
      if (live()) setState(summary ? { step: 'summary', summary } : { step: 'paused' })
    } catch (err) {
      if (live()) setState({ step: 'error', message: errorMessage(err) })
    } finally {
      off()
    }
  })

  return {
    state,
    mapping,
    setMapping,
    open: () => setState({ step: 'explain' }),
    read: guarded(async (live) => {
      setState({ step: 'reading' })
      const [result, settings] = await Promise.all([
        api.invoke('appleSync:preview'),
        api.invoke('settings:getAll')
      ])
      if (!live()) return
      setMapping({
        artistTagTarget: settings['import.artistTagTarget'],
        albumArtistTagTarget: settings['import.albumArtistTagTarget'],
        genreIsCountry: settings['import.genreIsCountry']
      })
      if (result.ok) setState({ step: 'mapping', preview: result.preview, conflicts: result.conflicts })
      else if (result.reason === 'denied') setState({ step: 'denied' })
      else setState({ step: 'error', message: result.detail })
    }),
    // The mapping is saved for every sync and import (main spec §5.2).
    confirmMapping: guarded(async (live, conflicts: ApplePlaylistConflict[]) => {
      if (mapping) {
        await api.invoke('settings:set', 'import.artistTagTarget', mapping.artistTagTarget)
        await api.invoke('settings:set', 'import.albumArtistTagTarget', mapping.albumArtistTagTarget)
        await api.invoke('settings:set', 'import.genreIsCountry', mapping.genreIsCountry)
      }
      if (!live()) return
      if (conflicts.length > 0) setState({ step: 'decisions', conflicts })
      else await start({})
    }),
    start,
    close: () => {
      session.current += 1
      setState({ step: 'closed' })
    }
  }
}

export type AppleSyncFlow = ReturnType<typeof useAppleSyncFlow>
```

- [ ] **Step 5: Write the steps and the dialog**

`src/renderer/src/apple-sync/MirrorDecisionsStep.tsx`:

```tsx
import { useState } from 'react'
import { Button, Group, Radio, Stack, Text } from '@mantine/core'
import type { MirrorDecision } from '@shared/apple-sync'
import type { ApplePlaylistConflict } from '@shared/import'

// Sync spec §5.8 step 4: playlists edited here since a Library.xml import. Music's version always
// appears as a read-only playlist; the choice is what happens to the edits.
export default function MirrorDecisionsStep(props: {
  conflicts: ApplePlaylistConflict[]
  onStart: (decisions: Record<string, MirrorDecision>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [decisions, setDecisions] = useState<Record<string, MirrorDecision>>(() =>
    Object.fromEntries(props.conflicts.map((c) => [c.persistentId, 'copy' as const]))
  )
  return (
    <Stack>
      <Text size="sm">
        You changed these playlists here since they came from Apple Music. Music&apos;s version will
        appear as a read-only playlist. What should happen to your edits?
      </Text>
      {props.conflicts.map((c) => (
        <Radio.Group
          key={c.persistentId}
          label={c.name}
          aria-label={c.name}
          value={decisions[c.persistentId]}
          onChange={(v) => setDecisions((d) => ({ ...d, [c.persistentId]: v as MirrorDecision }))}
        >
          <Group mt={4}>
            <Radio value="copy" label="Keep my edits as a copy" />
            <Radio value="replace" label="Replace with Apple version" />
          </Group>
        </Radio.Group>
      ))}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={() => props.onStart(decisions)}>Start sync</Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/apple-sync/SyncSummaryView.tsx`:

```tsx
import { Accordion, List, ScrollArea, Stack, Text } from '@mantine/core'
import type { SyncSummary } from '@shared/apple-sync'
import { fileName } from '../import/file-name'

type FileCategory = Exclude<keyof SyncSummary, 'finishedAt' | 'skipped' | 'playlists'>

const CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'added', label: 'Added' },
  { key: 'updated', label: 'Updated' },
  { key: 'relinked', label: 'Found after moving' },
  { key: 'adopted', label: 'Already in your library, now synced' },
  { key: 'restored', label: 'Restored' },
  { key: 'gone', label: 'Removed from Apple Music (to review)' },
  { key: 'missing', label: 'Not found on disk' },
  { key: 'unsupported', label: 'Unsupported format' },
  { key: 'unreadable', label: "Couldn't be read" }
]

// A sync's summary (sync spec §7.1), in the import summary's layout: each category lists its songs.
export default function SyncSummaryView({ summary }: { summary: SyncSummary }): React.JSX.Element {
  const categories = CATEGORIES.filter((c) => summary[c.key].length > 0)
  const p = summary.playlists
  const playlists = (
    [
      [p.created.length, 'created'],
      [p.updated.length, 'updated'],
      [p.deleted.length, 'deleted']
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${label}: ${n}`)
  return (
    <Stack>
      {categories.length === 0 && <Text>No songs changed.</Text>}
      <Accordion multiple variant="separated">
        {categories.map((c) => (
          <Accordion.Item key={c.key} value={c.key}>
            <Accordion.Control>{`${c.label} (${summary[c.key].length})`}</Accordion.Control>
            <Accordion.Panel>
              <ScrollArea.Autosize mah={200}>
                <List size="sm">
                  {summary[c.key].map((item) => (
                    <List.Item key={item.path}>
                      {fileName(item.path)}
                      {item.detail && (
                        <Text span size="xs" c="dimmed">{` — ${item.detail}`}</Text>
                      )}
                    </List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {summary.skipped.map((s) => (
        <Text key={s.reason} size="sm" c="dimmed">{`Skipped — ${s.reason}: ${s.count}`}</Text>
      ))}
      {playlists.length > 0 && <Text size="sm">{`Playlists — ${playlists.join(', ')}`}</Text>}
    </Stack>
  )
}
```

`src/renderer/src/apple-sync/AppleSyncDialog.tsx`:

```tsx
import { Alert, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import ImportMappingFields from '../import/ImportMappingFields'
import ImportProgressStep from '../import/ImportProgressStep'
import TagPreviewTable from '../import/TagPreviewTable'
import MirrorDecisionsStep from './MirrorDecisionsStep'
import SyncSummaryView from './SyncSummaryView'
import type { AppleSyncFlow } from './useAppleSyncFlow'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export const NOT_ALLOWED = "Folk Dance Player isn't allowed to read your Music library"

// The turn-on dialog (sync spec §5.8).
export default function AppleSyncDialog(props: {
  flow: AppleSyncFlow
  api: RendererApi
}): React.JSX.Element {
  const { flow, api } = props
  const { state } = flow
  const busy = state.step === 'reading' || state.step === 'running'
  const close = (
    <Group justify="flex-end">
      <Button onClick={flow.close}>Close</Button>
    </Group>
  )
  return (
    <Modal
      opened={state.step !== 'closed'}
      onClose={flow.close}
      title="Sync with Apple Music"
      size="lg"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      {state.step === 'explain' && (
        <Stack>
          <Text size="sm">
            Folk Dance Player will read your Music library and keep its songs and playlists in step
            with it: when it starts, when you switch back to it, and when you choose Sync now.
          </Text>
          <Text size="sm">
            Music stays the place to edit tags and build playlists; Music&apos;s playlists appear
            here read-only. Your dances, programs, notes, slides, favorites and your own playlists
            stay yours.
          </Text>
          <Text size="sm">
            macOS will ask whether Folk Dance Player may access Media &amp; Apple Music.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => void flow.read()}>Continue</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'reading' && (
        <Group>
          <Loader size="sm" />
          <Text>Reading your Music library…</Text>
        </Group>
      )}
      {state.step === 'denied' && (
        <Stack>
          <Alert color="yellow">
            {NOT_ALLOWED}. Allow it in System Settings → Privacy &amp; Security → Media &amp; Apple
            Music, then turn sync on again.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => void api.invoke('appleSync:openPrivacySettings')}>
              Open Privacy Settings
            </Button>
            <Button onClick={flow.close}>Close</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'error' && (
        <Stack>
          <Alert color="red">{state.message}</Alert>
          {close}
        </Stack>
      )}
      {state.step === 'mapping' && flow.mapping && (
        <Stack>
          <Text size="sm">
            {`${plural(state.preview.trackCount, 'song', 'songs')} and ${plural(state.preview.playlists.length, 'playlist', 'playlists')} will be synced. Choose where Music's tags go:`}
          </Text>
          <ImportMappingFields value={flow.mapping} onChange={flow.setMapping} />
          <TagPreviewTable rows={state.preview.tagSample.map((t, i) => ({ ...t, key: i }))} />
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => void flow.confirmMapping(state.conflicts)}>Start sync</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'decisions' && (
        <MirrorDecisionsStep
          conflicts={state.conflicts}
          onStart={(decisions) => void flow.start(decisions)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'running' && (
        <ImportProgressStep progress={state.progress} cancelling={false} />
      )}
      {state.step === 'summary' && (
        <Stack>
          <SyncSummaryView summary={state.summary} />
          <Group justify="flex-end">
            <Button onClick={flow.close}>Done</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'paused' && (
        <Stack>
          <Text fw={500}>Music has a different library open</Text>
          <Text size="sm">
            It isn&apos;t the library that was synced before. Keep waiting until Music has that
            library open again, or switch: songs from the old library go to Removed from Apple
            Music for you to keep or remove.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Keep waiting
            </Button>
            <Button
              onClick={() => {
                void api.invoke('appleSync:switchLibrary')
                flow.close()
              }}
            >
              Switch to this library
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
```

`src/renderer/src/apple-sync/AppleMusicSection.tsx`:

```tsx
import { useState } from 'react'
import { Button, Group, Modal, Stack, Switch, Text, Title } from '@mantine/core'
import { syncParts, type AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import ConfirmDialog from '../components/ConfirmDialog'
import AppleSyncDialog, { NOT_ALLOWED } from './AppleSyncDialog'
import SyncSummaryView from './SyncSummaryView'
import { useAppleSync } from './useAppleSync'
import { useAppleSyncFlow } from './useAppleSyncFlow'

const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Settings → Apple Music (sync spec §6.1). macOS only: hidden where sync isn't available.
export default function AppleMusicSection({ api }: { api: RendererApi }): React.JSX.Element | null {
  const status = useAppleSync(api)
  const flow = useAppleSyncFlow(api)
  const [confirmOff, setConfirmOff] = useState(false)
  const [details, setDetails] = useState(false)
  if (!status?.available) return null
  const on = status.state !== 'off'

  return (
    <Stack gap="xs">
      <Title order={4}>Apple Music</Title>
      <Switch
        label="Sync with Apple Music"
        description="Keeps your songs and Music's playlists in step with the Music app."
        checked={on}
        onChange={(e) => (e.currentTarget.checked ? flow.open() : setConfirmOff(true))}
      />
      {on && (
        <StatusLine status={status} api={api} onDetails={() => setDetails(true)} />
      )}
      {on && (
        <Group>
          <Button
            variant="default"
            loading={status.state === 'syncing'}
            onClick={() => void api.invoke('appleSync:syncNow')}
          >
            Sync now
          </Button>
        </Group>
      )}
      <AppleSyncDialog flow={flow} api={api} />
      <ConfirmDialog
        opened={confirmOff}
        title="Turn off Sync with Apple Music?"
        message="Songs and playlists stay; playlists become editable."
        confirmLabel="Turn off"
        onConfirm={() => void api.invoke('appleSync:disable')}
        onClose={() => setConfirmOff(false)}
      />
      <Modal opened={details} onClose={() => setDetails(false)} title="Last sync" size="lg">
        {status.lastResult && <SyncSummaryView summary={status.lastResult} />}
      </Modal>
    </Stack>
  )
}

function StatusLine(props: {
  status: AppleSyncStatus
  api: RendererApi
  onDetails: () => void
}): React.JSX.Element {
  const { status, api } = props
  if (status.state === 'syncing') return <Text size="sm">Syncing…</Text>
  if (status.state === 'paused-other-library') {
    return (
      <Group gap="sm">
        <Text size="sm">Paused: Music has a different library open</Text>
        <Button size="xs" variant="default" onClick={() => void api.invoke('appleSync:switchLibrary')}>
          Switch to this library
        </Button>
      </Group>
    )
  }
  if (status.state === 'paused-denied') {
    return (
      <Group gap="sm">
        <Text size="sm">{NOT_ALLOWED}</Text>
        <Button
          size="xs"
          variant="default"
          onClick={() => void api.invoke('appleSync:openPrivacySettings')}
        >
          Open Privacy Settings
        </Button>
      </Group>
    )
  }
  if (!status.lastResult) return <Text size="sm">Not synced yet</Text>
  const parts = [
    ...syncParts(status.lastResult),
    ...(status.reviewCount > 0 ? [`${status.reviewCount} to review`] : [])
  ]
  return (
    <Group gap="sm">
      <Text size="sm">
        {`Last synced ${time(status.lastResult.finishedAt)} — ${parts.length ? parts.join(', ') : 'no changes'}`}
      </Text>
      <Button size="xs" variant="subtle" onClick={props.onDetails}>
        Details
      </Button>
    </Group>
  )
}
```

`src/renderer/src/pages/SettingsPage.tsx`: render `<AppleMusicSection api={api} />` right after
the Import section (the mapping stays where it is, sync spec §6.1).

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run tests/renderer && npm run typecheck`
Expected: PASS. If the radio group isn't found by `role: 'radiogroup', name`, find it by its label
text instead; keep the assertion on what each radio says.

- [ ] **Step 7: Commit**

CHANGELOG (Unreleased → Added):

```markdown
- **Sync with Apple Music** (Settings → Apple Music, on a Mac): reads your Music library directly, with no Library.xml export, and keeps songs and playlists in step when the app starts, when you switch back to it, and with Sync now (File → Sync with Apple Music, ⌘⇧S). Tags follow Music unless you edited the field here, and a message says what each sync changed.
```

```bash
git add src/renderer tests/renderer CHANGELOG.md
git commit -m "feat(sync): Settings → Apple Music, with the turn-on dialog and status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The review list

Sync spec §6.2 (LIBRARY → Removed from Apple Music (N)) and §5.5 (its actions). Also hides Import
from Apple Music… while sync is on (§5.7).

**Files:**
- Modify: `src/renderer/src/components/sidebar/LibrarySection.tsx`,
  `src/renderer/src/pages/MusicPage.tsx`, `src/renderer/src/library/LibraryTable.tsx`
- Test: `tests/renderer/library/sidebar.test.tsx`, `tests/renderer/library/music-page.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `useAppleSync` (Task 14), the `{ kind: 'review' }` filter (Task 2),
  `appleSync:resolve` / `appleSync:resolveAll` (Task 13).

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/library/sidebar.test.tsx` (with the file's render helper and fake API):

```tsx
describe('Removed from Apple Music (sync spec §6.2)', () => {
  const syncing = (reviewCount: number) => ({
    'appleSync:status': { available: true, state: 'idle', lastResult: null, reviewCount }
  })

  test('appears only while songs wait for review, and filters the library', async () => {
    const { fake, user } = renderSidebar(syncing(2))
    await user.click(await screen.findByRole('link', { name: 'Removed from Apple Music (2)' }))
    expect(fake.callsTo('library:list').at(-1)?.[0]).toMatchObject({ filter: { kind: 'review' } })
  })

  test('is hidden when the list is empty', async () => {
    renderSidebar(syncing(0))
    await screen.findByRole('link', { name: '♪ All Music' })
    expect(screen.queryByText(/Removed from Apple Music/)).not.toBeInTheDocument()
  })

  test('emptying the list returns to All Music', async () => {
    const { fake, user } = renderSidebar(syncing(1))
    await user.click(await screen.findByRole('link', { name: 'Removed from Apple Music (1)' }))
    fake.emit('appleSync:state', { available: true, state: 'idle', lastResult: null, reviewCount: 0 })
    await waitFor(() =>
      expect(fake.callsTo('library:list').at(-1)?.[0]).toMatchObject({ filter: { kind: 'all' } })
    )
  })
})
```

Use the file's own names for its render helper (`renderSidebar` here) and for how a filter entry is
found (NavLink renders as a link or button; match what the file's existing tests use).

In `tests/renderer/library/music-page.test.tsx`:

```tsx
describe('the review list (sync spec §5.5)', () => {
  const gone = [
    row({ songId: 1, fileId: 11, title: 'Kolo', isMissing: false }),
    row({ songId: 2, fileId: 12, title: 'Hora', isMissing: true })
  ]

  test('notes each file, and Keep / Remove act on the selection', async () => {
    const { fake, user } = await renderMusicPage({ 'library:list': gone }, { kind: 'review' })
    expect(await screen.findByText('File still on disk')).toBeInTheDocument()
    expect(screen.getByText('File gone')).toBeInTheDocument()
    await user.click(screen.getByText('Kolo'))
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(fake.callsTo('appleSync:resolve')).toEqual([[[11], 'keep']])
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(fake.callsTo('appleSync:resolve').at(-1)).toEqual([[11], 'remove'])
  })

  test('Keep all acts at once; Remove all asks first', async () => {
    const { fake, user } = await renderMusicPage({ 'library:list': gone }, { kind: 'review' })
    await user.click(await screen.findByRole('button', { name: 'Keep all' }))
    expect(fake.callsTo('appleSync:resolveAll')).toEqual([['keep']])
    await user.click(screen.getByRole('button', { name: 'Remove all' }))
    await user.click(await screen.findByRole('button', { name: 'Remove 2 songs' }))
    expect(fake.callsTo('appleSync:resolveAll').at(-1)).toEqual(['remove'])
  })

  test('Import from Apple Music… is hidden while sync is on', async () => {
    await renderMusicPage({
      'appleSync:status': { available: true, state: 'idle', lastResult: null, reviewCount: 0 }
    })
    await screen.findByRole('button', { name: 'Add Music…' })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Import from Apple Music…' })).not.toBeInTheDocument()
    )
  })
})
```

Adapt `row(...)` and `renderMusicPage(handlers, filter)` to the file's existing helpers (add a
starting-filter parameter that calls `store.getState().setFilter(filter)` if there is none).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library`
Expected: FAIL.

- [ ] **Step 3: Add the sidebar entry**

`LibrarySection.tsx`:

```tsx
import { useEffect } from 'react'
import { useAppleSync } from '../../apple-sync/useAppleSync'
import { useLibrary, useLibraryApi } from '../../library/LibraryProvider'
import DropTarget from './DropTarget'
import FilterEntry from './FilterEntry'
import SectionHeading from './SectionHeading'

// Spec §6.1 LIBRARY: All Music and Favorites (songs dropped on Favorites become favorites), and,
// while songs wait for review, Removed from Apple Music (sync spec §6.2).
export default function LibrarySection(): React.JSX.Element {
  const api = useLibraryApi()
  const reviewCount = useAppleSync(api)?.reviewCount ?? 0
  const filter = useLibrary((s) => s.filter)
  const setFilter = useLibrary((s) => s.setFilter)
  useEffect(() => {
    if (filter.kind === 'review' && reviewCount === 0) void setFilter({ kind: 'all' })
  }, [filter.kind, reviewCount, setFilter])
  return (
    <>
      <SectionHeading>Library</SectionHeading>
      <FilterEntry label="♪ All Music" filter={{ kind: 'all' }} />
      <DropTarget onFiles={(ids) => void api.invoke('library:setFavorite', ids, true)}>
        <FilterEntry label="★ Favorites" filter={{ kind: 'favorites' }} />
      </DropTarget>
      {reviewCount > 0 && (
        <FilterEntry label={`Removed from Apple Music (${reviewCount})`} filter={{ kind: 'review' }} />
      )}
    </>
  )
}
```

The count arrives with `appleSync:state`, which main sends after every sync and every Keep or
Remove (Task 12's `resolve` emits the status), so the entry and the filter stay current.

- [ ] **Step 4: Add the file note column**

`LibraryTable.tsx`, beside `NUMBER_COLUMN`:

```tsx
// In the review list: whether the song's file is still on disk (sync spec §6.2).
const FILE_COLUMN: Column = {
  sort: null,
  label: 'File',
  render: (r) => (
    <Text span size="xs" c="dimmed">
      {r.isMissing ? 'File gone' : 'File still on disk'}
    </Text>
  )
}
```

And add it after the other columns when `filter.kind === 'review'`:

```tsx
  const COLUMNS = [
    ...(inPlaylist ? [NUMBER_COLUMN] : []),
    ...(compact ? COMPACT_COLUMNS : ALL_COLUMNS),
    ...(filter.kind === 'review' ? [FILE_COLUMN] : [])
  ]
```

- [ ] **Step 5: Add the toolbar, and hide the Library.xml import while syncing**

`MusicPage.tsx`:

```tsx
  const sync = useAppleSync(api)
  const syncOn = sync !== null && sync.state !== 'off'
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false)
```

Show "Import from Apple Music…" only when `!syncOn`. Below the search row, when
`filter.kind === 'review'`:

```tsx
      {filter.kind === 'review' && (
        <Group>
          <Text size="sm" c="dimmed">
            Apple Music no longer has these songs. Keep them as your own songs, or remove them from
            the library (their dances, notes and history are kept, and come back if the file is
            added again).
          </Text>
          <Button
            variant="default"
            disabled={selectedRows.length === 0}
            onClick={() =>
              act(() => api.invoke('appleSync:resolve', selectedRows.map((r) => r.fileId), 'keep'))
            }
          >
            Keep
          </Button>
          <Button
            variant="default"
            disabled={selectedRows.length === 0}
            onClick={() =>
              act(() => api.invoke('appleSync:resolve', selectedRows.map((r) => r.fileId), 'remove'))
            }
          >
            Remove
          </Button>
          <Button variant="default" onClick={() => act(() => api.invoke('appleSync:resolveAll', 'keep'))}>
            Keep all
          </Button>
          <Button variant="default" color="red" onClick={() => setConfirmRemoveAll(true)}>
            Remove all
          </Button>
        </Group>
      )}
```

And beside the other dialogs:

```tsx
      <ConfirmDialog
        opened={confirmRemoveAll}
        title="Remove all these songs?"
        message="They leave the library. Their dances, notes and history are kept, and come back if the same file is added again."
        confirmLabel={`Remove ${rows.length} ${rows.length === 1 ? 'song' : 'songs'}`}
        danger
        onConfirm={() => act(() => api.invoke('appleSync:resolveAll', 'remove'))}
        onClose={() => setConfirmRemoveAll(false)}
      />
```

(Import `ConfirmDialog` from `../components/ConfirmDialog`, `useAppleSync` from
`../apple-sync/useAppleSync`.)

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run tests/renderer && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

CHANGELOG (Unreleased → Added):

```markdown
- Songs deleted from Music wait in **Removed from Apple Music** (in the sidebar) until you keep or remove them; sync never deletes a song by itself.
```

```bash
git add src/renderer tests/renderer CHANGELOG.md
git commit -m "feat(sync): Removed from Apple Music, with Keep and Remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Folders and read-only mirrors in the sidebar

Sync spec §6.2 (PLAYLISTS: collapsible folders, mirrors with an Apple Music mark, local playlists
after) and §6.3 (read-only mirrors).

**Files:**
- Create: `src/renderer/src/components/sidebar/PlaylistTree.tsx`
- Modify: `src/renderer/src/components/sidebar/PlaylistsSection.tsx`,
  `src/renderer/src/library/library-store.ts`, `src/renderer/src/library/LibraryTable.tsx`,
  `src/renderer/src/pages/MusicPage.tsx`, `src/renderer/src/components/icons.tsx`
- Test: `tests/renderer/library/sidebar.test.tsx`, `tests/renderer/library/library-store.test.ts`,
  `tests/renderer/library/music-page.test.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `PlaylistFolder` (Task 1), `PlaylistSummary.mirror`/`folderId` (Task 9),
  `playlists:folders` (Task 13), `notifications` (Task 14), the `playlistFolders.open` setting.
- Produces:
  ```ts
  // library-store.ts: LibraryState gains
  folders: PlaylistFolder[]
  // PlaylistTree.tsx
  export interface FolderNode { folder: PlaylistFolder; folders: FolderNode[]; playlists: PlaylistSummary[] }
  export function buildTree(folders: PlaylistFolder[], playlists: PlaylistSummary[]): { folders: FolderNode[]; playlists: PlaylistSummary[] }
  export const MusicNoteIcon  // icons.tsx
  ```

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/library/library-store.test.ts`:

```ts
test('refresh loads Music folders with the playlists', async () => {
  const folders = [{ id: 1, name: 'IFD', parentId: null, persistentId: 'FFFFFFFFFFFFFFF1' }]
  const fake = createFakeApi({ 'playlists:folders': folders })
  const store = createLibraryStore(fake.api)
  await store.getState().refresh()
  expect(store.getState().folders).toEqual(folders)
})
```

In `tests/renderer/library/sidebar.test.tsx`:

```tsx
describe('Music folders and mirrors (sync spec §6.2, §6.3)', () => {
  const folders = [
    { id: 1, name: 'IFD2026', parentId: null, persistentId: 'FFFFFFFFFFFFFFF1' },
    { id: 2, name: 'Week 3', parentId: 1, persistentId: 'FFFFFFFFFFFFFFF2' }
  ]
  const playlists = [
    { id: 10, name: 'Monday', source: 'apple_xml', itemCount: 5, mirror: true, folderId: 2 },
    { id: 11, name: 'Loose', source: 'apple_xml', itemCount: 2, mirror: true, folderId: null },
    { id: 12, name: 'Mine', source: 'local', itemCount: 1, mirror: false, folderId: null }
  ]
  const handlers = { 'playlists:folders': folders, 'playlists:list': playlists }

  test('folders collapse, open state is saved, and mirrors come before local playlists', async () => {
    const { fake, user } = renderSidebar(handlers)
    const group = await screen.findByRole('group', { name: 'Playlists' })
    const names = within(group).getAllByRole('link').map((l) => l.textContent)
    expect(names.slice(-2)).toEqual(['Loose', 'Mine'])
    expect(within(group).queryByText('Monday')).not.toBeInTheDocument()
    await user.click(within(group).getByText('IFD2026'))
    await user.click(within(group).getByText('Week 3'))
    expect(await within(group).findByText('Monday')).toBeInTheDocument()
    expect(fake.settings['playlistFolders.open']).toEqual(['FFFFFFFFFFFFFFF1', 'FFFFFFFFFFFFFFF2'])
  })

  test('a folder remembered open starts open', async () => {
    const fake = { 'settings:getAll': { ...DEFAULT_SETTINGS, 'playlistFolders.open': ['FFFFFFFFFFFFFFF1', 'FFFFFFFFFFFFFFF2'] } }
    renderSidebar({ ...handlers, ...fake })
    expect(await screen.findByText('Monday')).toBeInTheDocument()
  })

  test('a mirror has an Apple Music mark and only "Duplicate as my playlist"', async () => {
    const { fake, user } = renderSidebar(handlers)
    expect(await screen.findByLabelText('Apple Music playlist')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Options for Loose' }))
    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate as my playlist' }))
    expect(fake.callsTo('playlists:duplicate')).toEqual([[11]])
  })

  test('dropping songs on a mirror says to edit it in Music', async () => {
    const { fake } = renderSidebar(handlers)
    const loose = await screen.findByText('Loose')
    dropFiles(loose, [1, 2]) // the file's existing drop helper
    expect(await screen.findByText('Edit this playlist in Music.')).toBeInTheDocument()
    expect(fake.callsTo('playlists:add')).toEqual([])
  })
})
```

In `tests/renderer/library/music-page.test.tsx`:

```tsx
test('a mirror has no Remove from playlist', async () => {
  const { user } = await renderMusicPage(
    {
      'library:list': [row({ songId: 1, fileId: 11, title: 'Kolo', playlistItemId: 5 })],
      'playlists:list': [{ id: 10, name: 'Loose', source: 'apple_xml', itemCount: 1, mirror: true, folderId: null }]
    },
    { kind: 'playlist', playlistId: 10 }
  )
  await user.click(await screen.findByText('Kolo'))
  expect(screen.queryByRole('button', { name: 'Remove from playlist' })).not.toBeInTheDocument()
})
```

Use the sidebar test file's own drop helper (or build a `DataTransfer` with `FILES_MIME` the way its
existing drop tests do) in place of `dropFiles`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/library`
Expected: FAIL.

- [ ] **Step 3: Load folders in the store**

`library-store.ts`: add `folders: PlaylistFolder[]` to `LibraryState` (initially `[]`), fetch it in
`refresh()` alongside the playlists:

```ts
      const [rows, playlists, folders] = await Promise.all([
        api.invoke('library:list', { search, filter, sort }),
        api.invoke('playlists:list'),
        api.invoke('playlists:folders')
      ])
```

and include `folders` in the `set(...)`.

- [ ] **Step 4: Add the icon**

`components/icons.tsx`:

```tsx
// The mark on a mirror of an Apple Music playlist (sync spec §6.2).
export const MusicNoteIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 18V6.5l10-2.5v11.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </Icon>
)
```

- [ ] **Step 5: Write the tree**

`src/renderer/src/components/sidebar/PlaylistTree.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { NavLink } from '@mantine/core'
import type { PlaylistFolder } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import type { PlaylistSummary } from '@shared/library'

export interface FolderNode {
  folder: PlaylistFolder
  folders: FolderNode[]
  playlists: PlaylistSummary[]
}

// Music's folders as a tree (sync spec §6.2). Folders keep Music's order; playlists keep the list's
// order (mirrors, then local). A playlist whose folder is gone shows at the top level.
export function buildTree(
  folders: PlaylistFolder[],
  playlists: PlaylistSummary[]
): { folders: FolderNode[]; playlists: PlaylistSummary[] } {
  const nodes = new Map(folders.map((f) => [f.id, { folder: f, folders: [], playlists: [] } as FolderNode]))
  const top: FolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId)
    ;(parent ? parent.folders : top).push(node)
  }
  const loose: PlaylistSummary[] = []
  for (const p of playlists) {
    const folder = p.folderId === null ? undefined : nodes.get(p.folderId)
    ;(folder ? folder.playlists : loose).push(p)
  }
  return { folders: top, playlists: loose }
}

// Which folders are open, by persistent ID, saved in the playlistFolders.open setting.
export function useOpenFolders(api: RendererApi): [Set<string>, (id: string) => void] {
  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => {
    void api.invoke('settings:getAll').then((s) => setOpen(new Set(s['playlistFolders.open'])))
  }, [api])
  const toggle = (id: string): void => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      void api.invoke('settings:set', 'playlistFolders.open', [...next])
      return next
    })
  }
  return [open, toggle]
}

// A collapsible folder; not selectable as a playlist.
export function FolderEntry(props: {
  node: FolderNode
  open: Set<string>
  onToggle: (id: string) => void
  renderPlaylist: (p: PlaylistSummary) => React.ReactNode
}): React.JSX.Element {
  const { node, open, onToggle, renderPlaylist } = props
  const id = node.folder.persistentId
  return (
    <NavLink
      label={node.folder.name}
      opened={id !== null && open.has(id)}
      onChange={() => id !== null && onToggle(id)}
      childrenOffset="sm"
    >
      {node.folders.map((child) => (
        <FolderEntry key={child.folder.id} {...props} node={child} />
      ))}
      {node.playlists.map(renderPlaylist)}
    </NavLink>
  )
}
```

The `setOpen` updater calls `settings:set` once per toggle; under StrictMode's double invocation in
development it may save twice with the same value, which is harmless. If a test counts calls, move
the save out of the updater into `toggle` after computing `next` from the current state.

- [ ] **Step 6: Use it in the playlists section**

`PlaylistsSection.tsx`:
- Read `folders` from the store (`useLibrary((s) => s.folders)`) and render
  `buildTree(folders, playlists)`: each top-level folder as a `<FolderEntry>`, then the top-level
  playlists; `renderPlaylist` renders the existing `<PlaylistEntry>`.
- In `PlaylistEntry`, for `p.mirror`:
  - the `extra` mark is `<span aria-label="Apple Music playlist" title="Synced from Apple Music"><MusicNoteIcon size={12} /></span>`
    (local Library.xml playlists keep their current mark);
  - the drop target shows a notice instead of adding:
    ```tsx
    <DropTarget
      onFiles={(ids) =>
        p.mirror
          ? notifications.show({ message: 'Edit this playlist in Music.', color: 'yellow' })
          : void api.invoke('playlists:add', p.id, ids)
      }
    >
    ```
  - the menu has only **Duplicate as my playlist** (`playlists:duplicate`); Rename… and Delete… are
    for local playlists only.

- [ ] **Step 7: Read-only mirrors on the Music page**

`LibraryTable.tsx`: a mirror can't be reordered or dropped onto:

```tsx
  const playlists = useLibrary((s) => s.playlists)
  const mirror =
    filter.kind === 'playlist' && playlists.some((p) => p.id === filter.playlistId && p.mirror)
  const reorderable =
    filter.kind === 'playlist' && !mirror && sort.column === 'position' && search === ''
```

`MusicPage.tsx`: show "Remove from playlist" only when the current playlist isn't a mirror (the same
`mirror` test, from the store's `playlists`).

- [ ] **Step 8: Run the tests and checks**

Run: `npx vitest run tests/renderer && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

CHANGELOG (Unreleased → Added):

```markdown
- Music's playlists appear in the sidebar in their folders, read-only, marked with a note; **Duplicate as my playlist** makes a copy you can edit.
```

```bash
git add src/renderer tests/renderer CHANGELOG.md
git commit -m "feat(sync): Music's folders and read-only playlists in the sidebar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: End-to-end: turn sync on, change Music, focus the app

Sync spec §8 "End-to-end".

**Files:**
- Modify: `e2e/app.ts`, `e2e/app.spec.ts`

**Interfaces:**
- Consumes: everything above; `FDP_APPLE_LIBRARY` (Task 13).
- Produces: `launch(userData, env?)` takes extra environment variables; `appleSnapshot(...)` writes
  a snapshot file for the workspace's songs.

- [ ] **Step 1: Extend the helpers**

`e2e/app.ts`:

```ts
// Starts the app on the library in `userData`, with any extra environment (FDP_APPLE_LIBRARY…).
export async function launch(
  userData: string,
  extraEnv: Record<string, string> = {}
): Promise<Running> {
  const env = { ...process.env, FDP_USER_DATA: userData, ...extraEnv } as Record<string, string>
```

(the rest unchanged), and:

```ts
export interface FakeMusicTrack {
  id: number // becomes the persistent ID
  title: string // the workspace song's title (its file is <music>/<title>.mp3)
  genre?: string
}

// Writes a Music library snapshot (sync spec §3.1) at `path`, for FDP_APPLE_LIBRARY. Read fresh on
// every sync, so a test changes the "Music library" by writing it again.
export function writeAppleSnapshot(
  path: string,
  music: string,
  tracks: FakeMusicTrack[],
  playlists: { id: number; name: string; folder?: string; trackIds: number[] }[] = []
): void {
  const pid = (n: number) => n.toString(16).toUpperCase().padStart(16, '0')
  const folders = [...new Set(playlists.flatMap((p) => (p.folder ? [p.folder] : [])))]
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      libraryId: 'AAAAAAAAAAAAAAA1',
      tracks: tracks.map((t) => ({
        persistentId: pid(t.id),
        location: pathToFileURL(join(music, `${t.title}.mp3`)).href,
        locationType: 'file',
        mediaKind: 'music',
        kind: 'MPEG audio file',
        title: t.title,
        artist: null,
        albumArtist: null,
        genre: t.genre ?? null,
        durationMs: 30000
      })),
      folders: folders.map((name, i) => ({ persistentId: pid(0xf000 + i), name, parentId: null })),
      playlists: playlists.map((p) => ({
        persistentId: pid(0xa000 + p.id),
        name: p.name,
        parentId: p.folder ? pid(0xf000 + folders.indexOf(p.folder)) : null,
        itemIds: p.trackIds.map(pid)
      }))
    })
  )
}
```

(Import `pathToFileURL` from `node:url`.)

- [ ] **Step 2: Write the test**

`e2e/app.spec.ts`, following the file's other tests (their `workspace`, cleanup and `run.app.close()`
pattern):

```ts
test('sync with Apple Music: turn on, change Music, then focus', async () => {
  const ws = workspace([{ title: 'Kolo' }, { title: 'Hora' }])
  const library = join(ws.userData, '..', 'music-library.json')
  const week = [{ id: 1, name: 'Week 3', folder: 'IFD2026', trackIds: [2, 1] }]
  writeAppleSnapshot(library, ws.music, [{ id: 1, title: 'Kolo', genre: 'Serbia' }, { id: 2, title: 'Hora' }], week)
  const run = await launch(ws.userData, { FDP_APPLE_LIBRARY: library })
  try {
    const { page } = run
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('switch', { name: 'Sync with Apple Music' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Start sync', exact: true }).click()
    await expect(page.getByText('Added (2)')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('tab', { name: 'Music' }).click()
    await page.getByText('IFD2026').click()
    await expect(page.getByText('Week 3')).toBeVisible()
    await expect(page.getByLabel('Apple Music playlist')).toBeVisible()

    // In Music: Kolo's genre changes and Hora is deleted.
    writeAppleSnapshot(library, ws.music, [{ id: 1, title: 'Kolo', genre: 'Macedonia' }], [
      { ...week[0], trackIds: [1] }
    ])
    // Focus syncs at most every 10 s (sync spec §3.3).
    await page.waitForTimeout(10_500)
    await run.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Folk Dance Player')
        ?.emit('focus')
    })
    await expect(
      page.getByText('Synced with Apple Music: 1 updated, 1 playlist changed · 1 to review')
    ).toBeVisible()
    await page.getByRole('link', { name: 'Removed from Apple Music (1)' }).click()
    await expect(page.getByText('Hora')).toBeVisible()
    await expect(page.getByText('File still on disk')).toBeVisible()
  } finally {
    await run.app.close()
    ws.cleanup()
  }
})
```

Match the sidebar entry's role (`link` or `button`) to what the other e2e tests use for sidebar
entries.

- [ ] **Step 3: Ask, then run the end-to-end tests**

Ask the user before running: the tests open the app's windows on their screen.

Run: `npm run test:e2e`
Expected: PASS, including the new test (about 15 s longer for the focus interval).

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): turn on Apple Music sync, change the library, focus the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Docs, decisions and the hardware checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`,
  `docs/superpowers/specs/2026-10-15-apple-music-sync-design.md`, `AGENTS.md`,
  `docs/manual-testing/pre-release-hardware.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update the main spec**

- §4 (data model): the migration 004 columns and table, in the spec's table style (the sync spec §4
  has the wording), and the four new settings keys under "Settings keys".
- §5.4: add "While Apple Music sync is on, a file matching a synced song (by path or fingerprint) is
  skipped as **Already in library (Apple Music)**; a removed song added again is restored. The
  summary gains Restored and Already in library (Apple Music)."
- §6.1 (sidebar): LIBRARY → Removed from Apple Music (N); PLAYLISTS → Music's folders (collapsible)
  and mirrors (read-only, marked) before local playlists.
- §6.2 / §7.2: a removed song in a program is shown greyed, labeled "removed", and skipped like a
  missing file.
- §6.3: Import from Apple Music… is hidden while sync is on; mirrors can't be reordered or edited.
- §6.4 (Settings): the Apple Music section.
- §9 (architecture): `src/main/apple-sync/` and the bundled helper (`native/music-library/`,
  `Contents/Resources/fdp-music-library`).
- §10.2 (testing): the sync tests and the e2e test.

- [ ] **Step 2: Update the sync spec**

Set **Status** to "Implemented (Plan 10)". In §5.8 step 4, add: "Asked before the first sync, right
after the mapping step, because the first sync writes the mirrors." In §5.3, replace "tags read from
the file for the raw `tag_*` columns" with "size, mtime, duration and the fingerprint read from the
file; the tags are Music's". In §3.2, add the 5-minute read while turning sync on.

- [ ] **Step 3: Add the decisions to AGENTS.md**

At the top of Decisions (newest first), dated the day of the commit:

- **— Sync with Apple Music is `src/main/apple-sync/`: pure modules over the database, a Swift helper, and `AppleSync`.** `parseSnapshot`/`sortTracks` (the snapshot), `createHelperSource`/`createFileSource` (`FDP_APPLE_LIBRARY` for dev and e2e), `applyMusicTags` (the baseline rule), `findSyncRow`/`saveSyncedTrack` (matching), `syncPlaylists`, `markGone` and the review actions, `runSync` (the engine) and `AppleSync` (triggers, states, notices). Only `index.ts` touches Electron. The helper's enum names were checked against the SDK headers; it compiles for `macos12.0` (Electron 44's minimum, and `isPrimary` needs it). _Rejected:_ a native Node add-on; scripting Music's XML export (sync spec §2).
- **— A sync reads only new, moved or changed files.** "Unchanged" is the same path (NFC), size and mtime, from an async `stat` in main; that also finds deleted or replaced files without reading them. Files that are read use Music's tags (`KnownTags`), as `Library.xml` imports do; only size, mtime, duration and the fingerprint come from the file.
- **— Turning sync on reads the library with a 5-minute timeout** (`PERMISSION_TIMEOUT_MS`): the helper waits while macOS's permission dialog is up. Other reads keep 30 s. `execFile`'s `maxBuffer` is 256 MB (its 1 MB default fails above about 3,000 tracks).
- **— The playlist decisions for edited `Library.xml` playlists are asked before the first sync,** after the mapping step: the first sync writes the mirrors.
- **— A sync and an import never run together.** Both use the one import worker and write the same tables. A sync blocked by an import runs when the import finishes (`importFinished`); an import during a sync gets "A sync with Apple Music is running".
- **— Two Music tracks pointing at one file:** the first keeps it; the other is "unreadable" ("Another Apple Music track uses this file"), because `files.path` is unique.
- **— Toasts come from `@mantine/notifications`** (9.6.3, with `@mantine/core`), mounted once in `main.tsx`; sync's notices are sent by main once per occurrence (`appleSync:notice`).
- **— Open folders are the `playlistFolders.open` setting** (persistent IDs), so they survive restarts and turning sync off and on.
- **— The packaged app bundles `fdp-music-library` with `extraResources` and `x64ArchFiles`.** The binary is already Universal; without `x64ArchFiles` the Universal merge stops on a Mach-O file that is the same in both builds. `NSAppleMusicUsageDescription` comes from `extendInfo`; without it macOS refuses Music access silently.

- [ ] **Step 4: Add the hardware checks**

`docs/manual-testing/pre-release-hardware.md`: a new section after the last one, continuing the
step numbers:

```markdown
## H. Apple Music

Use a Mac whose Music library has local songs and playlists in a folder.

- [ ] N. Settings → Apple Music → **Sync with Apple Music**, Continue: macOS asks whether **Folk Dance Player** may access Media & Apple Music. Allow it: the mapping step shows your tags, and the first sync's summary lists your songs.
- [ ] N+1. The sidebar shows Music's folders (collapsible) and playlists, marked, before your own.
- [ ] N+2. In Music, change a song's genre, delete a song, and edit a playlist. Switch back to Folk Dance Player: within a few seconds a message says what changed, the deleted song is in **Removed from Apple Music**, and the playlist matches Music.
- [ ] N+3. Turn sync off, then on again, and choose **Don't Allow** if macOS asks (or turn access off in System Settings → Privacy & Security → Media & Apple Music first): Settings says Folk Dance Player isn't allowed to read your Music library, and **Open Privacy Settings** opens that page. (If it says sync failed instead, the helper's denial check needs the error the log shows.)
- [ ] N+4. After installing this release over the previous one, does macOS ask for Music access again? If it does, say so in the release notes.
```

(Replace N with the next step number.)

- [ ] **Step 5: README and CHANGELOG**

`README.md`: add Sync with Apple Music (macOS) to the feature list. Read `CHANGELOG.md`'s Unreleased
section as a whole: the lines from Tasks 2, 11, 15, 16 and 17 should read as one release's notes for
organizers; merge or reorder them if needed.

- [ ] **Step 6: Final checks**

Run: `npx prettier --check . && npm run typecheck && npm test && npx electron-vite build`
Expected: all pass.

Ask the user before running `npm run test:e2e` again, and before building the packaged app
(`npm run dist`) to check that the helper is in `Contents/Resources` and signed:

```bash
codesign --verify --verbose "dist/mac-universal/Folk Dance Player.app/Contents/Resources/fdp-music-library"
```

- [ ] **Step 7: Commit**

```bash
git add docs AGENTS.md README.md CHANGELOG.md
git commit -m "docs: Sync with Apple Music in the specs, decisions and hardware checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Changes after execution

**Executed natively in one session, rebased onto `main` after Plan 9 merged (b309a67).**

**Departures from the tasks (rulings made while executing):**
- **Test placement:** several tasks' tests went into new files rather than the existing ones named in the plan:
  - `tests/main/library/removed-songs.test.ts` and `tests/renderer/program/removed-songs.test.tsx`
  - `tests/main/import/sync-rules.test.ts` and `tests/renderer/import-summary.test.tsx`
  - `tests/main/ipc/apple-sync-handlers.test.ts`
  - `tests/renderer/library/review-list.test.tsx` and `tests/renderer/library/mirrors.test.tsx`
  - `readTracks` is tested in `tests/main/apple-sync/engine.test.ts`.
- **End-to-end test:** it is in its own `e2e/apple-sync.spec.ts`, because `app.spec.ts`'s `beforeEach` imports music first.
- **Sync switch:** Mantine puts a switch's description inside its label, so tests find the switch by the start of its name (`/^Sync with Apple Music/`).
- **"Copies of local songs" test:** it expects `relinked`, because its first path isn't on disk.

**Final review (a fresh reviewer): no Critical findings, 2 Important, 10 Minor.** Both Important findings were fixed:
- **Gone means "not in the snapshot".** A track Music still has but now skips (cloud-only, ALAC) doesn't send its song to review. Hardware check 22 covers the unplugged-drive case.
- **Keep all / Remove all act on the songs shown,** so a typed search narrows them, and the confirmation's count is what happens.

**The user went through the minors one by one, and fixed nine:**
1. Turning sync on waits for an off still in progress ("Waiting for the last sync to finish…").
2. No sync starts after sync is off.
3. The first sync waits for a running import and keeps the choices ("Waiting for the import to finish…").
4. A different library is found by `preview()` and asked about before the mapping step. `enable(decisions, switchLibrary)` adopts it.
5. A sync that changes only missing states refreshes the lists quietly (`SyncSummary.missingChanged`).
6. Rows matched before reading are claimed, so another track's audio match can't take them.
7. The dance picker and playlist numbers count only songs that are in the library.
8. Add Music… finding a review-list song counts as Keep. `importFinished()` re-sends the status, so the review count updates.
9. A shrink pause: a sync that would send more than half of synced songs, and at least 20, to review pauses. It offers **Sync anyway**, and resumes by itself when Music recovers.

**Deferred:** Minor 10, the 30 s timeout of launch and focus syncs if macOS asks for access again after an update. It waits for hardware check 21.

**Results:** 806 unit tests and 8 end-to-end tests pass.

**After the first hands-on test (chosen by the user):**
- **Sync moved to the Music page.** `AppleSyncSwitch` sits beside the import buttons; `AppleSyncStatusBar` (status line, Details, Sync now) sits below the toolbar while sync is on. The Settings section is gone; Settings keeps only the import mapping.
- **A highlight for menu targets.** `app:showPage` carries a `PageTarget`, and `<HighlightTarget>` pulses a border around the control. File → Sync with Apple Music, while sync is off, opens the Music page with the switch highlighted.
