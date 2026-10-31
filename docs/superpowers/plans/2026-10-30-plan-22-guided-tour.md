# Folk Dance Player — Plan 22: The guided tour

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hands-on, game-style tour (spotlight, popover, advances only when the person has done the thing) in two parts, Basic and Advanced, run on a throwaway practice library, with intro screens, two saved flags, a launch offer and Help menu entries.

**Architecture:** Main builds a second handler set (`createHandlers`) over a temp database with a generated demo library and a real, playable practice tune. `registerHandlers` routes each window's calls to that set while the window is in tour mode. Entering or leaving tour mode reloads the control window, so nothing real is swapped and a crash restores itself. The renderer has a small tour engine (steps are data, "done when" conditions read the real stores) and an overlay.

**Tech Stack:** As Plans 1–21; Mantine `Popover` for the popover. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-guided-tour-design.md`. Read it first: the step table (§3), the flag table (§2.2) and the intro screens (§2.1.1) are the content this plan builds.

**Ships as one pull request**, in commits per task (the build must compile at each commit).

## Global Constraints

- **Test-first** (Vitest, Playwright for e2e); conventional-commit messages; a `CHANGELOG.md` line under `Unreleased` and the docs in Task 7. **Before every push run CI's exact steps and check each exit code** (`npx prettier --check .`, `npm run typecheck`, `npm test` including its "Unhandled Errors" section, `npx electron-vite build`, `npm run test:e2e`, and the e2e suite again at 1000×640; see AGENTS.md). Never filter test output down to pass/fail lines.
- **The real library and real settings are never written by a tour** (only `tour.basic` / `tour.advanced`, which are real settings by design). The real database is never swapped or closed.
- Practice-context handlers for import, sync, Canva, projector, remote, attachments and file dialogs answer "Not available in the practice library" (explain-only steps never call them).
- UI from Mantine components; custom CSS only in co-located `*.module.css`. Pin no new dependencies.
- Every exit from a tour ends on the Music tab of the real library. The tune is the traditional "Hava Nagila" melody only (no lyrics, no modern arrangement), synthesized by our script.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A crash or quit mid-tour: the next launch opens the real library (tour mode lives only in main's memory); stale `fdp-tour-*` folders are swept.
- Broadcasts never cross: the real context's `library:changed`/`player:state`/`appleSync:notice` never reach a tour-mode window; the practice context's never reach another window.
- Things outside the window must not touch the real library during a tour: the global media keys, File/Help menu actions, the idle auto-show, and background Apple Music sync notices.
- A step the person cannot finish or leave: they did the action early (completes at once), switched page, closed a dialog, or the target is gone ("Take me there"); Escape always offers Leave.
- The practice tune really plays and reaches its end (the auto-continue wait), the speed change keeps the pitch (it is a normal `<audio>` play), and the real player is stopped on entry.
- The real database file is byte-for-byte unchanged by a whole tour.

## File Structure

- Create `src/shared/tour.ts` (types, `tourOffer`), modify `src/shared/settings.ts`, `src/shared/contract.ts`.
- Create `scripts/make-tour-tune.mts`, `resources/tour/hava-nagila.wav`, `resources/tour/README.md`; modify `electron-builder.yml` (ship `resources/tour/`).
- Create `src/main/tour/demo-library.ts`, `practice-context.ts`, `tour-mode.ts` (the active tour: window ID, context, enter/leave, sweep), `src/main/ipc/tour-handlers.ts`; modify `src/main/ipc/register.ts`, `handlers.ts`, `src/main/index.ts`, `src/main/menu.ts`.
- Create `src/renderer/src/tour/`: `steps.ts` (data), `engine.ts`, `TourProvider.tsx`, `TourOverlay.tsx` (+ `.module.css`), `TourIntro.tsx`, `TourBanner.tsx`, `TourTarget.tsx`; modify `App.tsx`, `main.tsx`, and add `data-tour` targets across the pages and the player bar.
- Tests: `tests/shared/tour.test.ts`, `tests/main/tour/*.test.ts`, `tests/main/ipc/register.test.ts`, `tests/renderer/tour/*.test.tsx`, `e2e/tour.spec.ts`.

## Task 1: Flags, the offer rule, and the tour channels

**Files:** Create `src/shared/tour.ts`, `src/main/ipc/tour-handlers.ts`; modify `settings.ts`, `contract.ts`, `handlers.ts`; Test `tests/shared/tour.test.ts`, `tests/main/ipc/tour-handlers.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // shared/tour.ts
  export type TourPart = 'basic' | 'advanced'
  export type TourFlag = 'unseen' | 'done' | 'hidden'
  export function tourOffer(flags: Record<TourPart, TourFlag>): TourPart | null
  // settings: 'tour.basic' and 'tour.advanced': TourFlag, default 'unseen', validated
  // contract invoke channels (served by the REAL handler set, also while a window is in tour mode):
  'tour:offer'  { args: []; result: TourPart | null }              // from the real flags
  'tour:state'  { args: []; result: { part: TourPart | null } }    // which part this window is touring (null: none)
  'tour:start'  { args: [part: TourPart]; result: void }           // enters tour mode, reloads the window (Task 3)
  'tour:finish' { args: [part: TourPart]; result: void }           // sets the part's flag to 'done'
  'tour:hide'   { args: [part: TourPart]; result: void }           // sets it to 'hidden'
  'tour:leave'  { args: []; result: void }                         // leaves tour mode, reloads, shows Music (Task 3)
  // event: 'tour:intro' (payload TourPart): main asks the renderer to show a part's intro screen (Help menu)
  ```
  `tourOffer`: `'basic'` while `basic === 'unseen'`; else `'advanced'` while `basic === 'done'` and `advanced === 'unseen'`; else `null` (so `hidden` on Basic offers nothing).

- [x] **Step 1: Write failing tests.** `tour.test.ts`: `tourOffer` for every row of the spec's §2.2 (unseen/unseen → basic; done/unseen → advanced; done/done, hidden/*, done/hidden → null). `tour-handlers.test.ts` (as `program-handlers.test.ts` builds handlers over an in-memory DB): `'tour:finish and tour:hide set the real flags'`; `'tour:offer follows the flags'`; settings reject a bad value (`settings:set('tour.basic', 'x')`). The `tour:start`/`tour:leave`/`tour:state` handlers are tested in Task 3 (they need the tour mode).
- [x] **Step 2:** Run `npx vitest run tests/shared/tour.test.ts tests/main/ipc/tour-handlers.test.ts` — expect FAIL.
- [x] **Step 3:** Implement the module, the settings keys (type, default, validator), the contract entries (invoke list and `tour:intro` in the event list), and `tourHandlers(deps)` for `offer`, `finish`, `hide` (`start`, `leave`, `state` take injected functions, wired in Task 3; until then they are no-ops in `HandlerDeps`).
- [x] **Step 4:** Run the same tests, `npm run typecheck`, and `npx vitest run` — expect PASS and clean (fixtures that list every channel or setting gain the new ones).
- [x] **Step 5:** Commit `feat: tour flags and the offer rule`.

## Task 2: The practice tune and the demo library

**Files:** Create `scripts/make-tour-tune.mts`, `resources/tour/hava-nagila.wav`, `resources/tour/README.md`, `src/main/tour/demo-library.ts`; modify `electron-builder.yml`; Test `tests/main/tour/demo-library.test.ts`, `tests/scripts/make-tour-tune.test.ts` (if scripts are tested elsewhere, follow that).

**Interfaces:**
- Produces: `npm run tour:tune` (runs the script); `buildDemoLibrary(dir: string): { db: DatabaseSync; dbPath: string; tunePath: string }` — creates `dir/library.sqlite` (opened and migrated with `MIGRATIONS`), copies of the tune under `dir/music/`, and the contents below; `PRACTICE_TUNE_MS` (the tune's duration, stored as `files.duration_ms`).
  Contents (spec §5): about eight songs from several countries with title, artist, country; **one tune with two dances**; **one dance used by two tunes** with different teachers on the two pairings; a favorite; a local playlist; a **synced-style playlist** (`apple_xml` mirror) inside a folder; one saved program already listed in the sidebar. Built with the app's own functions (`createDance`, `linkDance`, `createPlaylist`, `createProgram`, `addTracks`, …) and a file/song insert like the e2e/test helpers; the builder picks real folk dance names.

- [x] **Step 1: Write failing tests** (`demo-library.test.ts`): `'builds a migrated library with the shapes the tour needs'` (a song with two dances; a dance linked to two songs with different teachers; a mirror playlist whose `folderId` is set; a local playlist; a favorite; one program; about eight songs); `'every song has a file that exists, is the practice tune, and has a duration'`; `'the dance of the "edit once" step is shared by exactly two songs'`; `'building twice in different folders gives independent databases'`; the tune test: `'the tune is a valid WAV of about 25 seconds, mono, with audible content'` (read the header and check non-silence).
- [x] **Step 2:** Run `npx vitest run tests/main/tour` — expect FAIL.
- [x] **Step 3:** Write `make-tour-tune.mts`: synthesize the traditional "Hava Nagila" melody (the 1922 *Sefer Hashirim* tune; notes written out in the script, a simple plucked/flute-like additive tone with a soft attack and release, steady tempo so a speed change is audible) to `resources/tour/hava-nagila.wav` (mono, 22,050 Hz, 16-bit, about 25 s). `README.md` records the rights reasoning from spec §5.1 (melody only, no lyrics, our own synthesis) and how to regenerate. Add the Settings → About credit text in Task 7. Then implement `buildDemoLibrary` and ship `resources/tour/` via `extraResources` in `electron-builder.yml` (and resolve its path in dev and packaged builds the way `resources/bin/` is resolved).
- [x] **Step 4:** Run `npm run tour:tune` once and commit the WAV; run `npx vitest run tests/main/tour` and typecheck — expect PASS.
- [x] **Step 5:** Commit `feat: the practice tune and the demo library`.

## Task 3: The practice context, routing, and entering and leaving a tour

**Files:** Create `src/main/tour/practice-context.ts`, `tour-mode.ts`; modify `ipc/register.ts`, `ipc/tour-handlers.ts`, `index.ts`, `menu.ts`; Test `tests/main/tour/practice-context.test.ts`, `tour-mode.test.ts`, `tests/main/ipc/register.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // practice-context.ts
  createPracticeContext(opts: { dir: string; send(channel, payload): void; appVersion: string }): {
    handlers: InvokeHandlers          // createHandlers over the demo library; unavailable services answer "Not available in the practice library"
    mediaPath(fileId: number): string | null
    dispose(): void                   // closes the database and deletes `dir`
  }
  // tour-mode.ts
  createTourMode(deps: {
    realHandlers: InvokeHandlers; tmpDir: string; makeContext(dir, send): PracticeContext;
    stopRealPlayer(): void; reload(windowId: number): void; showMusic(windowId: number): void }): {
    handlersFor(senderId: number): InvokeHandlers   // practice set for the touring window, except the tour:* channels, which are always real
    start(windowId: number, part: TourPart): void   // stops the real player, builds the context, marks the window, reloads
    leave(): void                                   // unmarks, disposes, reloads, shows Music
    state(senderId: number): { part: TourPart | null }
    active(): boolean
    mediaPath(fileId: number): string | null | undefined // undefined when no tour is active
    sweepStale(): void                              // deletes fdp-tour-* folders in tmpDir from earlier runs
  }
  // register.ts
  registerHandlers(ipc: Pick<IpcMain, 'handle'>, handlersFor: (event: { sender: { id: number } }) => InvokeHandlers): void
  ```
  `index.ts` wires: `registerHandlers(ipcMain, (e) => tour.handlersFor(e.sender.id))`; `broadcast()` skips the touring window; the practice context's `send` targets only that window; the media protocol asks `tour.mediaPath(id)` first (when active) and otherwise the real lookup (slide and dance-image URLs answer 404 during a tour); the remote's media keys, the menu actions that act on the real library (Sync with Apple Music, Sync now), and the idle auto-show do nothing while `tour.active()`; Help menu: **Take the Basic Tour…** / **Take the Advanced Tour…** send `tour:intro(part)`; at startup call `tour.sweepStale()`.

- [x] **Step 1: Write failing tests.**
  - `register.test.ts` (adapt the existing): a call from a window is served by `handlersFor(event)`.
  - `practice-context.test.ts`: `'serves the demo library through the real handlers'` (`library:list`, `programs:list`, `playlists:list` answer the demo data); `'unavailable services answer a clear message'` (`import:start`, `import:pickMusic`, `library:attachPdf`-style channel, `appleSync:enable`, `canva:*` reject with "Not available in the practice library"; `projector:status` reports off); `'settings are its own'` (`settings:set` changes only the practice settings); `'changes are announced through send, not elsewhere'` (a favorite change calls `send('library:changed', null)`); `'the practice tune is playable: play a program song, the player state is playing, and ended() advances'`; `'mediaPath resolves a demo file id'`; `'dispose deletes the folder and closes the database'`.
  - `tour-mode.test.ts` (fakes for the context and callbacks): `'start stops the real player, builds a context and reloads the window'`; `'handlersFor gives the touring window the practice set and every other window the real one'`; `'the tour:* channels are always real'`; `'leave disposes, reloads and shows Music'`; `'state reports the part for the touring window only'`; `'sweepStale removes only old fdp-tour-* folders'`; `'starting a tour while one is active replaces it (the old context is disposed)'`.
  - A **no-write guarantee**: `'a whole scripted session through the practice handlers leaves the real database file byte-identical'` (hash the real db file before and after; use a real file DB for the "real" side).
- [x] **Step 2:** Run `npx vitest run tests/main` — expect FAIL.
- [x] **Step 3:** Implement as above. `createHandlers` is given stub `importer`, `dialogs` (reject), no `projector`/`remote`/`canva`/`appleSync`/`attachments`; `onLibraryChanged`/`onProgramsChanged` coalesce into `send`; the practice `PlayerSession` is built like the real one over `createSessionPorts(db, practiceSettings, undefined, notices)` with `send('player:state', …)`. `tour:start`/`tour:leave`/`tour:state` handlers call `tourMode`.
- [x] **Step 4:** Run `npx vitest run`, `npm run typecheck`, and a manual smoke: `npm run dev`, Help → Take the Basic Tour… (the intro arrives in Task 4, so for now call `window.api.invoke('tour:start','basic')` from the devtools console): the window reloads on the practice library, songs list, the tune plays; `tour:leave` returns to the real library on Music. Record the result in the commit message.
- [x] **Step 5:** Commit `feat: a practice context for the tour, entered by reloading the window`.

## Task 4: The tour engine, overlay, intro screens, offer and banner

**Files:** Create `src/renderer/src/tour/{engine.ts,TourProvider.tsx,TourOverlay.tsx,TourOverlay.module.css,TourIntro.tsx,TourBanner.tsx,TourTarget.tsx,steps.ts}`; modify `App.tsx`, `main.tsx`; Test `tests/renderer/tour/engine.test.ts`, `overlay.test.tsx`, `intro.test.tsx`.

**Interfaces:**
- Produces:
  ```ts
  // steps.ts
  export type StepKind = 'do' | 'explain' | 'choice' | 'intro'
  export interface StepContext { api: RendererApi; library: LibraryStore; program: ProgramStore; page: Page; targetExists(id: string): boolean }
  export interface TourStep {
    id: string; part: TourPart; page: Page | null; kind: StepKind
    target?: string | [from: string, to: string]   // data-tour ids; a pair for drag steps
    title: string; body: string
    done?: (ctx: StepContext) => boolean | Promise<boolean>   // 'do' steps only
  }
  // engine.ts (pure)
  createTourEngine(steps: TourStep[], opts: { onFinishPart(part): void; onLeave(): void }): {
    state(): { index: number; step: TourStep; total: number; completed: boolean }
    evaluate(ctx: StepContext): Promise<void>   // advances while the current 'do' step is done (so an early action completes at once)
    next(): void                                 // 'explain' and 'intro' steps only
    choose(option: 'learn-more' | 'start-now'): void
    subscribe(fn): () => void
  }
  // TourProvider: reads `tour:state` at boot; when a part is active it renders the overlay for the current step, switches the page (`setPage`), re-evaluates on library:changed / programs:changed / player:state / settings changes and on DOM `input`/`click` events; offers Leave on Escape.
  // TourIntro({ part, mode: 'offer' | 'help' | 'interstitial', ... })  // §2.1.1
  // TourBanner(): "Practice library: your real music is safe", rendered at the top of the header while touring.
  ```
  The overlay is a fixed full-screen blocker with a hole around the target (clip-path) so only the target receives pointer events, a ring on the target (steady under reduced motion), and a Mantine `Popover` anchored to the target with the title, body, "Step n of N" and **Leave the tour** (and **Next** on explain/intro steps). It follows scroll and resize, scrolls the target into view, and shows **Take me there** if the target is missing.

- [x] **Step 1: Write failing tests.**
  - `engine.test.ts`: `'moves through steps in order'`; `'a do step advances only when its condition is true, and completes at once when it already is'`; `'explain and intro steps advance only with next()'`; `'choose learn-more continues into Advanced (after its intro interstitial), start-now finishes Basic and leaves'`; `'finishing a part calls onFinishPart once; leaving part-way does not'`.
  - `overlay.test.tsx` (fake API, two sample steps): `'shows the popover at the target and dims the rest'`; `'a click outside the hole does nothing, a click on the target reaches it'`; `'Next only on explain steps'`; `'Escape asks to leave; Keep going closes the ask; Leave calls tour:leave'`; `'switches to the step's page'`; `'Take me there appears when the target is missing'`; `'shows the banner while touring'`.
  - `intro.test.tsx`: `'the Basic and Advanced texts appear'`; `'Not now closes and sets no flag, with no reload'`; `'Don't show this again calls tour:hide'`; `'Help shows the intro without Don't show this again'`; `'Start the tour calls tour:start(part)'`; `'the interstitial has the single button Let's go'`; `'the launch offer appears when tour:offer returns a part, and not otherwise'`.
- [x] **Step 2:** Run `npx vitest run tests/renderer/tour` — expect FAIL.
- [x] **Step 3:** Implement the engine as a plain state machine; the provider and overlay on top; `TourIntro` for the three modes (launch offer, Help via the `tour:intro` event, in-tour interstitial); mount `TourProvider` inside `App` (it needs the stores and `setPage`); the banner inside the header; a two-step sample tour in `steps.ts` to prove the loop (replaced in Tasks 5–6).
- [x] **Step 4:** Run `npx vitest run`, `npm run typecheck`, and the manual smoke from Task 3 (the sample tour runs in the practice library; Help → Take the Basic Tour… shows the intro).
- [x] **Step 5:** Commit `feat: the tour engine, overlay and intro screens`.

## Task 5: The Basic tour

**Files:** Modify `steps.ts` and the pages/components that need `data-tour` targets (`MusicPage`/`LibraryTable`/`SongEditor`/dance cards, `ProgramPage`/`ProgramList`/`HoldingPanel`/`PlayerBar`, the sidebar); Test `tests/renderer/tour/basic-steps.test.ts`.

**Interfaces:** Steps 0–16 of spec §3 (Basic) as `TourStep`s, in order, with ids `basic.import`, `basic.edit`, … and targets named for what they light up (for example `music.add`, `music.sync`, `library.row`, `editor`, `editor.dance-card`, `editor.teacher`, `program.search`, `library.song`, `program.panel`, `program.dance-dialog`, `program.remove`, `holding.panel`, `library.star`, `player.play`, `player.speed`, `player.volume`, `player.wait`). Each is a `data-tour` attribute (or `<TourTarget id>`) on the existing element; no new visible UI. Wording is plain language (spec §1, §3), drafted by the builder.

Done-when conditions (read the real stores / API, per spec §3): a song is selected (step 2); the shared dance's saved field changed, then the other song selected (step 4); the library search is non-empty and the list narrowed, then the program has the dragged song (step 8); the "Which dance?" dialog answered (step 9: the item's dance matches the chosen, or the dialog closed after being open); an item removed (10); a song was in Holding and then back in the program (11, by watching the holding list and program together); a song is a favorite (12); `player.status === 'playing'` (13); the speed differs from 1 and the volume from its start (14). Explain steps: 1, 3, 5, 6, 7, 15; 16 is the choice.

- [x] **Step 1: Write failing tests** (`basic-steps.test.ts`, with stores over the fake API): the step list has the right ids, order, pages, kinds and kinds-with-`done`; each `done` condition is false in the starting state and true after the stated change (build the state with the store functions and fake API replies); `'every target id used by a step is attached to an element in the rendered pages'` (render the pages in the practice-like fake and assert `[data-tour="<id>"]` exists, or the dialog opens it).
- [x] **Step 2:** Run `npx vitest run tests/renderer/tour` — expect FAIL.
- [x] **Step 3:** Add the targets and the steps. Where a target only exists after an action (the dance dialog, the editor), the step names the element that opens it as its target first, or the engine's "Take me there" covers it.
- [x] **Step 4:** Run `npx vitest run` and `npm run typecheck` — expect PASS; smoke-test the whole Basic tour by hand in `npm run dev` (each step lights the right thing; the tune plays; speed and volume work; Leave works at every step) and note anything to adjust.
- [x] **Step 5:** Commit `feat: the Basic tour`.

## Task 6: The Advanced tour

**Files:** Modify `steps.ts` and the targets needed (`PlayerBar` projector switch and auto-show, sidebar programs and playlists sections, `SettingsPage` sections); Test `tests/renderer/tour/advanced-steps.test.ts`.

**Interfaces:** Steps 16b–25 of spec §3 (Advanced): the intro interstitial, then `advanced.projector`, `advanced.one-screen`, `advanced.auto-programs`, `advanced.add-delete` (**+** is hands-on, **Delete…** explained), `advanced.load`, `advanced.playlists`, `advanced.mirror` (hands-on: **Duplicate as my playlist** on the demo mirror), `advanced.settings` (explain, per section), `advanced.end` (the choice: **Done**). Done-when: the program list gained one (step 20), another program is current (21), a new local playlist exists beyond the demo's (23).

- [x] **Step 1: Write failing tests** as Task 5 (order, kinds, done conditions, targets present).
- [x] **Step 2:** Run `npx vitest run tests/renderer/tour` — expect FAIL.
- [x] **Step 3:** Add the steps and targets; wire the end: finishing Advanced calls `tour:finish('advanced')` then `tour:leave`.
- [x] **Step 4:** Run `npx vitest run` and `npm run typecheck`; smoke-test the Advanced path by hand, including Learn more from the end of Basic.
- [x] **Step 5:** Commit `feat: the Advanced tour`.

## Task 7: End-to-end, docs, release notes

**Files:** Create `e2e/tour.spec.ts`; modify the docs listed.

- [x] **Step 1: E2E** (`e2e/tour.spec.ts`, launch with a fresh `FDP_USER_DATA` as the other specs): `'the launch offer appears, Not now keeps the real library and asks again next launch'`; `'Don't show this again stops the offer'`; `'the Basic tour can be completed by doing each step in the real UI'` (accept the offer; perform each hands-on step: select a song, edit and save a field on the shared dance, search, drag a song into the program, answer the dance dialog, remove, hold and return, star, press Play and assert `player:getState` is playing, move the speed and volume sliders; **Next** through the explain steps; assert the step counter advances after each; choose **Start now!**; assert the Music tab of the real library and `tour.basic === 'done'`); `'Learn more continues into Advanced after its intro'`; `'leaving halfway returns to the real library, unchanged, on the Music tab'`; `'quitting mid-tour and relaunching opens the real library'` and `'a stale practice folder is swept at launch'`; and `'the real database file is unchanged by a whole tour'`. Run the file at the default size and again at 1000×640.
- [x] **Step 2: Docs.** Main spec: a Guided tour section (replacing the post-v1 mention), the Help menu (§6), the two settings. AGENTS.md decision (2026-10-30): **The tour runs on a practice context in main, entered by reloading the control window** (why: handlers are already a function of a database, a reload needs no store reset, nothing real is swapped so a crash restores itself; _Rejected:_ swapping the real database, a faked API in the renderer, a second app instance). CHANGELOG Added: "A hands-on tour (Help → Take the Basic Tour… / Take the Advanced Tour…) teaches the app on a practice library; it is offered on first launch." README: a line under the feature list and where to find the tour. Settings → About: the tune's credit. Hardware checklist: both tours with a real mouse and trackpad; leave halfway; quit mid-tour and relaunch; hear the speed change keep its pitch; check the minimum window size.
- [x] **Step 3:** Run the full CI sequence from the Global Constraints, checking exit codes, plus `npm run test:e2e` at 1000×640.
- [x] **Step 4:** Commit `docs: the guided tour`.
- [ ] **Step 5:** Open the pull request after an independent review.

## Rulings made while building

- **`tour:state` carries `landOn`.** A main-process event sent right after a reload can arrive before React has mounted its listeners, so the "land on Music" instruction is a one-shot field of `tour:state`, consumed by the reloaded window.
- **`TourMode` takes its real handlers lazily** (`realHandlers: () => …`), since they are built after it; `HandlerDeps.tour` gained `offerEnabled` for `FDP_TOUR_OFFER=off`.
- **The in-tour Advanced intro is an overlay step (`kind: 'intro'`)**, not `TourIntro`; `TourIntro` is only the real-window offer and Help card, sharing the text in `tour/text.ts`.
- **The Basic tour is 24 steps, not 16**: the spec's steps with hands-on parts (two dances, the shared dance, search, the dialog, holding) split into the pieces the person actually does. The spec's tables were updated to match.
- **Steps gained `begin`, `placement` and a shared `memo`** (a baseline taken when a step arrives; the popover side; shared context), after a baseline taken lazily proved racy.
- **Engine evaluation also runs on store changes and every 400 ms**, because typing in the search box changes only a store, and a dialog fading out sends no event.
- **The tour's cards have no overlay of their own, a briefly missing target keeps its hole (700 ms), and the popover vanishes the instant a drag starts**, each found by the end-to-end run (the overlay caught the mouse-down; the popover covered a drop target).
- **The demo library names dances for real dances** (Lesnoto, Misirlou Mixer, …), because import names each dance after its song.
- **README is left for the release bump PR**, as the maintainer asked.

## Self-Review

- **Spec coverage:** intro screens and offer (§2.1.1) → Tasks 1, 4; flags and offer rule (§2.2) → Tasks 1, 4; spotlight steps, leave, banner (§2.3, §2.5) → Task 4; end choice and Music landing (§2.4) → Tasks 3, 4, 7; steps (§3) → Tasks 5–6; practice context, routing, broadcasts, media, inert menu/keys/idle, reload in and out, sweep (§4.1–4.2) → Task 3; engine and targets (§4.3) → Tasks 4–5; storage and menu (§4.4–4.6) → Tasks 1, 3; demo library and tune (§5) → Task 2; limits (§6) → Task 3; docs (§7) → Task 7; tests (§8) → each task and Task 7.
- **Types:** `TourPart`/`TourFlag`/`tourOffer` (Task 1) are used by the handlers, the tour mode (Task 3) and the renderer (Task 4); `createPracticeContext`/`createTourMode` (Task 3) consume `buildDemoLibrary` (Task 2); `TourStep`/`StepContext` (Task 4) are filled in by Tasks 5–6.
- **Risks the builder should watch:** the overlay's cut-out and popover alignment (jsdom has no layout; covered by the hardware checklist and e2e), drag steps under the overlay, and the Task 5 "done when" for the Holding round trip.
- **Open for the maintainer:** the step wording and demo song names after you try it.
