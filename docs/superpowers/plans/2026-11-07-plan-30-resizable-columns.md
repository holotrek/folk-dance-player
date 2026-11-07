# Resizable columns (Plan 30) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Music page's table and the Program page's library list, an organizer drags the edge between two headers to resize a column. Sizes are remembered as settings (a percentage of the table's width, so they scale with the window), "Reset columns" clears them with the order, and Alt+Shift+←/→ resizes the focused column from the keyboard.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.9 (issue #81). Order of work §5: builds after §3.5 (slide icon column).

## Global Constraints

- Settings, not a migration (spec §4): `library.columnWidths.music` and `library.columnWidths.program`.
- Main owns state; the renderer reads and writes settings through `settings:getAll` / `settings:set` exactly as `useColumnOrder` does.
- Mantine components; custom CSS only in `LibraryTable.module.css`.
- Test-first (Vitest, jsdom); conventional commits; `CHANGELOG.md` line under Unreleased and an AGENTS.md decision in the same commit; spec §6 docs: main spec §6 Library and Program pages, hardware checklist line (drag with a mouse and a trackpad, resize the window after).
- Implementation runs only unit tests, typecheck, `prettier --check .` and build (no e2e; CI runs them).

## How it meets the existing grid (the key design point)

Today each row's `grid-template-columns` is `var(--w-<key>, <default track>)` per column, and the container-query rules in `LibraryTable.module.css` set `--w-<key>: 0px` on `.compact .header, .compact .item` to collapse a column. Plan: a resized column's **fallback** (the part after the comma) becomes `max(<minPx>px, calc(100cqw * <pct> / 100))` instead of its default track. `.table` is already `container-type: inline-size`, so `100cqw` is the table's width and needs no JS measurement or `--table-width` variable. Because the user width lives in the `var()` fallback, a collapsing rule's `--w-<key>: 0px` still wins below its breakpoint, and unresized columns keep their defaults. The Dance / Song column keeps its `minmax(220px, 3fr)` track and absorbs what the others leave.

## Files touched

- Create `src/renderer/src/library/column-widths.ts` (pure): `MIN_WIDTH_PX` per column key; `resolveWidths(saved, list)` (drops unknown keys, non-finite, non-positive and out-of-range values; clamps to a sane range); `widthTrack(key, pct)` (the CSS track); `percentFromPixels(px, tableWidth, key)`; `nudgeWidth(...)`.
- Create `src/renderer/src/library/useColumnWidths.ts`: like `useColumnOrder` (`{ widths, save(widths), reset() }`; saves once; a failed save is swallowed and the sizes stay until the page is left).
- Create `src/renderer/src/library/ResizeHandle.tsx` with styles in `LibraryTable.module.css`: a thin separator on a header's right edge.
- Modify `src/renderer/src/library/LibraryTable.tsx`: use both hooks, build the template from widths, render handles, Alt+Shift+Arrows, extend Reset columns.
- Modify `src/renderer/src/library/LibraryTable.module.css`: handle styles, recheck breakpoints.
- Modify `src/shared/settings.ts`: two keys (type, default `{}`, validator `isColumnWidths`).
- Tests: `tests/renderer/library/column-widths.test.ts`, `tests/renderer/library/column-resize.test.tsx`, additions to `tests/main/settings/settings-store.test.ts` and `tests/renderer/library/column-reorder.test.tsx` (Reset), and the fake API's settings default in `tests/renderer/fake-api.ts` if it enumerates keys.
- Docs: main spec §6, AGENTS.md decision, CHANGELOG.md, `docs/manual-testing/pre-release-hardware.md`, spec §3.9 status line.

## Tasks

### Task 1: Settings keys (test first)

- [ ] In `settings-store.test.ts`: both keys default to `{}`; a valid map round-trips; a non-object, an array, a non-numeric value, a value <= 0 or > 100, a key over 40 characters or more than 40 keys are rejected on `set`; a corrupt stored value falls back to `{}` on `get`.
- [ ] Implement `Record<string, number>` in the settings type, `DEFAULT_SETTINGS`, and `isColumnWidths` in `VALIDATORS`. Run the test file.

### Task 2: Pure width rules (test first)

- [ ] `column-widths.test.ts`: `resolveWidths` drops unknown keys (per list), fixed keys (`favorite`, `dance`, `number`, `file`, `menu`) and bad values, keeps good ones, returns `{}` for `{}`; `widthTrack` gives `max(Npx, calc(100cqw * P / 100))`; `percentFromPixels` clamps to the key's minimum and a maximum so a drag cannot reach nothing or fill the table; `nudgeWidth` moves by 1 percentage point and respects the clamp.
- [ ] Implement `column-widths.ts`. Minimums in px per key: country 60, choreographer 90, teacher 60, artist 60, danceType 60, difficulty 60, time 48 (own header plus sort arrow; tuned by eye, rechecked at the end).

### Task 3: `useColumnWidths` (test first, in `column-resize.test.tsx`)

- [ ] Shows defaults until the saved map arrives, applies a change at once, saves via `settings:set` with the right key, `reset()` saves `{}`; a rejected save is swallowed.
- [ ] Implement, mirroring `useColumnOrder`. Two small hooks stay clearer than a generic one (revisit if a third appears).

### Task 4: Handle and drag (test first)

- [ ] In `column-resize.test.tsx` render `LibraryTable` (via `render-library.tsx`): every movable column's header has a separator handle (`role="separator"`, `aria-orientation="vertical"`, label "Resize <Column>"); the favorite, Dance / Song, `#`, File, menu (and §3.5's icon) columns have none.
- [ ] Pointer sequence on a handle (`pointerdown`, `pointermove`, `pointerup`; stub `setPointerCapture`): the header's `grid-template-columns` changes during the move and `settings:set` is called **once**, at release, with a percentage of the table's width; a move below the minimum clamps; `pointercancel` restores and saves nothing; `pointerdown` calls `preventDefault` and `stopPropagation`, the handle is not draggable and a header `dragstart` that originates on it is cancelled, so it never sets `COLUMN_MIME`.
- [ ] Implement `ResizeHandle` (pointer capture on the handle; widths measured from the header cell's and the table's `getBoundingClientRect` at `pointerdown`; the live width is local state during the drag, saved on release). A click on the handle does not sort.
- [ ] Double-click on a handle resets just that column's size (see open question 3).

### Task 5: Template with widths, collapse and fixed columns (test first)

- [ ] Test: with saved widths, a resized column's track is `var(--w-country, max(...))` and an unresized column's track is its default; the Program list uses `library.columnWidths.program`, Music uses `.music`; fixed columns keep their tracks.
- [ ] Implement in `LibraryTable.tsx`: `track(c)` returns `widthTrack(...)` when a width is saved, else the default; `template` uses `var(--w-${c.key}, ${track(c)})`.
- [ ] jsdom has no layout, so the collapse-with-resize interaction is covered by the fallback-string unit test and by hand on the hardware checklist.

### Task 6: Keyboard and Reset (test first)

- [ ] Alt+Shift+ArrowRight on a focused movable header's button widens its column by 1 percentage point (starting from the measured current width) and saves; ArrowLeft narrows; clamped at the minimum; plain Alt+Arrow still reorders and Alt+Shift does not reorder.
- [ ] Reset columns is enabled when only widths differ from the default, and saves `library.columns.<list>` as `[]` and `library.columnWidths.<list>` as `{}`.
- [ ] Implement. `isDefaultOrder` becomes "order is default and no widths saved".

### Task 7: Recheck collapsing (CSS, by eye on a running app)

- [ ] The Program list's breakpoints (706 / 636 / 561 / 441 / 361 px) assume default widths. Check whether a widened column makes the remaining ones overflow before they collapse; either leave them or raise them when widths are set (open question 2). Record the decision in AGENTS.md.

### Task 8: Docs and gate

- [ ] Main spec §6, AGENTS.md decision (percent widths in the `var()` fallback via `100cqw`, minimums, how they meet collapsing, Dance / Song stays flexible, Reset clears both), CHANGELOG line, hardware checklist line, spec §3.9 status to Done.
- [ ] `npx prettier --check .`, `npm run typecheck`, `npm test`, `npm run build`: check exit codes. No e2e.

## Working with §3.5 (slide icon column, branch `feat/slide-icon`)

- The icon column is fixed. In this plan a column is resizable only if its key is in `MOVABLE` (`column-order.ts`), so the icon column needs no code of mine: no handle, default track in the template.
- **Rebase needed:** both branches edit `LibraryTable.tsx` near `COLUMNS` and `template` and the header map, and the CSS module. Expect a textual conflict in the template construction; resolve by keeping §3.5's column definition and my `track(c)`. I will rebase onto `main` after §3.5 merges and a test asserts handles only on `MOVABLE` keys.
- If §3.5 adds pixels to the compact list, the Task 7 breakpoints need a recheck (their comment says they include fixed columns).
- §3.7 (program filter) touches the library store and sidebar; no shared lines with the column code.

## Risks

- **Pointer drag vs the header's HTML5 drag.** The header cell is `draggable`, so a press on a child can start a reorder drag. Mitigation as in Task 4; needs a real mouse and trackpad (hardware checklist). CI e2e covers existing column drags.
- **Percent widths exceed the table.** Several widened columns can leave Dance / Song at its 220 px minimum and push the row past the clipped edge. Mitigation: a per-column maximum, and clamping a drag so the resized columns leave room for Dance / Song's minimum and the fixed columns.
- **Collapse breakpoints are static** (Task 7).
- **Scrollbar width.** `100cqw` includes the vertical scrollbar, a few pixels more than the rows' width; the flexible Dance column absorbs it.
- **No save per window resize:** only a drag's release or a keyboard step saves.
- **jsdom has no layout:** width math lives in pure functions with pixel inputs; component tests stub `getBoundingClientRect`.

## Open questions for the maintainer

1. **Is Dance / Song resizable?** It is the one flexible column (`minmax(220px, 3fr)`); a stored percentage would remove the column that absorbs slack. My call: not resizable, it takes the remaining width, so widening a column narrows Dance / Song. Alternative: dragging Dance / Song's edge resizes the next column inversely.
2. **Program list breakpoints** stay as they are when widths are set (a widened column may clip the right side before columns collapse), or move with the sizes?
3. **Double-click on a handle resets that column** (a common convention, not in the issue): include it?
4. **Maximum width:** no column above 40% of the table. Acceptable?
5. **Keyboard step:** 1 percentage point per press, as the spec says; no larger step with extra modifiers.
