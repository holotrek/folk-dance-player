# Folk Dance Player — Plan 28: Clear Previously played and Now Playing (1.0.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button on the Program page clears Previously played and the current Now Playing song, so the player is idle and ▶ starts the program's first song (issue #84). Nothing is deleted: played songs return to their places and the play log is hidden from the list, not removed.

**Architecture:** One operation in main, `programs:clearPlayed(programId)`, run by `PlayerSession` (it stops what plays, then resets the program, then re-reads state once). The log is hidden by a new per-program mark, `programs.log_cleared_at`; `listPlayed` returns only entries after it, while replay and history keep every row. The renderers only call the channel and react to the usual `programs:changed` and `player:state`.

**Tech Stack:** As Plans 1–27. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.6, §4 (the release's one migration), §6, §7 question 3. Issue #84.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `PlayerSession` still decides what plays (spec §1); the control window and projector only follow its broadcasts.
- Migration `008-log-cleared.ts` (version 8; `007-holding-items` is the last): `ALTER TABLE programs ADD COLUMN log_cleared_at TEXT`, nullable, no data conversion. Appended to `migrations/index.ts`. No released migration is edited. The migration tests that check `user_version` are updated.
- The mark uses the schema's timestamp format (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`, milliseconds), the same as `play_log.played_at`, so a plain string compare is correct and a song starting right after the clear is never hidden.
- Clearing deletes no `play_log` row and no program item; it asks nothing (as End Program, AGENTS.md 2026-10-30).
- Custom CSS only in co-located `*.module.css`; no new Unicode symbol icons.

## Review Focus

- A song playing, paused, stopped or in a countdown is stopped and unloaded first, and nothing follows it (no pending auto-continue timer survives).
- Every program item (STOP markers included) has `played_at` reset, order untouched; ▶ then starts the first song, and `atStop`/`nextUp` are recomputed (not left true from an earlier halt).
- `listPlayed` hides entries at or before `log_cleared_at`; replay (`getLoggedPlay`) of a log id still works; the projector's `played` follows because it calls `listPlayed`.
- Previews and replays logged under the program after the clear show again; clearing twice moves the mark forward.
- Exactly one `programs:changed` and one `player:state` per clear.
- A duplicated program (`duplicateProgram`) does not copy the mark wrongly (it copies items, not the log: check).
- The button is disabled when there is nothing to clear.

## File Structure

- Create `src/main/db/migrations/008-log-cleared.ts`; modify `migrations/index.ts`.
- Modify `src/main/programs/history.ts` (`listPlayed` honours the mark), `src/main/programs/programs.ts` (`clearPlayedItems`: reset `played_at`, set `log_cleared_at`, `touch`, one transaction).
- Modify `SessionPorts` and `src/main/session/session-ports.ts` (a `clearPlayed(programId)` port, one `programsChanged` notice) and `src/main/session/player-session.ts` (`clearPlayed()`).
- Modify `src/shared/contract.ts` (`programs:clearPlayed`, in the channel map and the channel list) and `src/main/ipc/program-handlers.ts`.
- Modify `src/renderer/src/program/PlayedList.tsx` (button in the header).
- Tests: the migration tests under `tests/main/db`, `tests/main/programs/history.test.ts`, `tests/main/programs/programs.test.ts`, `tests/main/session/player-session.test.ts`, the handlers test, `tests/main/projector/` feed test, `tests/renderer/program/played-list.test.tsx`; one e2e spec (written, run by CI only).

## Task 1: Migration 008

- [ ] **Step 1: Write failing tests:** `'migration 8 adds programs.log_cleared_at, NULL for existing programs'` (migrate to 7, insert a program, migrate, column exists and is NULL); update any `user_version` expectations (7 to 8).
- [ ] **Step 2:** `npx vitest run tests/main/db` — expect FAIL.
- [ ] **Step 3:** Implement the migration and register it. **Step 4:** run again — PASS.

## Task 2: The log is hidden, not deleted

**Files:** `history.ts`, `programs.ts`; tests `history.test.ts`, `programs.test.ts`.

- [ ] **Step 1: Write failing tests:** `'listPlayed leaves out entries logged before the program was cleared'` (three plays, mark after the second: only the third shows, all three still in `play_log`); `'getLoggedPlay still finds a hidden entry'`; `'clearPlayedItems resets played_at on every item, STOPs included, and keeps their order'`; `'clearing twice only moves the mark forward'`; `'another program's log and items are untouched'`.
- [ ] **Step 2:** `npx vitest run tests/main/programs` — FAIL.
- [ ] **Step 3:** Implement: `listPlayed` joins `programs p` and adds `AND (p.log_cleared_at IS NULL OR l.played_at > p.log_cleared_at)`; `clearPlayedItems(db, programId)` in one transaction sets `played_at = NULL` on the program's items, sets `log_cleared_at` to now, calls `touch`.
- [ ] **Step 4:** run — PASS.

## Task 3: One operation in `PlayerSession`

**Files:** `SessionPorts`, `session-ports.ts`, `player-session.ts`; test `player-session.test.ts`.

- [ ] **Step 1: Write failing tests** (in-memory db, fake timers, like the existing ones): `'clearPlayed while playing stops the song, leaves nothing loaded, and ▶ then starts the first song'`; `'... during a countdown cancels it'`; `'... after halting at a STOP clears atStop, and nextUp is the first item'`; `'... with the player idle only resets the program and the log'`; `'emits one state and one programs notice'`; `'a late ended() from the cleared song is ignored'` (its `playId` no longer matches).
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3:** Implement `clearPlayed()`: `cancelCountdown()`; reset `stopProgram`/`stopHead`; `ports.clearPlayed(programId)`; one `update({ status: 'idle', current: null, countdown: null, atStop: false })`. The ports implementation runs `clearPlayedItems` and notices `programsChanged` once.
- [ ] **Step 4:** run — PASS.

## Task 4: The channel and the projector

- [ ] **Step 1: Write failing tests:** `'programs:clearPlayed hides the played list and idles the player'` (through `createHandlers`); `'the projector snapshot has no now-playing and no previously played after a clear'`; any contract test that enumerates channels.
- [ ] **Step 2:** run — FAIL. **Step 3:** add the channel to both lists in `contract.ts`; the handler calls `player.clearPlayed()` for the loaded program, inside the usual `edit(...)` wrapper so `programs:changed` goes out once. **Step 4:** run — PASS.

## Task 5: The button

**Files:** `PlayedList.tsx`; test `played-list.test.tsx`.

- [ ] **Step 1: Write failing tests:** `'has a Clear button in the header that calls programs:clearPlayed with the program id'`; `'is disabled when nothing is played, nothing is logged and nothing is loaded'`; `'is enabled while a song is loaded even with an empty list'`.
- [ ] **Step 2:** `npx vitest run tests/renderer/program` — FAIL.
- [ ] **Step 3:** Implement with a Mantine compact `Button` (`variant="subtle"`) beside the title. Enabled when `played.length > 0`, a song is loaded, or the program has played items (the program store lists only unplayed items today; if so, expose the played count on `ProgramDetail`). Errors go through `errorMessage()`.
- [ ] **Step 4:** run — PASS.

## Task 6: End-to-end, docs, commit

- [ ] **Step 1: E2E (written, not run locally; CI runs it):** play two songs, press Clear, expect Previously played empty, Now Playing idle, and ▶ plays the first song.
- [ ] **Step 2: Docs:** main spec §6.2 (the Clear button and what it hides); 1.0.0 spec §2 row 3.6 to Built; an AGENTS.md decision, "Clearing hides the log, deletes nothing" (the mark, why not delete, why no confirmation, `played_at` reset, one operation in `PlayerSession`); a CHANGELOG line; the hardware checklist step (clear mid-song, and with a long history, on the control window and projector).
- [ ] **Step 3:** run `npx vitest run`, `npm run typecheck`, `npx prettier --check .`, `npm run build` (no e2e locally).
- [ ] **Step 4:** Commit `feat: clear Previously played and Now Playing from the Program page`.

## Risks

- **Migration number clash:** only this item adds a migration in 1.0.0; if another branch lands one first, renumber before merge.
- **Late audio event:** the control window's `<audio>` may report `ended` for the cleared song; the `playId` guard covers it (tested).
- **Button enabling** needs the played-items fact in the renderer; it may need a small field on `ProgramDetail`.
- **Other readers of `play_log`:** only `listPlayed` (control window and projector feed) and `getLoggedPlay` read it today; `library/edit.ts` merges rows. Any future history view must decide about the mark itself.

## Open questions for the maintainer

1. **Hide or delete the log (spec §7.3).** Plan: hide via `log_cleared_at`, nothing lost, no confirmation. If delete is wanted, no migration is needed but a confirmation is, and saved programs lose their record.
2. **Button visibility.** The spec says hidden when the list is empty; the issue says disabled when nothing to clear. Plan: always in the Previously played header, disabled when there is nothing to clear (so a loaded Now Playing song with an empty list can still be cleared).
3. **Which program.** Plan: the loaded program only.

## Self-Review

- **Spec coverage:** stop first, reset `played_at`, hide the log, one operation, one broadcast, projector follows, disabled when nothing, migration, docs per spec §6.
- **Not testable in unit tests:** the real projector and a mid-song clear (hardware checklist).
