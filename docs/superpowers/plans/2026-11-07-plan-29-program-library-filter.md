# Show a saved program in the library (Plan 29) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved program's songs can be shown in the library list from the program's menu in the sidebar (**Show in library**), narrowed, searched, sorted and selected like a playlist. The notice reads **Showing program "X"**; **Show all music** returns.

**Architecture:** One new `LibraryFilter` kind, `{ kind: 'program'; programId }`. `listLibrary` joins `program_items` (one row per song, at its first position) and reuses the playlist's `#` field and `position` sort. The library store opens it in program order, refreshes it on `programs:changed`, and clears it with a notice if the program is deleted. No migration, no new IPC channel, no new row field.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.7 (issue #83); §4 (no data change beyond the filter kind), §6 (docs).

## Global Constraints

- Main owns the data; the renderer filter is a query sent to `library:list` (AGENTS.md).
- Editing from the filtered view is out of scope: it is a view, like a playlist (spec §1). No reorder by drag, no remove-from-program.
- UI from Mantine; custom CSS only in `*.module.css`; no new Unicode symbols as icons.
- Test-first (Vitest); conventional commits; `CHANGELOG.md` line under Unreleased in the same commit.
- Run `prettier --check .`, `npm run typecheck`, `npm test`, `npm run build` (e2e is CI's job).
- Add fakes for any new channel call in `tests/renderer/fake-api.ts` (here `programs:get` for the store).

## Review Focus

1. A song twice in a program shows once, at its first position; STOP rows and items whose file was deleted (`file_id` NULL) add nothing.
2. Played and unplayed items both count.
3. `#` numbers are consecutive over the shown songs (removed songs skipped, as in a playlist).
4. Deleting the shown program clears the filter and says so; renaming updates the notice.
5. Drag from the filtered list works as from any other view (rows are plain library rows).

## Files touched

- `src/shared/library.ts`: `LibraryFilter` gains `{ kind: 'program'; programId: number }`; comment on `'position'` sort ("playlist or program order").
- `src/main/library/list.ts`: program join, `#`, `position` sort. (Also the other `playlistItemId`/`playlistNumber` consumers keep working: `playlistItemId` stays NULL for programs.)
- `src/renderer/src/library/library-store.ts`: `setFilter` (program opens in `PLAYLIST_SORT`), `reveal`, `watch` (`programs:changed`), deleted-program handling, program name for the note.
- `src/renderer/src/library/LibraryFilterNote.tsx`: **Showing program "X"**.
- `src/renderer/src/library/LibraryTable.tsx`: `NUMBER_COLUMN` shown for a program as for a playlist (`inPlaylist` becomes "has a position order"); drag-reorder stays playlist-only (line 264/286 already test `kind === 'playlist'`).
- `src/renderer/src/components/sidebar/ProgramsSection.tsx`: **Show in library** menu item (also reached by right-click, via the existing `onContextMenu`).
- `src/renderer/src/components/sidebar/FilterEntry.tsx` (`sameFilter`, line 6): compare program ids (only if the sidebar highlights the active filter for programs; otherwise untouched).
- Tests: `tests/main/library/list.test.ts`, `tests/renderer/library/library-store.test.ts`, `tests/renderer/program/programs-section.test.tsx`, a note test (new `tests/renderer/library/filter-note.test.tsx` or in `music-page.test.tsx`), `tests/renderer/fake-api.ts`.
- Docs (spec §6): main spec §6 Library and Program pages, `CHANGELOG.md`, hardware checklist line (showing a saved program, including a deleted one), an `AGENTS.md` decision.

## Tasks

### Task 1: `listLibrary` program filter (main)

- [ ] **Test first** in `tests/main/library/list.test.ts`: a program with songs A, B, STOP, A again, C (some played) lists A, B, C once each, `playlistNumber` 1, 2, 3, `playlistItemId` null; a removed song is skipped and numbers stay consecutive; a missing song is listed (`isMissing`); an item with `file_id` NULL is ignored; search narrows within it; `position` sort is program order, `desc` reverses; another sort works; an unknown program id gives `[]`.
- [ ] Implement: join `(SELECT file_id, MIN(position) AS position FROM program_items WHERE program_id = ? AND kind = 'track' AND file_id IS NOT NULL GROUP BY file_id) pg ON pg.file_id = f.id`; `#` = count of such rows with `position <=` among non-removed files; `SORT_SQL.position` uses `pi.position` today, so the sort expression becomes `pi.position` or `pg.position` by filter kind. Param order must match the `params.unshift` pattern already used.
- [ ] `npm test -- tests/main/library/list.test.ts`.

### Task 2: Store: open, refresh, deletion

- [ ] **Test first** in `library-store.test.ts`: `setFilter({kind:'program',programId})` sorts by `position`; leaving it returns to the default sort; `programs:changed` refetches while a program filter is on (and does nothing extra otherwise); when `programs:get` returns null the filter becomes `all`, the list is refetched, and a notice is shown (spy on `notifications.show`); `reveal` from a program filter that hides the song goes to All Music without the program sort.
- [ ] Implement. The store holds `programName: string | null` (read with `programs:get(programId)` during `refresh()` only when the filter is a program; null means gone). Decision: use `programs:get`, not the Program page's `programs` list, because that list is narrowed by the sidebar's program search.
- [ ] Subscribe to `programs:changed` in `watch()` (it returns one unsubscribe for both events).

### Task 3: Sidebar menu item and the note

- [ ] **Test first** in `programs-section.test.tsx`: the "Options for X" menu has **Show in library**; choosing it calls the library store's `setFilter` with the program filter (and does not load the program); right-click opens the menu. Note test: with a program filter the note reads `Showing program “X”` and **Show all music** clears it.
- [ ] Implement in `ProgramEntry` (uses `useLibrary`'s `setFilter`) and `LibraryFilterNote`.
- [ ] `LibraryTable`: show the `#` column for a program filter; confirm no reorder handlers fire for it (test beside `reorder.test.ts`).

### Task 4: Docs and finish

- [ ] `CHANGELOG.md` line; AGENTS.md decision (a saved program is a library filter, dedup by first position, `#` reuses the playlist fields, deleted program clears with a notice, a view not an editor); main spec §6 text; hardware checklist line.
- [ ] `prettier --check .`, `npm run typecheck`, `npm test`, `npm run build`.

## Risks

- **`'position'` is playlist-specific in several places** (store sort resets, `reveal`, `list.ts` fallback); each must treat "program" as a positioned filter or the sort silently falls back to Dance.
- **Shared filter between pages:** the Program page's compact library list reads the same store, so the filter and notice show there too (as a playlist's do). Check the Program page still lays out with the `#` column.
- **Deletion detection** relies on `programs:get` per refresh; a tour (practice context) must route it too (it does: handlers are per context). A program id from before a tour entry/exit is gone after the reload anyway.
- **Parallel work:** §3.5 and §3.9 also edit `LibraryTable.tsx` and `list.ts` (an icon column and widths); expect small merge conflicts in the same files.
- The `playlistNumber` field name is slightly wrong for programs. Renaming touches many files and the spec says no row changes, so it stays, with a comment.

## Open questions for the maintainer

1. **Order (spec open question 4).** Recommended: program order with `#` and that sort by default (like a playlist), other sorts still available. The alternative is the library's current sort with no `#`.
2. **Duplicates:** a song played twice shows once at its first position, with no count. Acceptable?
3. **Active highlight:** should the program's sidebar entry look "selected" while its filter is shown? Today clicking a program loads it, so "current" means loaded; a second highlight might confuse. Recommended: no highlight, the note says it.
4. **Notice wording:** `Showing program “X”` (matching the playlist's curly quotes).
