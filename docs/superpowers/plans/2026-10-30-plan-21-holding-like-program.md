# Folk Dance Player — Plan 21: Holding works like a Program on the side (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holding holds song-and-dance pairs, moves to and from the Program by drag and drop (a move, with the dance kept), asks which dance when a song with several is dropped in from the library, and has its own multi-selection with the star, ⋯ menu and ✕ acting on all selected rows, like the Program.

**Architecture:** Migration `007` replaces the per-file flag (`file_prefs.in_holding`, `holding_position`) with a `holding_items` table (`file_id`, `dance_id`, `position`, unique per pair). Holding rows are `Track`s with an ID, read by a new `library:holding` call, so they render like program items. Moving between Holding and a Program is one main operation each way (one transaction, one change notice). Selection reuses the reducer from Plan 17 (`program/selection.ts`).

**Tech Stack:** As Plans 1–20. No new dependencies.

**Ships as one pull request** (spec §5: it has a migration and changes two panels).

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.12 and §4 (migration `007`). Main spec §6.2 (the holding panel) is updated by this plan. Builds on Plans 17 (selection) and 18–20 (the Program page).

## Global Constraints

- **Test-first** (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change. **A released migration is never edited**; `007` is new. The startup backup (`VACUUM INTO` before migrating) already protects the library.
- **Keep the data layers separate:** Holding is personal data (like `file_prefs`), not part of the shareable `songs`/`dances` layer.
- **No duplicates by pair:** the same song with the same dance is never held twice (a unique index on `(file_id, COALESCE(dance_id, 0))`). A song with two different dances may be held once for each.
- A held pair's **dance is resolved when it is held** (spec §3.12): the dance chosen, else the song's default dance (`shownPairingSql`), else `NULL` for a song with no dance at all.
- **Moves are single operations** (`programs:moveToHolding`, `programs:moveFromHolding`): one transaction, one `programs:changed` plus one `library:changed` (main coalesces), never a song in both places or neither.
- **STOP markers can't be held:** a STOP in a dragged set stays in the Program; a drag of only STOP markers is not accepted by Holding. Other ways into the Program (library, playlists, Previously played, Add selected) leave Holding alone; only a drag from Holding is a move.
- UI from Mantine components; custom CSS only in co-located `*.module.css` files. Drag payloads use the app's own MIME types (`library/drag.ts`).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A program item with `dance_id` NULL ("default") moved to Holding is held as the song's default dance, so it compares equal to the same song dropped from the library; a song with no dance at all is held with `NULL` and still holds once.
- The same pair dropped into Holding again: from the library it **moves to the new spot**; from the Program the item is **only removed from the Program**; a different dance of the same song is added as a second row.
- A mixed drag (songs and a STOP) into Holding: the songs move, the STOP stays; only STOPs: no drop cursor and no call.
- Deleting a dance removes its held pairs; merging two dances keeps one held pair per song (the kept dance's) and loses none of the songs; unlinking a dance from a song leaves the held row showing that dance.
- Missing or removed songs can be held, moved and released (shown greyed, with the "removed" badge, as in the Program); played items and the playing song are unaffected.
- Releasing, moving or dragging with a selection acts on the whole selection in Holding order; a selection pruned when its rows leave (moved to the Program, released); the old `library:setHolding` is gone everywhere.
- Existing held songs survive the migration in their saved order, each as its default dance; a library with none gets an empty table.

## File Structure

- Create `src/main/db/migrations/007-holding-items.ts`; modify `migrations/index.ts`.
- Create `src/main/library/holding.ts` (`listHolding`, `holdSongs`, `moveHolding`, `releaseHolding`, `setHoldingDance`); remove `setHolding` from `playlists.ts` and the `holding` filter from `list.ts` and `LibraryFilter` (`shared/library.ts`).
- Create `src/main/programs/holding-moves.ts` (`moveToHolding`, `moveFromHolding`); modify `library/edit.ts` (`mergeDances`).
- Modify `src/shared/contract.ts` (channels, and the preload allowlist), `src/shared/program.ts` (`HoldingItem`), `src/main/ipc/library-handlers.ts`, `src/main/ipc/program-handlers.ts`.
- Modify `src/renderer/src/library/drag.ts` (`HOLDING_MIME`, a songs flag for item drags), `SongMenu.tsx` (dance choice and release), `src/renderer/src/program/HoldingPanel.tsx` (rewrite), `ProgramList.tsx` (accepts Holding drags; shares the dance choice), `DanceChoiceDialog.tsx` (generalized); create `src/renderer/src/program/dance-choices.ts`.
- Tests: `tests/main/db/migration-007.test.ts` (new), `tests/main/library/holding.test.ts` (new), `tests/main/programs/holding-moves.test.ts` (new), `tests/main/library/playlists.test.ts`, `list.test.ts`, `removed-songs.test.ts`, `tests/main/ipc/program-handlers.test.ts` (existing holding tests move), `tests/renderer/program/holding-panel.test.tsx`, `program-list.test.tsx`, `tests/renderer/library/*` (fixtures), `e2e/app.spec.ts`.

## Task 1: The migration and the holding module (main)

**Files:** Create `007-holding-items.ts`, `holding.ts`; modify `migrations/index.ts`, `playlists.ts`, `list.ts`, `shared/library.ts`, `shared/program.ts`; Test `migration-007.test.ts`, `holding.test.ts`; adapt `playlists.test.ts`, `list.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // shared/program.ts
  export type HoldingItem = { id: number } & Track   // a held song with the dance it is held as
  // main/library/holding.ts
  listHolding(db): HoldingItem[]                                   // in held order; removed songs included
  holdSongs(db, fileIds: number[], before: number | null): number[] // before = a holding item id; returns the holding item ids of those songs, in order
  moveHolding(db, itemIds: number[], before: number | null): void  // reorders; the moved rows keep their relative order
  releaseHolding(db, itemIds: number[]): void
  setHoldingDance(db, itemId: number, danceId: number): void       // throws LibraryEditError("That song is already held as that dance.") for a held pair
  ```
  Table: `holding_items (id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE, dance_id INTEGER REFERENCES dances(id) ON DELETE CASCADE, position INTEGER NOT NULL)` with `CREATE UNIQUE INDEX holding_pair ON holding_items (file_id, COALESCE(dance_id, 0))`.

- [ ] **Step 1: Write failing tests.** `migration-007.test.ts` (as `migration-003.test.ts`, migrating `MIGRATIONS.slice(0, 6)` then 7): `'held songs move over in their saved order, each as its default dance'`; `'a held song with no dance is held with no dance'`; `'songs not held are not copied, and the old flag columns are gone'`; `'deleting a dance removes its held pairs, deleting a file removes its rows'`; `'the same pair cannot be held twice, the same song with two dances can, and a pair with no dance holds once'`. `holding.test.ts`: `'holds a song as its default dance, at the end or before a held row'`; `'holding a pair that is already held moves it to the new spot'`; `'a different dance of the same song is a second row'`; `'the list carries the held dance, in order, and keeps removed songs (flagged)'`; `'moveHolding keeps the moved rows in their relative order and ignores unknown ids'`; `'releaseHolding removes rows and renumbers'`; `'setHoldingDance changes the dance, and refuses a pair that is already held'`. Adapt the existing `setHolding` and `holding` filter tests in `playlists.test.ts` and `list.test.ts` to the new functions, or delete those that no longer apply.
- [ ] **Step 2:** Run `npx vitest run tests/main/db tests/main/library` — expect FAIL.
- [ ] **Step 3:** Implement. Migration SQL is self-contained (copy the "shown pairing" expression the migration needs; do not import app code). Copy held songs with `INSERT … SELECT … ROW_NUMBER() OVER (ORDER BY fp.holding_position, fp.file_id)`, then `ALTER TABLE file_prefs DROP COLUMN in_holding` and `holding_position`. **If SQLite refuses the column drop** (a `CHECK` on the column, an index), leave the two columns in place, unused, with a comment in the migration saying why, and record it in the ledger/commit. Remove `setHolding` and the `holding` filter kind; `HoldingItem` rows come from `TRACK_COLUMNS` + `trackJoins('h.dance_id')` over `holding_items h` (as `listPlayed` does for the play log).
- [ ] **Step 4:** Run the same tests and `npm run typecheck` — expect PASS; typecheck errors point at every remaining caller (Tasks 3–5 fix the renderer ones; keep the build compiling by leaving `library:setHolding`'s contract entry until Task 2).

## Task 2: Moves between Holding and a Program (main)

**Files:** Create `src/main/programs/holding-moves.ts`; modify `contract.ts`, `library-handlers.ts`, `program-handlers.ts`; Test `holding-moves.test.ts`, `program-handlers.test.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  moveToHolding(db, programId: number, itemIds: number[], before: number | null): void   // before = a holding item id
  moveFromHolding(db, programId: number, holdingIds: number[], before: number | null): number[] // before = a program item id; returns the new item ids
  ```
  Contract (also added to the preload allowlist): `'library:holding': { args: []; result: HoldingItem[] }`, `'library:holdSongs': { args: [fileIds: number[], before: number | null]; result: number[] }`, `'library:moveHolding': { args: [itemIds: number[], before: number | null]; result: void }`, `'library:releaseHolding': { args: [itemIds: number[]]; result: void }`, `'library:setHoldingDance': { args: [itemId: number, danceId: number]; result: void }`, `'programs:moveToHolding': { args: [programId: number, itemIds: number[], before: number | null]; result: void }`, `'programs:moveFromHolding': { args: [programId: number, holdingIds: number[], before: number | null]; result: number[] }`. `library:setHolding` is removed.
  Semantics: `moveToHolding` holds each **track** item's song **with the item's dance resolved** (the item's `dance_id`, else the song's default, else NULL) at the spot given, in item order; a pair already held is left where it is and the item is just removed; STOP markers and unknown or already-played IDs are left alone; items are deleted from the Program. `moveFromHolding` adds each held row to the Program **as its held dance** (`program_items.dance_id` = the held dance, NULL if none) before the item given or at the end, then releases the rows; unknown IDs are ignored. Each runs in `inTransaction`; the handlers call `player.refresh()`, `onProgramsChanged()` and `onLibraryChanged()`.

- [ ] **Step 1: Write failing tests** (`holding-moves.test.ts`): `'program to Holding: the song is held as the item’s dance, and the item leaves the program'`; `'an item with the default dance (NULL) is held as the song’s default, equal to the same song dropped from the library'`; `'a pair already held: the item is only removed from the program and the held row stays put'`; `'a different dance of a held song is added as a second row'`; `'STOP markers stay in the program; only STOPs change nothing'`; `'unknown and played items are ignored'`; `'Holding to program: the song joins as its held dance, before the item dropped on or at the end, and leaves Holding'`; `'both directions are atomic: an unknown program changes nothing'`; `'selected items move in the order they had'`. In `program-handlers.test.ts`: `'a move sends one programs notice and one library notice'` (use the `counts` helper there) and `'the player’s next up follows a move'`.
- [ ] **Step 2:** Run `npx vitest run tests/main` — expect FAIL.
- [ ] **Step 3:** Implement the two functions and the handlers (`library:*` in `library-handlers.ts` with its `edit`, the moves in `program-handlers.ts`, which also calls `deps.onLibraryChanged()`); update `contract.ts` and the preload allowlist; remove `library:setHolding` and its handler.
- [ ] **Step 4:** Run `npx vitest run tests/main` and `npm run typecheck` — expect PASS (renderer errors remain until Task 4).

## Task 3: Dances deleted and merged

**Files:** Modify `src/main/library/edit.ts`; Test `tests/main/library/edit.test.ts` (or the file that tests `mergeDances`).

- [ ] **Step 1: Write failing tests:** `'merging dances moves held pairs to the kept dance, once per song'` (song A held as dance X and as dance Y, X merged into Y: one row as Y, in the first row's place; song B held only as X becomes Y); `'merging keeps the order of the held rows'`; `'deleting a dance removes its held pairs'` (already true by the cascade: assert it).
- [ ] **Step 2:** Run `npx vitest run tests/main/library` — expect the merge test to FAIL (the pair constraint or stale rows).
- [ ] **Step 3:** In `mergeDances`, before the removed dance is deleted: `UPDATE OR IGNORE holding_items SET dance_id = :keep WHERE dance_id = :remove`; any row left on the removed dance cascades away with it.
- [ ] **Step 4:** Run the same tests — expect PASS.

## Task 4: Holding panel, with drag and drop in and out

**Files:** Modify `library/drag.ts`, `SongMenu.tsx`, `program/HoldingPanel.tsx`, `ProgramList.tsx`, `DanceChoiceDialog.tsx`; create `program/dance-choices.ts`; Test `holding-panel.test.tsx`, `program-list.test.tsx`.

**Interfaces:**
- Produces in `drag.ts`: `HOLDING_MIME = 'application/x-fdp-holding-items'` with `setDraggedHolding(dataTransfer, ids)`, `getDraggedHolding(dataTransfer): number[]`, `carriesHolding(dataTransfer)`; `setDraggedItems(dataTransfer, itemIds, hasSongs)` also sets `ITEM_SONGS_MIME` when `hasSongs` and `carriesSongItems(dataTransfer)` reads it (a drag-over can see only the types, not the data, so this flag is how Holding refuses a STOP-only drag).
- `DanceChoice` becomes `{ item: { id: number; danceId: number | null; label?: string }; dances: SongDance[] }` (a `ProgramItem` still fits), and `dance-choices.ts` exports `chooseDances(api, rows: { id; songId; danceId; danceCount }[]): Promise<DanceChoice[]>` — fetches `library:song` for rows with `danceCount > 1`, keeps those with more than one dance. `ProgramList.addFiles` uses it (no behavior change).
- `SongMenu` gains optional `danceChoice?: { current: number | null; onChoose(danceId: number): void }` (lists the song's dances when it has several, ✓ on the current) and `onRemove?: { label: string; run(): void }` (a red item at the end).

**Holding panel behavior:** rows are `HoldingItem`s from `library:holding` (refetched on `library:changed`), shown like program items (star, label with the held dance, country, ✕ **Release**, ⋯ menu; missing/removed greyed with the badge). Selection: click, shift-click range, cmd/ctrl-click toggle (`selectIn`/`pruneSelection`/`selectedInOrder`, kept in the panel and pruned on refetch); a click on the empty space clears it; the star, the menu's favorites, Open PDF, ✕ and Release act on the whole selection when the row is in it, exactly as in the Program (Plan 17: **Edit details** and the dance choice only for one row). Drag out: `setDraggedHolding` with the selection in panel order. Drop in: `FILES_MIME` (library, playlist, Previously played) → `library:holdSongs(fileIds, before)`, then `chooseDances` on the returned rows and, for each answer, `library:setHoldingDance` (a refusal shows as a notification); `ITEMS_MIME` with songs → `programs:moveToHolding(programId, itemIds, before)`; `HOLDING_MIME` → `library:moveHolding(ids, before)`. A drop on a row goes before it, anywhere else at the end, with the same drop highlight as before. `ProgramList` also accepts `HOLDING_MIME`: `programs:moveFromHolding(await ensureProgram(), ids, before)`.

- [ ] **Step 1: Write failing tests** (`holding-panel.test.tsx`, fake API): rows render the held dance (`Dance ♪ Song`) and a second row for the same song with another dance; `'a library drag holds the songs, and asks which dance for a song with several'` (calls `library:holdSongs`, then `library:setHoldingDance` with the answer; a refusal shows a notification); `'a program-item drag moves the songs to Holding'` (`programs:moveToHolding` with the program ID, the item IDs and the row dropped on; at the end otherwise); `'a drag of only STOP markers is not accepted'` (no `preventDefault`/no call: `dragOver` without the songs flag); `'dragging a held row onto another reorders'` (`library:moveHolding`); `'selection: click, shift, cmd; the star, ✕ and the menu act on all selected; Edit details and the dance choice hide for several'`; `'dragging a selected row carries the whole selection in panel order, an unselected one only itself'`; `'the menu changes a held row’s dance'` (`library:setHoldingDance`); `'Release removes the selection'` (`library:releaseHolding`). `program-list.test.tsx`: `'a drag from Holding moves the songs into the program, before the item dropped on or at the end'` (`programs:moveFromHolding`); `'a song dragged from the library still does not touch Holding'`; the program's item drag sets the songs flag only when it carries a track.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program` — expect FAIL.
- [ ] **Step 3:** Implement. Existing `holding-panel.test.tsx` cases (star, menu, release, preview by double-click, drag between rows) are kept and adapted to the new channels and `HoldingItem` rows.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.

## Task 5: End-to-end, docs, commit

- [ ] **Step 1: E2E** (`e2e/app.spec.ts`; `dropInProgram` is for the Program, add `dropInHolding` beside it the same way): `'songs move between the program and Holding, keeping their order and dance'` — drag Hora and Kolo into the Program, drag both (select, then drag) into Holding: the Program is empty and Holding lists both, in order; drag Kolo back into the Program: Holding lists only Hora, the Program only Kolo. `'the same song is held once per dance'` — via `running.invoke` hold a song under its default dance, then `library:holdSongs` again: still one row.
- [ ] **Step 2: Docs:** 0.3.0 spec §2 row 3.12 → `Built (Plan 21)`, plus a short "decided while planning" note in §3.12 (Holding rows are `Track`s read by `library:holding`; the songs flag on item drags; Holding has its own selection; missing and removed songs are shown greyed); main spec §6.2 (the holding panel: pairs, moves, dance, selection); AGENTS.md decision (2026-10-30): **Holding holds song-and-dance pairs in `holding_items`, and drags between the Program and Holding are moves done by one main operation.** Why: a held song must keep the dance it was moved with, and a move done as two calls can leave a song in both places or neither; the pair is resolved when held so a program item's NULL ("default") compares equal to the same song from the library. _Rejected:_ keeping the flag and storing the dance beside it (one dance per song); a copy on drag (the old behavior left the song in both); CHANGELOG Changed: "Holding now works like the Program: drag songs between them (the song moves and keeps its dance), choose the dance when you drop a song with several, select several held songs to move, release or favorite them together, and hold the same song once for each of its dances."; hardware checklist step: drag a selection from the Program into Holding and back with a real mouse and trackpad (the drop highlight, the dance dialog, the order); confirm an old library's held songs are still held, in order, after updating.
- [ ] **Step 3:** Run `npx vitest run`, `npm run typecheck`, `npm run test:e2e`, and the e2e suite again with the window at 1000×640 (`setSize` in `launch`; see AGENTS.md) — expect all clean.
- [ ] **Step 4:** Commit in two or three conventional commits (`feat: Holding holds song-and-dance pairs`, `feat: move songs between the Program and Holding`, `feat: select several held songs`).
- [ ] **Step 5:** Open the pull request after an independent review.

## Self-Review

- **Spec coverage:** pairs and the unique index → Task 1; moves with dance kept, one transaction and notice, STOP markers, already-held pair, selection order → Task 2; dance deleted or merged → Task 3; library drop with the dance dialog, change a held dance, panel accepting program drags and the Program accepting Holding drags, other add paths unchanged, selection like the Program → Task 4; end-to-end each way → Task 5.
- **Types:** `HoldingItem` and the holding functions (Task 1) are used by the handlers and moves (Task 2) and the panel (Task 4); `HOLDING_MIME` and the songs flag (Task 4) are used by the panel and `ProgramList`; `DanceChoice`/`chooseDances` serve both lists.
- **Rulings for the maintainer to veto:** deleting a dance removes its held pairs (the spec's call); missing and removed songs stay in Holding, greyed (the old list hid removed ones); a failed `setHoldingDance` (pair already held) is a notification, not a silent no-op.
- **Open for the maintainer:** none blocking.
