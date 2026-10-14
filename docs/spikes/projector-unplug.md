# Known issue: unplugging the projector mid-session (2026-10-14)

**Status:** deferred. Leaders usually plug the projector in before the dances and unplug it
afterwards, so this is unlikely at an event. Workaround: turn the **Projector** switch off before
unplugging, or quit the app if it happens.

## Symptom

Unplugging the projector while the projector view is showing sometimes (about 1 unplug in 4)
leaves a grey rectangle covering about 90% of the laptop screen. It can't be moved, nothing can
be brought in front of it, and it outlives plugging the projector back in (after which macOS
switches the laptop's resolution, so it covers the whole screen). The music keeps playing and the
control window still works underneath. Quitting the app clears it.

## Evidence

Gathered with temporary logging of display events and window state, plus a
`CGWindowListCopyWindowInfo` recorder (one sample a second) of the app's on-screen windows:

- On unplug, `display-removed` arrives first, and the app closes the projector window at once.
- macOS relocates the projector window from the removed display onto the laptop, to (64,0) or
  (0,0) at 1920×1080, around the same moment.
- On a failing unplug, Electron reports the window **closed** within ~60 ms, but macOS's window
  list still shows that window (screen-saver layer, 1000) on the laptop until the app quits. The
  native window is orphaned and still drawn, with no Electron object left to control it.
- On a passing unplug, the same window disappears from macOS's list after the close.
- The display event sequence is identical in passing and failing runs. Along the way the laptop's
  scaled resolution changes (1792×1120 ↔ 2048×1280), and the built-in display is removed and
  re-added with a new id.

## Tried

1. **`hide()` synchronously before `close()`:** still failed. The window closed within 3 ms,
   before macOS moved it, and the grey rectangle still appeared.
2. **One persistent projector window, hidden instead of closed, with its state re-asserted 1.5 s
   after the displays settle:** worse. After two cycles the projector view itself stayed over the
   laptop and couldn't be closed, even with the projector plugged back in.

## Leads for later

- A window at the screen-saver level that can join all spaces (`setVisibleOnAllWorkspaces`) may be
  what macOS mishandles while removing a display. Try a lower level once the projector display is
  separate (always-on-top was needed to cover the menu bar on the laptop display).
- Delay closing until the display configuration settles, and check macOS's window list (via a small
  native helper) afterwards; if an orphan remains, recreate and close a window at the same bounds.
- Reproduce in a minimal Electron app (one borderless screen-saver-level window on a second display,
  unplug) to report upstream.
