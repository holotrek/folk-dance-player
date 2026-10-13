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

- **2026-10-13 — Mantine components with scoped CSS Modules for the UI.** Avoid hand-rolling standard controls (autocomplete, number inputs, dialogs, notifications); keep custom CSS small and component-scoped. _Rejected:_ shadcn/ui + Tailwind (utility classes instead of scoped CSS), Radix Themes (no autocomplete or notifications).
- **2026-10-13 — Built-in `node:sqlite` instead of `better-sqlite3`.** No native add-on to rebuild for Electron, and tests run on the same SQLite (3.53.4, FTS5) as the app. _Rejected:_ better-sqlite3 (needs separate builds for Node and Electron).
- **2026-10-13 — Exact version pins, each at least two weeks old; Vite stays on 7.x.** Reproducible builds, and avoiding brand-new releases. electron-vite 5 supports Vite only up to 7.
- **2026-10-13 — Double-click plays a preview everywhere except the program.** A preview stops the current song, is logged and shown on the projector, and never auto-continues; afterwards the program's next item is queued. Double-clicking in the program does nothing, because the program means "play in this order"; drag an item to the top instead.
- **2026-10-13 — Played program items are hidden but kept** (`program_items.played_at`). Saved programs record what was actually danced. _Rejected:_ deleting items as they play (the Flutter behavior).
- **2026-10-13 — Auto-continue is on by default,** with the delay editable in the player bar. STOP markers, replays and previews always halt.
- **2026-10-13 — Playlists are separate from programs.** Playlists organize the library; programs are a session's running order. Apple Music playlists are recreated exactly, and a re-import asks before overwriting local edits.
- **2026-10-13 — One `songs` row per file, in three data layers.** Editing one recording's metadata must never affect another. Keeping shareable facts separate leaves room for a future shared metadata database. _Rejected:_ several files sharing one song record.
- **2026-10-13 — Canva slides use the plain `/view` link in a `WebContentsView`, with a synthetic mouse pass after every slide change; saved slide images are used when offline.** `/view` can't be iframed (X-Frame-Options: deny). `?embed` can, but its controls never fade. Canva fades its controls only after mouse activity. _Rejected:_ `?embed` iframe, and cropping (the controls overlap slide content).
- **2026-10-13 — The projector window is borderless** (`frame: false`, `enableLargerThanScreen: true`, `setAlwaysOnTop(true, 'screen-saver')` before `setBounds`, `showInactive()`). This was the most seamless option on laptop and projector. Without `enableLargerThanScreen`, macOS clamps the window below the menu bar. _Rejected:_ native macOS fullscreen (new Space and an animation), simple fullscreen.
- **2026-10-13 — The projector view never closes on mouse or Esc in projector mode;** it does in laptop mode. The operator keeps working while the projector is up. Laptop mode must always be escapable.
- **2026-10-13 — Main process is the single source of truth; the control window plays audio through `<audio>`.** This prevents the Flutter app's desync bugs. `<audio>` with `preservesPitch` gives speed changes without changing pitch (verified at 0.5×, 0.75× and 1.25×). _Rejected:_ state in the renderer synced with BroadcastChannel; audio in a hidden window.
- **2026-10-13 — Electron rewrite of the Flutter app, macOS first.** The Flutter version couldn't reliably put a fullscreen window on a second display; a spike proved Electron can. _Rejected:_ continuing with Flutter.
