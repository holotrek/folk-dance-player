# Spike: a media remote (2026-10-14)

**Question:** with a presentation/media remote, play/pause seemed to work but back and next did
nothing. What does the remote send, and how can the app receive it reliably?

**Setup:** `remote-spike/` is a tiny Electron app that plays one song and logs everything it
receives: key events in the page and in the main process, Media Session actions, Electron global
shortcuts, and changes to the `<audio>` element. Run it with a song path:

```bash
SONG="/path/to/song.mp3" env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron docs/spikes/remote-spike
```

Its log is written to `remote-log.txt` beside it. Three modes are switched with buttons:
A (Chromium's defaults), B (our `navigator.mediaSession` handlers), C (Electron
`globalShortcut` media keys).

## Findings (macOS, Electron 44.4.5)

The remote sends **media keys**: one play/pause button (`MediaPlayPause`), `MediaNextTrack` and
`MediaPreviousTrack`. Its volume buttons change the system volume, which is fine.

| Mode | Nothing playing | Audio playing |
|---|---|---|
| A: Chromium's defaults | nothing reaches the app; macOS opens QuickTime | nothing logged |
| B: Media Session handlers | nothing reaches the app | nothing logged |
| C: global shortcuts | play/pause, next and back all arrive | all arrive (10 quick presses too); the key goes nowhere else |

- **Media keys never arrive as key events** in the page or in `before-input-event`.
- **macOS sends media keys to the current "Now Playing" app.** Until the app is playing, that
  isn't the app (QuickTime opened instead), and another player can take it over at any time. So
  A and B can't start a program from idle, or after a STOP.
- **In the app before this spike,** Chromium's default handling paused and played the `<audio>`
  element directly, behind `PlayerSession`'s back, so the app could think it was playing while the
  audio was paused. Back and next had no default, so they did nothing.
- **Global shortcuts work whether the app is idle or playing, focused or not,** and consume the key.
  They need the app to be trusted for Accessibility on macOS
  (`systemPreferences.isTrustedAccessibilityClient`). In development the trust comes from the
  terminal or editor that starts Electron; the packaged app needs its own grant.

## Decision

The main process registers the media keys as global shortcuts and sends them to `PlayerSession`:
play/pause toggles (▶ from idle starts the program), next is ⏭, back restarts the song (◀◀),
stop is ⏹. Chromium's own media-key handling is switched off
(`--disable-features=HardwareMediaKeyHandling,MediaSessionService`). Settings shows whether the
remote works and asks macOS for Accessibility permission when it doesn't. Verified with the real
remote against the built app.
