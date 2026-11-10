# Slide icon (Plan 27) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A song row shows a small photo icon when the dance on that row has a Canva slide and/or a slide image, in the Program page's library list, Holding and the program. A tooltip and an accessible name say which. Rows with neither show nothing.

**Architecture:** Main computes a `slide` field (`'canva' | 'image' | 'both' | null`) beside `hasNotesPdf`, in the same queries; nothing is stored. Renderer: one `SlideIcon` component in `components/icons.tsx` plus a small `SlideBadge` wrapper (tooltip + accessible name), used in the library table (a fixed column), program rows and Holding rows.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.5 (issue #82). §3.9 builds after this and treats the icon column as fixed.

## Global Constraints

- Main owns all state; no new IPC channel or event (`library:changed` and `programs:changed` already refetch).
- No migration: the columns exist (`dance_prefs.canva_page_id`, `slide_image_path`).
- UI from Mantine (`Tooltip`); the icon is an inline SVG component, never Unicode; custom CSS only in `*.module.css`.
- Test first (Vitest). Conventional commits. CHANGELOG line under Unreleased in the same commit. Agents run unit tests, typecheck, `prettier --check .` and build (no e2e; CI runs them).

## Decisions made in this plan

- **Field shape:** `slide: SlideKind | null` (`SlideKind = 'canva' | 'image' | 'both'`), one shared type for `LibraryRow` and `Track`, instead of the spec's boolean `hasSlide`, because the tooltip must say which. The renderer's "has one" test is `slide !== null`.
- **What counts:** `canva_page_id IS NOT NULL` (even before capture, and even if the slide has left its deck; open question 1) and `slide_image_path IS NOT NULL`. One shared SQL fragment `slideKindSql(...)` in `src/main/library/list.ts` (next to `shownPairingSql`) so the library, tracks and Holding cannot drift.
- **STOP markers:** no dance, so no icon.
- **Library placement:** a new fixed column `slide` in `LibraryTable`'s `ALL_COLUMNS`, right after `favorite` (`FIXED_FIRST = ['favorite', 'slide', 'dance']`), narrow (about 28px), a visually hidden "Slide" header label, never sortable, never collapsed by the container queries, and never part of `library.columns.*` (fixed keys are already dropped on read). The Music page shares the table, so it gets the column too (open question 2).
- **Program and Holding placement:** a slot before the label after the star; its width is reserved on rows without a slide so labels stay aligned.

## Files touched

- Modify: `src/shared/library.ts` (`LibraryRow.slide`), `src/shared/program.ts` (`Track.slide`), `src/main/library/list.ts`, `src/main/programs/tracks.ts` (`TRACK_COLUMNS`, `TrackRow`, `toTrack`), `src/main/session/player-session.ts` (hand-built track, line ~329), `src/renderer/src/components/icons.tsx`, `src/renderer/src/library/LibraryTable.tsx` and `.module.css`, `src/renderer/src/program/ProgramList.tsx`, `src/renderer/src/program/HoldingPanel.tsx` (and their CSS modules), test fixtures (`tests/renderer/program/fixtures.ts`, library row fixtures).
- Create: `src/renderer/src/components/SlideBadge.tsx` (and a `.module.css` only if needed).
- Tests: `tests/main/library/list.test.ts`, `tests/main/programs/programs.test.ts` (plus a Holding case), `tests/renderer/components/slide-badge.test.tsx`, `tests/renderer/library/music-page.test.tsx`, `tests/renderer/program/program-list.test.tsx`, `tests/renderer/program/holding-panel.test.tsx`.
- Docs: `CHANGELOG.md`, main spec §6 (Library and Program pages), `docs/manual-testing/pre-release-hardware.md`, AGENTS.md decision.

## Tasks

### Task 1: Main reports `slide` for the library

- [ ] Failing tests in `tests/main/library/list.test.ts`: only a Canva page ID gives `'canva'` (no captured image needed); only an image gives `'image'`; both gives `'both'`; neither gives `null`; the dance judged is the song's shown (default) dance; removing the image or unlinking the slide changes the next listing.
- [ ] Add `SlideKind` and `LibraryRow.slide`; add `slideKindSql` in `list.ts`, select it, pass it through the row mapper.
- [ ] Tests pass.

### Task 2: Main reports `slide` on program and Holding tracks

- [ ] Failing tests: a program item with a chosen dance reports that dance's slide, not the song's default; a NULL choice resolves to the default dance's; `programs:setItemDance` changes the field on the next read; Holding rows report it too; the play-log rows (same `TRACK_COLUMNS`) carry it harmlessly.
- [ ] Add `slide` to `TRACK_COLUMNS`/`TrackRow`/`toTrack` as a scalar subquery on `d.id` (works with `trackJoins`). Update `player-session.ts` and fixtures.
- [ ] Tests pass.

### Task 3: `SlideIcon` and `SlideBadge`

- [ ] Failing component tests: `slide="canva"` renders an element named "Canva slide", `image` "Image", `both` "Canva slide and image"; hovering or focusing shows the tooltip ("This dance has a Canva slide" / "an image" / "a Canva slide and an image"); `null` renders nothing, or with `reserve` an empty fixed-width spacer hidden from assistive tech.
- [ ] `SlideIcon` inline SVG (`currentColor`, `aria-hidden`) in `icons.tsx`; `SlideBadge` wraps it in a Mantine `Tooltip` with `role="img"` and `aria-label`.
- [ ] Tests pass.

### Task 4: Library table column

- [ ] Failing tests (Music page and the compact Program-page list): a row with a slide shows the icon with its name, one without shows none; the header has no sort control; after `library:changed` with the slide removed the icon goes; the column is not movable and stays after the star when a custom order is saved.
- [ ] Add the `slide` column, exclude it from the movable set, make sure no container query collapses it, add the hidden header label.
- [ ] Tests pass, including `tests/renderer/tour/targets.test.tsx`.

### Task 5: Program and Holding rows

- [ ] Failing tests: an item with `slide` shows the badge before its label, one without shows none and the label keeps its position (reserved slot); a STOP row shows none; existing queries by role and name still find rows (the badge must not change a row's accessible name unexpectedly; decide in the test).
- [ ] Add the badge slot to both lists and their CSS modules.
- [ ] Tests pass.

### Task 6: Docs and finish

- [ ] CHANGELOG line under Unreleased.
- [ ] Main spec §6; hardware checklist line (icon in all three lists after linking and removing a slide).
- [ ] AGENTS.md decision: the icon is derived from the dance's prefs on each listing as `slide: 'canva' | 'image' | 'both' | null`; a slide gone from its deck still counts; one fixed, unsortable, never-collapsing column. _Rejected:_ a stored flag; a boolean (tooltip could not say which).
- [ ] `npx prettier --check .`, `npm run typecheck`, `npm test`, `npm run build` all exit 0.

## Risks

- **Narrow Program panel:** the extra track costs label width; keep it fixed and small, and check the compact layout at the minimum window size by hand.
- **Merge conflicts:** `LibraryTable.tsx` and its CSS with §3.7 and §3.9. Keep the `ALL_COLUMNS`/`FIXED_FIRST` edit small; §3.9 must treat `slide` as fixed like `favorite`.
- **Required field:** a new required `slide` breaks hand-built `Track`s and fixtures; typecheck finds them all.
- **Tooltips on virtualized rows:** one Mantine `Tooltip` per visible row should be cheap; fall back to a `title` attribute if scrolling a large library suffers.
- **E2E:** specs that count columns or match row text may shift; CI runs them.

## Open questions for the maintainer

1. **A slide gone from its deck (spec question 6).** Plan: it still counts (it keeps its image and the projector shows the image), so the icon matches the editor's dance card. Alternative: count only slides still in their deck, or with an image. Confirm?
2. **Music page.** The library table is shared, so the Music page also gets the icon, not only the Program page's list. OK?
3. **Wording.** Tooltip "This dance has a Canva slide / an image / a Canva slide and an image"; accessible name "Canva slide", "Image", "Canva slide and image". Fine?
