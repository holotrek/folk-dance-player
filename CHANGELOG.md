# Changelog

All notable changes to Folk Dance Player are documented here. These sections are the official
release notes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A hands-on **guided tour** teaches the app on a practice library, with sample songs and two real tunes, so nothing of yours is touched. It scrolls to whatever it is pointing at, and walks through an import with a pretend folder. The **Basic** tour covers music, building a program and playback; the **Advanced** tour covers the projector, programs, playlists and settings. It is offered the first time you open this version, and any time from **Help → Take the Basic Tour…** / **Take the Advanced Tour…**.
- **Holding** now works like the Program on the side. Drag songs between them (the song moves and keeps its dance), choose the dance when you drop a song that has several, hold the same song once for each of its dances, and select several held songs to move, release or favorite them together.
- Each program shows its **total play time** in the sidebar. The Program page shows the total and when the program will **end**, and the projector shows a quiet “Ending about 9:42 PM” in its footer. Auto-continue seconds are included, songs missing from disk are left out, and pauses at STOP markers are not counted (the Program page says so).
- **Previously played** now reads oldest to newest, so previous, now playing and up next read down the screen as one list. The Program page's list stays at the newest song unless you scroll up, and the projector shows the most recent song just above Now Playing.
- **End Program** (in the Program page's header) clears the program and Previously played from the screen. The program stays saved in the sidebar, with what was played. With no program loaded, **Start New Program** asks for a name and starts one.
- Select several items in the program (click, shift-click for a range, cmd/ctrl-click to add or remove one) and drag them together; they land in the order they had and stay selected.
- With several songs selected (program, Music page, Program page's library list), the star, **Add to / Remove from favorites** and, in the program, ✕ and **Remove** act on all of them. A mixed selection offers both favorites choices; **Open PDF** opens every PDF among them; **Edit details** and the per-item dance choice are hidden while more than one is selected.
- Give a dance a slide **image** instead of, or as well as, a Canva slide (song editor → **Upload image…**). When it has both, choose which one the projector shows. An image slide works offline.
- Attach a PDF (its written notes, for example) to a dance in the song editor; **Open** shows it in your PDF viewer. The PDF is copied into the app's data folder, so moving the original doesn't matter. Attachments aren't part of the startup backups.
- A song, program item or held song whose dance has a PDF now offers **Open PDF** in its right-click (⋯) menu.
- In the song editor, a song's default dance has a **Same as song** box: while it is checked the dance's name can't be edited, and renaming the song renames the dance too. Uncheck it to name the dance separately; check it again to set the dance's name back to the song's.
- Drag a column header to reorder the columns of the Music page and of the Program page's library list (Alt+←/→ with a header focused also works). Each list keeps its own order, and right-clicking a header offers **Reset columns**.

### Changed

- Development builds (`npm run dev`, `npm start`) now keep their library in a separate `Folk Dance Player (dev)` folder, so trying unreleased code can no longer upgrade your real library past what the installed app can open.
- The import mapping now asks, for Artist, Teacher and Choreographer, which tag fills each (the Artist tag, the Album Artist tag, or neither). Your saved choices are converted automatically; if both tags were sent to one field, the Artist tag now fills it and the Album Artist tag no longer does.
- Dances are named before their song everywhere, as `Dance ♪ Song`.
- The Music page has an **Artist** column, and the Program page's library list shows **Artist** and **Choreographer**. As that list gets narrower, columns disappear in this order: Artist, Teacher, Choreographer, Country, Time.

### Fixed

- **Change…** on a dance's slide opens on the slide's current number in its deck, instead of slide 1, and follows it if the deck was edited in Canva.
- After you edit a Canva deck, the slide numbers and titles in the slide dialog, and the slides shown on the projector, follow the change. The app now re-reads your decks when you open the dialog and when you come back to it. Decks used by the current program are read first. **Refresh slides** is still how to save new images of slides whose content changed, and it saves the current program's first.

## [0.2.0] - 2026-10-17

### Added

- **Sync with Apple Music** (a switch on the Music page, on a Mac): reads your Music library directly, with no Library.xml export, and keeps songs and playlists in step when the app starts, when you switch back to it, and with Sync now (File → Sync with Apple Music, ⌘⇧S). Tags follow Music unless you edited the field here, and a message says what each sync changed.
- Songs deleted from Music wait in **Removed from Apple Music** (in the sidebar) until you keep or remove them; sync never deletes a song by itself.
- If Music's library suddenly looks much smaller (most of your songs missing), sync pauses and asks before changing anything; it carries on by itself once Music shows the songs again.
- Music's playlists appear in the sidebar in their folders, read-only, marked with a note; **Duplicate as my playlist** makes a copy you can edit.
- **Edit details** in a song's menu ("⋯" or right-click) in the program, Holding and the library list opens the song in the Music page's editor, selected and scrolled into view. Library and Holding rows now have that menu, with Add to / Remove from favorites too.
- After you link a Canva slide, the dance editor shows **Generating preview…** with a moving bar until the slide's image is saved. Offline, it says the preview will be made when you're back online, and it is made then; if Canva can't be reached, it says so.
- Adding a song you removed from the library brings it back with its dances, notes and history.
- Songs removed from the library stay in past programs and Previously played, greyed and labeled "removed", and a program skips them.

### Changed

- Folk Dance Player is now signed and notarized by Apple, so a downloaded copy opens normally, without the "unidentified developer" warning or Open Anyway in System Settings.

### Fixed

- Esc closes the projector view over the laptop the first time it's pressed, even right after turning the view on.
- Canva's buttons no longer show over the live slide on the projector, and changing to another slide of the same deck no longer flashes the previous slide.
- A long dance name no longer hides the countdown in the player bar: the name is shortened instead ("Next: A long dance na… in 3…").
- Adding a Canva deck now says where to find its link in Canva: **Share → Embed → Smart embed link**.

## [0.1.0] - 2026-10-15

### Added

- Program, Music and Settings pages, with a sidebar for the library, playlists and programs.
- Settings for import (Genre is Country), auto-continue and the countdown before the first song. They are saved between launches.
- Folk Dance Player won't open a music library created by a newer version of the app, and leaves that library unchanged.
- Import music with **Add Music…** (files and folders, including folders inside folders) or by dragging them onto the Music page.
- Import from Apple Music: choose the `Library.xml` you exported from Music and import the whole library or just the playlists you pick. Playlists are recreated in the same order.
- Before each import, choose whether the Artist and Album Artist tags become the Artist, Teacher or Choreographer, and whether Genre is the Country. Your choice is remembered.
- Each imported song gets its own dance with the same name, ready for its country, choreographer and teacher.
- Importing again keeps your edits, recognizes files you moved or renamed, and asks before replacing an Apple Music playlist you've changed.
- After each import, a summary lists what was added or updated, and any files that were missing, unreadable, or in a format the player can't play yet (such as AIFF or Apple Lossless).
- The Music page lists your whole library: search by song, dance, teacher, choreographer or country (accents don't matter), sort by any column, and select songs with click, ⌘-click or Shift-click, or all of them with ⌘A.
- Edit a song and its dances in a side panel: dance name, country, choreographer, teacher, dance type, difficulty and notes, with suggestions from what you've entered before.
- Link a song to more dances, make one its default, unlink one, or merge two dances that are really the same (merging keeps both dances' notes). When two dances share a name, the app asks whether they're the same dance.
- Make playlists: create, rename, duplicate and delete them, drag songs onto them, reorder them, and remove songs. Mark favorites, and drag songs onto Favorites.
- Re-apply the import mapping to selected songs: the dialog shows their tags and lets you choose the mapping for that run.
- Importing from Apple Music shows the tags of up to 50 songs (chosen at random in a larger library) beside the mapping choices, so you can see which tag holds teachers or choreographers.
- Settings: choose the default import mapping and edit the list of dance types.
- Programs: create one for each dance session (named for today's date), then rename, duplicate (a fresh copy to run again) or delete it. They're listed in the sidebar newest first, with a search box, and adding songs with no program open starts one.
- The Program page: build the program by dragging songs from the library, holding, playlists or Previously played, or with ➕ Add selected; drag items to reorder them; add STOP / teaching markers; choose which dance an item is played as.
- Play the program from the player bar at the top of every page: ▶, pause, stop, next and restart; a seek bar; auto-continue with an adjustable delay right in the player bar; a countdown before the first song; and STOP markers that halt playback until you press ▶.
- ⏹ rewinds the song and keeps it ready; ▶ plays it again. A song interrupted by a preview comes back as the next song. Loading another program while a song plays asks first.
- Remove a program item with the ✕ that appears on hover, and drop songs anywhere on the Program panel.
- Double-click a song in the library, a playlist or holding to preview it; double-click an entry in Previously played to play it again. Previews and replays never continue on their own.
- The projector view: on a second display, a large-font view of what was played, what's playing (with a red progress line) and what's coming up, including a "Teaching" marker before a dance that will be taught. Turn it on with the Projector switch in the player bar, and choose its display in Settings.
- With no projector connected, the same view can cover the laptop screen: from the Projector switch, or automatically after an idle time while music plays. Move the mouse or press Esc to close it.
- The Mac doesn't go to sleep while the projector view shows or music plays.
- Control playback with a media remote (or a keyboard's media keys), even while the app is in the background: play/pause, next, and back to restart the song. Settings shows whether the remote works and asks macOS for the permission it needs.
- Slow a song down or speed it up (0.5×–1.5×) without changing its pitch, with a lock to keep the speed for the next song, and set the volume.
- Holding: drop songs on the holding panel to keep them handy for the session, slotting them in between held songs or at the end, and drag held songs to reorder them.
- Previously played lists what was played in the program, newest first. Played items leave the program but are kept, so a saved program records what was danced.
- When a program is loaded, its files are checked, and missing ones are flagged before the event. A missing file is skipped at play time with a warning.
- Canva slides: link a dance to a slide of a Canva presentation, by its number in the deck (add the deck once, with its public view link) or with a link to the slide. The projector shows the slide beside the program while that dance is up: the saved image at once, then the live slide once Canva's buttons have faded.
- Slide images are saved in the background, so slides still show without internet. **Refresh slides** on the Music page re-reads your decks and saves the images again, showing its progress, and a notice says when Canva's links need checking.
- Favorite or unfavorite a song from anywhere: the star at the left of a library row, a held song or a program item (it shows on hover until the song is a favorite), or a program item's ⋯ menu.
- ✕ clears a search box: the library search, the program search and the dance search.
- Settings → Appearance: light, dark, or follow the Mac's setting.
- The Folk Dance Player logo: beside the page tabs, on the projector whenever there's nothing to show (instead of a blank screen), and in Settings → About; and an app icon (the logo on a red tile).
- A downloadable app: one `.dmg` for Apple silicon and Intel Macs. Drag it to Applications; the first time, open it with System Settings → Privacy & Security → Open Anyway.
- Your library is backed up every time the app starts (the last 5 backups are kept). Help → Reveal Library Backups in Finder shows them.
- The app keeps a log for troubleshooting: Help → Reveal Logs in Finder.
- A full app menu: About, Settings… (⌘,), copy and paste in text fields, and Window.
- The player bar has two rows: the controls, song, speed, volume, Projector switch and **Auto-show when playing … after N s** (the view over the laptop) on top; the position, time and **Auto-continue … after N s** below.
- When the library list shows a playlist or your favorites, a note above it says so, with **Show all music** to go back.
- Playlist songs are numbered in the playlist's order, and songs can be dragged below the last one to move them to the end.
- Adding a song that has several dances to the program asks which dance it's for (the default is preselected).

### Known issues

- Unplugging the projector while the projector view shows can leave a grey window over the laptop until the app quits. Turn the Projector switch off before unplugging.
- The app isn't signed with an Apple Developer ID yet, so macOS asks before opening it the first time: open System Settings → Privacy & Security and click **Open Anyway**.
