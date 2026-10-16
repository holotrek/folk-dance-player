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
