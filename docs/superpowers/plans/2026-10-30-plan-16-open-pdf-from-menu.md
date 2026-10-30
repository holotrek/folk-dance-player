# Folk Dance Player — Plan 16: Open a dance's PDF from a row's menu (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an entry's dance has a PDF attached, its right-click (⋯) menu offers **Open PDF**: on library rows, Holding rows and program items.

**Architecture:** Rows and program tracks gain a boolean `hasNotesPdf`, read in the SQL the lists already run. The menus call the existing `library:openNotesPdf` channel with the dance ID. No migration, no new channel, no main-process logic beyond the flag.

**Tech Stack:** As Plans 1–15. No new dependencies.

**Ships as one pull request.**

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.6 ("Open PDF from a row's menu"). Builds on Plan 15.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- The renderer sends only the dance ID; it never receives a path (Plan 15).
- The flag is a database fact (`notes_pdf_path IS NOT NULL`); no disk check per row.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A dance with no `dance_prefs` row, or a row with no PDF: `hasNotesPdf` is false, not null.
- A song with several dances: a library row reflects its shown (default) dance; a program item reflects its chosen dance, and changes when the item's dance changes.
- A STOP marker and a song with no dance: no Open PDF.
- A recorded PDF whose file is gone: the item shows and fails with "The PDF is missing", visibly, without throwing.
- Every place that builds a `Track` or `LibraryRow` carries the field (`player-session.ts` copies a track for Now Playing; test fixtures).

## File Structure

- Modify `src/shared/library.ts`, `src/shared/program.ts`: `hasNotesPdf` on `LibraryRow` and `Track`.
- Modify `src/main/library/list.ts`, `src/main/programs/tracks.ts`, `src/main/session/player-session.ts`: read and carry the flag.
- Modify `src/renderer/src/library/SongMenu.tsx` (props `danceId`, `hasNotesPdf`; **Open PDF** item), `LibraryTable.tsx`, `src/renderer/src/program/HoldingPanel.tsx` (pass them), `ProgramList.tsx` (`ItemMenu`).
- Tests: `tests/main/library/list.test.ts`, `tests/main/programs/programs.test.ts`, `tests/renderer/program/program-list.test.tsx`, `tests/renderer/program/holding-panel.test.tsx`, and the row/track fixtures that gain the field.

## Task 1: The flag on rows and tracks

**Interfaces:**
- Produces: `LibraryRow.hasNotesPdf: boolean`, `Track.hasNotesPdf: boolean`.

- [x] **Step 1: Write failing tests:** `'says whether the shown dance has a PDF attached'` (list); `'each song item says whether its dance has a PDF attached'` (programs); extend the existing `toEqual`/`toMatchObject` expectations with `hasNotesPdf: false`.
- [x] **Step 2:** Run `npx vitest run tests/main/library/list.test.ts tests/main/programs` — expect FAIL.
- [x] **Step 3:** Implement: `list.ts` selects `(dp.notes_pdf_path IS NOT NULL) AS hasNotesPdf` (it already joins `dance_prefs dp`) and converts it to a boolean; `TRACK_COLUMNS` adds `EXISTS (SELECT 1 FROM dance_prefs …)`, converted in `toTrack`; `player-session.ts` copies the field into the Now Playing track.
- [x] **Step 4:** Run the same tests and `npm run typecheck` (fixtures that build rows or tracks gain `hasNotesPdf: false`) — expect PASS and clean.

## Task 2: Open PDF in the menus

**Interfaces:**
- Consumes: `hasNotesPdf`, `library:openNotesPdf`.
- Produces: `SongMenu` props gain `danceId: number | null` and `hasNotesPdf: boolean`; **Open PDF** shows when `hasNotesPdf` and `danceId !== null`, right after Edit details; a failure is a red `notifications.show`. `ItemMenu` shows **Open PDF** for a track with `hasNotesPdf`, failures through its `onError`.

- [x] **Step 1: Write failing tests:** program list `'an item’s menu offers Open PDF only for a dance with a PDF'` (calls `library:openNotesPdf` with the item's dance ID); Holding `'a held song’s menu offers Open PDF only when its dance has one'`.
- [x] **Step 2:** Run `npx vitest run tests/renderer/program` — expect FAIL.
- [x] **Step 3:** Implement as above; pass the new props from `LibraryTable` and `HoldingPanel`.
- [x] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.
- [ ] **Step 5:** Commit `feat: open a dance's PDF from a row's menu`, with the CHANGELOG Added line ("A song, program item or held song whose dance has a PDF now offers **Open PDF** in its right-click (⋯) menu.").

## Task 3: Docs and hardware check

- [x] **Step 1:** 0.3.0 spec §3.6 and its §2 row updated (this plan's counterpart).
- [x] **Step 2:** `docs/manual-testing/pre-release-hardware.md`: attach a PDF to a dance, then open it from a library row, a held song and a program item's menu; delete the app's copy and see "The PDF is missing" appear.
- [ ] **Step 3:** No AGENTS.md decision: the flag is a database fact and the rest follows Plan 15's rules (note the "no per-row disk check" choice in the spec only).
- [ ] **Step 4:** Open the pull request after an independent review.

## Self-Review

- **Spec coverage:** menu placement, which dance, the flag, the missing-copy behavior and tests (§3.6 addition) → Tasks 1–2; docs → Task 3.
- **Types:** `hasNotesPdf` is on `LibraryRow` and `Track` (Task 1) and is consumed by `SongMenu` and `ItemMenu` (Task 2); `player-session.ts` is the one non-list place that constructs a `Track`.
- **Open for the maintainer:** whether a missing PDF should hide the item (needs a disk check per row) instead of failing with a message; this plan keeps the item.
