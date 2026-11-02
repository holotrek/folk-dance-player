# Pre-release hardware check: Windows

Run before a release that includes the Windows installer, on the installed app (the `.exe`), with a
second display (a TV works) and the real media remote. It covers what the automated tests can't.
The Mac list is `pre-release-hardware.md`. Windows release spec §9.1 and §10.

**Prepare Release copies this list into the release pull request's description** once it is wired
in; until then, copy it into the PR by hand.

Anything that behaves differently from what a step says is a finding to fix (or to list as a known
issue) before the release. Write what you see for the findings, especially for section C.

## Before you start

- [ ] Install on a clean Windows user (or after uninstalling). SmartScreen says "Windows protected your PC" for an unsigned build: **More info → Run anyway**. The install finishes without asking for an administrator and puts a shortcut on the desktop and in the Start menu.
- [ ] The library is in `%LOCALAPPDATA%\Folk Dance Player` (Help → Show Logs in File Explorer opens its `logs` folder).
- [ ] A program has a few songs, with a STOP before one, and one dance is linked to a Canva slide.

## A. The app

- [ ] 1. The menu bar is visible: File (Settings…, Exit), Edit, View, Window, Help. Help → About shows the version.
- [ ] 2. No Apple Music anywhere: no switch on the Music page, no File → Sync with Apple Music, and no "Mac" or "Finder" wording (Settings, Remote control).
- [ ] 3. Take the Basic tour and the Advanced tour to the end. No step waits on an Apple playlist or folder; the Appearance step says "follows your computer".
- [ ] 4. Add Music… with a folder; drag a folder in from File Explorer; a `.wma` file is reported as unsupported.
- [ ] 5. Play a song, change the speed, preview by double-click. Closing the window quits the app.

## B. The remote

- [x] 6. The remote's play/pause, next and back work while the app is in the background, and no Accessibility message is shown. The Windows volume flyout does not also take over the music.

## C. Projector on the second display (the TV)

- [x] 7. Extended: Projector on covers the TV completely, **including the taskbar** if the taskbar is on that display. The cursor and the control window stay on the main display.
- [ ] 8. Duplicate (Win+P): the view covers the screen and Esc or moving the mouse closes it.
- [x] 9. Unplug the TV's input while it is showing, then reconnect: the view comes back or closes cleanly; the control window never ends up on the TV.
- [x] 10. Mixed scaling: set the main display to 125% or 150% and the TV to 100% (or the reverse). The slide fills the screen exactly (no gap, no overflow) and the Canva slide is aligned with its saved image.
- [ ] 11. Play with the projector on for two songs: the Canva slide changes without flashing the previous one or showing Canva's controls.
- [ ] 12. HDMI audio: plugging in the TV moves Windows' default audio to it; note whether the music follows mid-song.

Results from the first Windows desktop (a monitor and a TV on one graphics card, 2026-11-01):
7 passes (nothing shows over the projector view, taskbar included). 6 passes (the media keys work).
9 passes: unplugging while the view is showing leaves no gray window (the macOS known issue in
`projector-unplug.md` does not happen here). Reconnecting made the projector view and the control
window **swap displays** (fixed in the build after that; retest: unplug and replug with the app on the
monitor and the view on the TV, and send the log's "Display event" lines if it still swaps). 10 passes (different scales look right). Known issue, not fixed: after a replug the taskbar can show over the view (switch the Projector off and on; see `docs/spikes/windows-projector.md`). 8, 11 and 12 are not done yet.

## D. Updates and removal

- [ ] 13. Check for Updates… (Help) answers "You have the latest version" or offers an update. If an update is ready, Restart to Update closes the app cleanly and the installer relaunches it (needs two published Windows releases or the local-feed rehearsal).
- [ ] 14. Uninstall from Settings → Apps, reinstall: the library and its programs are still there.

## Not covered by this machine

A laptop's lid, sleep and wake on battery, and a docking station's burst of display changes. Ask a
beta user with a laptop.
