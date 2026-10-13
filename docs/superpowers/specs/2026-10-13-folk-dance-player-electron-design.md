# Folk Dance Player — Electron Rewrite Design

- **Date:** 2026-10-13
- **Status:** Draft for review
- **Replaces:** Flutter app at `~/code/FolkDancePlayer/folk_dance_player` (and the older version in `~/code/FolkDancePlayer/old/`)

## 1. Purpose

A music player for folk dance organizers. Before and during a dance event, an operator builds a
**program** (the ordered list of dances for that session) from their indexed music library and plays
it. A separate **projector view** shows dancers, from across the room, what was played, what is
playing (with the dance's Canva slide), and what is coming up.

The design is based on **MITPlayer**, an older Visual Basic app for the same purpose.

The Flutter version stalled mainly because a fullscreen window on a second display (projector) could
not be made to work reliably. This rewrite moves to Electron, where that has been proven (see §11).

### Success criteria

1. An operator can index a music library — folders, dropped files, or an Apple Music `Library.xml` — in bulk.
2. Every song can carry organizing metadata (country, teacher, choreographer, dance type, Canva slide) and be found by searching song title, teacher, choreographer, or country.
3. A program can be built by drag-and-drop or a button, saved, and run with auto-continue.
4. While the program runs, the projector (a separate display) shows a large-font view with the current song's Canva slide, and the operator keeps working in the control window on the laptop.
5. Everything needed at the event works offline once prepared.

### Platform

- **Primary:** macOS (the machine used at events). Built and tested there first.
- **Later:** Windows. The design avoids macOS-only assumptions except in the display-setup helper (post-v1, §12).

## 2. Scope

### In v1

- **Importing:** folders, files, drag-and-drop, and Apple Music XML (whole library or chosen playlists); import mapping settings.
- **Library:** editing song metadata, with autocomplete for teacher/choreographer and country, and dance type.
- **Organizing:** favorites, a holding area, and playlists (local ones, plus Apple-imported ones protected against overwriting your edits).
- **Programs:** saved programs and STOP/Teaching markers.
- **Playback:** auto-continue (default on, adjustable in the player bar), countdown, preview by double-click, and speed changes that keep the pitch.
- **Projector view:** on a separate display; laptop fullscreen mode with an auto-show idle timer; Canva slides with saved images for offline use.
- **History:** a persistent play log.

### Not in v1 (§12)

- Shared online song-metadata database
- Display setup assistant (switch to extended mode and make the laptop the main display, from inside the app)
- Converting unsupported formats (AIFF, ALAC)
- Windows packaging and testing

## 3. Terminology

| Term | Meaning |
|---|---|
| **File** | A local audio file on this machine. |
| **Song** | The shareable facts about the music in one file (title, teacher, country, slide, …). Exactly one per file. |
| **Library** | All files and their songs. |
| **Playlist** | A curated, reusable list used to organize the library ("Couple dances"). Can be imported from Apple Music. |
| **Program** | The ordered dances for one session/day. Items are marked played rather than deleted. |
| **STOP marker** | A program item that halts playback (for teaching). |
| **Holding** | A per-file flag; held files appear in a panel above the library list on the Program page. |
| **Projector view** | The large-font audience display. |
| **Projector mode** | The projector view on a display other than the control window's display. |
| **Laptop mode** | The projector view covering the control window's own display. |

## 4. Data model

Stored in SQLite via Node's built-in `node:sqlite` in the main process (no native add-on to rebuild; verified with FTS5 in Electron 44 and Node 24). Data is kept in three layers: local file
facts, shareable song facts, and personal/local data. Shareable and personal fields never share a table.

```
files         (local)      id, path UNIQUE, file_size, mtime, duration_ms, content_hash,
                           tag_title, tag_artist, tag_album_artist, tag_genre,
                           source ('files'|'apple_xml'), apple_persistent_id, is_missing, missing_reason
songs         (shareable)  id, file_id UNIQUE (1:1), uuid, title, artist, teacher, choreographer,
                           country, dance_type, canva_url, canva_page
file_prefs    (personal)   file_id PK, is_favorite, in_holding, difficulty (1–5, nullable)
slide_cache   (local)      canva_url, canva_page, image_path, captured_at, last_error
                           PK (canva_url, canva_page)
playlists     (personal)   id, name, source ('local'|'apple_xml'), apple_persistent_id,
                           imported_at, modified_at, created_at
playlist_items             playlist_id, position, file_id
programs                   id, name, created_at, updated_at
program_items              id, program_id, position, kind ('track'|'stop'), file_id (null for stop),
                           played_at (null = unplayed)
play_log                   id, file_id, played_at, program_id (nullable), kind ('program'|'preview'|'replay')
settings                   key, value (JSON)
```

**Files and songs**

- **One song per file.** Files never share a song record, so editing one recording's details (for example, a same-named but different dance) never affects another file.
- **`files.content_hash`** is a fast fingerprint: file size plus a hash of the first and last 1 MB. It is used to relink moved files (§5.4).
- **Raw `tag_*` columns are never edited.** They allow "Re-apply mapping" later.
- **`songs.uuid`** is a stable ID for a future shared database. v1 does nothing with it beyond creating it.
- **`songs.canva_url`** is always stored in the plain `/view` form (§8.3).
- **Dance type** is free text. Suggestions come from an editable list in settings, defaulting to: Open Circle, Closed Circle, Line, Separated, 4-Wall, Couple, Mixer, Trio, Set.
- **Autocomplete:**
  - Teacher and Choreographer share one combined suggestion list: the distinct non-empty values of both columns.
  - Country has its own list: the distinct values of `songs.country`.
  - No extra tables are needed.

**Playlists, programs and history**

- **Playlists:** `modified_at` is updated by any local edit (add, remove, reorder, rename). It is used for overwrite protection (§5.3).
- **Programs:** `updated_at` is updated by any change to the program or its items. It drives the sidebar sort order.
- **Current program:** stored in settings (`currentProgramId`). The program cursor ("next up" = first unplayed item by position) is derived from `program_items.played_at`, so it survives a restart.

**Settings keys:**

- **Import:** `import.artistTagTarget`, `import.albumArtistTagTarget` (each one of `artist|teacher|choreographer|ignore`), `import.genreIsCountry` (bool)
- **Library:** `danceTypeSuggestions` (string[])
- **Playback:** `autoContinue.enabled` (default `true`), `autoContinue.seconds` (default 5), `countdown.seconds`
- **Projector:** `projector.displayId`, `projector.enabled`
- **Laptop mode:** `autoFullscreen.enabled`, `autoFullscreen.seconds`
- **Other:** `window.bounds`, `currentProgramId`

Schema changes go through numbered migrations, applied at startup inside a transaction.

## 5. Importing music

### 5.1 Entry points

- **Add Music…:** a picker for files and folders. Folders are scanned recursively.
- **Drag and drop** files or folders onto the library (Music page or Program page library list).
- **Import from Apple Music…:** pick `Library.xml`. The screen explains how to export it from Music (File → Library → Export Library…).

### 5.2 Mapping step (shown before every import)

The step shows the current values, which can be changed for this import and are remembered for next time:

- **"Artist" tag goes to:** Artist | Teacher | Choreographer | ignore
- **"Album Artist" tag goes to:** Artist | Teacher | Choreographer | ignore
- **Genre → Country:** on or off

Mapping is applied once, when a song record is created. It is not stored per song. The Music page has
**Re-apply mapping to selected**, which deliberately overwrites the mapped fields from the raw tags
using the current settings, after a confirmation. All fields remain freely editable afterwards.

### 5.3 Apple Music XML

- **Parsing:** `Library.xml` is parsed with `plist`.
  - **Tracks:** `Name`, `Artist`, `Album Artist`, `Genre`, `Total Time`, `Location` (a `file://` URL to decode), and `Persistent ID`.
  - **Tag values come from the XML,** not the file, because the XML reflects edits made in Music.
  - **Skipped:** tracks with no local `Location` (streaming only).
- **Choices:**
  - *Whole library*: all local tracks plus all of the user's own playlists.
  - *Choose playlists*: a checklist of the user's playlists with track counts. System playlists (Library, Music, Purchased, Downloaded, and those with a `Distinguished Kind`) are hidden.
- **Playlists are recreated exactly,** with the same name and order. Each is matched on re-import by `apple_persistent_id`.
- **Overwrite protection on re-import:**
  - **Not edited locally** (`modified_at <= imported_at`): replaced silently.
  - **Edited locally:** a dialog lists the affected playlists, each with three choices:
    - **Replace with Apple version:** local edits are lost.
    - **Keep mine:** the Apple version is skipped this time.
    - **Keep both:** the Apple version is imported as "Name (Apple Music)".
- **Tracks:** matched by `apple_persistent_id`, then by path, so re-importing updates rather than duplicates.

### 5.4 Scanning and existing files

- **Where it runs:** in an Electron `utilityProcess`, so the UI never blocks. It reports progress (`n / total`) and can be cancelled.
- **Tag reading** uses `music-metadata`.
- **Supported formats** are those Chromium `<audio>` can play: MP3, AAC/M4A (non-ALAC), WAV, FLAC, Ogg/Opus. AIFF and ALAC are reported as "unsupported format" and not imported in v1.
- **File already known by path:** the raw tags, size and mtime are refreshed. Song fields are only filled where currently empty.
- **New path whose `content_hash` matches a missing file:** treated as a move. The existing file row's path is updated, and its song, prefs, playlist memberships, program items and play log all carry over.
- **Errors are per file.** An unreadable file is recorded and skipped, never aborting the batch.
- **Summary at the end:** added, updated, relinked, already present, not found on disk (XML), unsupported format, unreadable. Each category expands to list its files.

## 6. Control window

Three pages: **Program**, **Music**, **Settings**. A left sidebar (styled like Apple Music) appears on Program and Music.

### 6.1 Sidebar

```
LIBRARY
  ♪ All Music
  ★ Favorites
PLAYLISTS                 [+]
  Couple dances
  Beginner night
   Balkan                ← Apple-imported, marked with an icon
PROGRAMS                  [+]
  🔍 [ search… ]
  ┌──────────────┐
  │ Tue Oct 14   │        ← own scroll container, fills remaining height,
  │ Test set B   │          sorted by updated_at, newest first
  │ …            │
  └──────────────┘
```

- **Library and playlist entries** filter the library list. Songs can be dropped onto a playlist (or Favorites) to add them.
- **Right-clicking a playlist** offers rename, duplicate and delete.
- **Programs** are loaded only from the sidebar; there is no dropdown.
  - The search box filters by name as you type.
  - Right-clicking a program offers rename, duplicate and delete. `[+]` creates a new program.
  - The list is expected to grow large, so it scrolls independently.
- **Holding is not a sidebar entry.**

### 6.2 Program page

```
┌──────────┬─────────────────────────────────────────────────────────────────┐
│ sidebar  │  ◀◀  ▶  ⏹  ▶▶   Hora Mare — Romania       speed ─●─   vol ─●─   │
│          │  ━━━━━━━━━━━━━━━━━━━━━━━━━━────────── 1:12 / 3:05               │
│          │  Auto-continue ☑ after [ 5 ] s        [Projector: On ▣]         │
│          ├──────────────────────────────┬──────────────────────────────────┤
│          │ PREVIOUSLY PLAYED (scrolls)  │ HOLDING                          │
│          ├──────────────────────────────┼──────────────────────────────────┤
│          │ PROGRAM: Tue Oct 14 (rename) │ 🔍 title / teacher / choreo /    │
│          │  ⏸ STOP / TEACHING           │    country                       │
│          │  Tfilati                     │  Title  Teacher  Country  ⏱      │
│          │  Kendime                [➕] │  …                               │
└──────────┴──────────────────────────────┴──────────────────────────────────┘
```

- **Player bar:** transport controls, the current song, a seek bar, speed and volume. The auto-continue checkbox and its seconds are editable right here. There is also the projector toggle.
- **Previously played:** the play log for the current program, newest first. It scrolls.
- **Program list:** only **unplayed** items, in order. Played items stay in storage (`played_at`) but are not shown here.
  - **Reordering:** drag and drop.
  - **Adding:** drag songs in from the library, holding or playlists, or use the ➕ button (adds the selected library songs at the end).
  - **STOP markers:** inserted with a button or context menu.
  - **Double-clicking a program item does nothing.** The program's intent is "play in this order"; to play an item now, drag it to the top.
- **Holding panel:** files with `in_holding`, above the library list.
- **Library list:** searchable by song title, teacher, choreographer and country. The search uses SQLite FTS5 over those columns plus artist. The list is filtered by the sidebar selection.

### 6.3 Music page

- **Table:** full-width and editable, with columns title, artist, teacher, choreographer, country, dance type, difficulty, favorite, Canva link and slide #, duration, path and status.
- **Selected song:** a side editor with autocomplete fields and a slide preview with a "Refresh slide" button.
- **Actions:** Add Music…, Import from Apple Music…, Re-apply mapping to selected, Refresh all slides.
- **Missing and unsupported files** are visibly flagged.

### 6.4 Settings page

- Import mapping defaults
- Dance-type suggestion list
- Projector display choice
- Auto-fullscreen on/off and timeout
- Countdown seconds
- "Reveal logs"

## 7. Playback and program flow

### 7.1 Sources of playback

| Started by | Logged (`play_log.kind`) | Marks program item played | Auto-continue afterwards |
|---|---|---|---|
| ▶ / ⏭ / auto-continue on the program | `program` | yes | per setting |
| Double-click in previously played | `replay` | no | **never**: halts and queues the program's next item |
| Double-click anywhere else (library, holding, playlist) = **preview** | `preview` (with current `program_id`) | no | **never**: halts and queues the program's next item |
| Double-click in program list | n/a: does nothing | n/a | n/a |

- **Previews and replays count as real plays.** They stop whatever was playing, appear on the projector as Now Playing, and are listed in previously played.
- **"Queues the program's next item"** means that when the preview or replay ends, playback stops and pressing ▶ starts the program's next unplayed item.

### 7.2 Program rules

- **Next up** is the first unplayed item by position.
- **▶ with nothing loaded:**
  1. Loads Next up.
  2. If `countdown.seconds > 0`, the projector shows "Starting in N…".
  3. Plays the song, setting `played_at` and writing `play_log`.
- **⏭** stops the current song and starts the next item.
- **When a program song ends:**
  - **Auto-continue on:** the projector shows `Next: <title> in N…`, then the next item plays. ⏹ during the countdown cancels it.
  - **Auto-continue off:** playback stops, and Next up is queued.
- **Reaching a STOP marker** always halts, regardless of auto-continue. The marker is marked played. While halted, the projector shows the **next** dance and its slide. ▶ resumes.
- **Speed** ranges from 0.5× to 1.5× using `playbackRate` with `preservesPitch = true`. It resets to 1.0× for each new song unless the 🔒 toggle next to the speed slider is on. **Volume** is global.
- **Missing or unreadable file at play time:** the item is skipped and a control-window warning is shown. With auto-continue on, the next item plays. With it off, playback halts with the item flagged.

### 7.3 Laptop-mode auto-fullscreen

- **When:** only when projector mode is off. If `autoFullscreen.enabled` is on and there has been no input in the control window for `autoFullscreen.seconds`, the projector view opens over the laptop display.
- **Closing:** mouse movement or Esc closes it, after a 1 s grace period.

## 8. Projector view

### 8.1 Window

- **Window type:** a borderless `BrowserWindow`, chosen in the spike as the most seamless option on both laptop and projector. Its settings:
  - `frame: false`, `enableLargerThanScreen: true`, `focusable: false`, `backgroundColor: '#000'`
  - `setAlwaysOnTop(true, 'screen-saver')` and `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, set **before** `setBounds(display.bounds)`
  - Shown with `showInactive()`, so the control window keeps focus

  Native macOS fullscreen and "simple" fullscreen are not used.
- **Projector mode** (target display ≠ control window's display):
  - It is opened and closed only by the control-window toggle. Mouse movement and Esc do **not** close it.
  - The control window is always placed on the non-projector display, because macOS may make the projector the main display.
- **Laptop mode** (the view covers the control window's own display, including mirror mode and "projector unplugged"): mouse movement or Esc closes it. Esc is captured from the app's own windows, not as a system-wide shortcut.
- **Display changes:**
  - **`display-removed` for the projector:** the window closes and audio continues.
  - **`display-added`:** if projector mode is on, the window reopens on the saved display, or the first non-primary one.
  - **`display-metrics-changed`:** bounds are reapplied.
- **Turning on projector mode with only one display:** shows "No separate display — showing on this screen (move the mouse or press Esc to close)", which is laptop mode.

### 8.2 Layout

With a slide:

```
┌──────────────────┬──────────────────────────┐
│ PREVIOUSLY       │                          │
│ PLAYED           │      CANVA SLIDE         │
│  Misirlou        │                          │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │                          │
│  Zemer Atik      │                          │
├──────────────────┴──────────────────────────┤
│ NOW PLAYING                                 │
│  Hora Mare                          Romania │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────  │  ← red elapsed-time line
├─────────────────────────────────────────────┤
│ UP NEXT                                     │
│  Tfilati                             Israel │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │  ← subtle divider between entries
│  Ali Pasa                            Turkey │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│  Kendime                             Turkey │
└─────────────────────────────────────────────┘
```

Without a slide, previously played takes the full width of the top row and includes country:

```
├─────────────────────────────────────────────┤
│ PREVIOUSLY PLAYED                           │
│  Misirlou                            Greece │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│  Zemer Atik                          Israel │
├─────────────────────────────────────────────┤
```

| State | Top row | Middle | Bottom |
|---|---|---|---|
| Playing | previously played + current song's slide | current song (title left, country right), with red progress line | upcoming |
| Stopped / teaching / countdown | previously played + **next** song's slide | "Up next" with the next song (title left, country right), or countdown | rest of upcoming |
| Relevant song has no slide (or no image and offline) | previously played, full width, with country | as above | as above |

- **Entry rows** follow the Flutter app's style: the title is left-aligned and the country is right-aligned on the same line. This applies to Now Playing, Up next, and previously played when it shows country.
- **Dividers:** a subtle, low-contrast horizontal line separates list entries, so short titles and countries clearly pair up across the gap.
- **Long titles** truncate with an ellipsis before they reach the country, so the country is never pushed off or overlapped.
- **Up next** is a vertical list showing as many entries as fit in its area.
- **Previously played** shows titles only when a slide is beside it, because the column is narrow. With no slide it shows the country too. Newest is at the top.
- **A missing country** leaves the right side empty.

- **Read-only.** The view renders state snapshots from main and sends nothing back except diagnostics.
- **Errors** are never shown on the projector, only in the control window.

### 8.3 Canva slides

Verified in the spike with a real 42-slide deck (§11):

- **Storing the link:** any Canva share link is normalized to the plain `https://www.canva.com/design/<id>/<token>/view` form. A `?embed` suffix and any fragment are removed. The slide number is stored in `canva_page`.
- **Live display** loads `…/view#<page>` in a `WebContentsView` owned by main, positioned over the slide area of the projector window. It is *not* an `<iframe>`:
  - The `/view` page sends `X-Frame-Options: deny`, so it cannot be iframed.
  - `?embed` can be iframed, but its controls never fade.
- **Hiding Canva's controls:** after **every** slide change (new deck or same-deck page change), main sends a synthetic mouse pass (several `mouseMove` events, then `mouseLeave`) to the view. Canva then fades its controls (logo, Share, "Create with Canva", page counter, arrows) after about 10 s. Without mouse activity they never fade.
- **Saved slide images (offline):**
  - **When captured:** on linking a slide, on "Refresh slide(s)", and in the background at startup when online.
  - **How:** the view is loaded off-screen, nudged, allowed to fade, then captured with `webContents.capturePage()`.
  - **Storage:** saved under the app data folder, recorded in `slide_cache`.
  - **On failure:** the previous image is kept and `last_error` is recorded, shown as ⚠ on the song.
- **What is shown:** the live view when online and it loads within a timeout. Otherwise the saved image. Otherwise the no-slide layout. The projector never shows "Loading…".

## 9. Architecture

Approach A (chosen): **the main process owns all state; the control window plays the audio; the projector window is read-only.**

```
┌──────────────────────── main process (source of truth) ────────────────────────┐
│  db/        SQLite, migrations, repositories                                    │
│  import/    utilityProcess: folder scan, music-metadata, Apple XML (plist)       │
│  session/   PlayerSession: pure TS state machine (cursor, now playing,           │
│             auto-continue + countdown timers, preview/replay rules, play_log)     │
│  displays/  projector window lifecycle, display events, laptop-mode rule         │
│  slides/    Canva WebContentsView host, mouse nudge, capture → slide_cache       │
│  ipc/       typed commands + one "state" broadcast                               │
└───────────────▲─────────────────────────────────────────────┬──────────────────┘
      commands  │                                             │ state snapshots
┌───────────────┴──────────────┐                ┌─────────────▼────────────────┐
│ Control window (React)       │                │ Projector window (React)     │
│ owns <audio>; reports        │                │ renders snapshot only        │
│ position/ended ~4×/s         │                └──────────────────────────────┘
└──────────────────────────────┘
```

- **One source of truth.** Renderers send commands, for example `program.addItems`, `player.play`, `song.update`. Main applies them and broadcasts a snapshot. No renderer decides what plays next. This prevents the Flutter app's class of desync bugs.
- **`PlayerSession` has no Electron imports.** Timers are injected, so it is fully unit-testable.
- **The typed IPC contract** lives in one shared `contract.ts`, used by main, the preloads and the renderers. Preloads expose only that API (`contextIsolation: true`, no `nodeIntegration`).
- **Tooling:**
  - **Build:** electron-vite, React, TypeScript
  - **State:** Zustand, for UI-local state only (selection, search text)
  - **Drag and drop:** dnd-kit
  - **Libraries:** `node:sqlite` (built in), music-metadata, plist
  - **Packaging:** electron-builder (a signed macOS `.dmg`)
- **Dev gotcha:** VS Code's terminal sets `ELECTRON_RUN_AS_NODE=1`, so npm scripts run Electron with that variable unset.

## 10. Errors, edge cases, and testing

### 10.1 Rule

The music never stops because of a side failure, and the projector never shows an error to the room.

- **Program pre-check:** when a program is loaded and at startup, every file in it is checked for existence, so missing files are flagged before the event.
- **Database safety:**
  - Writes use transactions.
  - At startup, the database file is copied to a rotating backup, keeping the last 5.
  - Migrations run in a transaction and abort startup with a clear message on failure.
- **Crash or restart:** the program position is restored from `played_at`, and playback does not auto-resume.
- **Import errors** are per file and never abort the batch (§5.4).
- **Logging:** the app log is written to `~/Library/Logs/Folk Dance Player`, with Help → Reveal logs.

### 10.2 Testing

- **Unit (Vitest):**
  - `PlayerSession`: auto-continue on and off; countdown and its cancellation; STOP halts; preview and replay halt and queue next; missing file skipped; ⏭ behavior.
  - Import mapping.
  - Apple XML parsing (fixture `Library.xml` with playlists, a streaming-only track, and an edited playlist).
  - `content_hash` relinking.
  - Canva URL normalization.
- **Database (in-memory SQLite):** migrations, repositories, FTS search, autocomplete queries, the playlist overwrite-protection decision.
- **End-to-end (Playwright + Electron):**
  - import a fixture folder, then search
  - drag into a program and reorder
  - play, then check that the projector window snapshot updates
  - save and load a program
- **Manual pre-release checklist (real hardware):**
  - projector plug and unplug mid-song
  - mirror vs. extended mode
  - Canva live slide and its fade
  - offline slide images
  - how audio sounds at 0.75× and 0.5× speed

## 11. Spike findings (2026-10-13)

The throwaway spike is in `spikes/display-canva/`; delete it once this spec is approved. It was run on a MacBook with a 1080p HDMI projector.

- **Borderless projector window:** fills the target display exactly in extended mode, and the control window keeps focus.
  - Requires `enableLargerThanScreen: true` plus the screen-saver level set before sizing. Otherwise macOS clamps the window below the menu bar.
- **Mirror mode:** Electron sees one display.
- **Switching displays from code:** CoreGraphics can switch mirror → extended (`CGConfigureDisplayMirrorOfDisplay` with `kCGNullDirectDisplay`, for the session only) and make the laptop the main display (`CGConfigureDisplayOrigin`), with no permission prompt.
- **macOS can make the projector the main display** after un-mirroring.
- **Speed without pitch change:** verified by measuring a 440 Hz tone, which stays at 440 Hz at 0.5×, 0.75× and 1.25× with `preservesPitch = true`. Audible quality on real music is still to be judged (§10.2 manual checklist).
- **Canva:**
  - `/view` cannot be iframed. `?embed` can, but its controls never fade.
  - `/view#N` in a `WebContentsView` opens slide N and fades all controls after a synthetic mouse pass.
  - With no network, nothing loads, hence saved slide images.

## 12. Future (not v1)

- **Shared song-metadata database:** suggest matching song records by title; the user picks one, and its values are copied into their local `songs` row. `songs.uuid` exists for this.
- **Display setup assistant:**
  - When a projector is detected, recommend extended mode with the laptop as the main display, then apply it.
  - **macOS:** a bundled, compiled CoreGraphics helper.
  - **Windows:** `DisplaySwitch.exe /extend` plus `ChangeDisplaySettingsEx`/`SetDisplayConfig`.
  - An OS-style "Keep these settings? Reverting in 15 s" confirmation that reverts automatically.
- **Converting AIFF/ALAC** so those files can be imported.
- **Windows build and testing.**
- **Import from MITPlayer:** read MITPlayer's metadata file and map its fields into `songs` (and its lists into playlists or programs, if it has them), through the same mapping step and summary as other imports (§5). The file format still needs to be examined from a real sample before this can be designed.
- **First-run tour:** a guided tutorial the first time the app opens. It steps through each area (sidebar, library and search, building a program, the player bar with auto-continue, the projector toggle, the Music page and importing, Settings) and explains how to use each one. It can be skipped and replayed later from Help.
- **About screen:** if an "About this app" screen is added, it includes a thank-you crediting MITPlayer as the inspiration for this app.

## 13. Project and release routines

These are kept in the repo from the first commit of code, and every task maintains them.


### 13.0 `README.md`

The front page for anyone who finds the repo. It is written for this app, not the Electron/React template. It covers:

- What Folk Dance Player is and who it's for (folk dance organizers), with the MITPlayer credit.
- The main features: importing, organizing, programs, playback, the projector view and Canva slides.
- Status, and the macOS-first platform note.
- A short quick start for developers.
- Links to the spec, `CHANGELOG.md`, `CONTRIBUTING.md` and `AGENTS.md`.

It is updated when a release changes what the app can do.

### 13.1 `CHANGELOG.md`: official release notes

- **Format:** [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), with [Semantic Versioning](https://semver.org/). The app version lives in `package.json`, starting at `0.1.0`. The minor version goes up for each release until v1 is feature-complete, at which point it becomes `1.0.0`.
- **What goes in it:** a line under `## [Unreleased]` for every change a user would notice, in the right group (`Added`, `Changed`, `Fixed`, `Removed`, `Security`). Lines are written for organizers, not developers ("Search now ignores accents: 'pasa' finds 'Paşa'"). Internal-only changes (refactors, tests, tooling) are left out.
- **Same commit:** the changelog line is added in the same commit as the change.
- **On release,** the `Unreleased` entries move under `## [x.y.z] - YYYY-MM-DD` and the release commit is tagged `vx.y.z`. That version section is the official release note. The same text is used for a GitHub release and, later, an in-app "What's new".

### 13.2 `CONTRIBUTING.md`

How to work on the project:

- **Prerequisites:** macOS, Node 24, npm 12.
- **Setup:** `npm install`, then `npm install-scripts approve esbuild`.
- **Scripts:** `dev`, `start`, `build`, `typecheck`, `test`, `format`.
- **Known gotchas:**
  - VS Code sets `ELECTRON_RUN_AS_NODE`. The scripts unset it.
  - Electron downloads its binary on first launch.
- **Workflow:** spec, then plan, then test-first implementation, with conventional commits that each end with the co-author line when an AI assisted.
- **Code conventions:**
  - Prettier settings
  - Mantine components first; custom CSS only in co-located CSS Modules
  - Renderers reach main only through the typed IPC contract
- **Rules for common changes:**
  - **Adding a dependency:** pin the exact version, at least two weeks old, and say why in the commit.
  - **Changing the database:** add a new numbered migration. A migration that has been released is never edited.
  - **Adding an IPC channel:** add it to the contract, to `INVOKE_CHANNELS`, and to the handlers.
- **Release checklist:**
  1. All tests and the manual hardware checklist (§10.2) pass.
  2. Bump the version.
  3. Move `Unreleased` into a version section in `CHANGELOG.md`.
  4. Tag the commit.
  5. Build the signed `.dmg` (plan 7).

### 13.3 `AGENTS.md`: decision log and agent guide

- **For** any AI agent, or any person, picking up the work. `CLAUDE.md` contains just `@AGENTS.md`, so Claude Code loads it automatically.
- **What it contains:**
  - A short orientation: what the app is, and where the spec, plans, changelog and contributing guide live.
  - The project's non-negotiable conventions, in one line each.
  - A **Decisions** log, newest first. Each entry gives the date, the decision, why, and the alternatives rejected.
- **Seeded with the decisions made during design,** for example:
  - Electron over Flutter (projector display)
  - main process owns all state
  - `node:sqlite`
  - Mantine with CSS Modules
  - the borderless projector window settings
  - Canva `/view` in a `WebContentsView` with a mouse pass, plus saved slide images
  - one song record per file, in three data layers
  - playlists are separate from programs
  - played items hidden but kept
  - double-click preview rules
  - exact, two-week-old dependency pins
- **Kept current:** when a task makes a decision a future contributor would otherwise have to rediscover, it adds an entry in the same commit. If a decision changes the spec, the spec is updated too.
