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
2. Every song can be linked to the dances done to it. Dances carry the organizing metadata (country, choreographer, dance type, teacher, notes, Canva slide), and music can be found by searching song title, dance name, teacher, choreographer, or country.
3. A program can be built by drag-and-drop or a button, saved, and run with auto-continue.
4. While the program runs, the projector (a separate display) shows a large-font view with the current dance's Canva slide, and the operator keeps working in the control window on the laptop.
5. Everything needed at the event works offline once prepared.

### Platform

- **Primary:** macOS (the machine used at events). Built and tested there first.
- **Later:** Windows. The design avoids macOS-only assumptions except in the display-setup helper (post-v1, §12).

## 2. Scope

### In v1

- **Importing:** folders, files, drag-and-drop, and Apple Music XML (whole library or chosen playlists); import mapping settings.
- **Library:** songs and dances as separate records linked many-to-many, each song with a default dance; editing them, with autocomplete for teacher/choreographer and country, and dance type.
- **Organizing:** favorites, a holding area, and playlists (local ones, plus Apple-imported ones protected against overwriting your edits).
- **Programs:** saved programs and STOP/Teaching markers.
- **Playback:** auto-continue (default on, adjustable in the player bar), countdown, preview by double-click, and speed changes that keep the pitch.
- **Projector view:** on a separate display; laptop fullscreen mode with an auto-show idle timer; Canva slides with saved images for offline use.
- **History:** a persistent play log.

### Not in v1 (§12)

- Shared online song and dance database
- Display setup assistant (switch to extended mode and make the laptop the main display, from inside the app)
- Converting unsupported formats (AIFF, ALAC)
- Windows packaging and testing

## 3. Terminology

| Term | Meaning |
|---|---|
| **File** | A local audio file on this machine. |
| **Song** | The music in one file: title and artist ("Pusteno Ludo"). Exactly one per file. |
| **Dance** | A dance: name, country, choreographer, dance type ("Pravo Rhodopsko Oro"). Names are not unique; several different dances can be called "Svornato". |
| **Pairing** | A link between a dance and a song: "this dance is done to this tune". Dances and songs are many-to-many (Lesnoto works with dozens of tunes). The pairing carries the teacher. |
| **Default dance** | Your group's usual dance for a song. Used when the song is added to a program; it can be switched per program item. |
| **Library** | All files, their songs and the dances linked to them. |
| **Playlist** | A curated, reusable list used to organize the library ("Couple dances"). Can be imported from Apple Music. |
| **Program** | The ordered dances for one session/day. Items are marked played rather than deleted. |
| **STOP marker** | A program item that halts playback (for teaching). |
| **Holding** | A per-file flag; held files appear in a panel above the library list on the Program page. |
| **Projector view** | The large-font audience display. |
| **Projector mode** | The projector view on a display other than the control window's display. |
| **Laptop mode** | The projector view covering the control window's own display. |

## 4. Data model

Stored in SQLite via Node's built-in `node:sqlite` in the main process (no native add-on to rebuild; verified with FTS5 in Electron 44 and Node 24). Data is kept in layers:
- **Local file facts**
- **Shareable facts** about songs and dances, which a future shared database could hold
- **Personal or local data:** your group's own choices

Shareable and personal fields never share a table.

```
files            (local)      id, path UNIQUE, file_size, mtime_ms, duration_ms, content_hash,
                              tag_title, tag_artist, tag_album_artist, tag_genre,
                              source ('files'|'apple_xml'), apple_persistent_id, is_missing, missing_reason
songs            (shareable)  id, file_id UNIQUE (1:1), uuid, title, artist
dances           (shareable)  id, uuid, name (NOT unique), country, choreographer, dance_type
dance_songs      (shareable)  id, dance_id, song_id, UNIQUE (dance_id, song_id)
song_prefs       (personal)   song_id PK, default_dance_id
dance_prefs      (personal)   dance_id PK, difficulty (1–5, nullable), notes,
                              canva_deck_id, canva_page_id, canva_page_index (last known position)
dance_song_prefs (personal)   dance_song_id PK, teacher
file_prefs       (personal)   file_id PK, is_favorite, in_holding, holding_position (order in holding)
canva_decks      (local)      id, view_url UNIQUE, design_id, title, pages (JSON: ordered [{id, title}]),
                              synced_at, last_error
slide_cache      (local)      deck_id, page_id, image_path, captured_at, last_error  PK (deck_id, page_id)
distinct_dances  (personal)   dance_a, dance_b (dance_a < dance_b): same-named dances the user said are different
playlists        (personal)   id, name, source ('local'|'apple_xml'), apple_persistent_id,
                              imported_at, modified_at, created_at
playlist_items                playlist_id, position, file_id
programs                      id, name, created_at, updated_at
program_items                 id, program_id, position, kind ('track'|'stop'), file_id (null for stop),
                              dance_id (the dance shown for this item), played_at (null = unplayed)
play_log                      id, file_id, dance_id, played_at, program_id (nullable),
                              kind ('program'|'preview'|'replay')
library_fts      (index)      one row per song; see "Search" below
settings                      key, value (JSON)
```

**Songs and dances**

- **Separate records, linked many-to-many** through `dance_songs`:
  - One tune can carry several dances.
  - One dance can be done to many tunes: Lesnoto works with dozens.
  - Names can differ: the dance Hora Mare is done to the song *Hora de la Munte*.
- **Dance names are not unique.** Several distinct dances can share a name, for example multiple Svornatos taught and choreographed by different people. They are told apart by choreographer, teacher and tune.
- **One song per file.** Files never share a song record, so editing one recording never affects another.
- **The common one-to-one case stays cheap.** Importing a song automatically creates a dance with the song's title, links them, and makes it the song's default dance (§5.4). For a dance like Hora Fetelor, which is always done the same way to the same tune, you only ever edit "the dance".
- **Default dance:** `song_prefs.default_dance_id` is your group's usual dance for a song (personal). When a song is added to a program, its default dance is used, and each program item can be switched to any other dance linked to that song. If the default is unlinked, the song falls back to its earliest-linked dance.
- **Teacher** belongs to the pairing (`dance_song_prefs.teacher`). It records who taught *this dance to this tune* to your group, which is often not the choreographer.
- **Personal dance fields:** difficulty, notes and the Canva slide are personal (`dance_prefs`). Notes are your group's own; a shareable description may come with a shared database later.
- **Favorites and holding** stay on the recording (`file_prefs`).
- **A dance with no songs is kept.** It may get music later.
- **Unchanged from before:**
  - `files.content_hash` is a fast fingerprint: file size plus a hash of the first and last 1 MB, used to relink moved files (§5.4).
  - Raw `tag_*` columns are never edited; they allow "Re-apply mapping" later.
- **`songs.uuid` and `dances.uuid`** are stable IDs for a future shared database. v1 does nothing with them beyond creating them.
- **Dance type** is free text. Suggestions come from an editable list in settings, defaulting to: Open Circle, Closed Circle, Line, Separated, 4-Wall, Couple, Mixer, Trio, Set.
- **Autocomplete:**
  - Teacher and Choreographer share one combined suggestion list: the distinct non-empty values of `dance_song_prefs.teacher` and `dances.choreographer`.
  - Country has its own list: the distinct values of `dances.country`.

**Labels: how a song and its dance are shown**

One shared function builds every song/dance label, so the control window and the projector always agree. A label has up to three parts:
- **Song:** the song's title. Omitted when it's the same as the dance name, so nothing is repeated.
- **Dance:** the dance name.
- **Choreographer**, in parentheses. Shown only when the song is linked to dances by **more than one choreographer**, which is when it's needed to tell them apart. A dance with no choreographer (a traditional dance) never shows empty parentheses.

Every list uses the one-line form `Dance (Choreographer) ♪ Song` (the dance first, as on the projector). Now Playing, in the control window and on the projector, is the one place it takes two lines: the dance, with ♪ and the song smaller below.

| Song | Dance | Choreographers linked to the song | Label |
|---|---|---|---|
| Hora de la Munte | Hora Mare | none (traditional) | Hora Mare ♪ Hora de la Munte |
| Svornato | Svornato | Jaap Leegwater and others | Svornato (Jaap Leegwater) |
| Pusteno Ludo | Pravo Rhodopsko Oro | Yves Moreau and others | Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo |
| Hora Fetelor | Hora Fetelor | one, or none | Hora Fetelor |

The projector uses the same parts with a different emphasis (§8.2): the dance name and choreographer are large, and the song title is smaller.

**Search**

- **One `library_fts` row per song.** It covers the song's title and artist plus, for every linked dance, its name, country, choreographer and the pairing's teacher.
- **Kept current by triggers** on `songs`, `dances`, `dance_songs` and `dance_song_prefs`.
- **Matching:**
  - Combining accents are stripped by the tokenizer (ş, ç, é…).
  - Separate letters (ı, ł, ø, æ, ß, đ, þ) are folded by the triggers using `FOLD_MAP`.
  - Search-box text always goes through `toFtsQuery()` (`src/main/db/fts.ts`), which folds it the same way and quotes each word.

**Canva**

- **Decks are added once,** by their smart embed link (`canva_decks`, §8.3).
- **A dance's slide** is stored as a **page ID**, which is stable when slides are inserted or moved. The last known position is kept as a fallback.

**Playlists, programs and history**

- **Playlists:** `modified_at` is updated by any local edit (add, remove, reorder, rename). It is used for overwrite protection (§5.3).
- **Programs:** `updated_at` is updated by any change to the program or its items. It drives the sidebar sort order.
- **Program items and the play log record the dance shown** (`dance_id`), so history shows what was actually *danced*.
- **Current program:** stored in settings (`currentProgramId`). The program cursor ("next up" = first unplayed item by position) is derived from `program_items.played_at`, so it survives a restart.

**Settings keys:**

- **Import:** `import.artistTagTarget`, `import.albumArtistTagTarget` (each one of `artist|teacher|choreographer|ignore`), `import.genreIsCountry` (bool)
- **Library:** `danceTypeSuggestions` (string[])
- **Playback:** `autoContinue.enabled` (default `true`), `autoContinue.seconds` (default 5), `countdown.seconds`
- **Projector:** `projector.displayId`, `projector.enabled`
- **Laptop mode:** `autoFullscreen.enabled`, `autoFullscreen.seconds` (edited in the player bar as "Auto-show when playing", 5–3600 s)
- **Appearance:** `appearance` (`system` (default), `light` or `dark`)
- **Apple Music sync:** `appleSync.enabled` (bool), `appleSync.libraryId` (the synced library's ID), `appleSync.lastResult` (the last sync's summary), `playlistFolders.open` (the sidebar's open Music folders, by persistent ID)
- **Other:** `window.bounds`, `currentProgramId`

**Sync with Apple Music (migration 004, `2026-10-15-apple-music-sync-design.md` §4)**

- **`files.apple_sync`:** `NULL` not synced, `'synced'` follows Music, `'gone'` Music no longer has it (the review list).
- **`files.removed_at`:** the soft delete. A removed song is hidden everywhere songs are listed but kept in history; adding the same file back clears it.
- **`files.sync_baseline`:** the mapped values sync last wrote, so a field edited in the app is never overwritten by Music.
- **`playlists.apple_sync`** (`1` for a read-only mirror of a Music playlist), **`playlists.folder_id`**, and the **`playlist_folders`** table (Music's folders: name, parent, persistent ID, order).

Schema changes go through numbered migrations, applied at startup inside a transaction. Migration 001 has not been released, so this model is written into 001 directly. The empty development database created by Plan 1 must be deleted once.

## 5. Importing music

### 5.1 Entry points

- **Add Music…:** a picker for files and folders. Folders are scanned recursively.
- **Drag and drop** files or folders onto the library (Music page or Program page library list).
- **Import from Apple Music…:** pick `Library.xml`. The screen explains how to export it from Music (File → Library → Export Library…).
- **Sync with Apple Music** (macOS, a switch on the Music page): reads the Music library directly and keeps the app current (§5.5). While it is on, Import from Apple Music… is hidden.

### 5.2 Mapping step (shown before every import)

The step shows the current values, which can be changed for this import and are remembered for next time:

- **"Artist" tag goes to:** Artist (the song's artist) | Teacher (the pairing's teacher) | Choreographer (the dance's choreographer) | ignore
- **"Album Artist" tag goes to:** the same choices
- **Genre → Country:** on or off. If on, the genre becomes the new dance's country.
- **Tag preview (Apple Music imports):** a scrolling table (its header stays in place) of up to 50 tracks' Name, Artist, Album Artist and Genre, read from the XML. When the library has more tracks, the 50 are chosen at random, so the organizer can see which tag holds teachers or choreographers. A file import has no preview, because tags are read only after the mapping is chosen.

Mapping is applied once, when a song and its automatic dance are created. It is not stored per song.

The Music page has **Re-apply mapping to selected**. Its dialog shows the selected songs' tags (the same table, up to 50 songs) and the mapping choices, which start from the import settings and apply to that run only. It deliberately overwrites the mapped fields from the raw tags: the song's artist, its default dance's choreographer and country, and that pairing's teacher. All fields remain freely editable afterwards.

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
- **New file:** creates its song, plus a new dance named after the song's title, linked to the song and set as its default (§4). Import **never** links a song to an existing dance by name, because dance names aren't unique. The library suggests possible matches instead (§6.3).
- **File already known by path:** the raw tags, size and mtime are refreshed. Song, dance and pairing fields are only filled where currently empty.
- **New path whose `content_hash` matches a missing file:** treated as a move. The existing file row's path is updated, and its song, prefs, playlist memberships, program items and play log all carry over.
- **Errors are per file.** An unreadable file is recorded and skipped, never aborting the batch.
- **Summary at the end:** added, updated, relinked, restored, already present, already in library (Apple Music), not found on disk (XML), unsupported format, unreadable. Each category expands to list its files.
- **While Apple Music sync is on,** a file matching a synced song (by path or fingerprint) is skipped as **Already in library (Apple Music)**, and a removed song added again is **restored** with all its data (as a local song).

### 5.5 Sync with Apple Music

Designed in its own spec, `2026-10-15-apple-music-sync-design.md`: a bundled Swift helper reads the Music library through the iTunesLibrary framework; sync runs at launch, on focus and on Sync now; removed tracks wait in a review list and are soft-deleted; Music's playlists become read-only mirrors in folders; tags follow Music unless edited in the app. It adds one rule to this section: while sync is on, Add Music… skips copies of synced songs as already present.

## 6. Control window

Three pages: **Program**, **Music**, **Settings**. A left sidebar (styled like Apple Music) appears on Program and Music.

The **player bar** (§6.2) sits above the page tabs and stays on every page. A song started anywhere, such as a preview double-clicked on the Music page, can be paused, stopped or skipped without going to the Program page. The control window's `<audio>` element lives in the player bar, which is mounted once, so changing pages never cuts the music. The **logo** sits at the left of the page tabs, in the app's red. (The logo is one all-black SVG, drawn as a mask in whatever color a place needs: red here, the text color in Settings → About, dim gray on the projector.)

### 6.1 Sidebar

```
LIBRARY
  ♪ All Music
  ★ Favorites
PLAYLISTS                 [+]
  Couple dances           ← own scroll container, at most 40% of the sidebar
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

- **Library and playlist entries** filter the library list. Songs can be dropped onto a playlist (or Favorites) to add them. While the list shows a playlist or Favorites, a tinted note above it says so ("Showing playlist “Balkan”", "Showing Favorites") with **Show all music**, on both the Program and Music pages.
- **The playlist list** scrolls on its own once it fills 40% of the sidebar, so a large Apple Music library's playlists never push Programs off screen.
- **Each playlist's options** are on a "⋯" button that appears on hover, or by right-clicking: Rename…, Duplicate, and Delete… (with a confirmation).
- **With Apple Music sync on** (sync spec §6.2, §6.3): LIBRARY gains **Removed from Apple Music (N)** while songs wait for review (Keep, Remove, Keep all, Remove all). PLAYLISTS shows Music's folders as collapsible groups and Music's playlists as read-only mirrors, marked with a note icon, before the local playlists. A mirror's only option is **Duplicate as my playlist**; dropping songs on it says "Edit this playlist in Music."
- **Programs** are loaded only from the sidebar; there is no dropdown.
  - Each entry shows how many songs are left to play.
  - Loading another program while a song plays or counts down asks first ("Load another program?"), because the next song will come from it.
  - The search box filters by name as you type.
  - `[+]` asks for a name, prefilled with today's date ("Tue Oct 14"), creates the program and loads it.
  - Adding songs with no program loaded creates one named for today and loads it.
  - Each program's options are on a "⋯" button or a right-click: Rename…, Duplicate, and Delete… (with a confirmation). **Duplicate** makes a fresh copy to run again: every item, all unplayed. The original keeps its record of what was danced.
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
│          │ PROGRAM: Tue Oct 14 (rename) │ 🔍 song / dance / teacher /      │
│          │  ⏸ STOP / TEACHING           │    choreographer / country       │
│          │  Tfilati                     │  Song  Dance  Teacher  Country ⏱ │
│          │  Kendime                [➕] │  …                               │
└──────────┴──────────────────────────────┴──────────────────────────────────┘
```

- **Player bar** (above the tabs on every page; drawn above the Program page here), in two rows:
  - **Row 1:** transport controls, the current item's label (§4 "Labels"), speed and volume; then, between thin vertical dividers, the **Projector** switch (with one line under it saying where the view is, "On Epson Projector", or the notice when there's no separate display; the full text on hover); then **Auto-show when playing [✓] after [N] s** (laptop mode's idle view, §7.3).
  - **Row 2:** the seek bar and elapsed time; then, after a divider, **Auto-continue [✓] after [N] s**.
  - Seconds are saved when the field is left, if they're a whole number in range; anything else goes back to the saved value.
- **Favorites:** a star at the left of every song row (library, holding, program items) adds or removes it from Favorites; until a song is a favorite, its star shows only on hover. A program item's ⋯ menu also has Add to / Remove from favorites.
- **Search boxes** (library, programs, dances) have an ✕ that clears them, shown once there is text.
  - **◀◀** restarts the current song. To go back to an earlier song, double-click it in previously played.
  - **▶** turns into **⏸** while a song plays.
  - When nothing is playing, the bar shows what's next ("Next up: …", "Starting in N…", or "Next: … in N…").
  - Previews and replays are marked as such.
  - A warning (a skipped missing file, a file that can't be played) appears under the bar until dismissed. It is never shown on the projector.
- **Previously played:** the play log for the current program, newest first. It scrolls.
- **Program list:** only **unplayed** items, in order. Played items stay in storage (`played_at`) but are not shown here.
  - **Reordering:** drag and drop.
  - **Adding:** drag songs in from the library, holding, playlists or previously played (dropped on an item, they go before it; below the list, at the end), or use the ➕ button (adds the selected library songs at the end). Each item takes the song's default dance; when an added song has more than one dance, a "Which dance?" dialog asks, with the default preselected (closing it keeps the defaults).
  - **Each item's menu** ("⋯" or right-click) has its options.
    - **Edit details** (song items) opens the song in the Music page's editor (below).
    - **Choosing the dance:** each item shows its label (§4 "Labels"). An item whose song has several dances lists every linked dance by its label, with the current one checked, so dances with the same name are told apart by choreographer.
    - **Insert STOP before** and **Remove**.
  - **STOP markers:** inserted with the **+ STOP** button (at the end) or an item's menu (before it).
  - **Removing:** an ✕ appears on each item on hover and removes it at once; Remove is also in the item's menu.
  - **Dropping:** the whole Program panel accepts drops. Dropped on an item, songs go before it; anywhere else, at the end.
  - **The program's name** is shown above the list, with a ✎ button to rename it.
  - **Double-clicking a program item does nothing.** The program's intent is "play in this order"; to play an item now, drag it to the top.
- **Holding panel:** files with `in_holding`, above the library list, in the order they were placed (`holding_position`). Drag and drop works as in the program: the whole panel takes drops; dropped on a held song, songs go before it, and anywhere else at the end; held songs dragged within the panel move. ✕ releases one, and held songs can be dragged into the program.
- **Song menus:** every song row in the library list (on both pages) and in Holding has a "⋯" menu, shown on hover (and on the selected library row), or by right-clicking the row: **Edit details** and **Add to / Remove from favorites**. **Edit details** (also in a program item's menu) switches to the Music page with that song selected alone, scrolled into view, and its editor open. If the current filter or search hides the song, the list goes back to All Music without the search.
- **Library list:** one row per song, showing its default dance's name, country, teacher, artist and choreographer. As the list narrows, columns disappear completely in this order: Artist, Teacher, Choreographer, Country, Time. Songs with more than one dance show a small "+N dances" badge, whose tooltip lists the dances by their labels. Searchable by song title, dance name, teacher, choreographer and country (`library_fts`, §4). Search-box text always goes through `toFtsQuery()`, so accents don't matter and punctuation like "4-Wall" can't break the query. The list is filtered by the sidebar selection, and the search carries over between the Program and Music pages.

### 6.3 Music page

- **Table:** one row per song, for browsing, sorting, searching and selecting. It is virtualized, so it stays fast with large libraries. Editing happens in the side editor, not in the table. Click selects, ⌘-click adds to the selection, Shift-click selects a range, and ⌘A (Ctrl+A on Windows) selects every song shown while the table has focus. Selected rows can be dragged onto a playlist or Favorites.
  - **Columns:** song title, artist, dance (the default dance's name), country, teacher, choreographer, dance type, difficulty, favorite, slide, duration, path and status.
  - **Columns can be reordered** by dragging a header (or Alt+←/→ with a header focused); Dance / Song, the star and the ⋯ menu stay put. Each list (this table, the Program page's library list) keeps its own order, saved in settings; right-click a header for **Reset columns**.
  - **Dance / Song** shows the label (§4) and sorts by dance name, then song title, with a "+N" badge when the song has more than one dance.
  - **In a playlist** (shown in its own order), a **#** column numbers the songs in the playlist's order (whatever the sort or search). Dropping rows onto another row moves them there, and onto the space below the last row moves them to the end. **Remove from playlist** removes the selection. Reordering is off while a search is active, because the search hides part of the playlist.
  - **When one song is selected,** the side editor opens beside the table. A dance shared with other songs says so ("Also used by 2 other songs"), because edits apply to all of them.
- **Selected song:** a side editor with two sections.
  - **Song:** title and artist.
  - **Dances:** every dance linked to the song, with the default marked.
    - **Per dance:** name, country, choreographer, dance type, difficulty and notes; the pairing's teacher; the Canva slide.
    - **Actions:** set as default; link an existing dance (search by name, choreographer or teacher); create a new dance; unlink.
- **Linking a Canva slide:**
  1. Choose a deck from a dropdown that lists decks by title (for example "Dance n' Jam Tunes"), or "+ Add a deck…" to paste a deck's link once (in Canva: Share → Embed → Smart embed link).
  2. Enter a slide number. The app immediately converts it to the slide's page ID and shows a preview with the slide's title, if it has one, to confirm.
  3. Optionally, paste a page link copied from Canva's share menu instead.
  - **The slide field** shows the saved image, "Deck · slide N: Title", Change… and Remove. It warns when the slide is no longer in its deck (link it again) or when its image couldn't be saved. While the image is being saved it shows "Generating preview…" with a moving bar; offline, "The slide preview will be generated when you're back online." instead. The library table has no slide column in v1.
- **Same-name suggestions:** when a dance shares its name with another dance that at least one song uses, the editor asks "Another dance called Lesnoto exists — same dance?". Dances no song uses (left over after unlinking) are never suggested.
  - **Same dance:** links this song to that dance and removes the automatic duplicate, if nothing else uses it.
  - **Different dance:** dismisses the suggestion for that pair, permanently (`distinct_dances`).
  - **Merge dances:** a general action for combining any two dances.
- **A merge** (including Same dance) moves songs, teachers, song defaults, program items and play history to the kept dance, and fills its empty fields from the removed one. Nothing personal is lost:
  - **Notes:** when both dances have notes, the removed dance's notes are added after the kept dance's.
  - **"Different dance" answers** about the removed dance carry over to the kept dance, so dismissed suggestions stay dismissed.
  - **Difficulty and the Canva slide:** the kept dance's values win when both are set.
- **Actions:** Add Music…, Import from Apple Music…, Favorite/Unfavorite (selection), Re-apply mapping… (selection), Refresh slides.
- **Sync with Apple Music** (macOS, sync spec §6.1): a switch beside the import buttons and, while sync is on, a status bar below the toolbar (last sync with Details, or a paused state with its fix, and **Sync now**). File → Sync with Apple Music, while sync is off, opens this page and pulses a border around the switch for a moment.
- **Refresh slides** sits in the header beside Add Music…, once a deck has been added. While images are being saved it shows "Saving slide images… N of M", and afterwards how many couldn't be saved. A "Canva links need checking" notice shows below while a deck's page can't be read, and a refresh that couldn't reach Canva says so.
- **Re-apply mapping** opens a dialog that shows the selected songs' Artist, Album Artist and Genre tags, with the mapping fields from the import step. They start from the import mapping in Settings, and the choice applies to this run only. It overwrites only the fields the chosen mapping targets: the song's artist, the default pairing's teacher, and the default dance's choreographer and country. If Genre → Country is off, countries are left alone. A default dance shared with other songs is left unchanged (it would change every song using it), and the result reports how many were skipped.
- **Missing and unsupported files** are visibly flagged.

### 6.4 Settings page

- Import mapping defaults
- Dance-type suggestion list
- Projector display choice
- Appearance: Light, Dark or System (applied at once)
- Countdown seconds
- Remote control: whether the remote's media keys work, and a button that asks macOS for Accessibility permission when they don't (§7.4)
- About: the logo, the version and the library's location
- "Reveal logs"

## 7. Playback and program flow

### 7.1 Sources of playback

| Started by | Logged (`play_log.kind`) | Marks program item played | Auto-continue afterwards |
|---|---|---|---|
| ▶ / ⏭ / auto-continue on the program | `program` | yes | per setting |
| Double-click in previously played | `replay` | no | **never**: halts and queues the program's next item |
| Double-click anywhere else (library on either page, holding, playlist) = **preview** | `preview` (with current `program_id`) | no | **never**: halts and queues the program's next item |
| Double-click in program list | n/a: does nothing | n/a | n/a |

- **Previews and replays count as real plays.** They stop whatever was playing, appear on the projector as Now Playing, and are listed in previously played.
- **The dance shown and logged:** a program item uses its own `dance_id`. A preview uses the song's default dance. A replay uses the dance it was logged with.
- **"Queues the program's next item"** means that when the preview or replay ends, playback stops and pressing ▶ starts the program's next unplayed item.

### 7.2 Program rules

- **Next up** is the first unplayed item by position.
- **▶ with nothing loaded:**
  1. Loads Next up.
  2. If `countdown.seconds > 0`, the projector shows "Starting in N…".
  3. Plays the song, setting `played_at` and writing `play_log`.
- **⏭** stops the current song and starts the next item at once, without a countdown.
- **⏹** rewinds the song to its start and keeps it loaded ("stopped"); ▶ plays it again as the same play, with no new log entry, and ⏭ moves on. ⏹ during a countdown cancels it.
- **A preview or replay that interrupts a program song** puts that song back as next up (unplayed), so ▶ plays it later; its play stays in the log. ⏭ counts the song as played. Unticking auto-continue during the countdown halts before the next song.
- **Operator commands pass STOP markers.** When ▶ or ⏭ finds a STOP marker next, it is marked played and the song after it starts: pressing a button means "go". Only automatic continuation halts at a STOP.
- **When a program song ends:**
  - **Auto-continue on:** the projector shows `Next: <title> in N…`, then the next item plays. ⏹ during the countdown cancels it.
  - **Auto-continue off:** playback stops, and Next up is queued.
- **Reaching a STOP marker** always halts, regardless of auto-continue. The marker is marked played. While halted, the projector shows the **next** dance and its slide. ▶ resumes.
- **Speed** ranges from 0.5× to 1.5× using `playbackRate` with `preservesPitch = true`. It resets to 1.0× for each new song unless the 🔒 toggle next to the speed slider is on. **Volume** is global, and starts at 100% each time the app opens.
- **Missing file at play time:** when the next song's file isn't on disk, it is skipped: left in the program, unplayed and flagged ⚠, while the song after it plays. A control-window warning names it, also when no playable song is left. A preview or replay of a missing file only shows the warning; whatever was playing or counting down carries on.
- **A removed song** (Apple Music sync's Remove, sync spec §6.4) is skipped the same way ("Skipped removed song: …"). The program and Previously played show it greyed and labeled "removed", and it can't be replayed. A song only *gone* from Music (still in the review list) plays as usual.
- **A double-click on ▶ or ⏸** counts as one press, since ▶ turns into ⏸ under the pointer.
- **Transport icons** are drawn (SVG), not characters: ⏸ and ⏹ render as colored emoji on macOS while ▶ doesn't.
- **Unreadable file at play time** (the file is there but can't be played): a warning is shown, and the program continues as if the song had ended. With auto-continue on, the next item plays; with it off, playback halts.

### 7.3 Laptop-mode auto-fullscreen

- **When:** only when projector mode is off, and only while music plays or a countdown runs. If `autoFullscreen.enabled` is on and there has been no input for `autoFullscreen.seconds` (keys in the control window, mouse movement, or any input on the Mac, such as scrolling or clicking: the system idle time), the projector view opens over the laptop display.
- **Closing:** mouse movement or Esc closes it, after a 1 s grace period.

### 7.4 Remote control

A media remote (or a keyboard's media keys) controls playback, whether the app is idle or playing, focused or not:

- **Play/pause** (one button): pauses a playing song; otherwise does ▶ (resumes, skips a countdown, or starts the program's next song, also from idle or after a STOP).
- **Next:** ⏭.
- **Back:** ◀◀ (restarts the current song).
- **Stop** (keyboards): ⏹.
- **Volume:** left to the system.

The keys are registered as global shortcuts in the main process and go to `PlayerSession`. Chromium's own media-key handling is switched off, so nothing can pause the `<audio>` element behind the session's back. On macOS, media keys reach an app only when it is trusted for Accessibility; Settings says whether the remote works and asks for the permission when it doesn't. See `docs/spikes/remote-control.md`.

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
  - **`display-removed` for the projector:** the window closes and audio continues. It does not fall back to covering the laptop. **Known issue:** about one unplug in four leaves an orphaned grey window over the laptop until the app quits; turn the Projector switch off before unplugging (see `docs/spikes/projector-unplug.md`).
  - **`display-added`:** if projector mode is on, the window reopens on the saved display, or the first non-primary one.
  - **`display-metrics-changed`:** bounds are reapplied.
- **At startup,** projector mode left on from last time reopens only when a separate display is connected; otherwise nothing covers the laptop until one is plugged in.
- **The control window is kept off the projector's display** after any display change, including sleep and wake (which renumber displays and can move windows), and whenever the operator moves it there. If no other display is left (clamshell, mirroring), projector mode closes rather than cover the operator's only screen; the switch stays on and a second display reopens it.
- **macOS specifics:** `setVisibleOnAllWorkspaces` is called with `skipTransformProcessType`, or macOS briefly turns the whole app into a background app (no Dock icon, no ⌘-Tab, the control window hidden) and after sleep it can stay that way. On wake, the app re-checks the displays and shows the control window if it's hidden.
- **Keeping the Mac awake:** while the projector view shows, or music plays or counts down, the app blocks display sleep (`powerSaveBlocker`).
- **Closing the control window quits the app,** so the projector view is never left on its own.
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
| Playing | previously played + current dance's slide | current dance (name left, country right), with red progress line | upcoming |
| Stopped / teaching / countdown | previously played + **next** dance's slide | "Up next" with the next dance (name left, country right), or countdown | rest of upcoming |
| Relevant dance has no slide (or no image and offline) | previously played, full width, with country | as above | as above |

- **What is shown is the dance, using the label rules (§4 "Labels"):**
  - **Large text:** the dance name, plus the choreographer in parentheses when the label calls for it.
  - **Smaller text:** the song title, *only when it differs* from the dance name, marked with ♪. In Now Playing it sits on its own line under the dance name. In Up next, and in previously played at full width, it follows on the same line.
  - **Previously played beside a slide** (the narrow column) shows only the large part.

```
NOW PLAYING
 Pravo Rhodopsko Oro (Yves Moreau)                     Bulgaria
   ♪ Pusteno Ludo
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────────────
UP NEXT
 Svornato (Jaap Leegwater)                             Bulgaria
 ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
 Hora Mare  ♪ Hora de la Munte                          Romania
```
- **Entry rows** follow the Flutter app's style: the name is left-aligned and the country is right-aligned on the same line. This applies to Now Playing, Up next, and previously played when it shows country.
- **Dividers:** a subtle, low-contrast horizontal line separates list entries, so short titles and countries clearly pair up across the gap.
- **Long titles** truncate with an ellipsis before they reach the country, so the country is never pushed off or overlapped. The smaller song title is truncated first, then the dance name.
- **Up next** is a vertical list showing as many entries as fit in its area.
- **STOP markers** show in the list as a row reading `⌄ —— Teaching —— ⌄`, the arrows pointing down at the dance that will be taught. Several STOPs in a row show once, and a STOP with no song after it isn't shown. Halted at a STOP, the next dance in the middle row carries the same Teaching row.
- **The middle row's heading:** "Now playing" (with "Paused" when paused or stopped), or, when nothing is loaded, "Up next", "Starting in N…" or "Next in N…". The list below is then headed "After that".
- **Previews and replays** show as Now Playing and are listed in previously played, like any play. The song playing now is not repeated under previously played.
- **The Teaching marker on the next dance** lasts only while the halted program's next item is the dance after the STOP; loading another program or removing that dance clears it.
- **Songs whose file is missing** are left out of the lists, since they will be skipped.
- **With nothing to show** (no program loaded and nothing playing, or a loaded program with nothing left, playing or played), the view shows the logo and the app's name, never a blank screen.
- **Previously played** shows titles only (the dance, without the song or country) when a slide is beside it, because the column is narrow. With no slide it shows the country too. Newest is at the top.
- **A missing country** leaves the right side empty.

- **Read-only.** The view renders state snapshots from main (`projector:snapshot`, plus `projector:progress` about 4 times a second for the red line) and sends nothing back. Its own preload exposes only `getSnapshot`, `onSnapshot` and `onProgress`.
- **The slide box** (`slideBox` in `shared/projector.ts`): 16:9, fitted within two-thirds of the content width and the top half of the screen (inside the view's 4 % / 3 % margins), aligned top right. The projector page draws the saved image in it, and main lays the live view over exactly the same box. Previously played fills the space to its left.
- **The slide layout is used** whenever the middle dance (Now playing, or Up next when nothing is loaded) has a slide: a saved image, or the live view. Otherwise the no-slide layout.
- **Errors** are never shown on the projector, only in the control window.

### 8.3 Canva slides

Verified in the spike with a real 42-slide deck (§11):

- **Decks are added once.** The user pastes the deck's link from Canva's **Share → Embed → Smart embed link** (`…/view?embed`); the field's hint says so. Any Canva share link is normalized to the plain `https://www.canva.com/design/<designId>/<token>/view` form: a `?embed` suffix and any fragment are removed.
- **Reading a deck:** the app fetches that public view page, with no Canva login, and reads:
  - **The presentation title** from the page's `<title>` / `og:title`, for example "Dance n' Jam Tunes". This is how decks are listed in dropdowns.
  - **The ordered list of slides** from the design data embedded in the page. Each slide has a stable page ID (for example `PBrWDbC9tVSzgzvW`) and, if the slide is named in Canva, a title (for example "Ali Paşa").
  - Both are stored in `canva_decks`.
  - **Refreshed** at startup when online, on "Refresh slides", when the control window gains focus (at most once a minute, online only; slide lists only, no image captures), and when the slide dialog opens. Decks with slides of the current program's dances still to come are read first, and their images are saved first by Refresh slides. A deck edited in Canva otherwise leaves stale numbers and titles, and the projector's live slide is addressed by its saved position.
- **Linking a slide to a dance:**
  - The user picks a deck and enters a **slide number**. The app converts it to that slide's **page ID** right away and shows a preview, with the slide's title, to confirm.
  - **Alternatively,** the user can paste a page link from Canva's share menu. A `canva.link/…` short link redirects to `…/edit?ui=<base64 of {"D":{"T":{"A":"<pageId>"}}}>`, which yields the page ID directly.
  - The dance stores the page ID and its last known position (`dance_prefs`).
- **Opening a slide:** the page ID is looked up in the deck's current slide list to get its position *now*, then `…/view#<position>` is loaded. Inserting, deleting or reordering slides in Canva doesn't break any link.
  - The public view link **ignores** the `?ui=` page parameter, so the position must be resolved this way.
  - The editor link needs a Canva login, which the app does not use.
- **Undocumented format, so it degrades safely:**
  - The slide list comes from Canva's undocumented, minified page data (slide objects shaped like `{"A?":"i",…,"a":"<pageId>","B":"<title>"}`).
  - **Self-check:** the parser treats zero slides, or a known page ID going missing from a deck that otherwise parsed, as "format changed".
  - **When parsing fails:** the app keeps the last known slide list and positions, shows the saved slide images, and shows a "Canva links need checking" notice **in the control window only**.
  - **A dance whose page ID was deleted from the deck** is flagged for re-linking. Its saved image stays in use.
- **Live display** loads `…/view#<position>` in a `WebContentsView` owned by main, positioned over the slide area of the projector window. It is *not* an `<iframe>`:
  - The `/view` page sends `X-Frame-Options: deny`, so it cannot be iframed.
  - `?embed` can be iframed, but its controls never fade.
- **Hiding Canva's controls:** after a new deck loads, main sends a synthetic mouse pass (several `mouseMove` events, then `mouseLeave`) to the view. Canva then fades its controls (logo, Share, "Create with Canva", page counter, arrows) after about 10 s; without mouse activity they never fade. Another slide of a deck whose controls have already faded is only a `#N` change in the page, and the controls stay hidden, so it gets no mouse pass (one would bring them back). A switch before the fade starts over as a new deck. The projector window ignores the mouse, so the operator's cursor never wakes the controls.
- **Saved slide images (offline):**
  - **When captured:** on linking a slide (when online), on "Refresh slides", and in the background at startup and whenever the connection comes back (main checks `net.isOnline()` every 15 s, and a capture skipped offline is retried on the next check that finds the app online): linked slides without a saved image. If such a slide's deck can't be read then, it records why ("Couldn't reach Canva…"), so the dance editor shows that instead of "Generating preview…".
  - **How:** the view is loaded off-screen, nudged, allowed to fade, then captured with `webContents.capturePage()`.
  - **Storage:** saved under the app data folder, keyed by deck and page ID in `slide_cache`, so a moved slide keeps its image.
  - **On failure:** the previous image is kept and `last_error` is recorded, shown as ⚠ on the dance.
- **What is shown: the saved image first, then live.** The projector shows the saved image at once. The live view loads under a **cover** showing the same saved image (a second view, on top of it; it appears only once its page has loaded that image, and until then the projector page's own copy shows through), and the cover is removed only once Canva's controls have faded: 11 s after a new deck loads (after the mouse pass), 1.5 s after another slide of the loaded deck. The Canva page is never simply hidden while it gets ready: Chromium throttles a hidden page, so Canva never fades its controls and the page keeps showing its previous slide until it is shown (both seen on real hardware, and reproduced in a spike). Switching away before then never shows it. Offline, or when the page fails to load, the saved image stays. With no saved image the slide area stays black until the live view appears. The projector never shows "Loading…" or Canva's controls.
- **Capturing details:** at startup when online, only linked slides without a saved image are captured; "Refresh slides" re-captures all of them. Captures run one at a time in an off-screen 1920×1080 window, reused within a deck (12 s for a new deck, 1.5 s for another slide of it), and give up after 45 s.
- **Canva's pages are untrusted.** The live view and the capture window use their own `persist:canva` session, sandboxed, muted and without a preload. They may navigate only within `https://*.canva.com` and never open windows. The app's own windows are sandboxed too, and only one copy of the app runs.
- **A slide gone from its deck** keeps its saved image on the projector but is never loaded live (it has no position).
- **Only Canva's deck page counts.** A load (live or capture) that ends anywhere but the deck's own view page, or with an HTTP error, has failed: a Wi-Fi login page or Canva's sign-in page for a deck no longer public is never shown or saved. Server redirects off canva.com are blocked, a deck fetch redirected elsewhere reads as "couldn't reach Canva" (not a format change), and only decks read fine in a refresh are re-captured.
- **The live view follows the projector window:** when the window is replaced (laptop mode → projector mode, another display), the view moves to the new one; the old window's late close doesn't switch it off.

## 9. Architecture

Approach A (chosen): **the main process owns all state; the control window plays the audio; the projector window is read-only.**

```
┌──────────────────────── main process (source of truth) ────────────────────────┐
│  db/        SQLite, migrations, repositories                                    │
│  import/    utilityProcess: folder scan, music-metadata, Apple XML (plist)       │
│  session/   PlayerSession: pure TS state machine (cursor, now playing,           │
│             auto-continue + countdown timers, preview/replay rules, play_log)     │
│  canva/     decks + slide links, CanvaService, CaptureQueue → slide_cache        │
│  projector/ window control, snapshot feed, LiveSlide (Canva WebContentsView)     │
│  ipc/       typed commands + one "state" broadcast                               │
└───────────────▲─────────────────────────────────────────────┬──────────────────┘
      commands  │                                             │ state snapshots
┌───────────────┴──────────────┐                ┌─────────────▼────────────────┐
│ Control window (React)       │                │ Projector window (React)     │
│ owns <audio>; reports        │                │ renders snapshot only        │
│ position/ended ~4×/s         │                └──────────────────────────────┘
└──────────────────────────────┘
```

- **One source of truth.** Renderers send commands, for example `program.addItems`, `player.play`, `dance.update`. Main applies them and broadcasts a snapshot. No renderer decides what plays next. This prevents the Flutter app's class of desync bugs.
- **`PlayerSession` has no Electron imports.** Timers are injected, so it is fully unit-testable.
  - It reaches the database through small "ports".
  - The control window's `<audio>` reports only "ended" and "failed", each tagged with the play's id, so a late event from an earlier song is ignored.
- **Audio reaches `<audio>` through an `fdp-media://file/<id>` scheme.** It looks up the path by file id, so the renderer never names a path. It answers Range requests itself, because seeking needs them.
- **Saved Canva slides are served as `fdp-media://slide/<deck>/<page>?v=<captured at>`.** The version makes a re-captured image load fresh.
- **Canva in main** (`src/main/canva/`): pure modules with injected pieces (a `Fetcher`, a `SlideCapturer`, a `LiveView`), and one Electron file, `electron-canva.ts`. A slide's position is always looked up from its page ID.
- **Sync with Apple Music in main** (`src/main/apple-sync/`, sync spec §3): pure modules over the database (snapshot parsing, matching, the tag baseline, playlist mirrors, the review list, the engine) and `AppleSync` (triggers, states, notices). The Music library is read by a bundled Swift helper, `native/music-library/main.swift`, built by `npm run build:helper` into `Contents/Resources/fdp-music-library`; `FDP_APPLE_LIBRARY` points sync at a snapshot JSON file instead, for development and end-to-end tests.
- **`FDP_USER_DATA`:** setting it points the app at another data folder, so end-to-end tests and smoke runs never touch the real library.
- **The typed IPC contract** lives in one shared `contract.ts`, used by main, the preloads and the renderers. Preloads expose only that API (`contextIsolation: true`, no `nodeIntegration`).
- **Tooling:**
  - **Build:** electron-vite, React, TypeScript
  - **State:** Zustand, for UI-local state only (selection, search text)
  - **Drag and drop:** native HTML5 drag and drop, with the app's own data types (songs, program items). dnd-kit wasn't needed.
  - **Libraries:** `node:sqlite` (built in), music-metadata, plist
  - **Packaging:** electron-builder 26 (`npm run dist`) makes one Universal `.dmg` (Apple silicon and Intel, about 230 MB). `npm run dist` is **ad-hoc signed** (`identity: '-'`) so it builds without a certificate; a release is signed with a Developer ID and the `.dmg` notarized and stapled, so a downloaded copy opens normally. CONTRIBUTING.md has the steps.
  - **App icon:** the logo in white on the app's red tile (`build/icon/icon.html`). `npm run icon` renders it into `build/icon.png`, `build/icon.icns` (for the `.dmg`) and `resources/icon.png` (the Dock when unpackaged).
- **Dev gotcha:** VS Code's terminal sets `ELECTRON_RUN_AS_NODE=1`, so npm scripts run Electron with that variable unset.

## 10. Errors, edge cases, and testing

### 10.1 Rule

The music never stops because of a side failure, and the projector never shows an error to the room.

- **Program pre-check:** when a program is loaded and at startup, every file in it is checked for existence, so missing files are flagged before the event.
- **Database safety:**
  - Writes use transactions.
  - At startup, before migrations, the library is copied (`VACUUM INTO`, a consistent copy) to `backups/folk-dance-player-<date>_<time>.sqlite` in the app data folder, keeping the newest 5. A brand-new library isn't backed up. A failed backup is logged and startup goes on.
  - Migrations run in a transaction and abort startup with a clear message on failure.
- **Crash or restart:** the program position is restored from `played_at`, and playback does not auto-resume.
- **Import errors** are per file and never abort the batch (§5.4).
- **Logging:** the app log is `main.log` in `~/Library/Logs/Folk Dance Player` (beside the library when `FDP_USER_DATA` is set). It rolls over at 1 MB, keeping 3 old files, and writing it never throws. It records each start (with the version), backups, finished imports, failed slide captures, uncaught errors, crashed windows or utility processes, and errors in the windows' consoles.
- **The app menu:** About; Settings… (⌘,), which opens the Settings page; the standard Edit (copy and paste in text fields) and Window menus; and Help → Reveal Logs in Finder and Reveal Library Backups in Finder. The developer tools are offered only in development.

### 10.2 Testing

- **Unit (Vitest):**
  - `PlayerSession`: auto-continue on and off; countdown and its cancellation; STOP halts; preview and replay halt and queue next; missing file skipped; ⏭ behavior.
  - Import mapping.
  - Apple XML parsing (fixture `Library.xml` with playlists, a streaming-only track, and an edited playlist).
  - `content_hash` relinking.
  - Canva: URL normalization, deck parsing (title plus the ordered page IDs and titles, from a saved view-page fixture), slide number → page ID, page ID → current position, and the fallback when parsing fails.
  - Songs and dances: the automatic one-to-one dance on import, never linking by name, default-dance fallback, linking and unlinking, merging dances.
  - Labels: song omitted when it equals the dance name; choreographer shown only when a song's dances have more than one choreographer; no empty parentheses for traditional dances. Cover all four examples in §4.
- **Database (in-memory SQLite):** migrations, repositories, `library_fts` search across songs and their dances (it must stay current when a dance or teacher changes), autocomplete queries, the playlist overwrite-protection decision.
- **Apple Music sync** (`tests/main/apple-sync/`, sync spec §8): the snapshot and eligibility, the helper runner (stub executables for each exit code, a timeout, invalid JSON, output over 1 MB), matching and adoption, the tag baseline, playlist mirrors and folders, the review list, the engine over real MP3s on the in-process worker, and `AppleSync`'s triggers and states. Removed songs are hidden from lists and skipped in a program.
- **End-to-end (Playwright + Electron, `e2e/`):** each test starts the app on a throwaway library of silent MP3s. They run on the build (`npm run test:e2e`) and on the packaged app (`npm run test:e2e:dist`):
  - import a folder, then search
  - drag into a program and reorder (drags move in steps, as a person's do; a single jump can lose the drop)
  - play, then check that the projector's snapshot follows
  - save and load a program, also after a restart
  - Settings… in the app menu opens the Settings page
  - each start backs up the library, and the log says so
  - Apple Music sync: turn it on with an `FDP_APPLE_LIBRARY` snapshot, change the snapshot, focus the app, and check the toast, the review list and a mirror (`e2e/apple-sync.spec.ts`)
- **Manual pre-release checklist (real hardware):** `docs/manual-testing/pre-release-hardware.md`, a step-by-step list with checkboxes, run on the packaged app. It covers:
  - the view over the laptop (Esc, the mouse, auto-show)
  - extended mode with a projector, and mirror mode
  - the Canva live slide and its fade, and offline slide images
  - how audio sounds at 0.75× and 0.5× speed
  - sleep and wake, and keeping the Mac awake
  - unplugging the projector
  - Apple Music sync: the permission dialog names the app, the real library syncs, a refused permission shows the Settings help, and whether an update asks again

## 11. Spike findings (2026-10-13)

The throwaway spike was deleted after this spec was approved; only its display helper is kept, at `docs/spikes/display-mode.swift`, for the display setup assistant (§12). It was run on a MacBook with a 1080p HDMI projector.

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
  - **No public page links, but stable page IDs:**
    - A page link copied from Canva's share menu (`canva.link/…`) redirects to the **editor**, `…/edit?ui=<base64 {"D":{"T":{"A":"<pageId>"}}}>`, which needs a login.
    - The public `/view` link ignores `?ui=`.
    - **The public view page does embed every slide in order,** each with a 16-character page ID and its title if named: 42 slides, slide 6 = `PBrWDbC9tVSzgzvW` "Ali Paşa".
    - **Stable:** after a blank slide was inserted at position 6, the deck had 43 slides, Ali Paşa was at #7 with the same ID, and all old IDs were unchanged.
    - **Deck title:** the view page's `<title>` / `og:title` gives the presentation title ("Dance n' Jam Tunes").

## 12. Future (not v1)

- **Shared song and dance database:** shares the shareable layer only (songs, dances and dance–song links), never personal data (teachers, default dances, notes, difficulty, slides, favorites). It suggests matching dances and songs by name and title; the user picks one, and its values are copied into their local records. `songs.uuid` and `dances.uuid` exist for this. Canva's developer API (Connect) page IDs are an alternative to the page-data parsing in §8.3, but it is a preview API that needs a Canva developer app and a login.
- **Display setup assistant:**
  - When a projector is detected, recommend extended mode with the laptop as the main display, then apply it.
  - **macOS:** a bundled, compiled CoreGraphics helper.
  - **Windows:** `DisplaySwitch.exe /extend` plus `ChangeDisplaySettingsEx`/`SetDisplayConfig`.
  - An OS-style "Keep these settings? Reverting in 15 s" confirmation that reverts automatically.
- **Converting AIFF/ALAC** so those files can be imported.
- **Windows build and testing.**
- **Import from MITPlayer:** read MITPlayer's metadata file and map its fields into `songs` (and its lists into playlists or programs, if it has them), through the same mapping step and summary as other imports (§5). The file format still needs to be examined from a real sample before this can be designed.
- **First-run tour:** a guided tutorial the first time the app opens. It steps through each area (sidebar, library and search, building a program, the player bar with auto-continue, the projector toggle, the Music page and importing, Settings) and explains how to use each one. It can be skipped and replayed later from Help.
- **Bulk editing, like Apple Music's "Get Info" on several songs:** select several songs in the Music page table and edit their fields together.
  - **Fields that agree** across the selection show the shared value.
  - **Fields that differ** show a `Mixed` placeholder; a field left as `Mixed` isn't changed.
  - **Only fields the user actually edits are applied,** to every selected song (or to its default dance, for dance fields).
  - **Clear warnings, because bulk edits are easy to get wrong and hard to undo:**
    - when the bulk editor opens: how many songs are selected, and that changes will apply to all of them
    - again before saving: a confirmation listing each field that will change, the new value, and how many songs (and shared dances) it affects
  - **Shared dances:** if a change would affect dances shared with songs outside the selection, the confirmation says so explicitly.
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
  - Electron 44 has no install script of its own, so `postinstall` runs `install-electron` to download the binary. Without it, electron-vite fails with "Electron uninstall".
- **Workflow:** spec, then plan, then test-first implementation, with conventional commits that each end with the co-author line when an AI assisted.
- **Code conventions:**
  - Prettier settings
  - Mantine components first; custom CSS only in co-located CSS Modules
  - Renderers reach main only through the typed IPC contract
- **Rules for common changes:**
  - **Adding a dependency:** pin the exact version, at least two weeks old, and say why in the commit.
  - **Changing the database:** add a new numbered migration. A migration that has been released is never edited.
  - **Adding an IPC channel:** add it to the contract, to `INVOKE_CHANNELS`, and to the handlers.
- **Release checklist** (the workflows do steps 2–4, §13.4):
  1. **Prepare Release** bumps the version and moves `Unreleased` into a dated version section of `CHANGELOG.md`, in a draft release pull request whose description carries the manual hardware checklist (§10.2).
  2. The maintainer approves the pull request's PR Gate run (**Approve workflows to run**). While the pull request is a draft, they run the checklist on that version's `.dmg` and tick it in the description, then mark it ready and merge it once the PR Gate passes.
  3. **Create Release** on main checks the version, tests, builds the installers, checks them with the end-to-end tests, and tags and publishes the GitHub release.

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
  - Canva slides linked by stable page ID, resolved from the public view page
  - songs and dances as separate records (many-to-many, automatic one-to-one dance on import, names not unique), with shareable and personal layers
  - playlists are separate from programs
  - played items hidden but kept
  - double-click preview rules
  - exact, two-week-old dependency pins
- **Kept current:** when a task makes a decision a future contributor would otherwise have to rediscover, it adds an entry in the same commit. If a decision changes the spec, the spec is updated too.

### 13.4 Continuous integration and releases (GitHub Actions)

The repo is public, so GitHub's standard hosted runners (Linux, Windows and macOS) cost nothing; the limits are concurrency (20 jobs, 5 of them macOS). Every action is pinned to a commit SHA (with its version in a comment), at least two weeks old like every dependency, and each workflow asks only for the permissions it needs.

- **PR Gate** (`.github/workflows/pr-gate.yml`), on every pull request and every push to main:
  - **Typecheck, test and build** (Linux): formatting, typecheck, the unit tests and the build.
  - **End-to-end (<os>)**: the end-to-end tests on a matrix of systems, starting with `macos-latest`. Linux (under a virtual display) and Windows join by adding them to the matrix.
  - **CHANGELOG**: a pull request that changes `src/` must change `CHANGELOG.md`, unless it's labeled `no changelog` or comes from Dependabot. It compares the PR's merge commit with today's main, so it sees exactly the PR's changes.
  - Pull requests from forks run with read-only permissions and no secrets (`pull_request`, never `pull_request_target`); GitHub asks before running a first-time contributor's workflows.
- **Prepare Release** (manual, main only; input, with no default: `major`, `minor`, `patch` or an exact version; the first release is `0.1.0`). It runs `scripts/release.mts prepare`, which bumps the version (`npm version`) and moves the Unreleased notes under a dated `## [x.y.z]` heading, leaving Unreleased empty. The current version is allowed, for the first release. Then it pushes `release/vx.y.z` and opens "Release vx.y.z" **as a draft**, so it can't be merged before the hardware check. Its description starts with the steps, then the hardware checklist (`docs/manual-testing/pre-release-hardware.md`, without its title), so the boxes can be ticked there. GitHub holds the PR Gate of a pull request opened with a workflow's own token until someone with write access clicks **Approve workflows to run** (since mid-2026; before, it started no run at all, and checks from a separately started, dispatched run don't count toward a pull request's required checks). So the maintainer approves the run, runs the checklist, reads the version and notes, clicks **Ready for review** and merges. The PR Gate doesn't listen for `ready_for_review`: marking a draft ready changes no code, and on the 0.1.0 release PR that second run was cancelled by the first's concurrency group, leaving the PR blocked until it was re-run.
- **Create Release** (manual, main only), as three jobs, so a release is all or nothing:
  1. **Check the version** (Linux): `scripts/release.mts check` refuses a version that isn't higher than the latest `vx.y.z` tag, or that has no CHANGELOG section.
  2. **Build (<os>)**, a matrix: the unit tests, `npm run dist` (electron-builder never publishes by itself: `--publish never`), the end-to-end tests on the packaged app, and the installer kept as an artifact. Today: `macos-latest`, the Universal `.dmg`. Windows joins as `{ os: windows-latest, installer: 'dist/*.exe' }`, with its electron-builder target and a cross-platform `dist` script (`env -u` is Unix-only).
  3. **Publish** (Linux), once every build has passed: tags `vx.y.z` at the commit and publishes one GitHub release, "Folk Dance Player x.y.z", with every installer and the version's CHANGELOG section as its notes. It uses the workflow's own token (`contents: write`); no personal access token is needed.
  - **A dry run** (a checkbox; any branch) does everything but publish: a failed version check is reported but doesn't stop it, and the installers are kept as workflow artifacts for a week.
  - **Signing in CI:** the certificate and Apple's notarization credentials become repo secrets for the build job (CONTRIBUTING.md has the electron-builder options).
- **Dependabot** (`.github/dependabot.yml`): weekly update pull requests for npm packages and the workflows' actions, only for releases at least 14 days old (`cooldown`), with development tools' minor and patch updates grouped. Major npm upgrades are ignored: they're deliberate work (Vite stays on 7 for electron-vite 5, and `@types/node` follows the Node major in `.nvmrc`).
- **Branch protection on main** is the repo's `main` ruleset: changes arrive only through pull requests (squash merges; no review approval required, so a solo maintainer can merge), never by force-push or deletion, and nobody bypasses it. It also requires the PR Gate's checks: Typecheck, test and build; End-to-end (macos-latest); CHANGELOG.
- **Repo setting:** "Allow GitHub Actions to create and approve pull requests" is on, for Prepare Release.

