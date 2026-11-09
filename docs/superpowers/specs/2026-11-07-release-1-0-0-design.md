# Release 1.0.0 — Design

- **Date:** 2026-11-07
- **Status:** Draft, for the maintainer's review. Nothing in §3 is built yet.
- **Extends:** `2026-10-13-folk-dance-player-electron-design.md` (the main spec): §6 Library and
  Program pages, §7 Playback (§7.4 the remote), §8 Projector; and `2026-10-18-release-0-3-0-design.md`
  (the column settings and the program rules it built on)
- **Ships:** 1.0.0, after 0.3.0. The Microsoft Store needs a first version that does not start
  with 0 (AGENTS.md, 2026-11-02), so 1.0.0 is also the first Windows Store release.

## 1. Purpose

1.0.0 collects what the maintainer found while using 0.3.0 for real sessions: a remote that tells
you what it needs, a projector that reads from across a room, a window that opens as it was left,
lists that show more of what a dance has, and a few controls for running the same program again.

Each change is small and independent. This document records what each is for, what was decided,
how it fits the code today, and what is left open, so each can be planned and built on its own.
The GitHub issue (in the table in §2) holds the original request.

### How to read decisions

- **Decided** is the maintainer's choice, in their words where possible.
- **My call** is a choice made while writing this, because a builder would otherwise have to
  guess. The maintainer can overrule any of them.
- **Open** needs the maintainer's answer before building (§7).

### Goals

1. The remote's media keys work, and when they cannot, the app says why and what to do.
2. The projector view reads clearly from across the room: songs are clearly separated and Now
   Playing stands out.
3. The control window opens the way it was closed.
4. An organizer sees which songs have something to project, and can browse an earlier program's
   songs with the library's tools.
5. A program can be run again from the top, and the tables can be sized to the person's data.

### Non-goals

- Changing how the projector chooses a display (§3.8 is a decision about one setting only).
- A saved-window layout per display configuration (§3.4 restores one set of bounds).
- Editing programs from the filtered view (§3.7 is a view, like a playlist).

### Anti-goals

- No new place that holds playback state: `PlayerSession` still decides what plays (§3.6).
- No stored copy of what can be derived (§3.5's icon is read from the dance on each listing).
- No custom CSS outside co-located `*.module.css` files, and no new Unicode symbols as icons
  (AGENTS.md).

## 2. The changes

| # | Change | Issue | Where it lives | State |
|---|--------|-------|----------------|-------|
| 3.1 | Offer a Restart when Accessibility is allowed | #90 | Remote section, `remote:status`, app menu | Not started |
| 3.2 | Document stale Accessibility entries | #90 | `CONTRIBUTING.md`, `AGENTS.md` | Not started |
| 3.3 | Projector: stronger separation, contrasting Now Playing | #91 | `ProjectorView.module.css` | Not started |
| 3.4 | Remember the control window's size and state | #92 | main window creation, settings | Not started |
| 3.5 | An icon on songs whose dance has a slide or image | #82 | `list.ts`, `tracks.ts`, `holding.ts`, three lists | Not started |
| 3.6 | Clear Previously played and Now Playing | #84 | `PlayerSession`, `history.ts`, Program page | Not started |
| 3.7 | Show a saved program as a filtered set in the library | #83 | `list.ts`, library store, `ProgramsSection` | Not started |
| 3.8 | Auto-show and the Projector switch | #71 | `ProjectorController`, player bar | **Decision only** |
| 3.9 | Resizable columns in the Music and Program tables | #81 | `LibraryTable`, settings | Done |

## 3. Details

### 3.1 Offer a Restart when Accessibility is allowed (#90)

**Problem.** On macOS the remote's media keys reach the app only if it is trusted for
Accessibility. `registerMediaKeys` runs once at startup; without trust the keys do nothing and
Play/Pause opens Apple Music. After the organizer allows the app in System Settings and returns,
nothing says what to do next, and Settings → Remote control still offers "Allow remote control…"
until they quit and reopen on their own. In 0.3.0 the permission was granted and the keys stayed
dead until a stale entry was removed and the app restarted.

**Research (done 2026-11-07).**

- **Detecting the change needs no capability.** `systemPreferences.isTrustedAccessibilityClient(false)`
  wraps `AXIsProcessTrusted()`, which never prompts, and `remote:status` already calls it. There is
  no notification for a grant, and polling is the usual way to notice one while running.
- **Why a restart.** Electron registers macOS media keys through `ui::MediaKeysListener` with
  scope `kGlobalRequiresAccessibility` (electron/electron#24145, commit 75349f5). The listener
  appears to be set up when the shortcut is registered, so keys registered before the grant stay
  dead. Community apps (nativefier) tell people to restart; Apple's advice for event taps is to
  relaunch.
- **Not verified, needs a spike on the packaged app:** (a) that the check flips to `true` in an
  already-running process on current macOS; (b) whether `globalShortcut.unregisterAll()` followed
  by `registerMediaKeys` after the grant makes the keys work with no restart.

**Decided.** Notice, then Restart (the maintainer's words: "similar to what Slack does"): when the
control window regains focus and the permission has gone from not trusted to trusted, show a
notice "Remote control is allowed. Restart Folk Dance Player to turn it on." with a **Restart**
button. Settings → Remote control shows the same state.

**My call.**

- **Do the spike first.** If (b) works, re-register the keys on the flip and skip the notice's
  Restart button (a plain "Remote control is on" toast); the rest of this section then shrinks to
  the status refresh. If it does not, build the notice as decided.
- **Where.** Main owns the answer: a `RemoteWatcher` (pure, over `isTrusted()` and a clock)
  checked on the control window's `focus`, and by `RemoteSection` while it is open. The window is
  told with an event (`remote:changed`) carrying the same `RemoteStatus`; the renderer shows the
  notice (like `UpdateBanner`) and holds no copy of the rule.
- **`RemoteStatus.keys` is computed once at startup,** so it goes stale; compute it where it is
  asked, or on re-registering.
- **Restart** is `app.relaunch()` then `app.exit()`, asking first while a song plays or counts
  down (as `UpdateBanner` does). The notice's ✕ hides it until the next launch.
- **Never prompt while polling:** only `isTrustedAccessibilityClient(false)`; the prompt stays on
  the Allow button.
- macOS only (`caps.mediaKeyTrust`); nothing on Windows. Not shown during a tour, which has its
  own context.
- **A stale entry never trips the notice** (the permission stays "not trusted"), so §3.2's help
  text covers that case; Settings also says so beside the Allow button.

**Checks for the hardware checklist:** with a development or old ad-hoc entry in Accessibility, the
packaged app: allow it, return to the app (the notice or the toast appears), Restart (or not),
then Play/Pause on the remote toggles the player and Apple Music stays closed.

### 3.2 Document stale Accessibility entries (#90)

**Problem.** macOS ties the permission to the app's code signature. A development run, an
ad-hoc-signed build (0.1.0) and the Developer ID release do not match each other, though a packaged
copy of each is `com.folkdanceplayer.app`. An entry left by one can show as enabled in System
Settings while the app reports it is not trusted, so the remote stays dead (seen going from 0.1.0
to 0.3.0).

**Decided.** Add a note to both documents, in the same commit as §3.1 (it is the same finding):

- **`CONTRIBUTING.md`**, where the remote and the hardware checks are described: when testing a
  release after development builds, or after upgrading from an ad-hoc build, remove the app's
  entry with **−** in System Settings → Privacy & Security → Accessibility (or
  `tccutil reset Accessibility com.folkdanceplayer.app`), quit, reopen and allow it again.
  "Enabled in System Settings" is not proof the permission works; Settings → Remote control is.
- **`AGENTS.md`**, a decision entry with the same reasoning and the rejected alternative (detecting
  and repairing the entry from the app: it cannot be read or removed without the permission it is
  missing).

### 3.3 Projector: stronger separation, contrasting Now Playing (#91)

**Problem.** In real use the songs in the projector's lists run together from across the room, and
the Now Playing section does not stand out from them.

**Wanted (the issue).** Higher-contrast delineation between songs in the lists; a contrasting
background behind the whole Now Playing section. The projector looks the same in light and dark
appearance, so there is one look to tune, in `ProjectorView.module.css`.

**My call.**

- **Separation:** a visible rule or alternating band between rows of Previously played and
  Upcoming, thick enough to read at a distance, in the existing gray scale (no new accent color).
- **Now Playing:** one full-width panel behind the heading, the dance and song, and the progress
  bar, in a clearly lighter or darker step than the page, with the red progress line still
  readable on it. "Up next" (nothing playing) gets the same panel, so the middle always reads as
  the middle.
- **Both layouts:** with and without a Canva slide (the played list narrows beside the slide and
  prints titles only), at the large sizes the view already scales to.
- **Contrast is checked, not guessed:** a unit test computes the contrast ratio of the chosen
  colors (at least 7:1 for text) so a later tweak cannot drop below it.

**Open:** the exact look wants the maintainer's eye on a real projector (§7).

### 3.4 Remember the control window's size and state (#92)

**Problem.** A resized or maximized window opens at the default size at the next launch.

**Decided.** Save the control window's size, position and maximized state, and restore them at
the next launch; keep the minimum sizes already set (including the Windows content-size minimum);
if the saved bounds no longer fit the available displays, fall back to a visible position and
size on a display that exists.

**My call.**

- **A setting,** `window.control`, `{ x, y, width, height, maximized }` (validated on write and
  read like the other settings; a bad value falls back to the default). Save on `resized`,
  `moved`, `maximize`, `unmaximize` and `close`, debounced about half a second. Save the *normal*
  bounds (`getNormalBounds()`), so un-maximizing after a restart returns to a sensible size.
- **The fit check is a pure function** (`restoreBounds(saved, displays, minimum)`), unit-tested:
  keep the bounds if enough of the window (say 100 × 50 px of its title area) is on some display's
  work area; else keep the size but center it on the display with the most overlap, else the
  primary display; clamp the size to that display and to the minimum.
- **Not the projector or the tour:** only the control window; the projector is placed by the
  display rules, and a tour never resizes the window (AGENTS.md, 2026-10-31).
- **Full screen** is not restored (a new macOS Space); maximized is.
- **Windows' content size:** `useContentSize` makes `width` and `height` the content's, so save
  `getContentBounds()` there and `getNormalBounds()` on macOS, or the window grows by a title bar
  at each launch.
- `FDP_USER_DATA` test runs start with no saved bounds, so the end-to-end specs are unaffected;
  one new spec resizes, quits, relaunches and checks the size.

### 3.5 An icon on songs whose dance has a slide or image (#82)

**Problem.** There is no quick way to see whether a dance has something to show on the projector.
An organizer building a program has to open each song's editor, so a dance with nothing to
project is easy to miss until it plays.

**Decided (the issue).** A small photo icon on a row when its dance has a Canva slide and/or a
slide image, in all three places a song appears: the Program page's library list, Holding, and the
program itself. A tooltip explains it ("This dance has a slide and/or image"). Rows with neither
show nothing, so a missing slide is what stands out.

**My call.**

- **The dance on the row.** In the program and Holding that is the item's chosen dance (a NULL
  choice resolves to the song's default); in the library, the song's default dance (the one
  `shownPairingSql` picks).
- **Main reports it,** as `hasSlide` on `LibraryRow` and on the program and Holding tracks
  (`TRACK_COLUMNS`/`toTrack`, `listHolding`, `listLibrary`), computed in the same query as
  `hasNotesPdf`. It follows `library:changed` and `programs:changed`, so linking, removing or
  replacing a slide, and changing the dance choice, update it with no new event.
- **What counts:** a linked Canva slide (a page ID on `dance_prefs`, even before its image is
  captured) or a stored image. The tooltip says which: "Canva slide", "Image", or "Canva slide and
  image". A linked slide that has since gone from its deck still counts (it keeps its image, and
  the projector shows the image); this is the issue's open point, decided so that the icon never
  disagrees with the editor's dance card.
- **An icon component** `SlideIcon` in `components/icons.tsx` (inline SVG), with an accessible
  name for screen readers, not only a hover tooltip.
- **Where it sits:** a narrow fixed column beside the star in the two library tables (so it fits
  the column order setting as a fixed column, like the star and ⋯ menu, and survives the Program
  list's narrowing, which only drops data columns), and a slot before the label in program and
  Holding rows.
- **Not shown for STOP markers** (they have no dance).

### 3.6 Clear Previously played and Now Playing (#84)

**Problem.** After a session or rehearsal, Previously played and Now Playing stay as they were.
To run the same program again the organizer has to rebuild it, and ▶ continues after the last
song played instead of starting at the top.

**Decided (the issue).** A button on the Program page clears Previously played and the current
Now Playing song, so the player is idle and ▶ starts the first song.

**My call** (the issue's open points):

- **What clearing does to the program:** reset `played_at` on every item, so played songs return to
  their places in their original order and ▶ starts at the top. Nothing is deleted from the
  program (played items are kept on purpose: AGENTS.md, 2026-10-13).
- **What it does to the play log:** nothing. `play_log` is the record of what was danced and
  also feeds saved programs, so the list is *hidden*, not deleted: `Previously played` shows log
  entries from a new per-program mark (`programs.log_cleared_at`, a migration), and Replay and the
  history views keep every row. Because it loses nothing it asks nothing, as End Program does
  (AGENTS.md, 2026-10-30).
- **A playing song** stops first (the way ⏹ does) and nothing follows it; the button is disabled
  when there is nothing to clear (no played items, no log entries shown and nothing loaded).
- **One operation in main:** `programs:clearPlayed(programId)`, which `PlayerSession` runs as one
  update (stop, reset, recompute `atStop` and the cursor), then one `programs:changed` and one
  `player:state`. The projector's snapshot (now-playing and previously played) follows from them.
- **Where:** in the Previously played header, next to its title; hidden when the list is empty.

### 3.7 Show a saved program as a filtered set in the library (#83)

**Problem.** A playlist can be clicked in the sidebar to show its songs in the library list; a
saved program cannot. To see what an earlier session played you have to load it, and its songs
cannot be browsed, searched or sorted with the library's tools.

**Decided (the issue).** A context-menu item on each saved program in the sidebar (**Show in
library**) filters the library list to the program's songs; the notice above the list reads
**Showing program X** (instead of **Showing playlist X**) and **Show all music** works as now.
Search, sort and selection apply within the filtered set; leaving it returns to the full list.

**My call** (the issue's open points):

- **Which songs:** every song in the program, played or not (a saved program records what was
  danced); STOP markers are ignored (no song); a song that appears twice shows once (the list is
  one row per song).
- **Missing and removed songs** behave as in a playlist.
- **Order:** the `#` column is the program's position (the first time a song appears), as a
  playlist's is, and the default sort in this view is by it; choosing another sort works as
  elsewhere.
- **A new filter kind,** `{ kind: 'program', programId }`, beside playlist and holding in
  `LibraryFilter`, `listLibrary` (a join on `program_items`) and the store. The sidebar's
  `ProgramsSection` gets the menu item, and a right-click opens it, as on other rows.
- **It refreshes** on `programs:changed`; if the program is deleted while shown, the filter clears
  with a notice.
- Songs dragged out of the filtered list work as from any other library view.
- The *loaded* program and the *shown* program are independent: showing one never loads it.

### 3.8 Auto-show and the Projector switch (#71)

**Problem.** With a second display connected, Auto-show behaves as if the Projector switch was
turned on (it sets `projector.enabled`), so the view stays until the switch is turned off and
reopens at the next launch with the display connected. The issue asks whether that is surprising,
and says to decide after real use.

**Decided (this release).** Keep the behavior; no code change. It was chosen on purpose
(AGENTS.md, 2026-11-01): an auto-show on a separate display that the mouse or Esc could close would
be closed by the operator's own mouse on the other screen, and a separate state would let the
switch read off while the view is up. 1.0.0 only closes the issue with that reasoning (a line in
the Auto-show setting's help text saying that the switch turns on and stays on).

**Open:** if real use shows it is wrong, the alternative is a state that does not touch the saved
setting (§7).

### 3.9 Resizable columns in the Music and Program tables (#81)

**Problem.** Column widths in the Music table and the Program page's library list are fixed by the
layout and the narrow-panel collapsing. Organizers can reorder columns but cannot widen Title or
narrow Country.

**Decided (the issue).** Drag the edge between two headers to resize a column, in both tables.
Sizes are remembered as settings, like the order (`library.columns.music`, `library.columns.program`),
and kept in proportion when the window resizes: each user-set width is saved as a percentage of
the table's width.

**My call.**

- **Settings:** `library.columnWidths.music` and `.program`, each a map from column key to a
  percentage; resolved against the defaults on read as the order is (unknown keys and bad values
  dropped, a column added later keeps its default). The empty map is the default.
- **How it meets the grid.** The rows' grid comes from the table, with a `--w-<key>` track per
  column (AGENTS.md, 2026-10-19). A resized column sets its track to `calc(var(--table-width) *
  pct)` through that variable, so collapsing (`--w-<key>: 0px`) still wins below its breakpoint
  and unresized columns keep their defaults. Collapsing breakpoints stay by container queries;
  recheck them when this lands, since a wider Title can make a column collapse earlier.
- **Fixed columns** (star, ⋯ menu, a playlist's #, the new slide icon) are not resizable.
- **Minimum per column** (in px, per column, so none can be dragged to nothing).
- **Drag.** The handle on a header's right edge uses pointer events, and must not start the header's
  own drag-to-reorder (`COLUMN_MIME`): the handle stops the header drag, and the resize does not
  save on every move but once at release (a failed save leaves the sizes until the page is left,
  as the order does).
- **Keyboard:** Alt+Shift+←/→ on a focused header resizes by 1% (the issue's suggestion; next to
  Alt+←/→ for order).
- **Reset columns** (the header's right-click item) clears order and sizes both.

## 4. Data changes

- **One migration:** `programs.log_cleared_at` for §3.6 (nullable; a released migration is never
  edited, so it is a new numbered one).
- **New settings, no migration:** `window.control` (§3.4), `library.columnWidths.music` and
  `library.columnWidths.program` (§3.9).
- **No change** for §3.1, §3.2, §3.3, §3.5, §3.7 or §3.8 beyond fields on row types and one new
  `LibraryFilter` kind.
- **New IPC:** `programs:clearPlayed` (§3.6) and the event `remote:changed` (§3.1), both in
  `src/shared/contract.ts`; library listing grows the `program` filter (§3.7).

## 5. Order of work

Each item is its own pull request, small enough to review on its own.

1. **§3.1 spike**, then **§3.1 and §3.2** together: the spike decides the shape; the docs ride
   with it. These matter most (the remote does not work for a new install).
2. **§3.4**: independent and small; do it early so every later hardware test benefits.
3. **§3.3**: independent; wants a real projector.
4. **§3.6**: has the migration; independent of the rest.
5. **§3.5**: before §3.9, because the icon column is one of the fixed columns that §3.9 leaves
   alone.
6. **§3.7**: independent of the rest; touches the library store and sidebar.
7. **§3.9**: last of the table work, after §3.5 (the new column) and the other `LibraryTable`
   changes.
8. **§3.8**: the help-text line, with any of the above.

Dependencies: §3.5 before §3.9; §3.1 and §3.2 together.

## 6. Documentation to update as each lands

- **Main spec:** §6 Library and Program pages (§3.5, §3.6, §3.7, §3.9), §7.4 the remote (§3.1),
  §8 Projector (§3.3).
- **AGENTS.md:** a decision for §3.1 (what is detected and how, whether a restart is needed),
  §3.2 (stale entries), §3.4 (saved bounds, the fit rule), §3.6 (clearing hides the log, deletes
  nothing) and §3.9 (percent widths and how they meet collapsing).
- **CHANGELOG.md:** a line under Unreleased in the same commit as each user-facing change.
- **README.md:** the features list when the release is prepared.
- **CONTRIBUTING.md:** §3.2's note.
- **Hardware checklist** (`docs/manual-testing/pre-release-hardware.md`): the remote after a
  fresh grant and after a stale entry (§3.1); the projector's separation and Now Playing panel on a
  real projector, with and without a slide (§3.3); resize, maximize, quit and reopen, and
  reopening with the saved display unplugged (§3.4); the icon in all three lists after linking and
  removing a slide (§3.5); clearing mid-song and with a long history (§3.6); showing a saved
  program, including a deleted one (§3.7); dragging a column edge with a mouse and a trackpad, and
  resizing the window after (§3.9). The Windows checklist gets §3.4's displays and §3.3.

## 7. Open questions for the maintainer

1. **§3.1, a restart or not.** Build the notice with Restart as decided, or spike re-registering
   the keys first and skip the restart if it works? (Recommended: spike first.)
2. **§3.3, the look.** Rows separated by a rule or by alternating bands? A lighter or darker Now
   Playing panel? Best judged on the projector itself.
3. **§3.6, the log.** Is hiding Previously played (the log kept) what is wanted, or should
   clearing delete the log entries too?
4. **§3.7, the order.** Show the program's songs in program order (with `#`), or just the
   library's sort?
5. **§3.8, Auto-show.** Keep the switch turning on, or give Auto-show its own state after more use?
6. **§3.5, a slide gone from its deck.** Does it count as having a slide (my call: yes, it keeps
   its image)?
