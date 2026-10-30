# Pre-release hardware check

Run before every release, on the packaged app (the `.dmg`), with a real projector. It covers what
the automated tests can't: a second display, Canva's live slide, sleep, and how slowed audio
sounds. Spec §10.2 and §13.2.

**Prepare Release copies this list into the release pull request's description,** where the boxes
can be ticked (GitHub doesn't make them clickable in a file). Edit the list here; each release PR
keeps the ticked copy.

The app backs up the library every time it starts (Help → Reveal Library Backups in Finder), so
the check can run on a real library.

Each step says what should happen; anything that behaves differently is a finding to fix (or to
list as a known issue) before the release.

## Before you start

- [ ] Install the `.dmg` (drag the app to Applications; the first time, System Settings → Privacy & Security → **Open Anyway**).
- [ ] A program has a few songs, with a STOP before one of them (its ⋯ menu → **Insert STOP before**), so the projector shows a Teaching row.
- [ ] One dance is linked to a Canva slide (Music page → the dance's editor → Canva slide, with the deck's link from Canva's **Share → Embed → Smart embed link**). The editor shows **Generating preview…** with a moving bar until the slide's image appears.

## A. No projector connected

- [ ] 1. Turn on the **Projector** switch in the player bar: the view covers the laptop and shows its notice.
- [ ] 2. **Esc** closes it at once, even pressed right after turning it on. Turned on again, moving the mouse after a second closes it too.
- [ ] 3. Turn on **Auto-show when playing** with a short delay (e.g. 5 s), play a song and don't touch anything: the view appears by itself.

## B. Projector connected, extended mode

System Settings → Displays: not mirrored, with the laptop as the main display.

- [ ] 4. **Settings → Projector display** lists both displays, with the projector chosen.
- [ ] 5. Turn on the Projector switch: the view goes to the projector and the control window stays on the laptop. Moving the mouse and pressing Esc do **not** close it.
- [ ] 6. Play the program:
  - [ ] The red progress line moves.
  - [ ] A Teaching row shows before the dance after the STOP.
  - [ ] Previously played fills in as songs play.
  - [ ] A preview double-clicked on the Music page shows on the projector too.
- [ ] 7. Drag the control window onto the projector: it moves back to the laptop.

## C. Canva

- [ ] 8. Play the dance with the linked slide:
  - [ ] The saved slide image shows at once.
  - [ ] About 11 s later the live slide replaces it, with Canva's buttons already faded.
  - [ ] Canva's controls, a blank page or "Loading…" never show on the projector.
- [ ] 9. If the deck has several linked slides, play another dance from the same deck: it switches in about 1.5 s.
- [ ] 10. Turn **Wi-Fi off** and play the slide's dance again: the saved image shows and stays.

## D. Audio

- [ ] 11. Play a song at **0.75×**, then at **0.5×**: the pitch stays the same, and it sounds acceptable for teaching.

## E. Sleep and wake

- [ ] 12. With the view on the projector, `pmset -g assertions` in Terminal lists a **PreventUserIdleDisplaySleep** entry for the app.
- [ ] 13. Apple menu → **Sleep**, then wake the Mac:
  - [ ] The app is in ⌘-Tab.
  - [ ] Its control window is on the laptop.
  - [ ] The view is back on the projector.

## F. Mirror mode

- [ ] 14. Switch the displays to **mirroring** and turn on the Projector switch: it covers the screen in laptop mode, so Esc and the mouse close it.

## G. Unplugging

- [ ] 15. Turn the Projector switch **off**, then unplug the projector: nothing is left behind and the music keeps playing.
- [ ] 16. Optional: unplug with the view **up**, a few times. Known issue (`docs/spikes/projector-unplug.md`): about 1 unplug in 4 leaves a grey window until the app quits. The music should keep playing; quitting and reopening the app clears it.

## H. Apple Music

Use a Mac whose Music library has local songs and playlists in a folder.

- [ ] 17. On the Music page, turn on **Sync with Apple Music**, then Continue: macOS asks whether **Folk Dance Player** may access Media & Apple Music. Allow it: the mapping step shows your tags, and the first sync's summary lists your songs.
- [ ] 18. The sidebar shows Music's folders (collapsible) and playlists, marked with a note, before your own playlists.
- [ ] 19. In Music, change a song's genre, delete a song, and edit a playlist. Switch back to Folk Dance Player: within a few seconds a message says what changed, the deleted song is in **Removed from Apple Music**, and the playlist matches Music.
- [ ] 20. In System Settings → Privacy & Security → Media & Apple Music, turn Folk Dance Player's access off, then choose File → Sync with Apple Music: the Music page says Folk Dance Player isn't allowed to read your Music library, and **Open Privacy Settings** opens that page. (The log shows the helper's error; a 4097 connection error to com.apple.amp.library.framework counts as not allowed.) Turn access back on.
- [ ] 21. After installing this release over the previous one, does macOS ask for Music access again? If it does, say so in the release notes.
- [ ] 22. With a song's file on an external drive, unplug the drive and switch back to the app: the song is marked missing (⚠) but is **not** in Removed from Apple Music. (If it is, the helper reports no location for a missing file; report it.)

## I. 0.3.0 labels and columns

- [ ] 23. For a dance whose song has a different name, every list reads `Dance ♪ Song`; Now Playing (control window and projector) shows the dance large with ♪ song smaller below.
- [ ] 24. On the Program page, narrow the library list step by step: columns disappear completely in the order Artist, Teacher, Choreographer, Country, Time, with no gap left behind, and Dance / Song never does.
- [ ] 25. On the Music page, the Artist column is next to Dance / Song, and its header sorts.
- [ ] 26. Drag a column header on the Music page, with a real mouse and with the trackpad: a line shows where it will land, and the column moves there. Dance / Song, the star and the ⋯ column can't be dragged. Do the same on the Program page's list: it keeps its own order.
- [ ] 27. Quit and reopen the app: both lists keep their orders. Right-click a header, **Reset columns**: the default order returns.
- [ ] 28. With a header focused (Tab to it), Alt+← and Alt+→ move its column and the focus stays on it.
- [ ] 29. Reorder the Program page's columns, then narrow the list: columns still disappear Artist, Teacher, Choreographer, Country, Time wherever they are, and come back in place when it widens.
- [ ] 30. Import a few songs with the new mapping (for example Teacher from the Album Artist tag): the fields fill from the chosen tags. Open Settings, then relaunch: the choices were kept. Updating from 0.2.0 with a changed mapping shows the equivalent choices.
- [ ] 31. Rename a song whose dance has the same name: the dance (and the library row, and a program item) follow, and the Dance name entry is greyed out while **Same as song** is checked and editable after unchecking it. Rename the dance to something else, then check the box: the dance gets the song's name again. A dance used by two songs shows no box.
- [ ] 32. Attach a real PDF to a dance (Music page, song editor): **Open** shows it in your PDF viewer. Delete the app's copy in Finder (`dance-notes` in the library folder): the editor says "The PDF is missing" and offers **Attach PDF…**. **Remove** clears it. Merge two dances that both have PDFs: the kept dance keeps its own. With a PDF attached, **Open PDF** is in the right-click (⋯) menu of a library row, a held song and a program item, and opens it; with the copy deleted it fails with "The PDF is missing".
- [ ] 33. Upload an image for a dance and play it on the projector: it is letterboxed in the slide area on black, with no Canva controls, and it still shows with the network off. Give the same dance a Canva slide: a "Show on the projector" choice appears, and switching it changes the projector's slide. Delete the app's copy of the image (`slide-images` in the library folder): the projector falls back to the Canva slide, and the editor says "The image is missing".
- [ ] 34. On the Program page, select several items (click, shift-click, cmd-click) and drag them to the middle and to the end of the program, with a real mouse and with the trackpad: they land together in their original order, stay selected, and the drag image reads “N items”. Dragging an unselected item moves only it. An item that starts playing leaves the selection, and a click in the empty area below the list clears it.
- [ ] 35. Select several songs on the Music page and in the program: the star, ⋯ menu (Add to / Remove from favorites, both offered for a mix) and, in the program, ✕ and Remove act on all of them; an unselected row's star acts alone; Edit details and the dance choice are missing from the menu while several are selected; Insert STOP before puts the STOP above the first item of the consecutive group you used it on (select 1, 3 and 4: on 3 or 4 it goes between 2 and 3, on 1 before 1); Open PDF opens every PDF among them (attach two to try).
