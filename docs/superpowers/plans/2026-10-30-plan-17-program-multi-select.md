# Folk Dance Player — Plan 17: Select several program items and move them together (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Program items can be selected (click, shift-click range, cmd/ctrl-click toggle), and dragging a selected item moves the whole selection, which lands in its original relative order and stays selected.

**Architecture:** A pure selection reducer (`program/selection.ts`) feeds the Program page's store (`program-store.ts`), which prunes it whenever the program is refetched. `ProgramList` renders selection (`aria-selected`) and starts drags from it. The drag payload (`ITEMS_MIME`), `moveBefore` and `programs:reorder` already move several items, so main changes nothing.

**Tech Stack:** As Plans 1–16. No new dependencies.

**Ships as one pull request.**

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.8. Main spec §6.2 (the program list) is updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- UI state only: the selection is not saved and lives in the Program page's store, separate from the library's selection (spec §3.8).
- **Double-click in the program still does nothing** (main spec: the program means "play in this order").
- STOP markers are items like any other: selectable and movable.
- Custom CSS only in `ProgramList.module.css`; Mantine tokens for colors (selected row = `var(--mantine-primary-color-light)`, as the Music table's rows).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A selected item that is played, removed, or belongs to a program that was replaced leaves the selection (the store prunes on every refetch).
- Dragging an **unselected** item while others are selected moves only that item and makes it the whole selection.
- Clicking an item's star, ✕ or ⋯ button must not change the selection.
- Shift-click with no anchor, or an anchor that has left the list, selects just the clicked item.
- Dropping the selection onto one of its own members changes nothing (no `programs:reorder` call) and keeps the selection; a non-contiguous selection that includes a STOP moves in its original order.

## File Structure

- Create `src/renderer/src/program/selection.ts`: the pure reducer.
- Modify `src/renderer/src/program/program-store.ts`: `selection`, `selectItem`, `clearSelection`, pruning in `refresh`.
- Modify `src/renderer/src/program/ProgramList.tsx` and `ProgramList.module.css`: roles, selection styling, click handlers, drag start, drag image.
- Modify `src/renderer/src/library/FavoriteToggle.module.css`: its hover rule keys off `[role='listitem']`; add `[role='option']`.
- Tests: `tests/renderer/program/selection.test.ts` (new), `program-store.test.ts`, `program-list.test.tsx`, `removed-songs.test.tsx` (queries by role), `e2e/app.spec.ts`.

## Task 1: The selection reducer

**Files:** Create `src/renderer/src/program/selection.ts`; Test `tests/renderer/program/selection.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface Selection { ids: number[]; anchor: number | null }  // ids in selection order
  export type SelectMode = 'single' | 'range' | 'toggle'
  export const EMPTY_SELECTION: Selection
  export function selectIn(sel: Selection, order: number[], id: number, mode: SelectMode): Selection
  export function pruneSelection(sel: Selection, order: number[]): Selection
  export function selectedInOrder(sel: Selection, order: number[]): number[]  // program order
  ```
  `order` is the program's item IDs, top to bottom.

- [ ] **Step 1: Write failing tests** in `selection.test.ts` (with `order = [1,2,3,4,5]`):
  - `'a plain click selects only that item and anchors on it'`: `selectIn(EMPTY_SELECTION, order, 3, 'single')` → `{ ids: [3], anchor: 3 }`.
  - `'shift-click selects the range from the anchor, either direction, keeping the anchor'`: anchor 2, `range` on 4 → ids `[2,3,4]`, anchor 2; anchor 4, `range` on 2 → ids `[2,3,4]`, anchor 4.
  - `'shift-click with no anchor, or one that left the list, selects just the clicked item'`: anchor null → `{ ids: [3], anchor: 3 }`; anchor 9 → same.
  - `'cmd/ctrl-click adds an item, or removes it when already selected, and moves the anchor'`.
  - `'pruning drops items that left the list, and the anchor with them'`: `{ ids:[1,9,3], anchor: 9 }` pruned against `[1,2,3]` → `{ ids:[1,3], anchor: null }`; an unchanged selection returns the same object (reference-equal, so the store does not re-render).
  - `'selectedInOrder returns the selected ids in program order'`: ids `[4,1]` → `[1,4]`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program/selection.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement the module above. Range replaces the selection (like the library store) and keeps the anchor.
- [ ] **Step 4:** Run the same test — expect PASS.

## Task 2: Selection in the Program store

**Files:** Modify `src/renderer/src/program/program-store.ts`; Test `tests/renderer/program/program-store.test.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces on `ProgramState`: `selection: Selection`; `selectItem(id: number, mode: SelectMode): void` (uses the loaded program's item order; no-op with no program); `clearSelection(): void`. `refresh()` sets `selection` to `pruneSelection(selection, newItemIds)` together with `program`.

- [ ] **Step 1: Write failing tests:**
  - `'selecting items follows the loaded program’s order'`: after a refresh with items `[1,2,3]`, `selectItem(1,'single')` then `selectItem(3,'range')` → `selection.ids` is `[1,2,3]`.
  - `'an item that leaves the program leaves the selection'`: select 1 and 3; make `programs:get` answer with items `[1,2]`; trigger a `programs:changed` broadcast (as the existing refetch test does) → `selection.ids` is `[1]`.
  - `'loading a program with no matching items clears the selection'`: `programs:get` answers a program with other ids → `selection` equals `EMPTY_SELECTION`.
  - `'clearSelection empties it'`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program/program-store.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement. When `program` is null, the pruned selection is `EMPTY_SELECTION`.
- [ ] **Step 4:** Run the same test — expect PASS.

## Task 3: Select and drag in the list

**Files:** Modify `ProgramList.tsx`, `ProgramList.module.css`, `FavoriteToggle.module.css`; Test `program-list.test.tsx`, `removed-songs.test.tsx`.

**Interfaces:**
- Consumes: store `selection`, `selectItem`, `clearSelection`, `selectedInOrder`.
- Produces: the list is `role="listbox" aria-multiselectable="true" aria-label="Program items"`; each row is `role="option"` with `aria-selected` (this replaces `role="list"`/`listitem`, which cannot be selected; the rows' accessible text and the ⋯/✕ button names are unchanged). Row click: `shift` → `'range'`, cmd/ctrl → `'toggle'`, else `'single'`; ignored when the click came from a `button` inside the row. A click on the list that is not inside a row calls `clearSelection()`. `onDragStart`: if the item is not selected, `selectItem(item.id, 'single')`; the payload is `selectedInOrder` of the selection as it then stands (or `[item.id]`); with more than one id, a drag image reading `"<n> items"` (a `div` with `classes.dragImage`, positioned off-screen, appended to `document.body`, removed on the next tick, set with `dataTransfer.setDragImage?.(el, 0, 0)` so jsdom's missing method is harmless).

- [ ] **Step 1: Write failing tests** in `program-list.test.tsx` (items 1 Hora, 2 STOP, 3 Kolo; `rows()`/`rowFor` now query `option`):
  - `'clicking an item selects it; clicking another replaces the selection'`: `aria-selected` true on the clicked row only.
  - `'cmd-click adds and removes; shift-click selects the range'`.
  - `'clicking a row’s star, ✕ or ⋯ button does not change the selection'`: select Hora, click Kolo's “Options for Kolo” button → Hora still selected, Kolo not.
  - `'clicking empty space in the list clears the selection'`.
  - `'double-clicking an item does nothing'`: no `player:*` call (keep the existing assertion if there is one).
  - `'dragging a selected item carries the whole selection in program order'`: select Kolo then cmd-click Hora; `fireEvent.dragStart(rowFor('Kolo'), { dataTransfer })` with a stub `{ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }` → `setData` called with `(ITEMS_MIME, '[1,3]')` and `setDragImage` called once.
  - `'dragging an unselected item selects only it and carries only it'`: Hora selected, drag Kolo → payload `'[3]'`, Kolo `aria-selected`, Hora not.
  - `'dropping a selection moves its items together in their original order'`: `fireEvent.drop(<the STOP row>, items([3,1]))` (moving 1 and 3 before the STOP, in their original order) → `programs:reorder` called once: `[[5,[1,3,2]]]`. Dropping on the list's end area with `items([1,3])` → `[[5,[2,1,3]]]` — one call each.
  - `'dropping a selection onto one of its own items changes nothing'`: no `programs:reorder` call.
  - `'the selection survives a reorder'`: after the drop, re-answer `programs:get` with the new order and broadcast `programs:changed`; both rows still `aria-selected`.
  Update every existing `listitem` query in `program-list.test.tsx` and `removed-songs.test.tsx` that targets the program list to `option`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program` — expect the new and the renamed-role tests to FAIL.
- [ ] **Step 3:** Implement as above. CSS: `.row[aria-selected='true'] { background: var(--mantine-primary-color-light); }` (after `.row:hover`, so selected wins), `.dragImage` off-screen with padding and the panel's border radius; `FavoriteToggle.module.css`'s `[role='listitem']:hover` selector also matches `[role='option']:hover`. Keep the `⋯`/✕ visible on a selected row like the Music table does (`.row[aria-selected='true'] .options, … .remove { opacity: 1 }`).
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean. Also run `npx vitest run tests/renderer/program/holding-panel.test.tsx` (Holding keeps `listitem`; it is Plan 18's concern).
- [ ] **Step 5:** Read the `programs:reorder` handler in `src/main` and confirm one call produces one `programs:changed` broadcast (main coalesces; no code change expected). If it does not, stop and tell the maintainer.

## Task 4: End-to-end, docs, commit

**Files:** Modify `e2e/app.spec.ts`, `docs/manual-testing/pre-release-hardware.md`, `CHANGELOG.md`, `AGENTS.md`, the main spec §6.2, the 0.3.0 spec.

- [ ] **Step 1: Write the e2e test** `'select two program items and drag them together'` beside the reorder test: add Hora, Kolo, Tfilati to the program (as the existing test does); `programItems()` now uses `getByRole('option')` (update the helper and its uses). Click Kolo, shift-click Tfilati; `drag(page, <Kolo item>, <Hora item>)`; expect `programItems()` to have text `[/Kolo/, /Tfilati/, /Hora/]` and both moved items to have `aria-selected="true"`. Run `npm run test:e2e` — expect PASS (the build must be current).
- [ ] **Step 2: Docs:**
  - 0.3.0 spec §2 row 3.8 → `Built (Plan 17)`.
  - Main spec §6.2: selection (click, shift, cmd/ctrl), dragging moves the selection, double-click still does nothing.
  - `docs/manual-testing/pre-release-hardware.md` step 33: with a real mouse and trackpad, select several items (click, shift-click, cmd-click), drag them to the middle and the end of the program: they land together in their original order, stay selected, and the drag image reads “N items”; dragging an unselected item moves only it; an item that plays leaves the selection; a click in the empty area below the list clears it.
  - AGENTS.md decision (newest first, 2026-10-30): **The program's selection is UI state in the program store, and its list is a `listbox` of `option` rows.** Why: `aria-selected` is not allowed on `listitem`, and the store prunes it on every refetch, so an item that is played or removed can never be dragged from a stale selection. Holding keeps its list roles until Plan 18. _Rejected:_ keeping `list`/`listitem` and marking selection with a data attribute only (invisible to screen readers); sharing the library's selection (a different list with different ids).
  - CHANGELOG Added: "Select several items in the program (click, shift-click for a range, cmd/ctrl-click to add or remove one) and drag them together; they land in the order they had and stay selected."
- [ ] **Step 3:** Run `npx vitest run`, `npm run typecheck`, `npm run lint` — expect all clean.
- [ ] **Step 4:** Commit `feat: select several program items and move them together` (code, tests, CHANGELOG line and docs in one commit).
- [ ] **Step 5:** Open the pull request after an independent review.

## Self-Review

- **Spec coverage:** click/shift/cmd selection, whole-selection drag, original order and kept selection, unselected-drag rule, drag-image count, pruning, click-on-empty clears, double-click unchanged, STOP movable, one reorder change notice, `aria-selected` and the role change, reducer/component/e2e tests → Tasks 1–4.
- **Types:** `Selection`, `SelectMode`, `selectIn`, `pruneSelection`, `selectedInOrder` are defined in Task 1 and used by the store (Task 2, whose `selectItem(id, mode)` calls `selectIn`) and the list (Task 3).
- **Not included (spec silent):** keyboard selection, Delete-to-remove for a selection, and ✕ removing the whole selection; each is a separate request.
- **Open for the maintainer:** none blocking.
