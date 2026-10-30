# Folk Dance Player — Plan 20: Program total time and ending time (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidebar shows each program's total play time; the Program page shows the loaded program's total and when it will end ("Ending on 9:42 PM"); the projector's footer shows one quiet "Ending about 9:42 PM".

**Architecture:** One pure module, `shared/program-time.ts`, does every sum (so main, the control window and the projector agree). Main adds two numbers to each `ProgramSummary` (for the sidebar) and one to the projector snapshot (`tailMs`); the renderers add the clock. The Program page computes its own numbers from the items it already holds, and gets the playing song's position from the program store (the player bar publishes it). No migration, no new channel.

**Tech Stack:** As Plans 1–19. No new dependencies.

**Ships in the same pull request as Plans 18 and 19.** The Program page's header was arranged by Plan 18 (End Program); this plan adds the centered times to it.

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.9 (open questions 2 and 3 decided 2026-10-31). Main spec §6.1, §6.2 and §8.2 are updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- **What counts (spec §3.9):** unplayed track items only. A song with no known duration counts as 0; songs whose file is missing or that are removed are left out (playback skips them). Auto-continue seconds are added **once for each gap between two songs with no STOP between them**; a STOP adds nothing. With auto-continue off, no gaps are added.
- **STOP markers are ignored** by the ending time (decided 2026-10-31): the Program page shows "if no pauses" beside it when the unplayed items contain a STOP; the projector never says so.
- **Projector:** one line, "Ending about 9:42 PM", in the footer; never the total (decided 2026-10-31). The projector stays read-only and never reads the program.
- The first version ignores the playback speed.
- Formats: totals with the existing `formatTime` (`M:SS`, or `H:MM:SS` from an hour); clock times as the system's short time (`toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`, for example "9:42 PM").
- The clock refreshes once a minute and whenever the program, the player or the position changes.
- Custom CSS only in co-located `*.module.css` files. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A STOP between two songs removes the gap there; a missing or removed song between two songs does not remove the gap (the neighbours still play back to back); two STOPs in a row behave as one.
- Auto-continue off: no gaps; the ending time is still shown.
- Paused or stopped: the ending time moves later each minute (the remaining time is constant, the clock is not); playing: it stays steady.
- Counting down between songs: the seconds left are added once, and the gap after the song that just ended is not added twice.
- A program with nothing left to play, or no program: no times, no projector footer, no `NaN` or "Invalid Date".
- Songs with no duration: zero, no `NaN`; the total never goes negative when the position runs past the duration.
- The end time passing midnight shows as a clock time (no date), as the spec's format.

## File Structure

- Create `src/shared/program-time.ts`: `playTime`, `totalMs`, `tailMs`, `formatClock`.
- Modify `src/shared/program.ts` (`ProgramSummary` gains `unplayedDurationMs`, `unplayedGaps`), `src/shared/projector.ts` (`ProjectorSnapshot.tailMs`).
- Modify `src/main/programs/programs.ts` (`listPrograms`), `src/main/projector/snapshot.ts`.
- Modify `src/renderer/src/program/program-store.ts` (`positionMs`, `setPosition`), `PlayerBar.tsx` (publishes the position), `ProgramList.tsx` (header), `src/renderer/src/components/sidebar/ProgramsSection.tsx` (line), `src/renderer/src/projector/ProjectorView.tsx` and its CSS (footer); create `src/renderer/src/program/ProgramTimes.tsx` and `useNow.ts`.
- Tests: `tests/shared/program-time.test.ts` (new), `tests/main/programs/programs.test.ts`, `tests/main/projector/snapshot.test.ts`, `tests/renderer/program/programs-section.test.tsx`, `program-list.test.tsx`, `program-times.test.tsx` (new), `tests/renderer/projector/projector-view.test.tsx`, `e2e/app.spec.ts`.

## Task 1: The sums

**Files:** Create `src/shared/program-time.ts`; Test `tests/shared/program-time.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface PlayTime { durationMs: number; gaps: number }
  export interface AutoContinue { enabled: boolean; seconds: number }
  export function playTime(items: ProgramItem[], afterSong?: boolean): PlayTime
  export function totalMs(time: PlayTime, autoContinue: AutoContinue): number
  export function tailMs(items: ProgramItem[], player: Pick<PlayerState, 'status' | 'countdown' | 'autoContinue'>): number
  export function formatClock(ms: number): string  // ms since the epoch
  ```
  `playTime` takes unplayed items in order. Counted songs are tracks with `!isMissing && !isRemoved`, adding `durationMs ?? 0`. A gap is counted before a counted song when a song precedes it with no STOP in between; with `afterSong` true (a song is playing now) the first counted song also has a gap before it unless a STOP comes before it. `totalMs` is `durationMs + (enabled ? gaps * seconds * 1000 : 0)`. `tailMs` is what remains after the current song: status `playing`/`paused`/`stopped` → `totalMs(playTime(items, true))`; `countdown` → `totalMs(playTime(items, false)) + secondsLeft * 1000`; anything else → `totalMs(playTime(items, false))`.

- [ ] **Step 1: Write failing tests** (items built with small helpers): `'adds up unplayed songs and counts a gap between neighbours'` (three 3:00 songs → 9:00 and 2 gaps; with 5 s and auto-continue on, total 9:10; off → 9:00); `'a STOP between two songs removes the gap there, two STOPs act as one'`; `'a missing or removed song is left out, and its neighbours still have a gap between them'`; `'a song with no duration counts as zero'`; `'afterSong adds the gap before the first song unless a STOP comes first'`; `'tailMs: playing adds the gap after the current song; a countdown adds the seconds left once; idle adds neither'`; `'formatClock gives the short local time with no date'` (fake timezone-independent: compare against `new Date(ms).toLocaleTimeString([], …)`).
- [ ] **Step 2:** Run `npx vitest run tests/shared/program-time.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement the four functions as specified.
- [ ] **Step 4:** Run the same test — expect PASS.

## Task 2: Main supplies the numbers

**Files:** Modify `programs.ts`, `shared/program.ts`, `snapshot.ts`, `shared/projector.ts`; Test `programs.test.ts`, `snapshot.test.ts`, fixtures that build `ProgramSummary` or `ProjectorSnapshot`.

**Interfaces:**
- Consumes: Task 1.
- Produces: `ProgramSummary.unplayedDurationMs: number` and `unplayedGaps: number`; `ProjectorSnapshot.tailMs: number | null` (null while nothing is shown; `EMPTY_SNAPSHOT.tailMs` is null).

- [ ] **Step 1: Write failing tests:** `'a program’s summary carries the unplayed songs’ time and gaps'` (STOP in the middle, a missing file, a played song, a song with no duration); `'the snapshot carries the time that remains after the middle song'` for both `now` (gap after the playing song included) and `next` (countdown seconds included); `'no tail without a program or with nothing to show'`.
- [ ] **Step 2:** Run `npx vitest run tests/main` — expect FAIL.
- [ ] **Step 3:** Implement. `listPrograms` keeps its query for the existing columns and gets the items' kind, `duration_ms`, `is_missing` and `removed_at IS NOT NULL` for the listed programs in one extra query ordered by program and position, folded with `playTime` (unplayed items only). `buildProjectorSnapshot` sets `tailMs: tailMs(unplayed, player)` when there is a middle entry, else null.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean (fixtures gain the new fields).

## Task 3: The sidebar line

**Files:** Modify `ProgramsSection.tsx`; Test `programs-section.test.tsx`.

- [ ] **Step 1: Write the failing test** `'under the song count, each program shows its total play time'`: two programs with `unplayedDurationMs`/`unplayedGaps`, the player's `autoContinue` `{ enabled: true, seconds: 5 }` → "Total play time: 12:30" (gaps added); with auto-continue disabled the gaps are not; a program with nothing to play shows no line.
- [ ] **Step 2:** Run it — expect FAIL.
- [ ] **Step 3:** Implement: the entry's description becomes two lines (the song count, then "Total play time: M:SS") using `totalMs({ durationMs, gaps }, player.autoContinue)` and `formatTime`.
- [ ] **Step 4:** Run `npx vitest run tests/renderer/program` — expect PASS.

## Task 4: The Program page header

**Files:** Create `ProgramTimes.tsx`, `useNow.ts`; modify `program-store.ts`, `PlayerBar.tsx`, `ProgramList.tsx`; Test `program-times.test.tsx`, `program-store.test.ts`, `program-list.test.tsx`.

**Interfaces:**
- Produces: `useNow(intervalMs = 60_000): number` (re-renders each interval); store `positionMs: number` with `setPosition(ms: number): void`; `ProgramTimes` (no props) reads the program, player and position from the store and renders, centered and dimmed, "Total play time: M:SS" and "Ending on 9:42 PM" (plus " if no pauses" when the unplayed items contain a STOP), nothing when there are no songs left. Ending = `now + remaining + tailMs(items, player)`, where `remaining` is `max(durationMs − positionMs, 0)` for a playing, paused or stopped song (stopped counts the full duration), else 0.
- `PlayerBar` calls `setPosition(Math.floor(audio.positionMs / 1000) * 1000)` when the whole second changes.

- [ ] **Step 1: Write failing tests** (fake `Date` as the existing default-name tests do): `'shows the total and the time the program will end'`; `'while paused the ending time moves later as the clock runs'` (advance 3 minutes, no position change → later by 3 minutes); `'while playing it stays steady as the position advances'`; `'adds “if no pauses” when the program has a STOP'`; `'shows nothing when nothing is left to play'`; `'the store keeps the position the player bar reports'`. In `program-list.test.tsx`: the header has the times centered between the title group and the buttons (assert DOM order: title, times, buttons).
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program` — expect FAIL.
- [ ] **Step 3:** Implement. The header becomes three slots: the title group, `ProgramTimes` (`flex: 1`, centered, with horizontal margin), the buttons; the times collapse (`display: none`) when the panel is too narrow, by a container query in `ProgramList.module.css` (tuned by eye).
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.

## Task 5: The projector's footer

**Files:** Modify `ProjectorView.tsx`, `ProjectorView.module.css`, `src/renderer/src/projector/main.tsx` if the clock is injected there; Test `projector-view.test.tsx`.

**Interfaces:**
- Consumes: `snapshot.tailMs`, the `progress` prop, `useNow`.
- Produces: `<footer aria-label="Ending time">Ending about 9:42 PM</footer>` at the bottom of the screen, small and dim, shown when `snapshot.tailMs !== null` and there is a `middle` entry. Ending = `now + remaining + tailMs`, `remaining` as in Task 4 but from `progress` (`durationMs − positionMs`, only while `middle.kind === 'now'` and the progress is for this play; paused counts as in Task 4).

- [ ] **Step 1: Write failing tests:** `'shows when the program will end'` (fake clock, a `now` snapshot with `tailMs` and progress); `'while paused the time moves later as the clock runs'`; `'shows nothing without a program or when nothing is playing or next'`; `'never shows the total or "if no pauses"'`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/projector` — expect FAIL.
- [ ] **Step 3:** Implement; `.screen` keeps its flex column and the footer sits after the upcoming list (`flex: 0 0 auto`), font about `2.2vh`, color `#7a7a7a`.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.

## Task 6: End-to-end, docs, commit

- [ ] **Step 1: E2E:** `'the sidebar and the Program page show the program’s times'`: add Hora, Kolo and Tfilati (the fixture MP3s' durations are tiny, so the test reads the text, not exact minutes); assert the sidebar entry contains "Total play time:" and the Program page header contains "Ending on" and the same total; end the program → the times are gone.
- [ ] **Step 2: Docs:**
  - 0.3.0 spec §2 row 3.9 → `Built (Plan 20)`.
  - Main spec §6.1 (sidebar line), §6.2 (header: total and "Ending on", "if no pauses", ignores speed) and §8.2 (the projector's footer line).
  - AGENTS.md decision (2026-10-31): **Program times are computed by one shared module (`shared/program-time.ts`); STOPs are ignored and speed is ignored.** Why: main, the control window and the projector must agree; a STOP's length is unknowable, and an invented one would be a guess shown as fact. The projector gets `tailMs` in its snapshot and adds the clock itself, so it never reads the program and an end time that is a minute stale costs nothing. _Rejected:_ an assumed length per STOP (a setting for a guess); sending the projector a finished end time (stale while paused).
  - CHANGELOG Added: "Each program shows its total play time in the sidebar. The Program page shows the total and when the program will end, and the projector shows a quiet “Ending about 9:42 PM” in its footer. Songs that are missing from disk are left out, auto-continue seconds are included, and pauses at STOP markers are not (the Program page says so)."
  - Hardware checklist step: play a program with a STOP; the Program page's “Ending on” stays steady while playing, moves later while paused, says “if no pauses”; the projector's footer shows the same time without that note; the header still fits at a narrow window (the times hide before anything overlaps).
- [ ] **Step 3:** Run `npx vitest run`, `npm run typecheck`, `npm run test:e2e` — expect all clean.
- [ ] **Step 4:** Commit `feat: show a program's total play time and when it will end`.

## Self-Review

- **Spec coverage:** what counts, gaps around STOPs, missing/removed/no-duration → Task 1 and 2; sidebar line → Task 3; Program page total + Ending on + "if no pauses" + steady/paused behavior + clock refresh → Task 4; projector footer, no total → Task 5; speed ignored and STOPs ignored → Global Constraints and AGENTS.md; docs and e2e → Task 6.
- **Types:** `PlayTime`, `AutoContinue`, `playTime`, `totalMs`, `tailMs`, `formatClock` (Task 1) are consumed by Tasks 2–5; `ProgramSummary.unplayedDurationMs/unplayedGaps` (Task 2) by Task 3; `positionMs`/`setPosition` and `useNow` (Task 4) by Tasks 4–5.
- **Not testable in jsdom:** header fit at narrow widths and the footer's look, covered by the hardware checklist.
- **Open for the maintainer:** none blocking.
