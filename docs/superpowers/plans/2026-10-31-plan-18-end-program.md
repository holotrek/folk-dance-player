# Folk Dance Player — Plan 18: End Program, then Start New Program (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An **End Program** button unloads the current program, which empties the list and Previously played without deleting anything. With nothing loaded, a **Start New Program** button opens the same "New program" dialog as the sidebar's **+**.

**Architecture:** End Program calls the existing `programs:setCurrent(null)`; the program, its unplayed order and its play log stay saved and can be loaded again from the sidebar. The create-and-load step and the dialog's wording move into one component, `NewProgramPrompt`, used by the sidebar and the program list. No migration, no new channel.

**Tech Stack:** As Plans 1–17. No new dependencies.

**Ships as one pull request.**

**Spec:** `docs/superpowers/specs/2026-10-18-release-0-3-0-design.md` §3.11. Main spec §6.2 (the program list) is updated by this plan. It must land with or before §3.9 (spec §5, step 6), which arranges the same header.

## Global Constraints

- Test-first (Vitest); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` in the same commit as the user-facing change.
- **End Program deletes nothing and needs no confirmation** (spec §3.11): the order of songs is already stored, so clearing the screen is `setCurrent(null)`. It must not use `programs:removeItems`.
- A song that is playing keeps playing to its end and nothing follows it (no program is loaded). Spec §7 Q9 (ask first?) is answered by the spec's default: no confirmation.
- Dropping songs on the empty list still works (`ensureProgram` creates a program with the default name); the button is an option, not a gate.
- UI from Mantine components; custom CSS only in co-located `*.module.css` files.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A loaded program whose songs have all played is not "ended": it keeps "Nothing left to play", its Previously played and **End Program**.
- After End Program, loading the same program from the sidebar restores its unplayed items and its Previously played exactly.
- End Program while a song plays: the song keeps playing, the player bar and projector follow the player as they do when no program is loaded, and the next song does not start.
- Ending a program, then dropping a song on the empty list, creates a new default-named program (existing `ensureProgram` behavior), not a reload of the ended one.
- The sidebar **+** and **Start New Program** behave identically, including a name error (empty name) shown in the dialog.

## File Structure

- Create `src/renderer/src/program/NewProgramPrompt.tsx`: the "New program" dialog (default name, **Create**, creates and loads).
- Modify `src/renderer/src/components/sidebar/ProgramsSection.tsx`: the **+** uses it (rename keeps its own prompt).
- Modify `src/renderer/src/program/ProgramList.tsx`: **End Program** button; **Start New Program** in the empty state.
- Tests: `tests/main/ipc/program-handlers.test.ts`, `tests/renderer/program/program-list.test.tsx`, `tests/renderer/program/programs-section.test.tsx`, `e2e/app.spec.ts`.

## Task 1: Unloading keeps everything (main)

**Files:** Test `tests/main/ipc/program-handlers.test.ts`. No production change is expected.

- [x] **Step 1: Write the tests** beside the existing `setCurrent` tests:
  - `'unloading a program leaves it, its items and its log saved, and loads again as it was'`: create a program with Hora and Kolo, load it, play and end Hora (so Kolo is next and Hora is in the log), `programs:setCurrent(null)`; assert `settings.get('currentProgramId')` is null, `player:getState().programId` is null and `nextUp` is null; then `programs:get(p)` still lists Kolo unplayed and `programs:played(p)` still lists Hora; `programs:setCurrent(p)` makes Kolo next up again.
  - `'unloading while a song plays lets it play on, and nothing follows it'`: load, `player:play`, `setCurrent(null)`; state is still `playing` the same song; after `player:ended(playId)` the status is `idle` and `current` is null.
- [x] **Step 2:** Run `npx vitest run tests/main/ipc/program-handlers.test.ts` — expect PASS (the behavior exists). If either fails, fix `PlayerSession`/the handler minimally and say so in the commit message.

## Task 2: The shared New program dialog

**Files:** Create `src/renderer/src/program/NewProgramPrompt.tsx`; modify `ProgramsSection.tsx`; Test `tests/renderer/program/programs-section.test.tsx`.

**Interfaces:**
- Produces: `NewProgramPrompt(props: { opened: boolean; onClose: () => void }): React.JSX.Element`. It renders `NamePrompt` titled "New program", `initialValue={defaultProgramName()}`, `submitLabel="Create"`; on submit it calls `programs:create` with the name, then `load` on the program store with the new ID (the sidebar's current code, moved).

- [x] **Step 1: Write the failing test** in `programs-section.test.tsx` (the existing sidebar tests keep passing): `'the New program dialog is the shared NewProgramPrompt'` — render `<NewProgramPrompt opened onClose={…} />` inside `renderWithLibrary` with `programs:create` → 3: the dialog "New program" opens with `defaultProgramName()` filled in (fake `Date` as the existing default-name test does); typing a name and pressing **Create** calls `programs:create` with it then `programs:setCurrent` with 3; an empty name shows the error from `programs:create` rejecting and keeps the dialog open.
- [x] **Step 2:** Run `npx vitest run tests/renderer/program/programs-section.test.tsx` — expect FAIL (module missing).
- [x] **Step 3:** Create the component and make `ProgramsSection`'s create mode use it (`prompt` state keeps `{ mode: 'rename' }` for rename only; a separate `creating` boolean for the new one).
- [x] **Step 4:** Run the same test file — expect PASS, including the unchanged sidebar create test.

## Task 3: End Program and Start New Program

**Files:** Modify `ProgramList.tsx`; Test `program-list.test.tsx`.

**Interfaces:**
- Consumes: `NewProgramPrompt`, `programStore.getState().load(null)`.
- Produces: a **End Program** button in the program panel's header, after **Add selected** (`size="compact-sm" variant="default"`), disabled while no program is loaded; it calls `load(null)` and shows an error from a rejection like the other buttons. With no program loaded (`programId === null`), the list area shows a **Start New Program** button (opens `NewProgramPrompt`) above one dimmed hint line, "Or drag songs here, or choose a program in the sidebar." (replacing "No program loaded. Drag songs here to start one, or choose one in the sidebar."). A loaded program with nothing left keeps "Nothing left to play. Drag songs here, or select songs and use ➕ Add selected."

- [x] **Step 1: Write failing tests** in `program-list.test.tsx`:
  - `'End Program unloads the program without asking, and removes nothing'`: click **End Program** → exactly one `programs:setCurrent` call with `[null]`, no `programs:removeItems`, no dialog.
  - `'End Program is disabled while no program is loaded'`.
  - `'with nothing loaded the list offers Start New Program'`: the button is present, the old "No program loaded" text is not; clicking it opens the "New program" dialog with the default name; **Create** calls `programs:create` then `programs:setCurrent` with the new ID.
  - `'a loaded program with nothing left still offers End Program'`: `programs:get` returns no items → "Nothing left to play" and an enabled **End Program**.
  - `'dropping songs on the empty list still starts a program'` — update the existing test (and its siblings) to find the drop target by the hint text "Or drag songs here" instead of "No program loaded".
- [x] **Step 2:** Run `npx vitest run tests/renderer/program` — expect the new tests and the updated drop tests to FAIL.
- [x] **Step 3:** Implement as above.
- [x] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS and clean.

## Task 4: End-to-end, docs, commit

**Files:** `e2e/app.spec.ts`, `docs/manual-testing/pre-release-hardware.md`, `CHANGELOG.md`, `AGENTS.md`, the main spec §6.2, the 0.3.0 spec.

- [x] **Step 1: Write the e2e test** `'end a program, start a new one, and load the first again'`: add Hora and Kolo to a program by dragging (as the existing tests do); click **End Program** → the Program list shows **Start New Program** and Previously played is empty; click **Start New Program**, **Create**, and add Tfilati; in the sidebar's Programs group click the first program → Hora and Kolo are listed again. Run `npm run test:e2e` — expect PASS.
- [x] **Step 2: Docs:**
  - 0.3.0 spec §2 row 3.11 → `Built (Plan 18)`; Q9 answered ("no confirmation; the song plays on", 2026-10-31).
  - Main spec §6.2: End Program (unloads, keeps the program and its record), Start New Program.
  - AGENTS.md decision (2026-10-31): **End Program unloads the program with `programs:setCurrent(null)`; it deletes nothing and does not ask.** Why: a program's order and play log are already stored, so a mistaken click loses nothing and a confirmation would only slow the organizer between sessions; a song that is playing finishes. The "New program" dialog is one component, `NewProgramPrompt`, shared by the sidebar and the empty list. _Rejected:_ deleting the unplayed items (loses the planned order for good); asking first while a song plays.
  - CHANGELOG Added: "**End Program** (in the Program page's header) clears the program and Previously played from the screen. It is still saved in the sidebar, with what was played. With no program loaded, **Start New Program** asks for a name and starts one."
  - Hardware checklist step 36: end a program with a song playing (the song finishes, nothing follows, the projector shows no next song), start a new program from the empty list, load the first one again from the sidebar.
- [x] **Step 3:** Run `npx vitest run`, `npm run typecheck` — expect all clean.
- [x] **Step 4:** Commit `feat: end a program and start a new one from the Program page`.
- [ ] **Step 5:** Open the pull request after an independent review.

## Self-Review

- **Spec coverage:** End Program unloads, clears list and Previously played, deletes nothing, no confirmation, plays on → Tasks 1 and 3; Start New Program shares the sidebar's dialog and path → Tasks 2–3; dropping on the empty list unchanged and a fully played program not "ended" → Task 3 tests; end-to-end run → Task 4.
- **Types:** `NewProgramPrompt` (Task 2) is consumed by `ProgramsSection` (Task 2) and `ProgramList` (Task 3); `load(null)` already exists on the program store.
- **Rulings for the maintainer to veto:** the empty state keeps one dimmed hint line under the button (the spec says "instead of the text"; the drag hint is still useful); End Program sits after **Add selected**.
- **Open for the maintainer:** none blocking.
