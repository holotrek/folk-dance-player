# Changelog

All notable changes to Folk Dance Player are documented here. These sections are the official
release notes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Program, Music and Settings pages, with a library sidebar (playlists and programs arrive in later releases).
- Settings for import (Genre is Country), auto-continue, the countdown before the first song, and the idle fullscreen view. They are saved between launches.
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
- The player bar has two rows: the controls, song, speed, volume, Projector switch and **Auto-show when playing … after N s** (the view over the laptop, moved here from Settings) on top; the position, time and **Auto-continue … after N s** below.
- When the library list shows a playlist or your favorites, a note above it says so, with **Show all music** to go back.
- Playlist songs are numbered in the playlist's order, and songs can be dragged below the last one to move them to the end.
- Adding a song that has several dances to the program asks which dance it's for (the default is preselected).
