# Folk Dance Player — Plan 12: Reorder columns in the Music and Program lists (0.3.0, PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The organizer can drag a column header (or press Alt+←/→ on it) to reorder the columns of the Music page table and of the Program page's library list, each list keeping its own saved order, with a way to reset it. Dance / Song, the favorite star, the "⋯" menu, and a playlist's `#` and the review list's File columns never move.

**Architecture:** Pure order functions in `src/renderer/src/library/column-order.ts` (resolve a saved list against the defaults, move, nudge) over the column keys Plan 11 added (`Column.key`). Two new validated settings hold the saved orders; a `useColumnOrder(list)` hook reads and writes them through `settings:getAll`/`settings:set`; `LibraryTable` applies the order, makes headers draggable (native HTML5 drag with its own MIME type, like every other drag in the app) and adds the keyboard and Reset paths. Collapsing columns by width (Plan 11's container queries) is keyed by column, so it is untouched.

**Tech Stack:** As Plans 1–11 (Electron, React, Mantine, Vitest, Playwright). No new dependencies, no migration.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.13 (and §3.3's column orders). Plan 11 (`2026-10-19-plan-11-labels-and-columns.md`) is merged; this builds on its `Column.key`, `ALL_COLUMNS`, `COMPACT_KEYS` and the inline grid `template` in `LibraryTable.tsx`.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; one commit per task; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- Settings are JSON per key, validated on write **and** read; a corrupt stored value silently falls back to its default (AGENTS.md).
- UI from Mantine components; custom CSS only in co-located `*.module.css`.
- Native HTML5 drag with the app's own MIME type (AGENTS.md); icons are inline SVG components, never Unicode symbols.
- Movable columns sit only between Dance / Song and the end of the data columns. **Never movable:** `number` (playlist `#`), `favorite`, `dance`, `file` (review list), `menu`.
- Each list has its own order: settings `library.columns.music` and `library.columns.program`, each a list of column keys; the default is the empty list, meaning "the default order".
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A saved list containing a key that no longer exists, a duplicate key, or a fixed key (`dance`, `menu`): ignored, never shown twice, never moved.
- A saved list missing a column a later release added: the column appears at its default place, not lost or last-by-accident.
- A corrupt stored value (a string, numbers): the default order, no crash.
- Dropping a header on itself, on Dance / Song, on the "⋯" header or past the last column: no change, first position, and end respectively.
- A column hidden by the narrow-width collapse cannot be dragged, and a hidden column keeps its place in the order when the window widens again.
- Playlist (`#`) and review-list (File) views: the extra columns stay put while data columns reorder around them.
- A failed settings write: the order applies on screen for the session and nothing crashes.

## File Structure

- Create `src/renderer/src/library/column-order.ts` — pure order logic.
- Create `src/renderer/src/library/useColumnOrder.ts` — read/save one list's order.
- Modify `src/renderer/src/library/reorder.ts` — make `moveBefore` generic.
- Modify `src/renderer/src/library/drag.ts` — column drag MIME helpers.
- Modify `src/renderer/src/library/LibraryTable.tsx` and `LibraryTable.module.css` — ordering, header drag, keyboard, Reset.
- Modify `src/shared/settings.ts` — the two settings.
- Tests: `tests/shared/settings-columns.test.ts` (or `tests/main/settings/settings-store.test.ts`), `tests/renderer/library/column-order.test.ts`, `tests/renderer/library/column-reorder.test.tsx`, `e2e/app.spec.ts`.

---

### Task 1: The two settings

**Files:**
- Modify: `src/shared/settings.ts` (the `Settings` interface, `DEFAULT_SETTINGS`, `VALIDATORS`)
- Test: `tests/main/settings/settings-store.test.ts`

**Interfaces:**
- Produces: `Settings['library.columns.music']: string[]` and `Settings['library.columns.program']: string[]`, default `[]`; valid when an array of at most 40 strings, each non-empty and at most 40 characters.

- [ ] **Step 1: Write failing tests** in `settings-store.test.ts`:
  - `'the column orders default to empty (the default order)'`: `store.get('library.columns.music')` and `.program` both equal `[]`.
  - `'saves and reads back a column order'`: set `['artist', 'country']`, read it back through a new `SettingsStore(db)`.
  - `'rejects a column order that is not a list of short strings'`: `store.set('library.columns.music', [1] as never)` and a 41-element list both throw `InvalidSettingError`.
  - `'a corrupt stored column order falls back to the default'`: write a non-array JSON value straight into the `settings` table for the key (as the file's existing corrupt-value test does), `get` returns `[]`.
- [ ] **Step 2:** Run `npx vitest run tests/main/settings/settings-store.test.ts` — expect FAIL (unknown key).
- [ ] **Step 3:** Add the two keys to `Settings`, `DEFAULT_SETTINGS` and `VALIDATORS` (a shared `isColumnOrder` validator beside `isSuggestionList`). Run the test — expect PASS.
- [ ] **Step 4:** Commit `feat: settings for the saved column orders`.

### Task 2: Column order logic

**Files:**
- Create: `src/renderer/src/library/column-order.ts`
- Modify: `src/renderer/src/library/reorder.ts` (make `moveBefore` generic: `moveBefore<T>(order: T[], moving: T[], before: T | null): T[]`; the existing number tests must still pass)
- Test: `tests/renderer/library/column-order.test.ts`

**Interfaces:**
- Produces, in `column-order.ts`:
  - `export const MOVABLE: Record<'music' | 'program', string[]>` — the default order of movable keys: music `['country', 'choreographer', 'teacher', 'artist', 'danceType', 'difficulty', 'time']`, program `['country', 'choreographer', 'teacher', 'artist', 'time']`.
  - `export type ColumnList = 'music' | 'program'`.
  - `resolveOrder(saved: string[], defaults: string[]): string[]` — keeps saved keys that are in `defaults`, first occurrence only; a default key missing from `saved` is inserted right after the key that precedes it in `defaults` (at the start if it has no predecessor present).
  - `moveColumn(order: string[], key: string, before: string | null): string[]` — via `moveBefore`; `before` null means the end; an unknown `key` returns `order` unchanged.
  - `nudgeColumn(order: string[], key: string, by: -1 | 1): string[]` — one place left or right; no change at either end.

- [ ] **Step 1: Write failing tests** (names and assertions):
  - `resolveOrder([], D)` equals `D`.
  - `'drops unknown and duplicate keys'`: `resolveOrder(['time', 'x', 'time', 'country'], MOVABLE.program)` → `['time', 'country', 'choreographer', 'teacher', 'artist']` (the kept keys, then each missing default key in default order right after its predecessor).
  - `'adds a column a later release introduced at its default place'`: saved without `'teacher'` → `'teacher'` appears right after `'choreographer'`.
  - `'a fixed key in the saved list is ignored'`: `['dance', 'menu', 'artist']` → fixed keys absent from the result.
  - `moveColumn(order, 'artist', 'country')` puts artist first; `moveColumn(order, 'country', null)` puts it last; `moveColumn(order, 'artist', 'artist')` and an unknown key leave the order unchanged.
  - `nudgeColumn` moves by one and returns the same order at either end.
  - The existing `moveBefore` tests still pass with numbers (run `tests/renderer/library`).
- [ ] **Step 2:** Run `npx vitest run tests/renderer/library/column-order.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement the functions as specified.
- [ ] **Step 4:** Run `npx vitest run tests/renderer/library` — expect PASS.
- [ ] **Step 5:** Commit `feat: column order logic`.

### Task 3: Apply and save the order in the table

**Files:**
- Create: `src/renderer/src/library/useColumnOrder.ts`
- Modify: `src/renderer/src/library/LibraryTable.tsx` (column assembly at ~line 175, header `key={i}` → `key={c.key}`)
- Test: `tests/renderer/library/column-reorder.test.tsx`

**Interfaces:**
- Consumes: `resolveOrder`, `MOVABLE`, `ColumnList` (Task 2); settings (Task 1); `useLibraryApi()`.
- Produces: `useColumnOrder(list: ColumnList): { order: string[]; save(order: string[]): void; reset(): void }`. It reads `settings:getAll` once on mount (the default order until it answers), applies `resolveOrder(saved, MOVABLE[list])`, and `save`/`reset` update the state at once and then call `settings:set` with the key for that list (`reset` saves `[]`); a rejected write is ignored (the order stays for the session).
- `LibraryTable` builds its columns as: `#` (in a playlist), `favorite`, `dance`, the movable columns in `order`, the File column (review), `menu`. The Music page uses `'music'`, the Program page (`compact`) `'program'`.

- [ ] **Step 1: Write failing tests** in a new `column-reorder.test.tsx`, rendering `MusicPage` / `ProgramPage` as `program-page.test.tsx` does with `createFakeApi` and a `'settings:getAll'` answer built from `DEFAULT_SETTINGS`:
  - `'the Music page applies its saved column order'`: settings with `'library.columns.music': ['time', 'artist']` → headers (trailing sort arrows stripped) are `['', 'Dance / Song', 'Time', 'Artist', 'Country', 'Choreographer', 'Teacher', 'Type', 'Difficulty', '']`.
  - `'the Program page uses its own order'`: music saved `['time']`, program saved `[]` → the Program list's headers keep the default order.
  - `'a corrupt or unknown saved key is ignored'`: saved `['bogus', 'artist']` → default order with Artist first of the movables.
  - `'in a playlist the # column stays first'`: with a playlist filter active, `#` precedes the star and Dance / Song whatever the saved order.
- [ ] **Step 2:** Run the file — expect FAIL.
- [ ] **Step 3:** Implement the hook and the table assembly; make header cells `key={c.key}` (so focus survives a move).
- [ ] **Step 4:** Run `npx vitest run tests/renderer` — expect PASS (existing header-order tests keep passing because the default order is unchanged).
- [ ] **Step 5:** Commit `feat: apply saved column orders to the library tables`.

### Task 4: Drag a header to move its column

**Files:**
- Modify: `src/renderer/src/library/drag.ts` (add `COLUMN_MIME = 'application/x-fdp-column'`, `setDraggedColumn(dt, key)`, `carriesColumn(dt)`, `getDraggedColumn(dt): string | null`, same shape as the existing file/item helpers), `LibraryTable.tsx`, `LibraryTable.module.css`
- Test: `tests/renderer/library/column-reorder.test.tsx`

**Interfaces:**
- Consumes: `useColumnOrder`, `moveColumn` (Tasks 2–3).
- Produces: a movable column's header is `draggable`; dragging sets the column MIME; dragging over another header shows a drop line on that header's left edge (new class `dropColumn` in the module, an inset `box-shadow` like `.dropBefore`); dropping calls `save(moveColumn(order, dragged, target))`. Target rules: a movable header → before it; Dance / Song, the favorite star or `#` header → before the first movable column; the File or "⋯" header → the end. A drag that doesn't carry the column MIME (a song, a program item) is not accepted by headers. Clicking a header still sorts.

- [ ] **Step 1: Write failing tests** (component tests with `fireEvent.dragStart/dragOver/drop` and a `dataTransfer` stub like the existing drag tests):
  - `'dragging Artist onto Country moves it before Country and saves the order'`: `settings:set` is called with `'library.columns.music'` and an order starting `['artist', 'country', …]`; headers follow.
  - `'dropping on Dance / Song makes the column the first data column'`, `'dropping on the ⋯ header moves it to the end'`, `'dropping a column on itself changes nothing and saves nothing'`.
  - `'Dance / Song and the ⋯ header are not draggable'` (`draggable` attribute absent/false).
  - `'a song drag over a header is not accepted'` (`dragOver` not default-prevented).
  - `'a click still sorts'` (the Artist header's button calls `library:list` with the artist sort).
- [ ] **Step 2:** Run the file — expect FAIL.
- [ ] **Step 3:** Implement. Track the hovered header key in state for the drop line; clear it on leave and drop.
- [ ] **Step 4:** Run `npx vitest run tests/renderer` — expect PASS.
- [ ] **Step 5:** Commit `feat: drag a column header to reorder columns`.

### Task 5: Keyboard and Reset

**Files:**
- Modify: `src/renderer/src/library/LibraryTable.tsx`
- Test: `tests/renderer/library/column-reorder.test.tsx`

**Interfaces:**
- Consumes: `nudgeColumn`, `useColumnOrder().save/reset`.
- Produces: on a focused movable header's sort button, **Alt+←** and **Alt+→** move its column one place (`nudgeColumn`), keeping focus on it, and are ignored at the ends and on fixed headers. A right-click on any header of the table opens a Mantine `Menu` at the pointer with one item, **Reset columns**, which calls `reset()`; the item is disabled when the order is already the default.

- [ ] **Step 1: Write failing tests:**
  - `'Alt+ArrowRight on a focused header moves its column one place right, and focus stays on it'`; `'Alt+ArrowLeft at the first movable column changes nothing'`.
  - `'plain arrow keys do not move columns'`.
  - `'right-click on a header offers Reset columns, which saves an empty order'` (`settings:set` called with `'library.columns.music', []` and the headers return to the default); `'Reset columns is disabled when the order is the default'`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. For the context menu use a controlled Mantine `Menu` whose target is a zero-size element placed at the click position (`withinPortal`), as no Mantine component opens at a pointer by itself.
- [ ] **Step 4:** Run `npx vitest run tests/renderer` — expect PASS.
- [ ] **Step 5:** Commit `feat: move columns with the keyboard, and Reset columns`.

### Task 6: End-to-end, docs and the hardware checklist

**Files:**
- Modify: `e2e/app.spec.ts`; the main spec §6.3 (`docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`); the 0.3.0 spec (§2 table row 3.13 → Built, §5); `AGENTS.md`; `CHANGELOG.md`; `docs/manual-testing/pre-release-hardware.md`

- [ ] **Step 1:** Add an e2e test `'a column dragged to a new place stays there after a restart'`: on the Music page drag the **Artist** header onto **Country** with the existing `drag()` helper, expect the header row to read Artist before Country, `running.app.close()`, `launch(space.userData)`, and expect the same order. Run `npm run test:e2e` — **ask the user first**, it takes over their screen — expect all pass.
- [ ] **Step 2:** Docs: main spec §6.3 gets a "Columns can be reordered" bullet; the 0.3.0 spec marks §3.13 built; an AGENTS.md decision (dated, newest first): "Column orders are the settings `library.columns.music` / `.program`, a list of column keys resolved against the defaults on read (unknown keys dropped, new columns added at their default place); the empty list means the default order. Collapsing follows the column. _Rejected:_ a stored full order (a new column in a later release would be missing); per-column widths."; CHANGELOG under Unreleased → Added: "Drag a column header to reorder the columns of the Music page and the Program page's library list (Alt+←/→ with a header focused); right-click a header for **Reset columns**."
- [ ] **Step 3:** Hardware checklist items: reorder columns by drag with a real mouse and trackpad on both pages; the drop line shows where the column lands; quit and reopen the app and the order is kept; Reset columns restores the default; reorder then narrow the Program list — columns still disappear Artist, Teacher, Choreographer, Country, Time, and widening brings them back in place.
- [ ] **Step 4:** Run `npx prettier --check .`, `npm run typecheck`, `npx vitest run` — expect clean.
- [ ] **Step 5:** Commit `docs: describe reorderable columns`.

## Self-Review

- **Spec coverage:** §3.13's fixed columns → Global Constraints and Tasks 2–4; drag with a line → Task 4; keyboard → Task 5; per-list settings, default-place for new columns, validation → Tasks 1–3; Reset → Task 5; collapsing follows the column → untouched, checked in the hardware list (Task 6); each column keeps its own width → already true (widths live on `Column`); tests listed in the spec → Tasks 1–6.
- **Types:** `ColumnList`, `MOVABLE`, `resolveOrder`, `moveColumn`, `nudgeColumn` (Task 2) are the names Tasks 3–5 consume; `useColumnOrder(list)` returns `{ order, save, reset }` throughout.
- **Open call for the maintainer:** none beyond the spec's own (Alt+arrows and Reset were its calls); the drop-on-fixed-header rules in Task 4 are this plan's.
