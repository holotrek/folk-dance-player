# Folk Dance Player — Plan 19: Previously played reads oldest to newest and stays at the bottom (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Previously played" lists oldest first, so previous, now and upcoming read as one rolling window going down the screen. The control window's list stays scrolled to the newest entry (unless the organizer scrolled up), and the projector's list is anchored to its bottom, just above Now Playing.

**Architecture:** The order is decided once, in main (`listPlayed` sorts ascending); neither renderer reverses it. The control window follows the bottom with a small hook. The projector anchors with CSS, because it is read-only and nobody can scroll it.

**Tech Stack:** As Plans 1–18. No new dependencies.

**Ships in the same pull request as Plans 18 and 20.**

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.10 (open question 8 decided 2026-10-31: follow the bottom only while the organizer is at it). Main spec §6.2 and §8.2 are updated by this plan.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- Order is `ORDER BY l.played_at ASC, l.id ASC` (spec §3.10); `ProjectorSnapshot.played` is documented "oldest first".
- The control window follows new entries only while at, or within **two rows (64 px)** of, the bottom (spec §3.10, decided 2026-10-31); it also scrolls to the end when it mounts and when a program loads.
- The projector never scrolls with script; the list is anchored to its bottom edge, and the oldest entries fall off the top when there are too many. With a Canva slide (`titleOnly`) the narrow column keeps the same anchoring.
- Double-click to replay and dragging an entry back into the program are unchanged.
- Custom CSS only in co-located `*.module.css` files. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Two log entries with the same `played_at` keep their insertion order (tie-break on `id` ascending).
- The playing song is still left out of the projector's list, and the list does not reverse when it is filtered.
- A long history on the projector drops the oldest entries off the top, never the newest, and never overlaps Now Playing (checked by eye in the hardware checklist; jsdom has no layout).
- Anything that assumed the first entry is the newest (`played[0]`, `.at(-1)` as oldest) is found and fixed.
- Scrolling up in the control window, then a new song starting, does not move the list; scrolling back to the bottom resumes following.
- An empty history, and a program change (another program's log), start at the bottom without error.

## File Structure

- Modify `src/main/programs/history.ts` (order and comment), `src/shared/projector.ts` (comment), `src/main/projector/snapshot.ts` (comment only; no reordering).
- Create `src/renderer/src/program/useFollowBottom.ts`; modify `PlayedList.tsx`.
- Modify `src/renderer/src/projector/ProjectorView.module.css` (and `ProjectorView.tsx` only if a class is needed).
- Tests: `tests/main/programs/history.test.ts`, `tests/main/projector/snapshot.test.ts`, `tests/renderer/program/played-list.test.tsx`, `tests/renderer/program/use-follow-bottom.test.tsx` (new), `tests/renderer/projector/projector-view.test.tsx`.

## Task 1: Oldest first, decided in main

**Files:** Modify `history.ts`, `shared/projector.ts`; Test `tests/main/programs/history.test.ts`, `tests/main/projector/snapshot.test.ts`, `tests/main/session/player-session.test.ts` and `tests/main/library/removed-songs.test.ts` (existing expectations).

- [ ] **Step 1:** Search for assumptions: `grep -rn "played\[0\]\|played.at(\|\.played\b" src tests` and read each hit. Record in the commit message any that needed a change.
- [ ] **Step 2: Write failing tests:** `'lists a program’s plays oldest first, with the same time in insertion order'` (history): three plays, two sharing one `played_at`, expect titles in play order; update the existing history, player-session and removed-songs expectations that listed newest first; `'the snapshot keeps the log’s order (oldest first) and leaves out the playing song'` (snapshot).
- [ ] **Step 3:** Run `npx vitest run tests/main` — expect the order tests to FAIL.
- [ ] **Step 4:** Implement: `listPlayed` orders `l.played_at ASC, l.id ASC` and its comment says "oldest first"; `ProjectorSnapshot.played` comment says "oldest first".
- [ ] **Step 5:** Run `npx vitest run` — expect PASS. Renderer fixtures that built `played` newest first are re-ordered.

## Task 2: The control window follows the bottom

**Files:** Create `useFollowBottom.ts`; modify `PlayedList.tsx`; Test `use-follow-bottom.test.tsx`, `played-list.test.tsx`.

**Interfaces:**
- Produces: `useFollowBottom(count: number, resetKey: unknown): React.RefObject<HTMLDivElement | null>` — the returned ref goes on the scrolling element. It scrolls the element to its end on mount, when `resetKey` changes, and when `count` grows while the element is within `NEAR_BOTTOM_PX = 64` of its bottom; the "was near the bottom" fact is tracked from `scroll` events, so a new entry cannot make the list think the organizer left it. `PlayedList` passes `played.length` and the program ID.

- [ ] **Step 1: Write failing tests** (jsdom has no layout: the tests define `scrollHeight`, `clientHeight` and a settable `scrollTop` on the element, and dispatch `scroll`): `'scrolls to the end when it mounts and when the program changes'`; `'follows a new entry while at the bottom'`; `'stays put when the organizer has scrolled up, and follows again after scrolling back down'`. In `played-list.test.tsx`: `'entries read oldest first, with the newest last'`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/program` — expect FAIL.
- [ ] **Step 3:** Implement the hook (a layout effect for the scroll, so there is no visible jump) and use it on `PlayedList`'s scrolling list; update the panel's comment to "oldest first".
- [ ] **Step 4:** Run `npx vitest run tests/renderer/program` — expect PASS.

## Task 3: The projector sticks to the bottom

**Files:** Modify `ProjectorView.module.css`; Test `tests/renderer/projector/projector-view.test.tsx`.

- [ ] **Step 1: Write failing tests:** `'previously played reads oldest to newest, the newest right before Now Playing'` (with a snapshot of five entries, the "Previously played" list's last item is the newest and the "Previously played" section is immediately followed by the "Now playing" section in the DOM); `'with a slide, the narrow played column keeps the same order'`.
- [ ] **Step 2:** Run `npx vitest run tests/renderer/projector` — expect FAIL only if the fixtures were newest first; update the fixtures to oldest first, then PASS (the DOM order is the markup's; the bottom anchoring is CSS, below).
- [ ] **Step 3:** CSS: `.played` becomes a flex column; its `.list` is `display: flex; flex-direction: column; justify-content: flex-end; flex: 0 1 auto; min-height: 0; overflow: hidden` so the oldest entries clip at the top when the section reaches its `max-height: 28vh`; in `.slideRow .played` the list also has `margin-top: auto` so it sits at the bottom of the slide's height. The heading stays above the list.
- [ ] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.

## Task 4: End-to-end, docs, commit

- [ ] **Step 1: E2E:** extend the existing `'play, and the projector’s snapshot follows'` test (or add one beside it) so that after two songs have played, `programs:played` through `running.invoke` returns the first song first, and the projector snapshot's `played` is in the same order.
- [ ] **Step 2: Docs:** 0.3.0 spec §2 row 3.10 → `Built (Plan 19)`; main spec §6.2 ("Previously played", oldest first, follows the bottom) and §8.2 (oldest first, anchored just above Now Playing); CHANGELOG Changed: "Previously played now reads oldest to newest, so previous, now playing and up next read down the screen as one list. The Program page's list stays at the newest song unless you scroll up, and the projector shows the most recent song just above Now Playing."; hardware checklist step: play a long program on the projector (more songs than fit, with and without a Canva slide): the newest song is just above Now Playing and the oldest fall off the top; in the control window scroll up during a song, and the list stays; scroll to the bottom, and it follows again.
- [ ] **Step 3:** Run `npx vitest run`, `npm run typecheck`, `npm run test:e2e` — expect all clean.
- [ ] **Step 4:** Commit `feat: Previously played reads oldest to newest and stays at the bottom`.

## Self-Review

- **Spec coverage:** order in main + comments + `played[0]` search → Task 1; control window follows the bottom (mount, program load, new entry, scrolled-up exception) → Task 2; projector bottom anchoring with and without a slide, playing song left out → Tasks 1 and 3; replay and drag unchanged (no change to those handlers); docs and e2e → Task 4.
- **Types:** `useFollowBottom` is defined in Task 2 and used only by `PlayedList`; no shared type changes.
- **Not testable in jsdom:** the projector's bottom anchoring and clipping (CSS), covered by the hardware checklist.
- **Open for the maintainer:** none blocking.
