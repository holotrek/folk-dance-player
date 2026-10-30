# Release 0.3.0 — Design

- **Date:** 2026-10-18
- **Status:** Draft, for the maintainer's review. §3.1, §3.2 and §3.3 are built and merged; §3.13 is built (Plan 12). Nothing else in §3 is built.
- **Extends:** `2026-10-13-folk-dance-player-electron-design.md` (the main spec): §4 Labels, §5.2
  Import mapping, §6 Library and Program pages, §7 Playback, §8 Projector and Canva slides
- **Ships:** 0.3.0, after 0.2.0 (the first published release) is out

## 1. Purpose

0.3.0 is a round of improvements the maintainer collected while using 0.1.0 and testing 0.2.0:
clearer names on screen, more information in the lists, a safer import mapping, more things a
dance can carry (a PDF, an image), a program that can be rearranged in groups and says how long
it runs, and slide numbers that stay right when a Canva deck is edited.

The ideas are small and mostly independent. This document records what each one is for, what was
decided, how it fits the code as it is today, and what is left open, so each can be planned and
built on its own.

### How to read decisions

- **Decided** is the maintainer's choice, in their words where possible.
- **My call** is a choice made while writing this, because a builder would otherwise have to
  guess. The maintainer can overrule any of them.
- **Open** needs the maintainer's answer before building (§7).

### Goals

1. An organizer sees the same name for a dance in every list, in the order they prefer.
2. An organizer can see who performed a song and who choreographed a dance without opening the
   editor.
3. An import can never be set up with two tags feeding one field.
4. A dance can carry its written notes as a PDF, and an image can stand in for a Canva slide.
5. A program can be rearranged in groups, as in Apple Music playlists.
6. An organizer knows how long the program will run and when it will end, on the control window
   and the projector.
7. Slide numbers and titles in the app match the Canva deck, without remembering to refresh.

### Non-goals

- The post-v1 ideas in the main spec stay post-v1: the shared online song database, bulk editing,
  the guided tour and the display setup assistant.
- No new way to import music, no Windows work, and no change to Apple Music sync.
- Keyboard shortcuts for program selection (select all, delete) and dragging program items to
  playlists are not part of multi-select (§3.7). They are natural follow-ups.
- **After 0.3.0 (to do):** Delete (and Backspace) removing the selected program items. Delete does
  not remove a single item today either, so multi-select does not add it; do both together.

### Anti-goals

- Nothing may add a network request to the projector's path while music plays. Canva reads happen
  in the control window's time (focus, opening a dialog, Refresh slides), never on a song change.
- No released migration is edited (AGENTS.md). Every schema change is a new numbered migration.
- Personal data stays personal: PDFs and images are the organizer's own and are not part of the
  shareable song/dance layer (AGENTS.md: keep the data layers separate).

## 2. The changes

| # | Change | Where it lives | State |
|---|--------|----------------|-------|
| 3.1 | Slide numbers stay right when a Canva deck is edited | Canva service, slide dialog | **Built** in PR #28 (ready to merge) |
| 3.2 | One label order: `Dance ♪ Song` | `shared/labels.ts`, lists, Now Playing | Built (Plan 11) |
| 3.3 | Artist and Choreographer columns | Music table, Program page library | Built (Plan 11) |
| 3.4 | Import mapping chosen per destination | Settings, import, Re-apply, sync | Built (Plan 13) |
| 3.5 | "Same as song" for a dance's name | Song editor | Built (Plan 14) |
| 3.6 | A PDF attached to a dance, opened from the editor or any row's menu | Song editor, row menus, `dance_prefs` | Built (Plan 15, PR 5a; Plan 16) |
| 3.7 | An image as an alternative to the Canva slide | Song editor, projector | Built (Plan 15, PR 5b) |
| 3.8 | Select several program items and move them together | Program list | Built (Plan 17) |
| 3.9 | Program total time and ending time | Sidebar, Program page, projector | Built (Plan 20) |
| 3.10 | Previously played reads oldest to newest and stays at the bottom | Program page, projector, `history.ts` | Built (Plan 19) |
| 3.11 | End Program, then Start New Program | Program list, sidebar | Built (Plan 18) |
| 3.12 | Holding works like a Program on the side: moves, keeps the dance | Holding, Program list, `holding_items` | Planned |
| 3.13 | Reorder columns in the Music and Program lists | `LibraryTable`, settings | Built (Plan 12) |
| 3.14 | Quick-set a field from the song's own tags | Song editor | **To investigate** |

## 3. Details

### 3.1 Slide numbers stay right when a Canva deck is edited (built)

**Problem.** The app keeps a saved copy of each deck's slide list and re-read it only at startup,
when linking by page link, and on **Refresh slides**. After a deck was edited in Canva the dialog
showed old numbers and titles, a number could link the wrong slide, and the projector's live view
(which loads `viewUrl#<saved position>`) could show the wrong slide.

**What PR #28 does** (it was held back from 0.2.0 and has been brought up to date with main after
the 0.2.0 release; its CHANGELOG lines belong under Unreleased → Fixed, not under 0.2.0):

- The **slide dialog** re-reads the decks when it opens. It shows the saved list first with
  "Checking Canva for changes…", then updates; if Canva can't be reached it says so and keeps the
  saved list. **Link** stays enabled during the check.
- The **control window** re-reads the decks when it gains focus (at most once a minute, online
  only). Neither re-read saves images; **Refresh slides** still does that.
- The decks and images of the **current program's upcoming dances come first** in every refresh
  (`upcomingDanceIds`), so they are right before the rest and survive a slow or lost connection.
- **Change…** on a dance's slide opens on the slide's current number (found by its page ID in the
  re-read list), not slide 1, and follows the slide if the deck changes; a typed number is kept.

**Left over (my call: not part of PR #28).** A deck request has no timeout, so a hung Canva request
can keep a refresh running (which is why Link stays enabled). A timeout of around 15 seconds on
deck reads would make that bounded. It is a small separate change.

**Checks for the hardware checklist:** edit a deck in Canva (insert a slide at the front), come
back to the app, and open a dance's slide dialog (numbers and titles follow); play a linked dance
on the projector (still the linked slide); go offline and open the dialog (saved list, with the
"couldn't reach Canva" note); click **Change…** on a dance linked to a later slide (opens on that
number).

### 3.2 One label order: `Dance ♪ Song`

**Problem.** The projector writes a dance with its song as "Dance" with a smaller "♪ Song". Every
other list writes `Song | Dance (Choreographer)`. The maintainer prefers the projector's way.

**Decided.**

- When the dance and song names differ, name them **dance first, then ♪, then the song**
  (`Dance ♪ Song`) everywhere.
- It is **always on one line**, except in **Now Playing**, in both the control window and the
  projector, where it stays on two lines (the dance large, "♪ song" smaller below).
- The existing rules stay: the song is left out when it matches the dance name, and the
  choreographer shows only when the song's linked dances have more than one.

**How (today).** `labelParts` decides what to show and `formatLabel` joins it; both are in
`shared/labels.ts` and are called from `main/library/list.ts`, `main/library/edit.ts` and
`main/programs/tracks.ts`, which store the result in `label` on rows and tracks. The projector
already renders `parts.song` itself, so it needs no change.

- `formatLabel` produces the new text. **My call:** the choreographer stays attached to the dance:
  `Dance (Choreographer) ♪ Song`.
- The control window's Now Playing (the player bar) shows `track.label` on one line today. It
  should render the dance on the first line (with the country beside it, as today) and "♪ song"
  smaller on the second, from the track's `parts`.
- Everything that shows a `label` changes with it: library rows, Holding, program items,
  Previously played, the player bar's "Next:", the Which dance? dialog, the song editor's dance
  headings, and the accessible names of favorite stars and row menus.
- **My call:** the library table's first column is renamed "Dance / Song" and sorts by dance name
  and then song title, using the `dance` sort that already exists instead of `title`.

**Tests.** Many tests assert the old text (about two dozen test files contain the `|` form), so
the change is mostly updating expectations; `labels.test.ts` gets the new cases, including a
dance with a choreographer and a song that matches its dance.

### 3.3 Artist and Choreographer columns

**Decided.**

- The **Music page table** shows an **Artist** column.
- The **Program page's library list** shows **Artist** and **Choreographer**.

**How (today).** `LibraryRow` already carries `artist` and `choreographer`; the table's column
list is `ALL_COLUMNS` in `library/LibraryTable.tsx`, and the Program page uses `COMPACT_COLUMNS`,
the subset named in `COMPACT`. So this is display plus sorting: add `'artist'` to `SortColumn` and
to the sort in `main/library/list.ts` (`choreographer` already sorts).

**Decided (2026-10-19).** The Music page's columns are, after Dance / Song, Country, Choreographer,
Teacher, Artist, Type, Difficulty and Time; the Program page's are Country, Choreographer, Teacher,
Artist and Time. **My calls.** On the Program page the list is narrow, so its columns truncate with an
ellipsis (the full text in a tooltip) before the first column ever does. Choreographer here is the
shown dance's choreographer, as the Music page's column already is.

**Decided (2026-10-19).** As the Program page list narrows, columns disappear completely in this
order: **Artist, Teacher, Choreographer, Country, Time**. Dance / Song never collapses. This is
done in CSS (a container query on the table), so it needs no script; the Music page does not
collapse columns. With §3.13, the order follows the column, not its position: Artist always
goes first, wherever the organizer has put it.

### 3.4 Import mapping chosen per destination

**Problem.** Today the mapping asks, for each source tag (Artist, Album Artist), where it goes
(Artist, Teacher, Choreographer, or Ignore). Nothing stops both tags going to the same field, which
has no sensible meaning, and one tag can't feed two fields. The maintainer overlooked this in the
original import work.

**Decided.** Ask per destination instead, as three choices, each a radio group:

- **Populate Artist from:** Artist tag / Album Artist tag / Ignore
- **Populate Teacher from:** Artist tag / Album Artist tag / Ignore
- **Populate Choreographer from:** Artist tag / Album Artist tag / Ignore

Each destination has exactly one source, so two sources for one field cannot happen and no
validation is needed. One tag may feed several destinations. ("Genre is the Country" is unchanged.)

**How (today).** `ImportMapping` (`shared/import.ts`) is `{ artistTagTarget, albumArtistTagTarget,
genreIsCountry }`, stored in the settings `import.artistTagTarget`, `import.albumArtistTagTarget`
and `import.genreIsCountry`, and used by `main/import/mapping.ts`, `main/library/mapping.ts`
(Re-apply), `ImportMappingFields.tsx`, `SettingsPage.tsx`, `useImportFlow.ts`, `ReapplyDialog.tsx`,
`useAppleSyncFlow.ts` and Apple sync's `applyMusicTags`.

**Design.**

- New shape: `{ artistFrom, teacherFrom, choreographerFrom, genreIsCountry }` where each `*From`
  is `'artistTag' | 'albumArtistTag' | 'ignore'` (a new `TagSource` type beside `TagTarget`).
- **Defaults** equal today's: `artistFrom: 'artistTag'`, `teacherFrom: 'ignore'`,
  `choreographerFrom: 'ignore'`.
- **Saved settings are converted by a migration** (settings are rows in the `settings` table, one
  JSON value per key), which rewrites the old two keys into the three new ones and removes the old
  keys. The conversion inverts the old mapping: a destination takes the tag that targeted it; if
  both tags targeted one destination (the case this change prevents), **my call:** the Artist tag
  keeps it and the Album Artist tag's mapping is dropped.
- **Re-apply mapping** keeps asking each time, starting from the saved settings, with the same
  three choices; its tag preview table is unchanged. Apple sync's baseline rule reads the new
  shape.
- Update main spec §5.2, and the AGENTS.md decisions that name the mapping.

**Tests.** The mapping function for each source/destination pairing, including one tag feeding
two destinations; the settings migration for each old combination (including the conflicting
one); the three radio groups and their defaults; Re-apply starting from saved settings.

### 3.5 "Same as song" for a dance's name

**Decided.** When a dance's name is the same as its song's, show a **"Same as song"** checkbox and
make the dance's title entry **read-only**. While it is checked, **any change to the song's name
also changes the dance's name**.

**How (today).** Import gives each new song its own dance with the same name (main spec §4), and
labels already treat "same name" as equality ignoring case and spacing (`labelParts`). The song
editor (`library/SongEditor.tsx`) lists a song's dances, each with an editable name. Renaming a
song is `updateSong` in `main/library/edit.ts`; `library_fts` triggers follow name changes.

**Design.**

- The checkbox shows on the song's **default dance** (decided 2026-10-19: for a song with several
  dances, only the default), when that dance is **linked to exactly one song**, so it never
  disappears when the dance is renamed. A song's other dances have no checkbox and never follow
  the song, and neither does a dance shared by several songs (one dance, many tunes).
  Changing which dance is the default moves the checkbox, and the following, to the new one.
- It is **checked** while the dance's name equals the song's. Unchecking makes the entry
  editable. **Checking it again (decided 2026-10-19) sets the dance's name back to the song's**,
  so the box can always be used to restore the link.
- **Recommended (open, §7):** keep it **derived, with no schema change.** "Same as song" is
  simply "the names are equal and the dance has one song". Renaming the song renames the dance
  in the same transaction when the dance's name equaled the old title. The one thing that does
  not persist is unchecking while the names are still equal: that holds for the editor visit (a
  title saved meanwhile leaves the dance alone) and is forgotten when the editor is left. While the
  box is checked the name entry is greyed out, and the box sits to the right of it.
- The alternative is a stored flag (a column on the personal `dance_song_prefs` row), which would
  also make that unchecked state persist beyond the editor visit. It costs a migration and a data conversion for
  existing songs; with re-checking available, it matters much less.
- Linking a second song to the dance, or merging dances, ends the following by itself under the
  derived design (the dance then has two songs).

**Tests.** Rename follows when checked; no checkbox for a shared dance; the checkbox stays when
names differ and checking it restores the song's name; renaming updates search (`library_fts`) and the labels; the read-only entry.

### 3.6 A PDF attached to a dance

**Decided.** A dance can have a PDF attached (its written notes, for example).

**Design (my calls).**

- **One PDF per dance**, chosen with a native file dialog limited to PDFs and **copied into the
  app's data folder** (`dance-notes/`), so moving or deleting the original does not break it. It is
  personal data, so it is two new columns on `dance_prefs`: `notes_pdf_name` (the shown file name)
  and `notes_pdf_path`.
- The song editor's dance section gets **Attach PDF…** under the dance's notes. With a PDF it shows
  the file name with **Open** and **Remove**. Remove deletes the copied file.
- **Open** uses the system's default PDF viewer through main (`shell.openPath`), which keeps a
  PDF viewer out of the app. The renderer asks by dance ID and never passes a path, as the media
  protocol does (AGENTS.md: audio is served by file ID).
- A copy that has gone missing shows "The PDF is missing" with **Attach PDF…** to replace it.
- **Merging dances never loses personal data** (AGENTS.md): the kept dance keeps its PDF; if it has
  none, it takes the other dance's.
- The startup backup copies the database only, so PDFs are outside it; note this in
  CONTRIBUTING.md where backups are described.

**Tests.** Attaching copies the file and records the name; Open resolves only the dance's own
file; Remove deletes it; the merge rule; a missing file.

**Open PDF from a row's menu (added after 5a).** Opening a dance's PDF should not need the song
editor, so the right-click (⋯) menu of every entry that shows a dance offers **Open PDF** when that
dance has one:

- **Where:** library rows (Music page and the Program page's library list), Holding, and program
  items. A STOP marker has no dance and no item.
- **Which dance:** the one the entry shows (a library or Holding row's shown dance; a program item's
  chosen dance). The renderer sends only the dance ID, to the existing `library:openNotesPdf`.
- **How the row knows:** `LibraryRow` and the program `Track` carry `hasNotesPdf`, true when the
  dance has a recorded PDF (`dance_prefs.notes_pdf_path IS NOT NULL`). It is a database fact only;
  the row does not check the disk, which would cost a `stat` per row of a large library.
- **A missing copy:** the item still shows; choosing it fails with "The PDF is missing", shown as a
  notification (library and Holding menus) or the program list's error line. The song editor
  remains the place to replace it.
- **No schema change, no new channel.** The list queries read the flag with the columns they
  already join.

**Tests.** The flag in `listLibrary` and in program items; the menu item shown only with a PDF in
the program list and in Holding, calling `library:openNotesPdf` with the dance ID.

### 3.7 An image as an alternative to the Canva slide

**Decided.** A dance can have a **static image** to show on the projector instead of a Canva
slide. A dance can have **both**; then a **toggle** chooses which one the projector shows, and
the toggle is **hidden when the dance has only one**.

**Design (my calls).**

- **Storage:** like the PDF, the image is chosen with a file dialog (PNG, JPEG, WebP or GIF; what
  Chromium displays), **copied into the app's data folder** (`slide-images/`), and recorded on
  `dance_prefs` as `slide_image_name` and `slide_image_path`. A third column, `slide_source`
  (`'canva'` or `'image'`, null when the dance has fewer than two), records the toggle.
- **Editor:** the Slide section of a dance shows the Canva controls as today, plus **Upload
  image…**. With both present it shows a segmented control, "Show on the projector: Canva slide /
  Image".
- **Default when both exist:** the Canva slide, until the toggle is used.
- **Projector:** an `image` choice shows the image with the same letterboxing as a saved slide
  image (`slideBox()`), on black, and never starts the live Canva view, so it works offline and
  adds no network use. The image is served like saved slide images, by dance ID through the media
  protocol (`fdp-media://`), not by path. The projector feed carries which kind of slide to show;
  `LiveSlide` is only asked for `canva`.
- Removing either source leaves the other, and clears `slide_source`.
- **Merging dances:** as for the PDF, the kept dance's choice wins; otherwise the other dance's is
  adopted.

**Tests.** Upload copies and records; the toggle appears only with both and is hidden otherwise;
the projector shows the chosen source; an image dance never calls the live view; removal rules.

### 3.8 Select several program items and move them together

**Decided.** Follow Apple Music playlists:

- Program items can be **selected**. Click selects one; **shift-click** selects a range;
  **cmd/ctrl-click** adds or removes one.
- **Click and drag a selected item to move the whole selection.** The items land at the drop spot
  **in the order they were originally in**, and **stay selected**.

**Actions on a selection (decided 2026-10-30, after the first build).** A row's star, its "⋯"
menu and (in the program) ✕ act on the **whole selection when the row is part of it**, and on the
row alone otherwise. This holds in the program list, the Music page's table and the Program page's
library list. Holding has no selection until §3.12 and is unchanged.

- **Star:** the clicked star's state sets the direction for every selected song: clicking an
  unstarred star favorites all, clicking a starred one unfavorites all.
- **Favorites in the menu:** "Add to favorites" shows when any selected song is not a favorite,
  "Remove from favorites" when any is; a mixed selection shows both, and each applies to all.
- **✕ and Remove (program):** remove every selected item, STOP markers included.
- **Edit details:** hidden while more than one item is selected (there is no multi-edit).
- **Insert STOP before:** always goes before the item the menu was used on, whatever is
  selected. (A smarter rule for non-consecutive selections, putting it before the start of the
  selected run, was built and then dropped as confusing: 2026-10-30.)
- **Open PDF:** shown when any selected item's dance has a PDF; it opens every available PDF,
  once per dance, in program order.
- **Per-item dance choice:** hidden while more than one item is selected.
- Right-click and the "⋯" button do not change the selection.

**How (today).** The drag payload for program items is already a list: `setDraggedItems(…,
itemIds[])` and `getDraggedItems` (`library/drag.ts`), and `moveBefore(order, moving, before)`
(`library/reorder.ts`) already moves several items and keeps their relative order. What is missing
is the selection itself and starting the drag from it: `ProgramList.tsx` drags `[item.id]`.

**Design.**

- **Selection state** belongs to the Program page's store (`program-store.ts`), separate from the
  library's selection, as UI state only (not saved). It holds the selected item IDs and the anchor
  for shift-click.
- **Dragging an unselected item** selects only that item and drags it (as Apple Music does).
  Dragging a selected item drags the whole selection. The drag image shows a count when there is
  more than one.
- Item IDs are stable across a reorder, so the selection survives a drop. Items that leave the
  list (played, removed, a different program loaded) leave the selection.
- A plain click on empty space in the list clears the selection. **Double-click in the program
  still does nothing** (main spec: the program means "play in this order").
- STOP markers are items like any other and can be selected and moved.
- The reorder call (`programs:reorder`) already takes the full order, so main needs no change;
  check that moving several items is one change notice, not one per item (main coalesces notices).
- Accessibility: selected rows need `aria-selected`; the builder decides between a listbox role
  and another pattern that keeps the existing accessible names (`role="listitem"` rows cannot be
  selected).

**Tests.** A selection reducer (click, shift range from the anchor, cmd/ctrl toggle, pruning when
items disappear); component tests with modifier keys; the end-to-end drag helper (`drag()` in
`e2e/app.ts`) for dragging a multi-selection and checking order and selection afterwards.

### 3.9 Program total time and ending time

**Decided.**

- A program shows its **total play time**, **adding the auto-continue seconds** when auto-continue
  is on.
- **Sidebar** (the Programs section, left): under "N songs to play", a line "Total play time: X:XX".
- **Program page:** the same total, plus **"Ending about X:XX"** (the current time plus the time
  that remains), **centered** in the program panel's header, with room between it and both the
  title on the left and the buttons on the right.
- The projector shows one quiet "Ending about 9:42 PM" line in its footer (decided 2026-10-30); never the total.

**Design.**

- **What counts (my calls).** Unplayed track items only (what is still to come). A song with
  no known duration counts as zero. Songs whose files are missing or removed are skipped by
  playback, so they are left out. Auto-continue seconds are added **once for each gap between two
  consecutive songs with no STOP between them**, because auto-continue halts at a STOP.
  A STOP marker adds nothing, so the ending time assumes no pauses; the Program page says "if no pauses" beside it when the program has a STOP (decided 2026-10-30).
- **Where it is computed.** Total time is a sum over the program's items, so main supplies it:
  `ProgramSummary` (used by the sidebar) gains `unplayedDurationMs` and `unplayedGaps`; the renderer
  adds `gaps × seconds` using the `autoContinue` setting. `ProgramDetail` gets the same two numbers
  (or the Program page sums its items).
- **Ending time while playing.** It is the current time plus the current song's remaining time, the
  following songs and the gaps. It stays steady while a song plays, and moves later while paused or
  counting down, because the clock keeps going. It refreshes about once a minute and whenever
  the program changes. Formats: the total as `M:SS`, or `H:MM:SS` from an hour up (the existing
  `formatTime`); the clock time as the system's short time (for example "9:42 PM").
- **Playback speed.** A song played at 0.75× takes longer. **My call:** the first version ignores
  the speed lock (it lives in `PlayerSession`, not the settings). A later change can scale by the
  rate.
- **Projector (decided).** One quiet line, "Ending about 9:42 PM", in the footer of the
  projector view. The projector is read-only and fed by `createProjectorFeed`, so the snapshot
  carries what it needs (for example `remainingMs`, or an end time) and the projector never reads
  the program. The total play time is not shown to the audience.

**Tests.** The sums (gaps around STOP markers, missing songs, null durations, auto-continue off);
the header layout and the sidebar line; the end time with a fake clock, while playing and paused;
the snapshot field and the projector line.

### 3.10 Previously played reads oldest to newest and stays at the bottom

**Decided.** "Previously played" changes from newest first to **oldest first (ascending)**.
Looked at alone, newest first makes sense. Looked at together with Now Playing and Upcoming it
does not: the three should read as one rolling window going down the screen, previous, now, then
upcoming. This was clearest when testing in projector mode.

- **Control window:** the Previously played list **stays scrolled to the bottom**, so the most
  recent song is always visible, just above where the program continues.
- **Projector:** the list **sticks to the bottom** of its area, so the most recently played song
  appears **just above Now Playing**. When there are more songs than fit, the oldest fall off the
  top.

**How (today).** `listPlayed` (`main/programs/history.ts`) sorts `ORDER BY l.played_at DESC, l.id
DESC`, and `PlayedList.tsx` and `ProjectorView.tsx` render the array as it comes.
`ProjectorSnapshot.played` is documented "newest first" (`shared/projector.ts`), and
`snapshot.ts` filters the playing song out of it without reordering.

**Design.**

- **Order.** Flip `listPlayed` to `ASC` (tie-break on `l.id ASC`) and update the comments on
  `listPlayed` and `ProjectorSnapshot.played` to "oldest first". The order is decided once, in
  main, so both windows stay consistent; neither renderer reverses it. Anything else that reads
  `programs:played` or `played` and assumes the first entry is the newest must be checked (search
  for `played[0]`).
- **Control window follows the bottom.** The list scrolls to its end when it mounts, when a
  program loads, and when an entry is added. **My call:** it follows only while the organizer is
  at (or within a row or two of) the bottom, so scrolling up to look at an earlier song is not
  undone by the next song starting. Scrolling back down resumes following.
- **Projector sticks to the bottom.** The list is anchored to its bottom edge (for example a
  bottom-aligned flex column with the overflow hidden at the top), not scrolled with script,
  because the projector is read-only and has no one to scroll it. With a Canva slide the played
  list is the narrow column beside the slide (`titleOnly`); it keeps the same bottom anchoring.
- **Drag and replay are unchanged.** Double-click to replay and dragging an entry back into the
  program work on the entry, not its position.

**Tests.** `listPlayed` returns oldest first (including two entries with the same time); the
snapshot keeps that order and still leaves out the playing song; `PlayedList` scrolls to the end
on a new entry and does not when the organizer has scrolled up; the projector markup puts the
newest entry last, immediately before Now Playing, with a fake long history.

### 3.11 End Program, then Start New Program

**Decided.**

- An **End Program** button clears the current program list **and Previously played**. (The
  maintainer first wanted Previously played kept, then changed their mind: a new program starts
  with a clean screen.)
- When nothing is loaded, a **Start New Program** button appears in place of the list. It opens
  the same **New program** dialog as the sidebar's **+**, so the organizer can edit the name
  before starting.

**How (today).** The order is stored: a program's items are rows in `program_items` with a
`position`, and a played item keeps its row with `played_at` set, so the program and what was
danced are saved (spec §4). The sidebar's **+** opens `NamePrompt` ("New program", default name
from `defaultProgramName()`), creates the program with `programs:create` and loads it with
`programs:setCurrent` (`ProgramsSection.tsx`). `ProgramList.tsx` already shows "No program
loaded…" when `programId` is null, and `setCurrent` already accepts `null`. Previously played is
the loaded program's play log (`play_log`), so it empties whenever no program is loaded.

**Design.**

- **End Program unloads the program; it does not delete anything.** It calls
  `programs:setCurrent(null)`. The list and Previously played both go empty because no program is
  loaded. The program, its unplayed order and its play log all stay saved and can be loaded again
  from the sidebar. This is deliberate: the order of songs is already stored, so clearing the
  screen needs no data change, **needs no confirmation**, and nothing can be lost by a mistaken
  click. (The alternative, deleting the unplayed rows with `programs:removeItems`, would lose the
  planned order for good and would need a confirmation; it is rejected for that reason.)
- **Where.** With the program panel's header buttons, beside **+ STOP** and **Add selected**,
  enabled while a program is loaded.
- **A song that is playing** keeps playing to its end; nothing follows it, because no program is
  loaded. The projector and Previously played follow the player as they do today when no program
  is loaded. **Open (§7):** whether to ask first while a song is playing.
- **Start New Program.** When no program is loaded, the list area shows **Start New Program**
  instead of the "No program loaded…" text. It opens the shared `NamePrompt`, titled "New
  program", with the default name and the submit label "Create", and creates and loads the
  program exactly as the sidebar does. To avoid two copies, move that create-and-load step and
  the prompt's wording into one shared function or hook used by both the sidebar and the
  program list.
- **Dropping songs on the empty list still works** (`ensureProgram` creates and loads a program
  with the default name), so the button is an option, not a gate.
- **A loaded program whose songs have all played** is not "ended": it still shows "Nothing left
  to play", its Previously played, and **End Program**. The organizer can add songs or end it.

**Tests.** End Program unloads the program, empties the list and Previously played, and leaves the
program, its items and its log in the database and the sidebar; a playing song is not
interrupted; with nothing loaded the list shows **Start New Program**; the dialog opens with the
default name, accepts an edited name, creates, loads and clears the empty state; the sidebar **+**
and this button share one code path; an end-to-end run that ends a program mid-way, starts a new
one and reloads the first from the sidebar.

### 3.12 Holding works like a Program on the side

**Decided.** Holding should act like the Program, but on the side:

- Dragging an item **from the Program into Holding** removes it from the Program and adds it to
  Holding.
- Dragging a song **from Holding into the Program** removes it from Holding.
- Holding **keeps the chosen dance** of a song, so a song moved either way keeps the dance it had.
- Dragging a song **from the library into Holding** lets the organizer **choose a dance**, as
  adding to a program does.
- **No duplicates in Holding, judged by song and dance together.** The same song with the same
  dance is never held twice. This is already true today, because Holding holds each file once; it
  is stated here because the rule must now be about the **pair**: a song with two different dances
  can be in Holding once for each dance. Dragging from the Program into Holding, when that
  song-and-dance pair is already held, **just removes the item from the Program**.

**How (today).** Holding is a per-file flag, `file_prefs.in_holding` with `holding_position`
(migration 003), so it holds a song, not a dance. `HoldingPanel.tsx` accepts only songs
(`FILES_MIME`) and calls `library:setHolding(fileIds, true, before)`. Dropping a held song on the
Program adds a copy with `programs:addTracks` (as its default dance) and leaves it in Holding.
Program items drag as item IDs (`ITEMS_MIME`), accepted only by `ProgramList.tsx`. After a drop
from the library, the Program asks "Which dance?" (`DanceChoiceDialog`) for songs with more than
one dance and applies the answer with `programs:setItemDance`.

**Design.**

- **Holding holds song-and-dance pairs.** Holding moves out of `file_prefs` into its own table,
  `holding_items` (`id`, `file_id`, `dance_id`, `position`), in migration `007` (§4). `file_id`
  cascades on delete; `dance_id` is `ON DELETE CASCADE` too, because a held pair whose dance is
  gone no longer means anything (**my call**; the alternative, falling back to the song's default,
  could create a duplicate). A **unique index on the pair** is what enforces "no duplicates".
  Songs held before the migration move over in their saved order, each as its default dance;
  `file_prefs.in_holding` and `holding_position` are then dropped (SQLite 3.53 supports `DROP
  COLUMN`). Code that reads them changes: `setHolding` (`playlists.ts`) and the
  Holding panel's list. That list is today the library query with an internal
  `{ kind: 'holding' }` filter (`list.ts`, `HoldingPanel.tsx`); it is not a sidebar filter. Holding
  rows are now pairs, so **my call:** the panel gets its own list call (for example
  `library:holding`, returning rows with the held dance) and the `holding` filter kind is removed
  from `LibraryFilter`.
- **Which dance a pair has.** The dance is always resolved to a real dance when it is held: the
  one chosen, else the song's default, else none for a song with no dance at all (stored as
  `NULL`, and the unique index treats `NULL` as one value, for example by indexing
  `COALESCE(dance_id, 0)`). Resolving up front is what makes "the same song and dance" comparable
  between a program item (whose `dance_id` may be `NULL` for "default") and a held pair.
- **Holding rows** show the held dance in their label, exactly as a program item shows its dance,
  and the dance can be changed from the row's menu with `library:setHoldingDance(holdingId,
  danceId)`. A change to a pair that is already held is refused with a message (no duplicate).
  The panel, its drag payload and its remove button work on **holding rows**, not files, so two
  rows of one song are independent.
- **Library to Holding: choose the dance.** As for the Program: the song is held as its default
  dance, then a song with several dances opens the same "Which dance?" dialog, and the answer is
  applied with `library:setHoldingDance`. Share the dialog and the "ask when `danceCount > 1`"
  logic with `ProgramList.tsx` instead of copying them.
- **Program to Holding: a move.** Holding's drag-over and drop also accept `ITEMS_MIME`, and the
  drop spot works as for songs (before the row dropped on, or at the end). To avoid a failure
  leaving a song in both places or neither, one main operation does both in one transaction and
  sends one change notice: `programs:moveToHolding(programId, itemIds, before)`. It holds each
  item's song **with the item's dance** (skipping a pair already held) and removes the items.
- **Holding to Program: a move.** The same, the other way: `programs:moveFromHolding(programId,
  fileIds, before)` adds each held song to the Program **as its held dance** (the default if none)
  before the item dropped on, or at the end, and takes it out of Holding. Dragging from Holding
  therefore no longer leaves a copy there.
- **Other ways into the Program leave Holding alone.** Dragging a song from the library, a
  playlist or Previously played, and **Add selected**, still add to the Program and do not touch
  Holding. Only a drag **from Holding** is a move.
- **STOP markers** cannot be held. **My call:** a STOP in the dragged set stays in the Program, and
  a drag of only STOP markers is not accepted by Holding (no drop cursor).
- **A pair already in Holding** that is dropped there again (from the library or from the Program)
  is not added a second time: from the library it **moves to the new spot**; from the Program the
  item is **just removed from the Program** and the held pair stays where it is. A different dance
  of the same song **is** added, as a second row.
- **Missing or removed songs** can be moved like any song. Played items are not in the list, so
  they cannot be dragged; the playing song is unaffected.
- **With several items selected** (§3.8), dragging a selected item moves the whole selection, in
  the order they had, so §3.12 lands after §3.8 or with it. Without §3.8 it handles the one item.

**Tests.** The migration (existing held songs move over in order as their default dance; a song
with no dance; deleting a dance removes its held pairs); the unique pair (the same song with two
dances is held twice, the same pair never, from the library and from the Program, the Program
drop removing the item only); the
main operations (program to Holding and back: dance kept, items and holding changed in one
transaction, one notice, STOP markers left alone, an already-held song repositioned, an unknown
id ignored); setting a held dance; `HoldingPanel` accepting a program-item drag and a library
drag with the dance dialog; the Program accepting a Holding drag and the song leaving Holding; the
other add paths leaving Holding unchanged; the end-to-end `drag()` helper in each direction.

### 3.13 Reorder columns in both lists

**Decided.** The organizer can reorder the columns of the Music page table and of the Program
page's library list, **except Song / Dance** (named Dance / Song after §3.2), which stays fixed.

**Design (my calls).**

- **What moves.** Every data column: Artist, Country, Teacher, Choreographer, Type, Difficulty
  and Time, as shown in each list. **What stays:** the favorite star (first), Dance / Song
  (second), the playlist's `#` and the review list's File columns, and the "⋯" menu (last).
  Movable columns can sit only between Dance / Song and the "⋯" menu.
- **How.** Drag a column header to a new place; a line shows where it will land. This uses native
  HTML5 drag with its own MIME type, like every other drag in the app (AGENTS.md), and
  `moveBefore` (`library/reorder.ts`) to compute the new order. Clicking a header still sorts.
  **A keyboard way** is needed for accessibility: with a header focused, Alt+← and Alt+→ move the
  column (my call; the builder may choose another pair if it clashes).
- **Each list has its own order,** because they show different columns. They are saved as the
  settings `library.columns.music` and `library.columns.program`, each a list of column keys
  (the `key`s added in §3.3). Settings are validated on write and read (AGENTS.md), so an unknown
  key is dropped and a column missing from a saved list (a new one in a later release) is
  added at its default place. No migration is needed.
- **Reset.** A "Reset columns" item in a header's right-click menu restores the default order of
  that list (my call; the cost is small and an organizer who dragged by mistake needs a way back).
- **Collapsing (§3.3) follows the column,** not the position, so the Program page still drops
  Artist first, then Teacher, Choreographer, Country, Time. Reordering never hides a column.
- **Sort, selection and drag of rows are unaffected.** The sort is stored by column, as today.
- The grid's column widths follow the column (each column keeps its own width), not the position.

**Tests.** The order reducer (move before another column, to the end, an unknown key dropped, a
missing key added, Dance / Song and the star unmovable); the settings round trip and its fallback
on a corrupt value; the header drag with the `drag()` helper in the component tests and the
end-to-end suite; Alt+arrow; Reset; that the two lists keep separate orders; that the saved order
is applied at the next start.

### 3.14 Quick-set a field from the song's own tags (to investigate)

**Idea (the maintainer's).** Because the mapping is not stored per song, an organizer who picked
the wrong mapping at import, or never saw the choice, has to retype a value that is already in the
file. In the song editor, a field that has **not been changed by hand** could offer a small
dropdown of the values the song's tags hold (the Artist tag, the Album Artist tag, and for Country
the Genre tag) so one click fills Artist, Teacher or Choreographer.

**What is stored today (so the question can be answered).** No mapping is kept per song (main spec
§5.2: "Mapping is applied once ... not stored per song"; this stays decided). What *is* kept is the
raw material: the song's file row holds its raw tags (`files.tag_title`, `tag_artist`,
`tag_album_artist`, `tag_genre`, written by every import and every Apple Music sync), which
Re-apply mapping and the sync's tag rule already read. For a synced song, `files.sync_baseline`
also holds the values the last sync wrote. So the quick-set needs no new data, only a way to
show it.

**To investigate before deciding.**

- **"Not changed yet".** How to tell. Candidates: the field is empty; or it equals what the
  saved mapping would produce from the raw tags now; or (for a synced song) it equals the sync
  baseline. A field the organizer typed must never be offered for overwrite without them asking;
  the offer is a convenience for untouched fields only.
- **Which fields and where.** Artist (the Song section), and Teacher (on the dance-song pairing)
  and Choreographer (on the dance) in each dance card. A dance shared with other songs applies
  an edit to all of them, so the offer likely stays off for a shared dance's choreographer, as
  Re-apply already skips it.
- **Interaction with Apple Music sync.** A value set here is an edit, so the sync's baseline rule
  already protects it from being overwritten later; check that choosing a tag value never writes
  the baseline.
- **Interaction with Re-apply mapping.** Re-apply stays the bulk tool (many songs, a mapping
  for the run); this is the one-song shortcut. Check they do not offer contradictory things.
- **Surface.** A small dropdown beside the field listing the distinct non-empty tag values with
  their tag names ("Album Artist: Sonia Dion"), or a "Use tag…" menu; and whether it should be
  hidden once the field has a value that matches none of them.
- **Cost.** Probably small (display and a normal edit through the existing patch channels);
  confirm before planning.

**Outcome wanted.** A recommendation (build it, or not, and the exact rule for "not changed")
for the maintainer to decide, before any plan is written.

## 4. Data changes

| Migration | Change |
|-----------|--------|
| `005-import-mapping` | Rewrites the saved import settings from two keys to three (§3.4); built |
| `006-dance-attachments` | `dance_prefs`: `notes_pdf_name`, `notes_pdf_path`, `slide_image_name`, `slide_image_path`, `slide_source` (§3.6, §3.7) |
| `007-holding-items` | New `holding_items` table (song, dance, position; unique per pair) replacing `file_prefs.in_holding`/`holding_position`; copies existing held songs (§3.12) |

No migration for §3.5 under the recommended design, or for §3.13 (two new settings keys). §3.1 to §3.3 and §3.8 to §3.11 change no tables.
Migrations 001 to 005 are untouched (005 is the import mapping). The next number is 006; if another change lands first, these
take the next free numbers.

Files the app now writes outside the database: `dance-notes/` and `slide-images/` in the app data
folder, joining the saved slide images. Deleting a dance or removing an attachment deletes its
file; a startup check can list orphans (optional).

## 5. Order of work

Each item is its own pull request, small enough to review on its own.

1. **§3.1** (PR #28): merge, with its CHANGELOG lines under Unreleased.
2. **§3.2 and §3.3**: labels and columns touch the same lists and many tests; do them together or
   back to back.
   **§3.13** follows straight after, in the same area: it needs the column keys that §3.3 adds, and
   it reuses the same CSS grid.
3. **§3.4**: independent; a migration and a settings change, so give it its own release note.
4. **§3.5, §3.6, §3.7**: all in the song editor's dance section; do §3.5 first (smallest), then
   the two attachments sharing one migration (`006`).
5. **§3.8, §3.9**: both in the Program page; §3.9's header line should land after §3.8 so the
   header is arranged once.
6. **§3.10, §3.11**: small and independent; §3.10 is a good first change if a quick win is wanted.
   §3.11 adds a header button, so land it with or before §3.9 so the header is arranged once.
7. **§3.14** (after the investigation, if it goes ahead): after §3.4 and §3.5, in the same editor
   section; it needs no migration.
8. **§3.12**: after §3.8 (the drag then carries a selection). It has a migration (`007`), three
   channels, and changes the Holding panel and the Program list, so give it its own pull request.

Dependencies: §3.2 before §3.5 (it changes the labels the editor shows); §3.6 and §3.7 share the
migration and the "copy a file into the app's data folder" helper.

## 6. Documentation to update as each lands

- **Main spec:** §4 Labels (§3.2), §5.2 Import mapping (§3.4), §6 Library and Program pages
  (§3.3, §3.5, §3.8 to §3.13), §8 Projector (§3.2, §3.7, §3.9, §3.10), §8.3 Canva (§3.1, §3.7).
- **AGENTS.md:** a decision for each of §3.2, §3.13 (saved per list as settings, collapse follows the column), §3.4, §3.6/§3.7 (copies in the app data folder,
  served by ID) and §3.9 (what counts toward the total).
- **CHANGELOG.md:** a line under Unreleased in the same commit as each user-facing change.
- **README.md:** the features list when the release is prepared.
- **Hardware checklist** (`docs/manual-testing/pre-release-hardware.md`): the §3.1 steps above;
  multi-select drag with real mouse and trackpad; the projector with an image slide and with the
  end time; the import with the new mapping; Previously played staying at the bottom, and the
  projector's list ending just above Now Playing, with a long history; End Program mid-song;
  reordering columns by drag and by keyboard in both lists, and after a restart; dragging between the Program, Holding and the library, in both directions, with a real mouse,
  and choosing a dance on the way into Holding.
- **CONTRIBUTING.md:** where backups are described, note that attachments are outside them.

## 7. Open questions for the maintainer

1. ~~**§3.5, derived or stored?**~~ Built derived (no schema change), with the box kept after a
   rename and re-checking restoring the song's name (2026-10-19). Only unchecking while the
   names are still equal is session-only; a stored flag would change that.
2. ~~**§3.9, STOP markers.**~~ Decided 2026-10-30: STOPs are ignored; the ending time assumes no pauses and the Program page says so when the program has a STOP.
3. ~~**§3.9, the projector.**~~ Decided 2026-10-30: one quiet "Ending about 9:42 PM" line in the projector's footer; no total.
4. ~~**§3.7, the default.**~~ Built with the Canva slide as the default until the toggle is used (2026-10-20).
5. **§3.6, the PDF.** Is opening it in the system's PDF viewer acceptable, or should it open in an
   app window? Is one PDF per dance enough?
6. ~~**§3.4, old settings.**~~ Decided 2026-10-19: where an old mapping sent both tags to one field, the Artist tag keeps it.
7. ~~**§3.2, the choreographer.**~~ Decided 2026-10-19: `Dance (Choreographer) ♪ Song`.
8. ~~**§3.10, following the bottom.**~~ Decided 2026-10-30: the control window's list follows new songs only while the organizer is at (or within a row or two of) the bottom.
9. ~~**§3.11, a playing song.**~~ Decided 2026-10-30: End Program asks nothing; the song that is playing
   finishes and nothing follows it.
10. **§3.14, the quick-set.** Worth building? What counts as "not changed yet" (empty, equal to
    the current mapping's value, or equal to the sync baseline)? See the investigation list in §3.14.
