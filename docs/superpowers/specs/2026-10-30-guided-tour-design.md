# Guided tour — Design

- **Status:** built (Plan 22), 2026-10-31
- **Ships:** with 0.3.0, which the maintainer plans to publicise; the tour is there to save explaining
- **Builds on:** the main spec (`2026-10-13-folk-dance-player-electron-design.md`) and the 0.3.0 spec
  (`2026-10-18-release-0-3-0-design.md`); AGENTS.md's conventions apply
- **Replaces:** the "first-run guided tour" idea in the main spec's post-v1 list

## 1. Purpose

Folk Dance Player does a lot, and a new organizer has to learn several ideas that are not obvious:
a dance is not the same as a song, one tune can carry several dances, the teacher belongs to a
dance-and-song pair, a program is built by dragging, and there is a short wait before the next song
starts. The maintainer ends up explaining these by hand. A **guided tour** teaches them inside the
app, in the style of a game tutorial: the screen dims, the thing to use is lit up with a popover
pointing at it, the person does it, and the tour moves on only when they have.

The tour runs on a **practice library** of realistic songs and dances (with one short tune that can
really be played), so the person tries everything for real and nothing of theirs is touched.

### Goals

1. A new organizer can finish the **Basic tour** in about ten minutes and then build and play a
   program without help.
2. Every step that can be done for real **is** done for real, on the real app: the tour watches the
   real result (the song is in the program, the speed changed) rather than faking a screen.
3. The tour can never harm the real library, and the real library can never be left hidden by it.
4. The person is always in control: there is a visible **Leave the tour** on every step, and the
   tour never blocks the way out.
5. The two parts are separate: **Basic** (music, program, playback) and **Advanced** (projector,
   program management, playlists, settings), each with its own saved flag.

### Non-goals

- No video, no localisation, no analytics about who finishes the tour.
- No editing the tour's text in the app, and no "tour of what's new" for later releases (the engine
  could host one; this spec does not design it).
- The projector, Apple Music sync, Canva and native file dialogs are **explained**, not run (§6).
- No branching tours that adapt to what the person already knows; one fixed path per part.

### Anti-goals (failures even if the feature "works")

- The tour **writes anything to the real library** or the real settings, or leaves the app showing
  the practice library after the tour (or a crash during it).
- A step the person **cannot complete or leave** because something unexpected happened (they did
  the action early, navigated elsewhere, closed a dialog, or the target is not on screen).
- The practice library's tune **sounds from the real player** or the real player is still playing
  during the tour.
- Jargon: the text uses plain words ("a dance is what you do; a song is the music you do it to").

## 2. What the person sees

### 2.1 When it is offered

- **First launch of 0.3.0, for everyone** (decided 2026-10-30: new users and people updating from
  0.2.0 alike): the **intro screen** of the Basic tour (§2.1.1), with **Start the tour**, **Not now**
  and **Don't show this again**.
- **Never forced.** Not now closes it and changes nothing.
- **Replay any time:** Help → **Take the Basic Tour…** and Help → **Take the Advanced Tour…**,
  whatever the flags say. They open the part's intro screen first, with **Start the tour** and
  **Not now** (no Don't show this again: it was asked for).

### 2.1.1 Intro screens

Each part begins with an **intro screen**: a centered card, no spotlight, that says what is coming
before anything is asked of the person (decided 2026-10-30). One component serves everywhere.

- **Basic intro ("Welcome"):** a few sentences on what Folk Dance Player is (build the running order
  for a dance session from your music, play it with the wait and teaching stops, and show dancers a
  large display of what's on) and what the tour will do: about ten minutes in a **practice
  library**, doing each thing yourself, your real music untouched, leave any time.
- **Advanced intro:** what Basic covered and what Advanced adds (the projector, managing programs
  and playlists, settings), about five minutes in the same practice library, and that it is fine to
  stop at any point.
- **Where it shows.** Before entering a tour (the launch offer, and Help) it is shown **in the real
  window**, so declining costs nothing (no reload); **Start the tour** then enters the practice
  library straight into step 1. When the person chooses **Learn more** at the end of Basic, the
  Advanced intro shows **inside the tour** as an interstitial with one button (**Let's go**), since
  they have just chosen it.
- It is plain text with a heading, in the app's own voice, and fits the minimum window size.

### 2.2 The flags

Two settings, `tour.basic` and `tour.advanced`, each `'unseen'` (the default), `'done'` or
`'hidden'`:

| Event | Basic | Advanced |
|---|---|---|
| Finish the Basic tour (its last step) | `done` | unchanged |
| Finish the Advanced tour | unchanged | `done` |
| **Don't show this again** on a part's offer | `hidden` | `hidden` for that part |
| Leave the tour part-way, quit the app, or **Not now** | unchanged | unchanged |

- **Part-way means unchanged**, so the offer comes back next launch. That offer is the same dialog,
  which is why it carries **Don't show this again**: it is how someone who left early says "enough".
- On launch, the offer is for **Basic** while `tour.basic` is `unseen`; otherwise for **Advanced**
  while `tour.basic` is `done` and `tour.advanced` is `unseen`. Nothing is offered when both
  parts are `done` or `hidden`, or after `hidden`. (**My call:** someone who picks "Start now!" at the end of Basic is offered Advanced once more next launch, with Don't show this
  again; see §10.)
- The flags live in the **real** settings (`settings.ts`, validated like the others), never in the
  practice library. Replaying from Help does not change them unless the part is finished.

### 2.2a The tour's window

A tour needs room for the Music page's columns and the song editor together, so entering one **grows the window to at least 1280 × 1200 points, or as large as the screen's work area allows**, and sets that as its minimum size; leaving restores the size and position it had (`src/main/tour/window-size.ts`). Scrolling is locked during a step unless the step asks for it, and the first step never shows centered before moving to its target.

### 2.3 A step

- The rest of the window is dimmed; the **target** (what to use) is bright, with a pulsing outline,
  and receives clicks and drags. Everything else ignores the pointer.
- A **popover** points at the target with a few plain sentences, a step count ("Step 4 of 14"),
  and **Leave the tour**. Steps that cannot be done for real have a **Next** button; hands-on
  steps have none (the person does the thing, and the popover says what).
- When the person does it, the step ends and the next one shows. If they did it **before** the
  step appeared, it completes at once.
- The tour **switches pages itself** (Music, Program, Settings) and scrolls the target into view.
- **Escape** or **Leave the tour** asks "Leave the tour? Your practice library is thrown away" with
  **Keep going** and **Leave**. Leaving returns to the real library, on the Music tab.
- Reduced motion: the pulse is a steady outline.

### 2.4 The end of Basic

The last Basic step asks (the maintainer's wording, 2026-10-30): "Would you like to learn about some
more app features or start building your music library now?" with two buttons:

- **Learn more** goes on into Advanced without leaving the tour; finishing it sets `tour.advanced`
  to `done`.
- **Start now!** ends the tour (flag `done` for Basic).

**After the tour the person lands on the Music tab of the real library** (decided 2026-10-30), the
natural place to start adding music. This is true of every way out of a tour (finishing, **Start
now!**, or leaving part-way); the Program tab is not where they land.

### 2.5 A visible reminder

While a tour runs, a slim banner at the top says "Practice library: your real music is safe", so
nobody wonders why their songs are gone.

## 3. The steps

Each step has a **page**, a **target**, a **kind** and (for hands-on steps) a **done-when**
condition on the real result. *Explain* steps have **Next**. The wording is the builder's, in plain
language; this table fixes the content and order (the maintainer's list, 2026-10-30).

### Basic (as built: 29 steps)

The welcome (step 0, §2.1.1) is the intro screen shown before the tour is entered. "Page" is where
the tour switches to; **explain** steps have **Next**; **do** steps end on the real result.

| # | Step id | Page | Kind | What the person does / learns |
|---|---|---|---|---|
| 1 | `basic.import` | Music | explain | **Add Music…** and Apple Music sync: how music gets in. |
| 2 | `basic.import-open` | Music | do | Press **Add Music…**: the practice library pretends a folder was picked (§5.2). |
| 3 | `basic.import-tags` | Music | explain | "Populate Artist / Teacher / Choreographer from" and "Genre is Country": which tag goes where. |
| 4 | `basic.import-run` | Music | do | Press **Import**; the summary says the songs are already there. |
| 5 | `basic.import-done` | Music | do | Press **Done**. |
| 6 | `basic.select` | Music | do | Click Hava Nagila; its details open. |
| 7 | `basic.two-dances-pick` | Music | do | Click Legnala Dana. |
| 8 | `basic.two-dances` | Music | explain | "You can assign more than one dance to a song, when it makes sense to": Legnala Dana and Lesnoto. |
| 9 | `basic.shared-pick` | Music | do | Click Makedonsko Devojče. |
| 10 | `basic.shared-edit` | Music | do | Pick a Dance type for Lesnoto (done when it is saved, which choosing a suggestion does at once). |
| 11 | `basic.shared-other` | Music | do | Click Legnala Dana: its Lesnoto card shows the same change, "edited once". |
| 12 | `basic.who-owns-artist` | Music | explain | The artist belongs to the song. |
| 13 | `basic.who-owns-teacher` | Music | explain | The teacher belongs to the dance and tune together. |
| 14 | `basic.attachments` | Music | explain | A PDF of a dance's notes (a file picker can't run here). |
| 15 | `basic.canva` | Music | explain | Canva slides and slide images for the projector. |
| 16 | `basic.search` | Program | do | Type `hora` (the whole word) in the library search. |
| 17 | `basic.search-clear` | Program | do | Clear the search. |
| 18 | `basic.add` | Program | do | Drag Hava Nagila into the program (this starts one). |
| 19 | `basic.pick-dance` | Program | do | Drag Legnala Dana in: the "Which dance?" dialog opens. |
| 20 | `basic.pick-dance-answer` | Program | do | Choose a dance and press Done. |
| 21 | `basic.remove` | Program | do | Remove Legnala Dana with ✕. |
| 22 | `basic.hold` | Program | do | Drag Korobushka into Holding. |
| 23 | `basic.hold-back` | Program | do | Drag it from Holding into the program (it moves). |
| 24 | `basic.favorite` | Program | do | Star Zemer Atik. |
| 25 | `basic.play` | Program | do | Press Play. Hava Nagila **repeats** from here (`tourAudio.setLoop`). |
| 26 | `basic.speed` | Program | do | Move the speed slider: slower or faster, same pitch. |
| 27 | `basic.volume` | Program | do | Move the volume slider. |
| 28 | `basic.wait` | Program | do | The repeat stops and the song **jumps to its last five seconds**; the step ends when Korobushka starts. Explains the wait, Auto-continue and STOP markers. |
| 29 | `basic.end` | — | choice | "Would you like to learn about some more app features or start building your music library now?" **Learn more** / **Start now!** (§2.4). |

### Advanced (as built: intro + 14 steps)

| # | Step id | Page | Kind | What the person does / learns |
|---|---|---|---|---|
| 0 | `advanced.intro` | — | intro | The Advanced intro screen (§2.1.1): shown in the real window from the launch offer or Help, and inside the tour (one button, **Let's go**) after **Learn more**. |
| 1 | `advanced.projector` | Program | explain | The **Projector** switch (no second screen in a practice library). |
| 2 | `advanced.one-screen` | Program | explain | With one screen the view covers the laptop after a while; "Uncheck to disable showing the overlay". |
| 3 | `advanced.auto-programs` | Program | explain | Drop a song on an empty program and one is made, named for today. |
| 4 | `advanced.add-program` | Program | do | Press **+**, name a program, Create. |
| 5 | `advanced.delete` | Program | explain | Rename, Duplicate and Delete in a program's ⋯ menu (Delete is not run here). |
| 6 | `advanced.load` | Program | do | Load Friday warm-up from the sidebar (the app asks first if a song is loaded). |
| 7 | `advanced.playlists` | Program | do | Click Easy circle dances in the sidebar. The tour stays on the Program page until the click, then moves to Music for the next step. |
| 8 | `advanced.open-folder` | Music | do | Open the Festival 2026 folder. |
| 9 | `advanced.mirror` | Music | do | On the synced playlist Balkan night, **Duplicate as my playlist**. |
| 10–13 | `advanced.settings-appearance`, `-import`, `-remote`, `-about` | Settings | explain | One control at a time: light or dark, the import defaults, the remote's media keys, About. |
| 14 | `advanced.end` | — | choice | **Done**, then the Music tab of the real library. |

The practice library (§5) supplies the songs, the song with two dances (Legnala Dana: Legnala Dana and Lesnoto), the shared dance (Lesnoto), the folder and
its synced playlist, and the saved program these steps name. Steps about the projector, sync,
import, attachments and Canva are explain-only because the practice context has none of those
services.

### Built behavior worth knowing (found while building)

- A step's condition can read a store or the screen, so the provider re-checks the current step after
  events, after store changes (typing in the search box changes only a store), and every 400 ms (a
  dialog fading out sends no event).
- A step may note where something started the instant it arrives (`begin`), for "one more than
  before" conditions.
- The popover steps aside the instant a drag starts, so it can never sit over a drop target; the
  centered cards have no overlay of their own; a target missing for under 700 ms keeps its hole.
- The first **Play** has the app's normal countdown ("Starting in 5…"), so that step is done once
  the countdown starts.

## 4. How it works (the design)

### 4.1 One practice context in main

The renderer talks to main through `createHandlers(deps)`, which is built from a database and
services; the tests already build one. The tour adds a second set built over a **throwaway
database**:

- `src/main/tour/practice-context.ts` builds the context: a temp folder, the demo library (§5), a
  `SettingsStore` and `PlayerSession` over it, and the handler set from `createHandlers`. It gives
  no import, sync, Canva, projector, remote or attachments (those handlers answer "not available in
  the practice library"; explain-only steps never call them).
- **Routing.** `registerHandlers` today binds each channel to one handler set. It becomes
  `ipc.handle(channel, (event, ...args) => handlersFor(event.sender)[channel](...args))`, where
  `handlersFor` returns the practice set for a window in tour mode and the real set otherwise. Only
  the **control window** can be in tour mode.
- **Broadcasts.** `library:changed`, `programs:changed`, `player:state` and the other events go to
  the window from the context that is active for it; the real context's events are not sent to a
  window in tour mode, and the practice context's events never go to the real window.
- **Media.** `fdp-media://file/<id>` is resolved against the active context's database for the
  control window, so the practice tune plays from the temp folder.
- **Real playback.** Starting the tour stops the real player (`stop()`); the real player's
  `player:state` broadcasts stop reaching the window.
- **Things that would reach the real library from outside the window are inert during a tour:** the
  remote's global media keys (they call the real player and would start real playback), the File and
  Help menu actions that act on the real library (Sync with Apple Music, Sync now, Reveal Logs is
  fine), and the idle auto-show. Background work (Apple Music sync on focus, Canva catch-up) may go
  on in the real context but its notices and changes are not sent to the window.

### 4.2 Entering and leaving: a reload

Entering tour mode is a **reload of the control window** in tour mode: main sets the window's mode
(in memory only), builds the practice context, and reloads the page; the renderer starts fresh on
the practice library and shows the tour. Leaving clears the mode, disposes the context (closes the
temp database, deletes the folder) and reloads again, so every store refetches from the real
library, then shows the Music page (the existing `app:showPage`; the app otherwise opens on Program). Reasons: it needs no "reset every store" code, and it is **crash-safe by construction**:
the mode lives only in main's memory and the real database is never swapped, so quitting or
crashing mid-tour leaves nothing to restore. A startup sweep deletes stale `fdp-tour-*` temp
folders from crashed runs.

### 4.3 The tour engine (renderer)

- A **step** is data: `{ id, part, page, target, kind, title, body, done? }`.
- **Targets** are elements carrying `data-tour="<id>"` (a `<TourTarget>` wrapper like
  `HighlightTarget`, or the attribute on an existing element). A step can name two targets (drag
  from, drop onto).
- **done-when** is a function of the real state, re-evaluated after each `library:changed`,
  `programs:changed`, `player:state` and settings change (and after DOM events the state does not
  show, such as typing in the search box): `(ctx) => boolean | Promise<boolean>` over `ctx.api`
  (the practice context's API) and the stores. A step whose condition is already true when it
  appears completes at once.
- The overlay is a Mantine-based dimmed layer with a cut-out around the target (kept in step with
  scrolling, resizing and layout changes), and a popover anchored to the target (Mantine
  `Popover`). Pointer events pass through the cut-out only. CSS lives in module files.
- If a target is not on screen (the person closed a dialog, switched page), the engine switches to
  the step's page and re-opens what it needs where it can, otherwise shows **Take me there**.
- The engine, the step data and the done-when functions are pure and unit-tested; the overlay is
  tested with a fake API.

### 4.4 Storage

`tour.basic` and `tour.advanced` in `src/shared/settings.ts` (`'unseen' | 'done' | 'hidden'`,
default `'unseen'`, validated on write and read like every setting; no migration). The welcome offer
reads them at startup; the practice context has its own settings, so nothing the person does in the
tour (the speed lock, auto-continue) leaks into the real ones.

### 4.5 Menu and offer

- Help menu: **Take the Basic Tour…**, **Take the Advanced Tour…** (`menu.ts`); both enter tour mode
  at the start of that part.
- The intro screen (`TourIntro`) is shown by the renderer on launch (after the first page loads)
  when main says an offer is due (`tour:offer` returns `'basic' | 'advanced' | null`), and by the
  Help items (main sends the renderer a `tour:intro(part)` event); in the real window it offers
  Start / Not now (/ Don't show this again on the launch offer). Inside the tour the same component
  is the one-button interstitial (§2.1.1).

### 4.6 Channels

New: `tour:offer`, `tour:start(part)`, `tour:finish(part)` (sets the flag), `tour:leave()`,
`tour:hide(part)` ("Don't show this again"), plus a `tour:state` event/query telling the renderer
which mode it is in (so a reloaded page knows to show the tour). `tour:start`/`tour:leave` reload
the window. These are main-only operations on the real settings; none touches the practice library.

## 5. The practice library

Built by `buildDemoLibrary(dir)` using the same repository functions the app uses (creating songs,
dances, links and playlists), not raw SQL where a function exists, so it cannot drift from the schema.
Realistic contents (the builder chooses the names; they should be real folk dances):

- About **eight songs** across several countries, each with title, artist and genre-as-country.
- **One tune with two dances** (the "Which dance?" step and the dance-vs-song step).
- **One dance used by two tunes** (the "edit once" step), with different teachers on the two
  pairings (the "teacher belongs to the pair" step).
- A **favorite**, a **local playlist**, a **synced-style playlist** (an `apple_xml` mirror, inside a
  folder, so the note icon and **Duplicate as my playlist** are real), and one **saved program**
  already in the sidebar (so "load another program" has somewhere to go).
- A song with a **PDF note** recorded (shown, not openable) is optional.
- Every song's file is a **copy of the one practice tune** (§5.1) in the temp folder, with its
  duration set, so **Play** really plays and the song can reach its end (the auto-continue wait).

### 5.2 Add Music… in the practice library

The file picker returns a pretend folder, and `import:start` "finds" the songs already in the library (summary: all *already in your library*, nothing added), with real progress events. The mapping step, progress and summary are the app's real dialog, so the tour can explain "Populate … from". Everything else in §6 stays unavailable.

### 5.1 The practice tunes

Two tunes: "Hava Nagila" (below) and the Russian folk tune "Korobushka" (about 21 s, plain folk melody, not the game arrangement; see `resources/tour/README.md`). The first song of a program repeats until the wait-between-songs step, so the speed and volume can be tried at leisure; that step then jumps to the song's last seconds so the second song is heard starting.

A short (about 25 s) **synthesized rendition of the traditional melody of "Hava Nagila"**, made by
a script (`scripts/make-tour-tune.mts`) and committed as a small WAV (the media server already
serves `.wav`). Chosen by the maintainer (2026-10-30) because everyone knows it, it is rhythmic and
tonal (a speed change is obvious by ear and the unchanged pitch is audible), and a generated
rendition has no recording rights to clear.

- **Rights check (2026-10-30, not legal advice).** The melody was first published in 1922 in
  Idelsohn's *Sefer Hashirim* (Idelsohn died 1938; he described it as a Hasidic *nigun* he
  transcribed in 1915), so it has been in the US public domain since 2018. There is a competing claim
  that his student Moshe Nathanson wrote it, which could matter outside the US; the risk is low,
  not zero. Therefore: **the traditional melody only, no lyrics, no modern arrangement** (for
  example Harry Belafonte's), and our own synthesized performance.
- Credit the tune's origin in Settings → About.

## 6. What the practice context cannot do

| Feature | In the practice library |
|---|---|
| Import files, Apple Music sync | not available (file picker, Music permission): **explain** |
| Attach a PDF or image | not available (file picker): **explain** |
| Canva slides | not available (network, the person's decks): **explain** |
| Projector, second display | none: **explain**. The projector switch does nothing. |
| Remote media keys | not registered in tour mode |
| Saving anything real | the practice database is deleted at the end |

If an explain-only control is clicked anyway (the overlay prevents it, but keyboard focus might
reach it), it shows a short "Not in the practice library" message.

## 7. Documentation to update as it lands

- Main spec: a new section for the tour (replacing the post-v1 mention), §6 for the Help menu items,
  §5.2/Settings for the two flags.
- AGENTS.md decision: **The tour runs on a practice context in main, entered by reloading the
  control window.** Why: the handlers are already a function of a database, a reload needs no store
  reset, and it is crash-safe because nothing real is swapped. _Rejected:_ swapping the real database
  for the tour (a crash could leave the practice library showing); faking the API in the renderer
  (a second implementation of main's logic to keep in step); a separate app instance (the app is
  single-instance by design).
- CHANGELOG (Added): the tour. README: a line and where to find it. Hardware checklist: run both
  tours with a real mouse and trackpad, leave halfway and check the real library, quit mid-tour and
  relaunch.
- The tune's provenance: `docs/` note with the rights reasoning above, and `resources/tour/README`.

## 8. Tests

- **Engine (unit):** step order; done-when re-evaluated on each event; a step already satisfied
  completes at once; leaving; the flags table in §2.2 (finish, hide, leave part-way, quit).
- **Intro screens:** the Basic and Advanced text appear; **Not now** closes without a reload and changes no flag; **Don't show this again** sets `hidden`; Help shows the intro without Don't show this again; **Start the tour** enters step 1; the in-tour interstitial has the single button.
- **Overlay (renderer, fake API):** shows the popover at the target, dims the rest, passes clicks
  only through the cut-out, **Next** only on explain steps, Escape asks to leave, "Take me there"
  when the target is missing.
- **Main:** media keys, menu actions on the real library and the idle auto-show do nothing during a tour; the routing sends a tour-mode window to the practice handlers and an ordinary window to the
  real ones; broadcasts do not cross; the real player is stopped on entry; media resolves in the
  practice context; leaving disposes the folder; the startup sweep removes stale folders; the real
  database is byte-for-byte unchanged by a whole tour (hash before and after).
- **Demo library:** it builds, has the shapes §5 lists (a tune with two dances, a shared dance with
  different teachers, a synced playlist in a folder, a program), and its files exist and play.
- **Settings:** the flags validate and default; the offer logic returns `basic`, `advanced` or null
  for each state in §2.2.
- **End-to-end (Playwright, as the other specs):** every exit from a tour (Start now!, finishing Advanced, leaving part-way) ends on the Music tab of the real library; launch, accept the offer, **perform each Basic
  step's action in the real UI** (drag a song, answer the dialog, press Play, move the speed slider)
  and assert the tour advances; reach the choice and continue into Advanced; leave halfway and
  check the real library is intact and the offer returns next launch; run once at the minimum
  window size (1000×640). The tune must really play, so the e2e checks the player state.

## 9. Order of work

1. The flags, the offer logic, the intro screens (`TourIntro`) and the Help/offer wiring (no tour yet).
2. The demo library and the practice tune (with its script and provenance note).
3. The practice context, routing, broadcasts, media and the reload in and out.
4. The engine and overlay, with a two-step tour proving the loop.
5. The Basic steps (§3), then the Advanced steps; end-to-end after each part.
6. Docs, hardware checklist.

## 10. Calls I made (for the maintainer to check)

1. **Entering and leaving the tour reloads the control window.** Simple and crash-safe; the cost is a
   brief flash.
2. **"Start now!" marks Basic `done` but leaves Advanced `unseen`**, so Advanced is offered once more
   next launch (with Don't show this again). If you would rather Advanced never come up again after
   that choice, "Start now!" should set Advanced to `hidden`.
3. **The banner "Practice library: your real music is safe"** is always on during a tour.
4. **Step 4 (edit a shared dance)** shows the second song's card changing, to make "edit once" visible.
5. **Delete…** of a program is explained, not run, so the practice library keeps its saved program.
6. **The practice tune is a synthesized "Hava Nagila" melody**, melody only, per §5.1.
7. The step wording is mine to draft; you will test it and we will adjust.

## 11. Open questions

None blocking. Wording and the exact demo song names are for the builder to propose and the
maintainer to adjust after trying it.
