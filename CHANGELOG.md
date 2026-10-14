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
- The Music page lists your whole library: search by song, dance, teacher, choreographer or country (accents don't matter), sort by any column, and select songs with click, ⌘-click or Shift-click.
- Edit a song and its dances in a side panel: dance name, country, choreographer, teacher, dance type, difficulty and notes, with suggestions from what you've entered before.
- Link a song to more dances, make one its default, unlink one, or merge two dances that are really the same. When two dances share a name, the app asks whether they're the same dance.
- Make playlists: create, rename, duplicate and delete them, drag songs onto them, reorder them, and remove songs. Mark favorites, and drag songs onto Favorites.
- Re-apply the import mapping to selected songs: the dialog shows their tags and lets you choose the mapping for that run.
- Settings: choose the default import mapping and edit the list of dance types.
