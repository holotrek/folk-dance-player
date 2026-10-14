# Folk Dance Player

A music player made for **folk dance organizers**. Build the running order for a dance session from
your music library, play it with auto-continue and teaching stops, and show dancers a large-font
**projector view** of what was played, what's playing (with the dance's Canva slide) and what's
coming up — while you keep programming on your laptop.

> **Status:** early development (v0.x). macOS first; Windows later.

## Features

- **Import your music.** Add files or folders, drag and drop, or import from Apple Music's `Library.xml` (the whole library or chosen playlists).
- **Organize it.** Link each song to the dances done to it: one tune can carry several dances, and one dance can be done to many tunes. Record each dance's country, choreographer, dance type, difficulty and notes, and who taught it to your group, with autocomplete. Use favorites, a holding area and playlists.
- **Search** by song title, dance name, teacher, choreographer or country. Accents don't matter: "pasa" finds "Paşa".
- **Build programs** (the dances for a session) by drag and drop, with STOP/Teaching markers. Save and reload them.
- **Play.** Auto-continue with an adjustable delay, a countdown, preview any song by double-clicking, and slow songs down for teaching without changing their pitch. A media remote works too: play/pause, next and back.
- **Projector view.** A borderless, large-font display on a second screen or projector, with each dance's Canva slide. Slides are saved for use offline.
- **Fullscreen on one screen.** When no projector is connected, the same view can cover the laptop screen after an idle timeout.

## Getting started (developers)

Requires macOS, Node 24 and npm 12.

```bash
npm install
npm install-scripts approve esbuild
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for scripts, conventions and the release process.

## Project documents

- [Design spec](docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md): what the app does and how it's built
- [Implementation plans](docs/superpowers/plans/)
- [CHANGELOG.md](CHANGELOG.md): release notes
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the project
- [AGENTS.md](AGENTS.md): guide and decision log for AI agents and contributors

## Acknowledgements

Inspired by **MITPlayer**, the Visual Basic app many organizers used for years. Thank you for
showing how this should work.
