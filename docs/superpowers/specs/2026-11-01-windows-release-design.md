# Windows release — design (draft)

**Status:** draft for discussion. Nothing here is built. §12 records the questions you have answered and the few still open; §11 lists what I (Claude) guessed, so you can overrule it.

**Branch:** `feat/windows-release`. It was cut from `feat/in-place-updates` (the updater is not merged yet) and `site/` exists only on `main`. Rebase onto `main` once the updater merges, before any site work.

## 1. Intent

Folk Dance Player is macOS-only today ("macOS first; Windows later", spec 2026-10-13 §1). Its inspiration, MITPlayer, is a Windows program, and many folk dance organizers are on Windows laptops. The goal is a Windows release that is a first-class product, not a port that works on a good day: it installs without scaring people, updates itself, drives a projector reliably, and doesn't show Mac-only features or Mac-only wording.

The four things already named, plus everything else I found:

1. Apple Music sync is disabled and hidden on Windows, and the tour adjusts (§3).
2. The site shows the right things and the right download for the visitor's system (§4).
3. A MITPlayer importer was considered and dropped (§5).
4. In-place updates on Windows (§6).
5. The unglamorous rest: installer, code signing, projector window, menus, paths, CI, release flow (§7–§10).

## 2. Goals, non-goals, anti-goals

**Goals**

- A signed (see §12 Q1) Windows installer, published in the same GitHub release as the Mac one, found and updated by the same mechanism.
- The same data model, features and tours as macOS, minus what depends on Apple software.
- A projector view that works on a laptop plus a projector under Windows' display rules, verified on hardware.
- The Windows build is tested in CI (unit, end-to-end on `windows-latest`) so it cannot rot.

**Non-goals (for this release)**

- Linux. The capability model in §3.1 should make it cheap later, but nothing is built or tested for it.
- Moving a library between a Mac and a Windows PC. Paths in `files.path` are absolute and OS-specific; the post-v1 shared database is the real answer.
- Playing formats Chromium can't (WMA, AIFF, ALAC). Windows libraries have more WMA than Mac ones; we explain it (§9) rather than bundle a transcoder.
- An ARM64 build (decided: x64 only; it runs under emulation on ARM laptops).
- Microsoft Store / MSIX distribution.

**Anti-goals** (would make this a failure even if it technically ships)

- A Windows user sees the word "Mac", "Finder", "⌘" or "Apple Music" where it doesn't apply.
- A Windows update or signing problem delays or blocks a Mac release, or the reverse, without a deliberate choice (§8).
- The Windows code path is exercised only by hand on release day.
- Sprinkling `process.platform` checks through the code. Platform differences live in one module (§3.1).

## 3. Apple Music sync: disabled and hidden

### 3.1 One capability module

Today the checks are scattered: `index.ts` tests `process.platform === 'darwin'` in four places, and the renderer relies on `AppleSyncStatus.available`. Add `src/shared/platform.ts`:

```ts
export type Platform = 'mac' | 'windows' | 'linux'
export interface Capabilities {
  appleMusicSync: boolean      // the helper + File → Sync with Apple Music
  mediaKeyTrust: boolean       // macOS asks for Accessibility before media keys work
  mirrorDisplayHelp: boolean   // reserved for the post-v1 display setup assistant
  // …more as §7–§9 find them
}
export const capabilitiesFor: (p: Platform) => Capabilities
```

Main computes the platform once (`process.platform`, overridable with `FDP_PLATFORM=windows` **in unpackaged and test runs only**) and passes the capabilities to the things that need them (`AppleSync`, `menuTemplate`, the tour, `remote:status`). The renderer reads them through the existing settings/status path rather than sniffing `navigator`. The override lets the macOS CI runner exercise the Windows UI (hidden Apple Music, Windows tour, Windows menu) in end-to-end tests, in addition to the real Windows runner.

### 3.2 What is hidden

Most of this already works: `AppleSync` takes `available`, and `AppleSyncSwitch` and `AppleSyncStatusBar` render nothing when it is false. What remains:

| Place | Today | On Windows |
| --- | --- | --- |
| File → Sync with Apple Music (`menu.ts`) | built only when `o.appleSync` | stays absent; the whole File menu is rebuilt anyway (§9.2) |
| `AppleSync`, the Swift helper, `fdp-music-library` | helper is a mac-only `extraResources` entry | not built (`build-helper.sh` skipped), not packaged |
| Settings → import mapping | shared | stays: file imports use it. Check its wording for "Apple" |
| Playlists sidebar | marks Apple-mirrored playlists with a note icon | nothing to mark unless a `Library.xml` import created some (§3.3) |
| `appleSync:*` IPC channels | handlers exist | stay in the contract (the contract is one list for all platforms) but answer "unavailable"; verify none can be reached |
| Onboarding / empty states, the site's Apple Music copy | mention Apple Music | reworded (§3.4, §4) |

### 3.3 The `Library.xml` import is a separate feature

"Import from Apple Music…" reads an exported `Library.xml` file; it needs no Apple software, and `fileURLToPath` already handles Windows paths. Windows users with iTunes for Windows, or an export brought over from a Mac, could use it. But the paths inside such a file point at the other machine's disk. **Decided (Q5):** keep it on Windows, and build a **relocate songs** tool in this release: replace a folder prefix across the library's file paths (preview the count first; songs whose new path doesn't exist stay missing). The same remap step serves the Library.xml import and the everyday "I moved my music" case, so build it once as a shared piece (§9.5).

### 3.4 The tour

The tour is data (`src/renderer/src/tour/*-steps.ts`), with a practice library built by `main/tour/demo-library.ts`. Apple Music appears in three places:

- **Basic tour, the Music step** (`basic-steps.ts:44`): "On a Mac you can also turn on Sync with Apple Music…". Steps need to be platform-aware: a step's `body` may be a function of the capabilities, or a step may carry `platforms`. Prefer a small `when`/`body(caps)` extension to the step type over a second copy of the tour (a second copy drifts).
- **Advanced tour, playlists** (`advanced-steps.ts:88–113`): three steps about read-only Apple playlists, a folder (`Festival 2026`), and "Duplicate as my playlist". On Windows the practice library should not contain Apple mirrors, and these steps are replaced by local-playlist steps (a folder-less playlist, drag a song onto it). The duplicate-playlist action is still worth teaching, but only if something can be a mirror on Windows; otherwise it is dropped.
- **The pretend import** (`Add Music…` runs a pretend import over the practice library) is unaffected.

On Windows the Music step's Apple sentence is simply removed; nothing takes its place (a MITPlayer sentence was planned and dropped with the importer, §5).

Tests: the existing tour end-to-end specs run with `FDP_PLATFORM=windows` as well, and a unit test walks both step lists and fails if the Windows one mentions "Apple", "Mac", "Finder" or "⌘".

## 4. The site (`site/`, on `main`)

Today: one page; `main.js` fetches `releases/latest`, points every `[data-download]` link at the asset ending `.dmg`, and un-hides a "Windows version is in the works" note for Windows visitors. The page text says "A Mac music player", "macOS 12 or later, Apple silicon or Intel", and "Open the downloaded .dmg" in its install steps.

### 4.1 Detecting the visitor's system

Use `navigator.userAgentData?.platform` where it exists (Chromium) and fall back to parsing `navigator.userAgent`. Result is one of `mac`, `windows`, `mobile`, `other`. Notes:

- iPads report themselves as Macs in Safari; treat "Mac with touch points" as `mobile`.
- Mobile and Linux visitors get both downloads listed, with a line that the app is for computers.
- ARM vs Intel doesn't matter for either installer (the Mac one is Universal; see Q4 for Windows).
- The choice is a convenience, never a gate: a "Show downloads for another system" link is always there (people download for a different machine).

### 4.2 What changes by system

Mechanism: the script sets `data-os="mac|windows|other"` on `<html>`; the CSS hides elements marked `[data-os-only="mac"]` etc. Without JavaScript the attribute is absent and **everything shows**, i.e. the no-script page shows both downloads and every section, which is the safe fallback (and what a crawler sees). The site's CSP (`style-src 'self'`, `style-src-attr 'unsafe-inline'`) allows this.

| Element | Mac visitor | Windows visitor | Other / no JS |
| --- | --- | --- | --- |
| Primary button | Download for Mac (`.dmg`) | Download for Windows (`.exe`) | Both |
| Under the button | Free. macOS 12 or later. | Free. Windows 10 or later (verify against Electron 44's floor). | Both lines |
| Secondary link | "Also for Windows" | "Also for Mac" | n/a |
| Install steps (`#download`) | Open the .dmg, drag to Applications, "Open Anyway" if unsigned | Run the installer; SmartScreen note if the build is unsigned or new (§7.2) | Both lists |
| "Beyond Apple Music" section + sync screenshot | shown | **hidden entirely** (decided, Q6) | shown |
| Hero copy, `<meta description>`, `og:*` | "…for folk dance organizers" — drop "Mac" from the shared copy | same | same |
| Screenshots | existing (macOS window chrome, traffic lights) | Windows captures, retaken on your Windows desktop (decided, Q7) | Mac ones |
| MITPlayer section | unchanged (the credit and link stay) | the same | the same |

**Release assets.** `main.js` must pick the asset by platform: `.dmg` for Mac, `Folk-Dance-Player-Setup-*.exe` for Windows (never `.blockmap`, `.zip`, `.yml`). Failure cases to handle: the latest release lacks one platform's asset (a partial publish, or a Windows-only hotfix) → that button falls back to the Releases page; GitHub API rate limit (60/hour/IP, existing cache of 10 minutes stays) → buttons keep the Releases link. The Windows note is deleted.

**Not changing:** hosting (Azure Static Web App), the CSP's `connect-src`.

## 5. Importing from MITPlayer (dropped)

**Decided:** there is no MITPlayer importer. MITPlayer's data file is a CSV with no header row, so most columns could only be guessed, and a wrong guess would put wrong teachers, countries or notes into someone's library without their noticing. We would rather not import than import fields we are guessing at.

Consequences, all of them removals from earlier drafts: no MITPlayer format spike, no sample-hunting, no import entry on the Music page, no MITPlayer sentence in the tour, nothing about it on the site beyond the existing credit and link. **Revisit only if** a documented column layout turns up (from MITPlayer's author or its documentation); then a headerless-CSV import with a user-confirmed column mapping, like the existing tag-mapping step, would be the shape to design, as a post-release feature.

## 6. In-place updates on Windows

**Mostly the same.** `UpdateService` is a pure state machine over an `Updater` port; `electron-updater.ts` is the only file that imports the library; the banner, the schedule, the setting and the menu item are platform-neutral. `electron-updater` supports Windows through its NSIS target natively. What differs:

| | macOS (today) | Windows |
| --- | --- | --- |
| Installer the library uses | zip → Squirrel.Mac | the NSIS `.exe` (+ `.exe.blockmap` for differential downloads); **no zip** |
| Feed file | `latest-mac.yml` | `latest.yml`. Both sit in one release; the library reads the one for its platform |
| Trust check | Squirrel.Mac refuses an app not signed by the same identity | electron-updater verifies the new installer's Authenticode publisher name against `win.publisherName`, **if** configured. Unsigned builds update without a check, i.e. with no integrity protection beyond the sha512 in the yml (§7.2) |
| Install | swap `.app` at quit or on Restart | the installer runs silently when the app quits; per-user install (no elevation) is required for a silent update, so the installer must be per-user (§7.1) |
| "Dev run only checks and downloads" | needs the Developer ID | the same: an unpackaged run cannot install |
| First version with an updater | can't update older | n/a: Windows' first release already contains it |

**Things to do/verify:**

- `electron-builder.yml`: add `win.target: nsis`, `nsis` options, and the `publish` block is already generic. NSIS `artifactName` without spaces (the GitHub renames-spaces trap in the 2026-11-01 decision applies to `.exe` too).
- **`scripts/release.mts check-feed` is Mac-specific** (it reads `latest-mac.yml`, looks for the zip). Generalize to "for each feed present in `dist/`, the version matches, the named file exists, the sha512 matches", and run it in the Windows build job. Add its unit tests first.
- **Two jobs, one release:** each OS uploads its files as an artifact; Publish runs `gh release create` once with all of them. Same as today's design (matrix + single publish). A caveat: if one OS's feed file is absent from a release, installed copies on that OS see no update (that's fine); but a feed that exists and names a missing file strands them. `check-feed` covers it.
- The tests' `FDP_UPDATE_URL` generic-provider trick (writes a config file, sets `updateConfigPath`) should work on Windows, but the *signed rehearsal* in CONTRIBUTING.md needs a Windows variant with a test certificate.
- **Quit semantics.** The NSIS updater waits for the app to exit. `mainWindow.on('closed', () => app.quit())`, `will-quit` (`db.close()`, `globalShortcut.unregisterAll()`), utility processes and the Canva sessions must all finish promptly; a lingering process makes the installer say "cannot close Folk Dance Player". Verify on hardware, including while the projector window is open.
- "Restart to Update" asks first while a song plays — unchanged, and more important on Windows where a restart is a visible installer.
- Check for Updates… moves with the menu restructure (§9.2): Help menu on Windows.
- Antivirus: a silent NSIS installer run from `%LOCALAPPDATA%` can be slowed or flagged; the update download goes to the electron-updater cache folder.

## 7. Packaging and signing

### 7.1 Installer

**Decided (Q8):** NSIS, per-user only (`perMachine: false`, a one-click install with a short "Installing…" window), because electron-updater only supports NSIS (and AppImage/dmg-zip on the other systems), per-user installs update silently without an admin prompt (a school or community-center laptop may not give the user admin), and the user data folder lives in the profile anyway. No all-users option. Options:

- `nsis.deleteAppDataOnUninstall: false` (never delete someone's library on uninstall).
- Start-menu shortcut yes; desktop shortcut on by default (decided, Q8; organizers launch from the desktop).
- **Beta label (decided, Q12):** the first Windows release is "Windows (beta)" on the site, in the installer's text and in About. It shares the next minor version with the Mac build if the work lands together; the label comes off when the Windows hardware checklist has passed on a published release.
- `win.icon: build/icon.ico` — `npm run icon` needs to also write a multi-size `.ico` (16–256 px).
- `win.extraResources`: the tour's `hava-nagila.wav` and `korobushka.wav` are currently listed **under `mac:`**, so they would be missing from a Windows build and the tour would break. Move them to a top-level `extraResources`; keep `fdp-music-library` under `mac:`.
- `publisherName` and `signtoolOptions` once §7.2 is decided.
- Artifact name: `Folk-Dance-Player-Setup-${version}.exe` (no spaces; the site matches on it).

### 7.2 Code signing and SmartScreen

Unsigned Windows installers get Microsoft Defender SmartScreen's "Windows protected your PC" wall and more antivirus false positives; for non-technical organizers that is a real adoption barrier, comparable to the macOS "unidentified developer" problem we solved with a Developer ID. **Research (Nov 2026, from web searches; mostly third-party summaries, so confirm each on the vendor's own page before committing money or time):**

- **Azure Artifact Signing** (formerly Trusted Signing). About $9.99/month for up to 5,000 signatures (~$120/year); billing starts when the account is created, even if identity validation then fails. Eligibility: per Microsoft's Windows docs, **individuals only in the US and Canada**; organizations in the US, Canada, EU and UK (one third-party guide lists more countries). Individuals need an Azure billing account of type _Individual_. Reports disagree on whether a multi-year business-history rule still applies (a Microsoft Q&A answer from 2025 said yes during the preview; a later blog says it no longer applies to self-employed applicants). Cloud-based (no hardware token), so it works from GitHub Actions. Fits that the site already lives on Azure.
- **SignPath Foundation**: free signing for open-source projects. The certificate is issued to SignPath Foundation, which then appears as the **publisher**, not you or the app. Conditions: an OSI-approved open-source license, a public repository, no proprietary components, MFA for everyone on the signing team, and an "origin verification" check that the binary was built from the repository by CI (they review CI config and build scripts). A good fit for a public repo built in GitHub Actions; the unknowns are the application's turnaround and whether the repo's license qualifies (check `LICENSE`).
- **A purchased OV or EV certificate** from a CA. **Don't pay extra for EV to avoid SmartScreen:** since the March 2024 Microsoft root-program change, EV and OV certificates build SmartScreen reputation the same way (through download volume), and older guides, including some electron-builder tutorials, still claim otherwise. Certificate private keys now generally have to live on hardware or a cloud HSM, which complicates CI. A renewed certificate may reset reputation.
- **Unsigned:** free and immediate; SmartScreen's "Windows protected your PC" wall and more antivirus false positives; the updater gets no publisher check (§6).

**My recommendation:** apply to **SignPath Foundation** first if the repository's license qualifies (free, fits a public GitHub Actions pipeline), and in parallel check whether **Azure Artifact Signing** accepts your identity (US/Canada individual, or an organization). Ship the beta unsigned with an install note only if both stall; the beta label (§7.1) makes that tolerable. Whichever, reputation builds over downloads, and the first weeks may still show warnings even when signed. Keep the same signing identity across releases so reputation isn't reset.

Applying and identity verification take real calendar time, so Q1 below is the first task, not the last. The `Package` environment gets the Windows signing secrets; Create Release signs on every run, dry runs included, like the Mac job.

### 7.3 Architecture

**Decided (Q4): x64 only.** Windows-on-ARM runs x64 apps under emulation. An arm64 build would double the artifacts and make electron-updater choose a file per architecture; it can be added later.

### 7.4 Minimum Windows version

**Decided (Q13): Windows 10 or later**, Electron 44's own floor (verify when writing the site copy). Windows 7/8 users can't run the app; the site says so.

## 8. Release flow and CI

- **`package.json`:** `dist` and `test:e2e` use `env -u ELECTRON_RUN_AS_NODE`, which is Unix-only. Replace with a small Node script (`scripts/run.mts`, or `cross-env`-style but without a dependency: the variable has to be *removed*, not set to empty) and `dist` becomes per-OS (`dist:mac`, `dist:win`, with `dist` choosing from `process.platform`). `build:helper` is skipped on Windows. `test:e2e:dist` takes `FDP_APP` as the path to the packaged exe.
- **PR Gate:** add `windows-latest` to the end-to-end matrix; add its check to the `main` ruleset's required checks (a manual Settings step, per CONTRIBUTING). Unit tests keep running on Linux, which cannot catch path-separator bugs, so also run `npm test` on Windows (cheap, and it will find the first dozen assumptions).
- **Line endings:** add a `.gitattributes` (`* text=auto eol=lf`) and set Prettier `endOfLine: lf`; otherwise `prettier --check .` fails on a Windows checkout with autocrlf, and fixtures with exact byte comparisons (the Canva fixture, generated MP3s) break.
- **Create Release:** a second matrix entry (`windows-latest`, installers `dist/*.exe`, `dist/*.exe.blockmap`, `dist/latest.yml`), a Windows signing step, and the generalized `check-feed`. **Decided (Q9): always ship together.** The all-or-nothing rule stays (Publish needs every build), so a Windows signing outage blocks a Mac release too. A Mac-only release remains possible as a manual exception, by removing the Windows entry for that run; the site must still cope with a release missing one platform's asset (§4.2).
- **Release notes and CHANGELOG** need per-platform notes where behavior differs ("Windows: …"); the "Add a line under Unreleased" rule is unchanged.
- **Hardware checklist:** `pre-release-hardware.md` is macOS-shaped (Accessibility, Music permission, Finder). Add `pre-release-hardware-windows.md`; Prepare Release copies the right one(s) into the release PR.
- **`electron-builder.yml`** is currently "Packaging: a Universal macOS .dmg"; restructure with per-OS blocks and update the header.
- **Docs:** README status line, CONTRIBUTING ("Adding an OS" becomes done), AGENTS.md decisions, the main spec's "macOS-first" statements.

## 9. Everything else that differs

Grouped by how risky I think it is. "Verify" means I'm reasoning from how Electron/Windows generally behave, not from having run this app there.

### 9.1 The projector window (highest risk)

The macOS implementation encodes hard-won hardware lessons (AGENTS.md 2026-10-13/14). None of it transfers automatically.

- **Covering a display without native fullscreen.** On macOS: a borderless window with `enableLargerThanScreen`, `setAlwaysOnTop(true, 'screen-saver')` and bounds that include the menu bar. On Windows the taskbar sits above ordinary always-on-top windows on its display unless the window is fullscreen or at the `screen-saver`/`pop-up-menu` level. Probably `setFullScreen(true)` (or `kiosk`) on the target display works better on Windows, and `simpleFullscreen` doesn't exist there. Needs a spike.
- **Mixed DPI.** `setBounds` and `screen.getDisplayNearestPoint` use DIPs; a 125%/150% laptop plus a 100% projector is the normal case. Known Electron quirks with moving windows between monitors of different scale factors. `slideBox()` (the Canva `WebContentsView` overlay) and the capture window's size must be checked at 100/125/150/200%.
- **Display modes.** Windows' Win+P offers PC screen only / Duplicate / Extend / Second screen only. "Duplicate" is the laptop-mode case. The macOS-only `display-mode.swift` has a Windows counterpart in the main spec (`DisplaySwitch.exe /extend`), still post-v1; for this release the app just detects and explains.
- **Display change events, sleep/wake.** `powerMonitor` and `screen` events exist on Windows, but their timing differs (docking stations, RDP sessions, projector hot-plug often fire a burst). The existing `controller.displaysChanged()` re-check should be idempotent; test it with a burst.
- **Remove macOS workarounds from the Windows path:** `setVisibleOnAllWorkspaces(..., skipTransformProcessType)`, `app.dock`. They no-op on Windows (guards exist for the Dock) but the intent should be commented, and the `visibleOnAllWorkspaces` call should not run at all.
- **Mouse pass-through** (`setIgnoreMouseEvents(true)`) works on Windows, but the *cursor* is still visible; laptop mode's dismissal-by-mouse uses cursor polling, which is fine. Hide the cursor over the projector.
- **Display sleep/screensaver/lock** blocking: `powerSaveBlocker` is cross-platform; Windows' lock screen (Win+L) still ends playback focus. Note in the checklist.
- **Audio device:** playback goes through Chromium's default output. When HDMI/projector audio is the default after plugging in, Windows moves the default device mid-song. Document it; maybe a future output picker.

### 9.2 Menus and window chrome

- Windows (and Linux) show the menu **inside the window**, with no app menu. Roles `about`, `services`, `hide`, `hideOthers`, `unhide` are macOS-only. Restructure `menuTemplate` per platform: File (Settings…, Exit), Edit, View, Window, Help (Take the tours, Check for Updates…, About, Open Logs / Backups folder). `Settings…` accelerator `Ctrl+,` works but isn't a Windows convention (many apps use File → Options); keep the accelerator.
- **Decided (Q10): the menu bar is always visible** (no `autoHideMenuBar`). It costs about one row of height on a 1000×640 minimum window; recheck the layout (player bar, tables, the Program page's container-query breakpoints) at that size on Windows.
- `app.setAboutPanelOptions` is a macOS/Linux feature; the About item on Windows needs checking (verify; may need a small own dialog).
- Title bar: the control window uses the default frame (no `titleBarStyle`), so this works. The projector is frameless on both.
- Taskbar: `setAppUserModelId('com.folkdanceplayer.app')` already exists and must match the installer's app ID, or taskbar pinning and grouping break. Taskbar thumbnail toolbar buttons (play/pause/next) would be a nice later touch; not in scope.
- Closing the control window quits the app (`window-all-closed` already quits on non-macOS). Unchanged.

### 9.3 Wording and keyboard

- Strings: "this Mac", "the Mac's volume", "follows your Mac" (Settings → Appearance, tour), "Reveal Logs in Finder", "Reveal Library Backups in Finder". Introduce `platform.fileManagerName` ("Finder" / "File Explorer") and a neutral "your computer" elsewhere.
- Shortcuts: the key handling already accepts `metaKey || ctrlKey`. Visible copy ("⌘A / Ctrl+A") needs the right modifier shown per platform (`modifierKeyLabel`). The tours mention shortcuts in a few places.
- Right-click context menus and the ⋯ menus work on both. `Ctrl+click` on macOS vs Windows' `Ctrl+click` multi-select — `LibraryTable`/`ProgramList` use `metaKey || ctrlKey`; on macOS Ctrl+click is a right-click, so confirm Windows Ctrl+click doesn't also open the row menu.
- Fonts and glyphs: the app uses inline SVG icons (good, per the 2026-10-14 decision), but check remaining text glyphs (♪, ⋯, …, ✕, ◀◀) against Segoe UI / Segoe UI Symbol, and the Mantine font stack. The projector's large type is the place a missing glyph or different metrics would show up.
- Scrollbars on Windows are classic and take layout width (macOS overlay scrollbars don't). The virtualized tables, the drag handles and `scrollbar-gutter` need a look; so does the "Program" column's container-query breakpoints (tuned by eye on macOS; recheck, per the 2026-10-19 note).

### 9.4 Media keys and the remote

- macOS needs Accessibility trust for global shortcuts; Windows doesn't. `trusted()` already returns true off macOS. `RemoteSection` copy ("Accessibility", "set the Mac's volume") must change, and the trust-prompt UI must not appear.
- Chromium's own media-key handling is switched off today (it paused `<audio>` behind `PlayerSession`). Whether the same switches suppress Windows' System Media Transport Controls (the volume flyout's media card, Bluetooth headset buttons) and whether `globalShortcut` receives `MediaPlayPause` etc. on Windows needs a spike on hardware with the user's actual remote (the macOS spike is `docs/spikes/remote-control.md`). Some presentation remotes send Page Up/Down or F5/B rather than media keys; out of scope.

### 9.5 Files, paths and the database

- **Path model.** `files.path` is stored as-is. Windows paths are case-insensitive and may differ by drive-letter case or slash direction; `samePath` normalizes NFC/NFD (a macOS concern) but not these. Decide the canonical form (`path.normalize` + drive-letter uppercase) and make the unique index and "same path" matching agree. Apple sync's NFC/NFD logic is irrelevant but harmless.
- **Long paths and odd locations:** Node handles `\\?\` paths, but verify a >260-character path imports and plays; test a UNC share (`\\nas\music`) and a mapped drive; network drives that are offline at launch must produce the existing "missing" state, not a hang (`stat` with a timeout?).
- **Removable/changed drive letters:** a USB stick becomes `E:` today and `F:` tomorrow; every song reads as missing. Same as moving files on a Mac, but much more common on Windows laptops. **In scope (decided, Q5):** a "relocate songs" tool (a path-prefix remap with a preview of how many files it would find), shared by the Library.xml import and the everyday "I moved my music" case. It belongs in this release and in its own plan.
- **Hidden-file rules.** `scan.ts` skips names starting with `.` (macOS resource forks). On Windows also skip entries with the hidden/system attribute, `$RECYCLE.BIN`, `System Volume Information` (readdir errors are already swallowed), and `Thumbs.db` is harmless.
- **File locking.** Windows won't delete or rename an open file. `AttachmentStore` replaces/deletes PDFs and images and the media protocol streams audio and images; the startup backup (`VACUUM INTO`) writes a new file; log rollover renames. Each needs checking against `EBUSY`/`EPERM`, plus antivirus scanning briefly holding new files. Retry-with-backoff on delete/rename is the usual cure.
- **SQLite:** `node:sqlite` is the same engine. WAL mode on a roaming profile or network home folder is risky (WAL needs shared memory; it fails on some network filesystems). Electron's default `userData` on Windows is `%APPDATA%` (Roaming), which in managed environments (schools, community centers) can be a network-synced profile, and our folder holds a database plus copies of images/PDFs. **Decided (Q11): the Windows data folder is `%LOCALAPPDATA%\Folk Dance Player`**, set with `app.setPath('userData', …)` before the app is ready, in the same place `userDataOverride` (`src/main/user-data.ts`) already chooses folders; `FDP_USER_DATA` still wins and the dev folder rule is unchanged. This must be settled before the first release, because moving real libraries later needs a migration. The logs folder follows `userData`.
- **Drop from Explorer:** the renderer gets dropped files' paths via Electron's file-path API; behaves the same, but test dragging from Explorer, from a OneDrive-synced folder (placeholder files that are cloud-only: `stat` succeeds, reads trigger a download) and from a compressed ZIP.
- **Reveal and open:** `shell.openPath` on a PDF opens the default handler (Edge or Acrobat); fine. Reveal-logs becomes File Explorer.
- **Log and data locations:** `~/Library/Logs/Folk Dance Player` in comments and the main spec becomes `%APPDATA%\Folk Dance Player\logs` (Electron's `app.getPath('logs')` already resolves per OS). The dev folder `Folk Dance Player (dev)` rule (2026-10-29) is unchanged.
- **Case-insensitive filesystem tests:** the unit tests that build temp trees must not rely on case sensitivity; run `npm test` on Windows to find them.

### 9.6 Audio formats

Chromium plays MP3, AAC/M4A, FLAC, WAV, OGG/Opus on Windows as on macOS. Unplayable: ALAC (already flagged), AIFF (already), and **WMA**, which is already in the unsupported list but likely to show up often in older Windows libraries (iTunes-for-Windows and other older collections). Make sure the "unsupported format" summary on import is clear and offers the file list, since a Windows user may find a sizeable share of their tunes flagged.

### 9.7 Canva

Same sandboxed session code; only the off-screen capture and the live cover depend on display scale. Capture size in device pixels under 125%/150% scaling must produce images the projector can use at any scale; the live view was tuned against a macOS throttling quirk (hidden `WebContentsView` throttled, hence the cover). Whether Windows throttles occluded views the same way is unknown. Test the hardware path with a real deck.

### 9.8 Uninstall, data and privacy

Uninstall leaves the library (§7.1). The site and README should say where it lives and how to move it. No telemetry exists and none is added.

### 9.9 Accessibility and system settings

High-contrast themes, system text scaling, and the system dark/light switch (`nativeTheme` follows it on Windows too) — the Appearance setting works unchanged; test forced-colors rendering of the projector at least once.

## 10. Test strategy

1. **Unit:** the capability module; the tour's step lists per platform; the menu template per platform; `check-feed` for both feeds; path canonicalization; the site's detection function (extract it so it can be tested in Vitest with sample UA strings).
2. **End-to-end:** on `windows-latest` (real) and on macOS with `FDP_PLATFORM=windows` (fast feedback for UI). Display-dependent specs can't run on a headless runner; they stay hardware checks.
3. **Packaged:** `npm run test:e2e:dist` against the installed or unpacked Windows build, as on macOS.
4. **Hardware checklist** (Windows, new): install on a clean user, SmartScreen behavior, first launch, tour, import from Explorer drag, projector on a real second display at mixed DPI, unplug/replug, sleep/wake, media keys on the real remote, update from the previous release (needs two published Windows releases or the local-feed rehearsal), uninstall/reinstall keeps the library.
5. I will ask before any hands-on test that needs you at the screen.

**Test hardware (Q2):** a Windows desktop with a TV as the second display. That stands in for laptop + projector well (extend, duplicate, unplug/replug by switching the TV input, HDMI audio moving the default device). It cannot cover: a laptop's lid and internal panel, sleep/wake on battery, and docking-station display bursts. Those stay on the checklist as "not covered; ask a beta user". Pick the TV's scaling deliberately (a 4K TV at 100% against a 1080p monitor at 125% is a good mixed-DPI case).

## 11. My calls (change any of these)

- Platform differences go in one `platform.ts` capability module with an `FDP_PLATFORM` test override (§3.1).
- Site: no-JS shows everything; detection only picks emphasis (§4).
- Rebase onto `main` after the updater merges, and do site work from `main`.
- Mac-only features are hidden on Windows, not greyed out (consistent with how sync already works).
- The signing recommendation in §7.2 (SignPath first if the license qualifies, Azure in parallel).

## 12. Questions

### Answered

| # | Decision |
| --- | --- |
| Q2 | Test hardware: a Windows desktop with a TV as second display (§10). No laptop. |
| Q3 | MITPlayer importer: **dropped** — its data file is a headerless CSV and the fields would be guesses (§5). |
| Q4 | x64 only (§7.3). |
| Q5 | Keep the Library.xml import on Windows, and build a shared "relocate songs" tool in this release (§3.3, §9.5). |
| Q6 | Hide the Apple Music sections entirely from Windows visitors on the site (§4.2). |
| Q7 | Retake the site's screenshots on Windows (§4.2). |
| Q8 | Per-user NSIS install, desktop shortcut on by default; no all-users option (§7.1). |
| Q9 | Always ship Mac and Windows together (§8). |
| Q10 | Menu bar always visible (§9.2). |
| Q11 | Windows data lives in `%LOCALAPPDATA%\Folk Dance Player` (§9.5). |
| Q12 | First Windows release is labeled "Windows (beta)" and shares the next minor version (§7.1). |
| Q13 | Windows 10 or later (§7.4). |
| Q15 | Audience: MITPlayer users and general organizers equally. With the importer dropped, projector reliability and parity lead the work (§13). |

### Still open

1. **Signing (Q1, §7.2).** Research is in §7.2. Your move: check the repository has an OSI-approved `LICENSE` and, if so, apply to SignPath Foundation; check whether your Azure account type and country qualify for Artifact Signing. Which route do you want to pursue first? (Calendar time: start now.)
2. **Scope check (Q14, §9).** Anything in §9 you'd cut or pull forward (a taskbar play/pause toolbar, an audio-output picker for projector audio, a WMA hint)? Default if you say nothing: all of §9 stays as verification work, none of the "nice later" items are built.

## 13. Order of work (proposal, before the plan)

1. Start now, in parallel with everything else: the **signing application** (§7.2), which has waiting time outside our control.
2. Spikes, in parallel, on the Windows desktop + TV: the projector window (§9.1) and media keys (§9.4). Each writes `docs/spikes/*.md`; the results decide the plan.
3. The capability module, the Windows menu, wording, and the tour changes, tested on macOS with `FDP_PLATFORM=windows`.
4. Cross-platform scripts, `.gitattributes`, Windows in the PR Gate (unit + e2e), fixing what that finds (paths, locking, the `%LOCALAPPDATA%` data folder).
5. Relocate songs (shared tool) as its own plan.
6. Packaging: NSIS, icon, resources, signing, the generalized `check-feed`, Create Release matrix, a dry run.
7. Updater verification (local-feed rehearsal, then a real two-release check).
8. Site changes (from `main`), after the first Windows installer exists, with Windows screenshots.

Each of 3–8 becomes a plan under `docs/superpowers/plans/` when reached, as is the habit here.
