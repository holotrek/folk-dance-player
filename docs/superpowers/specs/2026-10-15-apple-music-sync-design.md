# Sync with Apple Music — Design

- **Date:** 2026-10-15
- **Status:** Implemented (Plan 10, `docs/superpowers/plans/2026-10-16-plan-10-apple-music-sync.md`)
- **Extends:** `2026-10-13-folk-dance-player-electron-design.md` (the main spec), §5 Importing music
- **Spike:** the iTunesLibrary framework read the user's real library (2,169 tracks, 78 playlists) in
  about 0.8 s, with the same persistent IDs, tags and playlists as their exported `Library.xml`
  (findings in §9)

## 1. Purpose

Today an organizer brings their Apple Music library in by exporting `Library.xml` from Music and
importing it, and repeats that by hand whenever the library changes. **Sync with Apple Music**
reads the Music library directly and keeps the app's library current, with no export step.

Music stays the place where the organizer curates (adding tracks, fixing tags, building
playlists); the app follows it. Everything personal stays the app's own: dances, programs, notes,
slides, favorites, Holding and local playlists.

### Success criteria

1. Turning sync on once brings in the whole Music library, with a single macOS permission dialog
   naming Folk Dance Player.
2. After that, changes made in Music appear in the app when it starts or is switched back to,
   within about a second for a library of a few thousand tracks.
3. Nothing personal is ever lost: sync never deletes a song by itself, a song that comes back
   brings back all its data, and fields edited in the app are never overwritten.
4. A song is never duplicated because it was added both through Music and through Add Music….
5. Sync never interrupts a session: it runs alongside playback, and its failures never stop the
   music (main spec §10.1).

### Platform

macOS only. On other platforms the feature is hidden. Sync reads through a `LibrarySource`
interface (§3), so a Windows source can be added if one exists; whether to build one (PowerShell
driving iTunes for Windows' COM interface, for example; the Apple Music app for Windows has no
known API) or leave the feature out is decided when Windows is built.

## 2. Decisions

Chosen by the user during design, each with the alternatives considered.

| Question | Decision | Rejected |
|---|---|---|
| What sync covers | **The whole library:** every local music track and all of the user's own playlists | Chosen playlists only; all tracks with chosen playlists |
| A track removed from Music | **A review list:** the song is flagged and waits for Remove or Keep; sync never deletes | Remove automatically; keep automatically |
| What Remove does | **A soft delete:** the song is hidden but every row is kept; adding the same file back restores it with all its data | Keep history as text and delete the rest; remove everywhere; remove only if unused |
| Restoring removed songs | **Only automatically,** when the same file comes back (through Music or Add Music…) | A "Removed" filter with a Restore button |
| Playlists from Music | **Read-only mirrors;** "Duplicate as my playlist" makes an editable copy | Editing detaches the playlist; asking on each conflict |
| Music's playlist folders | **Collapsible folders** in the sidebar | Flattened; flattened with a "Folder / Name" prefix |
| Tags changed in Music | **Follow Music unless the field was edited in the app** | Music always wins; fill empty fields only (today's import rule) |
| When sync runs | **At launch, when the app is focused, and on Sync now** | Polling every minute; watching Music's files |
| Music has a different library open | **Pause and ask** | Pause silently; sync it like any change |
| Turning sync off | **Keep everything; mirrors become editable local playlists** | Keep playlists frozen; ask |
| Extra Music data | **None in this version** (Favorites: the framework exposes no favorite flag; see §10) | Favorites, comments, BPM |
| Feedback | **A toast when a sync changed something;** details in Settings | Quiet; a toast after every sync |
| A local song shows up in Music (same audio, a copy) | **Adopt it:** the existing song becomes the synced one and keeps all its data | Keep both; ask each time |
| Add Music… picks a copy of a synced song | **Skip it as already present** | Add a separate song |
| How the app reads Music | **A bundled Swift helper** using the iTunesLibrary framework | A native Node add-on; scripting Music's XML export |

## 3. Architecture

```
AppleSync (main)                      triggers, one sync at a time, pause states
  └─ LibrarySource.read() → Snapshot
       ├─ HelperSource                 runs Contents/Resources/fdp-music-library
       └─ FileSource                   reads the JSON file named by FDP_APPLE_LIBRARY
  └─ sync engine (pure, over the db)   plan + apply (§5)
       └─ import worker (utility process, existing): reads tags and fingerprints new or moved files
```

### 3.1 The helper: `fdp-music-library`

- **What it is:** a small Swift command-line program (about 150 lines) that opens `ITLibrary`
  (API version 1.1) and prints one JSON snapshot on stdout. It never writes anything.
- **Where it lives:** `native/music-library/main.swift`, built by `npm run build:helper` into
  `resources/bin/fdp-music-library` as a Universal binary (`swiftc` for arm64 and x86_64, joined
  with `lipo`). electron-builder copies it into `Contents/Resources` (`extraResources`), and the
  app's ad-hoc signature covers it.
- **Permission:** macOS asks once for "Media & Apple Music" access, on behalf of the app that
  launched the helper. In the packaged app that is Folk Dance Player, whose Info.plist carries
  `NSAppleMusicUsageDescription` (added through electron-builder's `extendInfo`). Without that
  key macOS denies access without asking, which is what happened in the spike when the helper was
  started from a terminal inside Visual Studio Code.
- **Snapshot format** (version 1):

  ```json
  {
    "version": 1,
    "libraryId": "<the master playlist's persistent ID>",
    "tracks": [{
      "persistentId": "E2B4BA09917B9867",
      "location": "file:///Users/…/18%20Karamfil.mp3",
      "locationType": "file",
      "mediaKind": "music",
      "kind": "MPEG audio file",
      "title": "…", "artist": "…", "albumArtist": "…", "genre": "…",
      "durationMs": 215000
    }],
    "folders": [{ "persistentId": "…", "name": "IFD2026", "parentId": null }],
    "playlists": [{ "persistentId": "…", "name": "Week 3", "parentId": "<folder id or null>", "itemIds": ["…"] }]
  }
  ```

  Persistent IDs are 16 uppercase hex digits, the same form as `Library.xml`'s `Persistent ID`.
  `mediaKind` is `music` for music and the framework's kind name otherwise. `playlists` holds
  only the user's own playlists: the helper leaves out the master library, built-in playlists
  (any `distinguishedKind`), folders (listed in `folders`) and hidden playlists. User smart
  playlists are included with their current items, as `Library.xml` includes them.
- **Exit codes:** `0` success; `2` access denied; `3` the library couldn't be opened (any other
  `ITLibrary` error). Any other code, a crash, output that isn't a valid snapshot, or no exit within
  30 seconds counts as a failed read.

### 3.2 `LibrarySource`

```ts
interface LibrarySource {
  read(): Promise<SnapshotResult>
}
type SnapshotResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }
```

- **`HelperSource`** runs the helper with `execFile`, applies the 30 s timeout, maps exit codes to
  reasons, and validates the JSON against the snapshot shape. The read while turning sync on waits
  up to 5 minutes instead, because macOS's permission dialog holds it; stdout may be up to 256 MB.
- **`FileSource`** reads a snapshot from the file named by `FDP_APPLE_LIBRARY`, read fresh on
  every sync, so dev runs and end-to-end tests can change the "Music library" between syncs. When
  the variable is set, `FileSource` replaces `HelperSource` (like `FDP_USER_DATA`, it is for
  development and tests). `npm run dev` started from Visual Studio Code can't get Music access
  (it's attributed to Visual Studio Code), so the real helper is tested in the packaged app.

### 3.3 `AppleSync`

- **Triggers:**
  - at startup, once the window is shown
  - when the control window gains focus, at most once every 10 seconds
  - Sync now (Settings, and File → Sync with Apple Music, ⌘⇧S)
- **One at a time:** a trigger during a running sync queues one more sync (never more).
- **States:** `off`, `idle`, `syncing`, `paused-denied`, `paused-other-library`. A paused sync
  does nothing on focus triggers (no repeated notices). Sync now and the Settings buttons retry.
- **Broadcasts** `appleSync:state` (state, last result, review count) to the control window, and
  `library:changed` after a sync that changed anything.

## 4. Data (migration 004)

| Column / table | Meaning |
|---|---|
| `files.apple_sync` | `NULL` not synced; `'synced'` follows Music; `'gone'` Music no longer has it (in the review list) |
| `files.removed_at` | The soft delete. Non-null hides the song (§6.4). Cleared when the file is matched again. |
| `files.sync_baseline` | JSON of the mapped values sync last wrote for this song (§5.4) |
| `playlists.apple_sync` | `1` for a read-only mirror of a Music playlist |
| `playlists.folder_id` | The folder the playlist is in, or `NULL` |
| `playlist_folders` | `id`, `name`, `parent_id` (another folder or `NULL`), `apple_persistent_id`, `position` |

- **Settings keys:** `appleSync.enabled` (boolean), `appleSync.libraryId` (string or null),
  `appleSync.lastResult` (the last sync's summary, §7.1).
- **Why columns instead of new `source` values:** `files.source` and `playlists.source` have
  CHECK constraints, and SQLite can't change one without rebuilding the table. `source` keeps
  saying where a row first came from; `apple_sync` says whether Music owns it now.
- **Existing `Library.xml` imports** are adopted on the first sync: their persistent IDs are the
  ones the helper reports (§9).
- **Search needs no index change:** `library_fts` keeps removed songs' rows, and every library,
  search and picker query filters on `files.removed_at IS NULL`, so restoring a song needs no
  re-indexing.
- **The review list** is `apple_sync = 'gone' AND removed_at IS NULL`; a removed song keeps
  `'gone'` but has left the list.

## 5. The sync rules

Each sync reads a snapshot and runs these steps. Steps 1–2 change nothing; the rest write.

### 5.1 Identity

If `snapshot.libraryId` differs from `appleSync.libraryId`, the sync stops before changing
anything, enters `paused-other-library`, and shows **"Music has a different library open"**:

- **Keep waiting:** nothing changes; sync resumes when Music has the original library open again.
- **Switch to this library:** `appleSync.libraryId` becomes the new ID and the sync runs. Every
  song from the old library becomes `'gone'` (into the review list), and the new library's tracks
  are added or adopted.
- **When turning sync on,** a different library is found when the library is first read, so this
  question comes before the mapping step and the playlist choices are made for the library
  being synced.

### 5.2 Eligible tracks

A track is synced if it is a local file (`locationType` `file`, a `file://` location), its
`mediaKind` is `music`, and its format is supported (main spec §5.4). Everything else is skipped
and counted, never touched: cloud and streamed items, videos, PDFs and booklets, Apple Lossless
and AIFF ("unsupported format", as today).

### 5.3 Matching

For each eligible track, in order:

1. **A synced file with the same persistent ID:** its path is updated if Music moved the file,
   and its tags are compared (§5.4). Paths are compared in Unicode NFC form: Music and the file
   system can store the same accented name in different forms (42 tracks in the spike).
2. **Otherwise the existing chain** (main spec §5.4): same path, then persistent ID, then
   fingerprint. Two differences while syncing:
   - **Adoption:** a fingerprint match against a local song (`apple_sync IS NULL`) adopts it even
     if its old copy still exists. The song points at Music's copy, becomes `'synced'`, and keeps
     all its data. If several local songs share the fingerprint, the oldest (lowest id) is adopted
     and the others stay local.
   - **Restoring:** a match against a soft-removed song clears `removed_at`. Its local playlist
     memberships come back with it.
3. **No match:** a new song, its automatic dance, and the pairing, using the saved import
   mapping (main spec §5.2). There is no mapping step per sync.

Only new, moved or changed files go through the import worker (size, mtime, duration and the
fingerprint are read from the file; the tags are Music's). "Unchanged" is the same path, size and
mtime. Unchanged tracks are compared from the snapshot
alone, which keeps a typical sync to about a second.

As with `Library.xml`, **tag values come from Music** (the snapshot), not from the file, because
Music's edits may not be written into the file.

### 5.4 Tag changes

The mapped fields are the song's title and artist, its default dance's name, country and
choreographer (only while that dance has this one song), and that pairing's teacher.

- **`sync_baseline`** holds the value sync last wrote to each mapped field.
- **When Music's mapped value changes,** a field is updated only if its current value in the app
  still equals its baseline (the user hasn't edited it here); then its baseline moves to the new
  value. A field the user edited keeps their value, and its baseline still moves, so a later edit
  in Music doesn't override it either.
- **A dance shared with other songs is never changed** by one song's tags (unchanged rule).
- **Songs with no baseline yet** (imported before sync, or adopted local songs) get one computed
  from their stored raw `tag_*` columns with the current mapping.
- **The raw `tag_*` columns** are refreshed from the snapshot, so Re-apply mapping uses Music's
  current tags.

### 5.5 Disappearances

- **A synced song whose persistent ID is no longer in the snapshot** becomes `'gone'` and appears
  in the review list. It stays in playlists, programs and search, and stays playable, until the
  user decides.
- **If it reappears** (same persistent ID) before a decision, it silently becomes `'synced'` again.
- **A track still in Music whose file is gone** (deleted, or on an unplugged drive) is marked
  missing, as today. It is not "gone" from Music, so it doesn't enter the review list.
- **The review list's actions:**
  - **Remove:** sets `removed_at` (§6.4), leaves `apple_sync = 'gone'`, and takes the song out of
    the review list.
  - **Keep:** sets `apple_sync = NULL`. The song becomes an ordinary local song (missing if its
    file is gone).
  - **Remove all / Keep all** apply to the whole list.

### 5.6 Playlists and folders

- **Mirrors match Music exactly:** created, renamed, refilled (same order) and deleted with Music,
  and so are folders (nesting and order). Playlist items whose track was skipped (§5.2) are left
  out, as with `Library.xml`.
- **Matching** is by persistent ID (`playlists.apple_persistent_id`,
  `playlist_folders.apple_persistent_id`).
- **Deleting a mirror** deletes only the playlist; its songs stay.
- **A gone song is never in a mirror:** Music's playlists can only list tracks Music still has,
  so refilling a mirror drops it. Local playlists keep it until it is removed.

### 5.7 Add Music… while sync is on

- **A file matching a synced song** by path or fingerprint is skipped and listed in the import
  summary as **"Already in library (Apple Music)"**.
- **Copies of local songs** behave as today.
- **A song waiting in the review list** that Add Music… finds again (same file, or a copy when its
  old file is gone) counts as **Keep**: it becomes an ordinary local song.
- **Import from Apple Music… (Library.xml)** is hidden while sync is on.

### 5.8 Turning sync on

1. **An explanation:** what sync does, that Music stays the place to edit tags and playlists, and
   that macOS will ask for access.
2. **The mapping step** (main spec §5.2), with the tag preview's 50 random tracks taken from the
   snapshot. Reading the snapshot is what makes macOS ask for access, so the dialog appears before
   the mapping step. If access is denied, turning on stops with the Settings help (§7.1).
3. **The first sync,** with progress (the existing import progress), which records
   `appleSync.libraryId`.
4. **Playlists edited locally since a `Library.xml` import:** a one-time dialog (like main spec
   §5.3) lists them. It is asked before the first sync, right after the mapping step, because the
   first sync writes the mirrors. Because every Music playlist gets a mirror, each has two choices:
   - **Replace with Apple version:** the playlist becomes the mirror; local edits are lost.
   - **Keep my edits as a copy** (the default, so edits are never lost without a choice): the
     edited playlist becomes a local playlist named "Name (my edits)", and a new mirror follows
     Music.

### 5.9 Turning sync off

After a confirmation ("Songs and playlists stay; playlists become editable"):
- **Songs:** `apple_sync = NULL` for every synced song. Gone songs leave the review list as kept.
- **Mirrors** become local playlists (`apple_sync = 0`). Their `apple_persistent_id` stays, so
  turning sync on again re-adopts them; a playlist edited in the meantime gets the one-time
  dialog (§5.8 step 4).
- **Folders** stay as plain groups. The app doesn't gain folder editing: playlists can't be moved
  between folders, and folders can't be created or renamed.
- **`appleSync.libraryId`** is kept, so turning sync on again detects a different library.

## 6. The interface

### 6.1 Settings → Apple Music

- **Sync with Apple Music** switch (§5.8, §5.9).
- **Status line**, one of:
  - "Last synced 11:42 — 3 added, 1 updated, 2 to review", with **Details** showing the last
    sync's summary in the import summary layout (§7.1)
  - "Paused: Music has a different library open", with **Switch to this library**
  - "Folk Dance Player isn't allowed to read your Music library", with **Open Privacy Settings**
    (System Settings → Privacy & Security → Media & Apple Music)
- **Sync now.**
- The import mapping and its settings stay where they are.

### 6.2 Sidebar

- **LIBRARY → Removed from Apple Music (N),** shown only while N > 0. It lists the gone songs in
  the normal table with a note per song, "File still on disk" or "File gone". Its toolbar offers
  **Keep** and **Remove** for the selection, and **Keep all** and **Remove all**.
- **PLAYLISTS** shows Music's folders as collapsible groups (each remembers whether it is open)
  and mirrored playlists with a small Apple Music mark. Local playlists follow the mirrors. A
  folder isn't selectable as a playlist.

### 6.3 Read-only mirrors

- No rename, delete, reorder, remove or drop. Dropping songs on a mirror shows "Edit this playlist
  in Music."
- Their menu has **Duplicate as my playlist** (a local copy named "Name copy", editable).
- Main rejects writes to a mirror too (`playlists:*` channels), so the rule doesn't depend on the
  UI.

### 6.4 Removed songs elsewhere

A removed song (`removed_at` set) is hidden from the library table and its filters, search,
playlists, Holding, the "same dance?" suggestions and every song picker. Where history refers to it:

- **Past programs and Previously played** in the control window show it, greyed and labeled
  "removed". The projector's Previously played shows it like any other song (it was danced).
- **An unplayed item in a program** is flagged and skipped, like a missing file (main spec §7), so
  a program never stops on it.

### 6.5 Feedback

- **A toast after a sync that changed something:** "Synced with Apple Music: 3 added, 1 updated ·
  2 to review". Nothing when nothing changed.
- **A notice** when access is denied, Music has a different library, or a sync fails, once per
  occurrence (not per focus).

## 7. Errors and edge cases

### 7.1 The sync summary

Kept in `appleSync.lastResult` and logged: added, updated, relinked (moved), adopted, restored,
gone (to review), playlists created/updated/deleted, skipped (by kind), unsupported format,
unreadable, missing. Each category lists its songs in Details, like the import summary.

### 7.2 Failures

- **The helper fails** (crash, timeout, invalid JSON, exit 3): nothing is applied, a notice says
  sync failed, the log has the detail, and the next trigger tries again.
- **Access denied (exit 2):** `paused-denied` with the Settings help. The next Sync now retries.
- **One file fails** (unreadable, unsupported): counted in the summary, the sync goes on (main spec
  §5.4).
- **Crash mid-sync:** each file is saved in its own transaction (as imports are), and the
  playlist step and the "gone" step each run in one transaction, after all files are saved. The
  next sync finishes the job.
- **Sync during a session:** allowed. The worst a mid-session sync can do is relabel a song or
  re-order a mirror; removals only go to the review list. The playing song is never interrupted.
- **Music's library suddenly much smaller** (added after the final review): if a sync would send
  more than half of the synced songs, and at least 20, to the review list, it pauses before
  changing anything (`paused-shrunk`): "Music's library looks much smaller than before (N of M
  songs are missing)", with **Sync anyway**. Keep waiting needs no button: focus syncs retry, and
  sync resumes by itself once Music reports the library again.
- **Turning sync on waits** for an off still in progress ("Waiting for the last sync to
  finish…") and for a running Add Music import ("Waiting for the import to finish…"), keeping
  the playlist choices. No sync starts while sync is off.

### 7.3 Edge cases settled during design

- **Music has two tracks with identical audio:** two songs, because Music has two tracks.
- **Add Music… picks the exact file a synced song uses:** "already present", changing nothing
  (Music's tags stay authoritative).
- **A song kept from the review list is later added to Music again:** adopted (§5.3).
- **A soft-removed song is added again with Add Music…:** restored as a local song.
- **Music re-adds a deleted track:** it gets a new persistent ID; the fingerprint matches the
  removed song, which is restored.

## 8. Testing

- **Sync engine (Vitest, in-memory database, snapshot fixtures):** a new track; a tag change with
  and without an app edit; a shared dance; a moved file; NFC paths; gone and back; Remove, Keep,
  Remove all, Keep all; adoption by fingerprint (including two local copies); restoring a removed
  song; playlist and folder create/rename/refill/delete; items of skipped tracks; a different
  library (wait and switch); skipped kinds; turning sync off and on again; the one-time dialog for
  edited `Library.xml` playlists.
- **Removed songs:** hidden from listing, search and pickers; shown greyed in program history;
  skipped in a running program.
- **Add Music… while syncing:** synced copies skipped and listed.
- **`HelperSource`:** with a stub executable for each exit code, a hang (timeout), and invalid JSON.
- **The helper itself:** `npm run build:helper` builds on macOS CI runners; its JSON is checked
  against the snapshot shape by a test that runs it only when `FDP_TEST_REAL_MUSIC=1` (it needs
  real access, so not on CI).
- **Renderer tests:** the Settings section in each state, the review list, read-only mirrors,
  collapsible folders, and the toast.
- **End-to-end:** turn sync on with an `FDP_APPLE_LIBRARY` fixture; edit the fixture; focus the
  app; check the toast, the review list and a mirror.
- **By hand, in the packaged app, before release:**
  - the permission dialog names Folk Dance Player, and the real library syncs
  - after installing an update (a new ad-hoc signature), whether macOS asks again; if it does,
    the release notes say so

## 9. Spike findings (2026-10-15)

- **Read speed:** 0.8–0.9 s for 2,169 tracks and 78 playlists; opening the library takes 0.01 s
  once access is granted.
- **Against `Library.xml` (exported two days earlier):** every XML track was present, with
  identical persistent IDs and identical title, artist, album artist, genre, duration and kind; 8
  newer tracks appeared only in the live read. All 66 user playlists matched in name, persistent ID
  and item order. 42 locations differed only in Unicode normalization (both resolve to the same
  file).
- **Filtering:** cloud and streamed items report `locationType` remote (17 here); videos, a PDF
  and TV episodes report other media kinds. Folders are a playlist kind; built-in playlists have a
  `distinguishedKind`.
- **Permission:** an unsigned binary, and then a signed one with an embedded Info.plist, were both
  refused ("TCC not granted") when started from Visual Studio Code's terminal, because macOS
  attributes the request to Visual Studio Code, which doesn't declare Music use, so no dialog can
  be shown. The same binary in a minimal `.app` with `NSAppleMusicUsageDescription`, launched with
  `open`, got the dialog under its own name.
- **No favorite flag:** `ITLibMediaItem` has no favorite or loved property, `Library.xml` has none,
  and this library has no built-in "Favorite Songs" playlist to read.
- **MusicKit** was not tried: it needs a MusicKit entitlement tied to a paid Apple Developer
  account, and it gives no file paths.

## 10. Out of scope (later)

- **Windows** (§1, Platform).
- **Favorites from Music:** only if a way to read them turns up (a built-in Favorite Songs
  playlist the framework exposes, perhaps).
- **Other Music fields:** comments, BPM, ratings.
- **Editing playlist folders** in the app.
- **Restoring a removed song by hand.**
