# Windows projector window: hardware findings

First Windows desktop (a monitor and a TV on one graphics card), 2026-11-01. Findings for the
projector window and display changes; the checklist is `docs/manual-testing/pre-release-hardware-windows.md`.

- **Taskbar:** with the view opened by the Projector switch, nothing shows over it (the taskbar
  included).
- **Different display scales:** a slide fills the TV exactly with the two displays at different
  scales.
- **Media keys:** play/pause, next and back work in the background.
- **Unplug:** unplugging the TV while the view shows leaves no gray window (the macOS issue in
  `projector-unplug.md` did not occur).
- **Replug swapped the view and the app window:** fixed by returning the view to the display it
  lost (`lostId` in `ProjectorController`). Display events are logged ("Display event …") if it
  comes back.

## Known issue

After unplugging and replugging the TV, the view comes back on the correct display, but the taskbar
can show over it. Seen once. Turning the Projector switch off and on again is the workaround. Not
investigated: a likely cause is that the window's always-on-top level is applied before Windows
finishes laying out the returning display. Rare enough to leave until a beta user reports it.
