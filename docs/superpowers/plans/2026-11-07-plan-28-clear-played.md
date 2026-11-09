# Folk Dance Player — Plan 28: Clear Previously played and Now Playing (1.0.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button on the Program page clears Previously played and the current Now Playing song, so the player is idle (issue #84). Clear only unloads Now Playing and hides the play log from the list. Nothing is deleted, and played songs stay played: nothing returns to the program (maintainer decision after manual testing, 2026-11-09).

**Architecture:** One operation in main, `programs:clearPlayed(programId)`, run by `PlayerSession` (it stops what plays, hides the log, then re-reads state once). The log is hidden by a new per-program mark, `programs.log_cleared_at`; `listPlayed` returns only entries after it, while replay and history keep every row. The renderers only call the channel and react to the usual `programs:changed` and `player:state`.

**Tech Stack:** As Plans 1–27. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.6, §4 (the release's one migration), §6, §7 question 3. Issue #84.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `PlayerSession` still decides what plays (spec §1); the control window and projector only follow its broadcasts.
- Migration `008-log-cleared.ts` (version 8; `007-holding-items` is the last): `ALTER TABLE programs ADD COLUMN log_cleared_at TEXT`, nullable, no data conversion. Appended to `migrations/index.ts`. No released migration is edited. The migration tests that check `user_version` are updated.
- The mark uses the schema's timestamp format (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`, milliseconds), the same as `play_log.played_at`, so a plain string compare is correct and a song starting right after the clear is never hidden.
- Clearing deletes no `play_log` row, and changes no program item (`played_at` is never touched); it asks nothing (as End Program, AGENTS.md 2026-10-30).
- Custom CSS only in co-located `*.module.css`; no new Unicode symbol icons.

## Review Focus

- A song playing, paused, stopped or in a countdown is stopped and unloaded first, and nothing follows it (no pending auto-continue timer survives).
- Played items (STOP markers included) stay played, in order: nothing returns to the program, and `nextUp` stays the next unplayed item; `atStop` is cleared.
- `listPlayed` hides entries at or before `log_cleared_at`; replay (`getLoggedPlay`) of a log id still works; the projector's `played` follows because it calls `listPlayed`.
- Previews and replays logged under the program after the clear show again; clearing twice moves the mark forward.
- Exactly one `programs:changed` and one `player:state` per clear.
- A duplicated program (`duplicateProgram`) does not copy the mark wrongly (it copies items, not the log: check).
- The button is disabled when there is nothing to clear.

## File Structure

- Create `src/main/db/migrations/008-log-cleared.ts`; modify `migrations/index.ts`.
- Modify `src/main/programs/history.ts` (`listPlayed` honours the mark), `src/main/programs/programs.ts` (`clearPlayLog`: set `log_cleared_at`, `touch`; no item changes).
- Modify `SessionPorts` and `src/main/session/session-ports.ts` (a `clearPlayLog(programId)` port, one `programsChanged` notice) and `src/main/session/player-session.ts` (`clearPlayed()`).
- Modify `src/shared/contract.ts` (`programs:clearPlayed`, in the channel map and the channel list) and `src/main/ipc/program-handlers.ts`.
- Modify `src/renderer/src/program/PlayedList.tsx` (button in the header).
- Tests: the migration tests under `tests/main/db`, `tests/main/programs/history.test.ts`, `tests/main/programs/programs.test.ts`, `tests/main/session/player-session.test.ts`, the handlers test, `tests/main/projector/` feed test, `tests/renderer/program/played-list.test.tsx`; one e2e spec (written, run by CI only).

## Task 1: Migration 008

- [ ] **Step 1: Write failing tests:** `'migration 8 adds programs.log_cleared_at, NULL for existing programs'` (migrate to 7, insert a program, migrate, column exists and is NULL); update any `user_version` expectations (7 to 8).
- [ ] **Step 2:** `npx vitest run tests/main/db` — expect FAIL.
- [ ] **Step 3:** Implement the migration and register it. **Step 4:** run again — PASS.

## Task 2: The log is hidden, not deleted

**Files:** `history.ts`, `programs.ts`; tests `history.test.ts`, `programs.test.ts`.

- [ ] **Step 1: Write failing tests:** `'listPlayed leaves out entries logged before the program was cleared'` (three plays, mark after the second: only the third shows, all three still in `play_log`); `'getLoggedPlay still finds a hidden entry'`; `'clearPlayLog leaves every item's played_at alone, STOPs included'`; `'clearing twice only moves the mark forward'`; `'another program's log and items are untouched'`.
- [ ] **Step 2:** `npx vitest run tests/main/programs` — FAIL.
- [ ] **Step 3:** Implement: `listPlayed` joins `programs p` and adds `AND (p.log_cleared_at IS NULL OR l.played_at > p.log_cleared_at)`; `clearPlayLog(db, programId)` sets `log_cleared_at` to now and calls `touch`; it never touches items.
- [ ] **Step 4:** run — PASS.

## Task 3: One operation in `PlayerSession`

**Files:** `SessionPorts`, `session-ports.ts`, `player-session.ts`; test `player-session.test.ts`.

- [ ] **Step 1: Write failing tests** (in-memory db, fake timers, like the existing ones): `'clearPlayed while playing stops and unloads the song, leaves it played, and ▶ plays what was next'`; `'... during a countdown cancels it'`; `'... after halting at a STOP clears atStop and the STOP does not return'`; `'emits one state'`; `'only the loaded program is cleared'`; `'a late ended() from the cleared song is ignored'` (its `playId` no longer matches).
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3:** Implement `clearPlayed()`: `cancelCountdown()`; reset `stopProgram`/`stopHead`; `ports.clearPlayLog(programId)`; one `update({ status: 'idle', current: null, countdown: null, atStop: false })`. The ports implementation runs `clearPlayLog`; the handler sends the one `programs:changed`.
- [ ] **Step 4:** run — PASS.

## Task 4: The channel and the projector

- [ ] **Step 1: Write failing tests:** `'programs:clearPlayed hides the played list and idles the player'` (through `createHandlers`); `'the projector snapshot has no now-playing and no previously played after a clear'`; any contract test that enumerates channels.
- [ ] **Step 2:** run — FAIL. **Step 3:** add the channel to both lists in `contract.ts`; the handler calls `player.clearPlayed()` for the loaded program, inside the usual `edit(...)` wrapper so `programs:changed` goes out once. **Step 4:** run — PASS.

## Task 5: The button

**Files:** `PlayedList.tsx`; test `played-list.test.tsx`.

- [ ] **Step 1: Write failing tests:** `'has a Clear button in the header that calls programs:clearPlayed with the program id'`; `'is disabled when nothing is played, nothing is logged and nothing is loaded'`; `'is enabled while a song is loaded even with an empty list'`.
- [ ] **Step 2:** `npx vitest run tests/renderer/program` — FAIL.
- [ ] **Step 3:** Implement with a Mantine compact `Button` (`variant="subtle"`) beside the title. Enabled when `played.length > 0` or a song is loaded. Errors go through `errorMessage()`.
- [ ] **Step 4:** run — PASS.

## Task 6: End-to-end, docs, commit

- [ ] **Step 1: E2E (written, not run locally; CI runs it):** play two songs, press Clear, expect Previously played empty, Now Playing idle, and the played songs do not return.
- [ ] **Step 2: Docs:** main spec §6.2 (the Clear button and what it hides); 1.0.0 spec §2 row 3.6 to Built; an AGENTS.md decision, "Clearing hides the log, deletes nothing" (the mark, why not delete, why no confirmation, no `played_at` change (nothing returns to the program), one operation in `PlayerSession`); a CHANGELOG line; the hardware checklist step (clear mid-song, and with a long history, on the control window and projector).
- [ ] **Step 3:** run `npx vitest run`, `npm run typecheck`, `npx prettier --check .`, `npm run build` (no e2e locally).
- [ ] **Step 4:** Commit `feat: clear Previously played and Now Playing from the Program page`.

## Risks

- **Migration number clash:** only this item adds a migration in 1.0.0; if another branch lands one first, renumber before merge.
- **Late audio event:** the control window's `<audio>` may report `ended` for the cleared song; the `playId` guard covers it (tested).
- **Button enabling** uses only what the renderer has (log entries shown, a song loaded); no `ProgramDetail` field is needed.
- **Other readers of `play_log`:** only `listPlayed` (control window and projector feed) and `getLoggedPlay` read it today; `library/edit.ts` merges rows. Any future history view must decide about the mark itself.

## Open questions for the maintainer

1. **Hide or delete the log (spec §7.3).** Plan: hide via `log_cleared_at`, nothing lost, no confirmation. If delete is wanted, no migration is needed but a confirmation is, and saved programs lose their record.
2. **Button visibility.** The spec says hidden when the list is empty; the issue says disabled when nothing to clear. Plan: always in the Previously played header, disabled when there is nothing to clear (so a loaded Now Playing song with an empty list can still be cleared).
3. **Which program.** Plan: the loaded program only.

## Self-Review

- **Spec coverage:** stop first, hide the log, leave `played_at` alone, one operation, one broadcast, projector follows, button enabled only with list entries or a loaded song, migration, docs per spec §6.
- **Not testable in unit tests:** the real projector and a mid-song clear (hardware checklist).
