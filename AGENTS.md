# AGENTS.md

Guide for AI agents (and people) working on Folk Dance Player. Read this first.

## Orientation

Folk Dance Player is a macOS-first Electron app for folk dance organizers: index a music library,
build a **program** (the dances for one session), play it, and show a large-font **projector view**
with Canva slides on a second display. It replaces an earlier Flutter app and is inspired by
MITPlayer.

- Spec: `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`
- Plans: `docs/superpowers/plans/` (one per subsystem; written when reached)
- Release notes: `CHANGELOG.md` · How to contribute: `CONTRIBUTING.md`

## Non-negotiable conventions

- **The main process owns all state.** Renderers call `window.api.invoke` on channels in `src/shared/contract.ts`. The projector window is read-only.
- **Use `node:sqlite`.** Schema changes are new numbered migrations. A migration that has been released is never edited.
- **Keep the data layers separate.** `files` holds local facts, `songs` holds shareable facts (one per file), and `file_prefs`, `playlists` and `slide_cache` hold personal or local data.
- **UI comes from Mantine components.** Custom CSS goes only in co-located `*.module.css` files.
- **Pin exact dependency versions,** each at least two weeks old when added.
- **Work test-first** (Vitest). Commit with conventional-commit messages.
- **Add a `CHANGELOG.md` line** under `Unreleased` for every user-facing change, in the same commit.
- **Add a decision below** whenever you make one a future contributor would otherwise have to rediscover.

## Decisions

Newest first. Format: **date — decision.** Why. _Rejected:_ alternatives.

- **2026-10-13 — Search folds letters the tokenizer can't, and search-box text always goes through `toFtsQuery()`.** The FTS5 `unicode61 remove_diacritics 2` tokenizer strips combining accents (ş, ç, é) but not separate letters (ı, ł, ø, æ, ß, đ, þ). So `library_fts` is a contentless index (`content = ''`, `contentless_delete = 1`) with one row per song: its title and artist, plus the name, country and choreographer of every linked dance and the pairings' teachers. Triggers on `songs`, `dances`, `dance_songs` and `dance_song_prefs` keep it current, and fold those letters using a frozen copy of `FOLD_MAP`. `toFtsQuery()` folds the query the same way and quotes each word as a prefix term, because raw text such as "4-Wall" makes `MATCH` throw. To change folding later, add a migration that rebuilds `library_fts`; a test checks that the migration's copy covers `FOLD_MAP`. _Rejected:_ a SQL function registered with `db.function()` (triggers would break on any connection without it); storing folded shadow columns in `songs` and `dances`.
- **2026-10-13 — Settings are stored as JSON per key and validated on both write and read.** An unknown key or invalid value is rejected on `set`. A stored value that is corrupt or the wrong type silently falls back to its default on `get`, so an old or hand-edited database never crashes the app.
- **2026-10-13 — The app refuses a library database with a newer `user_version`.** It shows a "created by a newer version" dialog and quits without migrating. Each migration and its `user_version` bump run in one transaction.
- **2026-10-13 — `postinstall` runs `install-electron`.** Electron 44 has no install script of its own, and electron-vite fails with "Electron uninstall" without the binary.
- **2026-10-13 — Windows use `sandbox: false` for now** (the electron-vite template default). The preload is CommonJS and only needs `electron`, so `sandbox: true` should work. Turn it on, along with a navigation guard and a single-instance lock, before Canva web content is loaded (plans 6 and 7).
- **2026-10-13 — Kept the spike's `display-mode.swift` at `docs/spikes/`.** It is the verified CoreGraphics helper (mirror → extended, laptop as main display) that the post-v1 display setup assistant needs.
- **2026-10-13 — Mantine components with scoped CSS Modules for the UI.** Avoid hand-rolling standard controls (autocomplete, number inputs, dialogs, notifications); keep custom CSS small and component-scoped. _Rejected:_ shadcn/ui + Tailwind (utility classes instead of scoped CSS), Radix Themes (no autocomplete or notifications).
- **2026-10-13 — Built-in `node:sqlite` instead of `better-sqlite3`.** No native add-on to rebuild for Electron, and tests run on the same SQLite (3.53.4, FTS5) as the app. _Rejected:_ better-sqlite3 (needs separate builds for Node and Electron).
- **2026-10-13 — Exact version pins, each at least two weeks old; Vite stays on 7.x.** Reproducible builds, and avoiding brand-new releases. electron-vite 5 supports Vite only up to 7.
- **2026-10-13 — Double-click plays a preview everywhere except the program.** A preview stops the current song, is logged and shown on the projector, and never auto-continues; afterwards the program's next item is queued. Double-clicking in the program does nothing, because the program means "play in this order"; drag an item to the top instead.
- **2026-10-13 — Played program items are hidden but kept** (`program_items.played_at`). Saved programs record what was actually danced. _Rejected:_ deleting items as they play (the Flutter behavior).
- **2026-10-13 — Auto-continue is on by default,** with the delay editable in the player bar. STOP markers, replays and previews always halt.
- **2026-10-13 — Playlists are separate from programs.** Playlists organize the library; programs are a session's running order. Apple Music playlists are recreated exactly, and a re-import asks before overwriting local edits.
- **2026-10-13 — Dances are separate from songs, many-to-many, with an automatic one-to-one dance per imported song.** One tune can carry several dances, and one dance (Lesnoto) works with many tunes. Dance names aren't unique: there are several Svornatos by different choreographers. Import gives each new song its own same-named dance, its default, and never links by name; the library suggests "same dance?" instead. Each file still has exactly one `songs` row, so editing one recording never affects another. The teacher lives on the dance–song pairing (`dance_song_prefs`), the default dance on `song_prefs`, and difficulty, notes and the Canva slide on `dance_prefs`; all of these are personal. Songs, dances and pairings are the shareable layer. Labels show `Song | Dance (Choreographer)`, dropping the song when it matches the dance name and the choreographer unless the song's dances have more than one. _Rejected:_ dance fields on `songs` (can't model one tune with several dances); several files sharing one song; linking by name on import (wrong for the Svornatos).
- **2026-10-13 — Canva slides use the plain `/view` link in a `WebContentsView`, with a synthetic mouse pass after every slide change; saved slide images are used when offline.** `/view` can't be iframed (X-Frame-Options: deny). `?embed` can, but its controls never fade. Canva fades its controls only after mouse activity. _Rejected:_ `?embed` iframe, and cropping (the controls overlap slide content).
- **2026-10-13 — The projector window is borderless** (`frame: false`, `enableLargerThanScreen: true`, `setAlwaysOnTop(true, 'screen-saver')` before `setBounds`, `showInactive()`). This was the most seamless option on laptop and projector. Without `enableLargerThanScreen`, macOS clamps the window below the menu bar. _Rejected:_ native macOS fullscreen (new Space and an animation), simple fullscreen.
- **2026-10-13 — The projector view never closes on mouse or Esc in projector mode;** it does in laptop mode. The operator keeps working while the projector is up. Laptop mode must always be escapable.
- **2026-10-13 — Main process is the single source of truth; the control window plays audio through `<audio>`.** This prevents the Flutter app's desync bugs. `<audio>` with `preservesPitch` gives speed changes without changing pitch (verified at 0.5×, 0.75× and 1.25×). _Rejected:_ state in the renderer synced with BroadcastChannel; audio in a hidden window.
- **2026-10-13 — Electron rewrite of the Flutter app, macOS first.** The Flutter version couldn't reliably put a fullscreen window on a second display; a spike proved Electron can. _Rejected:_ continuing with Flutter.
