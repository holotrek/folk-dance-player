# In-place updates — Design

- **Date:** 2026-11-01
- **Status:** Built (Plan 23, `docs/superpowers/plans/2026-11-01-plan-23-in-place-updates.md`), apart from the maintainer's signed rehearsal (§8, layer 4).
- **Extends:** `2026-10-13-folk-dance-player-electron-design.md` (§9 Packaging, §13.4 Releases)
- **Ships:** 0.3.0 (the maintainer's wish), as the last change before the release PR

## 1. Purpose

Today a new version means telling people to download the `.dmg` and drag the app over the old one.
The maintainer wants to stop having to explain that: an installed copy should find a new release by
itself, download it in the background, say so in a banner, and replace itself when the person
presses **Restart to Update**.

### Decided (the maintainer's, 2026-11-01)

- Download in the background; show a banner at the top when an update is available; the banner has
  a **Restart to Update** button.
- It looks at the GitHub Releases page by itself; nobody types a URL.
- Showing the banner while music plays or the projector is up is fine.
- The real swap of the app is verified by the maintainer on their own Mac, with a signed local
  rehearsal (§8, layer 4).

### Goals

1. A copy of the app that is 0.3.0 or newer finds, fetches and installs later releases with two
   clicks at most (the banner's button, then nothing).
2. Nothing about an update ever interrupts the music or the projector on its own.
3. A release can never go out in a state that would strand installed copies (a missing or wrong
   update file is caught before publishing).

### Non-goals

- Updating copies older than the first release that contains this. Anyone on 0.2.0 installs 0.3.0
  by hand once; that is unavoidable, since 0.2.0 has no updater.
- Windows or Linux. The release matrix is macOS-only today; the design leaves room (§5), nothing
  more.
- Release channels, prereleases, downgrades, or a changelog viewer in the app.
- A progress bar. The banner appears when the update is ready (§3).
- Delta updates. electron-builder writes the blockmap that makes them possible, and the updater
  uses it when it can; nothing is built around it.

### Anti-goals

- The app must never restart, quit or relaunch itself without the person pressing the button
  (installing when they quit is their own quit, §3).
- A failed check, a bad network or a bad feed must never show an error to someone who didn't ask.
- No change to the projector's path while music plays (the main spec's rule on network requests
  there): updates are checked and downloaded by the main process in its own time, and nothing
  touches the projector window.
- An unsigned or differently signed build must never be installed over the app (macOS enforces
  this, §2).

## 2. How it works

**The library.** `electron-updater`, from the same project as `electron-builder` (which builds the
releases already). It sits on Electron's own macOS updater, Squirrel.Mac. It is a runtime
dependency, so it is bundled with the app, pinned to an exact version at least two weeks old
(AGENTS.md); the newest one that old on 2026-11-01 is **6.8.10**, and 6.8.11 qualifies from
2026-11-03.

**The feed.** The repository is public, so `electron-updater`'s GitHub provider reads the newest
release's `latest-mac.yml` with no token: the version, the zip's file name and its sha512. The
provider and repository are written into the app at build time (`publish:` in
`electron-builder.yml`, which electron-builder turns into `app-update.yml` inside the app's
resources). The `.dmg` stays what people download for a first install; macOS updates use a **zip**
of the same app, so each release carries both.

**The swap.** The updater downloads the zip, checks its sha512 against the yml, then hands it to
Squirrel.Mac, which verifies that the new app is signed by the same identity as the running one
and, on restart, replaces the app bundle and relaunches. This is why updates need the Developer ID
signature the releases already have, and why they do not work in a development run or an ad-hoc
signed build.

**When it checks.** Once shortly after launch and then every four hours while the app stays open
(a session may run all evening). Never in a development run, never during a tour (§4), never when
the setting is off.

## 3. The behavior

### 3.1 States

Main owns the state (AGENTS.md), and broadcasts it as `updates:state`:

| State | Meaning | Shown |
|---|---|---|
| `idle` | Nothing known, or up to date | nothing |
| `checking` | A check is running | nothing (Help → Check for Updates… shows it) |
| `downloading` (version) | An update was found and is downloading | nothing |
| `ready` (version) | Downloaded, verified, waiting for a restart | the banner |
| `error` (message) | The last check or download failed | nothing, except after a manual check |

### 3.2 The banner

A slim bar at the top of the window, above the tabs (the tour's practice-library banner sits in the
same place and the two never show together):

> **Version 0.3.1 is ready.**   [Restart to Update]   [✕]

- **Restart to Update** installs and relaunches. **My call:** if a song is playing or a countdown is
  running, it asks first ("Music is playing. Restart anyway?", Restart / Keep playing), reusing
  `ConfirmDialog`. It never asks otherwise.
- **✕** hides the banner for this run only (not remembered); it returns at the next launch if the
  update is still pending. Another, newer update re-shows it.
- It appears only when the update is `ready`: it never says "available" while a file is still
  arriving, so the button always works.
- The banner works the same with the projector up and while music plays (the maintainer's call).

### 3.3 Installing at quit

**My call:** if an update is `ready` and the person quits the app by any other means (⌘Q), the
update installs as the app closes, so the next launch is the new version. This is
`electron-updater`'s `autoInstallOnAppQuit`, left on: it is the person's own quit, and "I never have
to tell anyone how to upgrade" depends on updates actually landing. It takes a few seconds at quit.

### 3.4 Help → Check for Updates…

**My call:** in the **app menu**, under About (the macOS convention; the tours are in Help because
they are help). It runs a check now and answers in a small dialog: "You have the latest version
(0.3.0).", "Version 0.3.1 is downloading… it will appear in the banner when ready.", "Version 0.3.1
is ready" (with the same Restart button), or the error's message, in plain words (the only place an
error is shown, because the person asked). In a development run it says "Updates only work in the
installed app."

### 3.5 The setting

**My call:** Settings gets one switch, **Check for updates automatically** (default on), saved as
the `updates.check` setting. Off means no automatic checks or downloads; Check for Updates… still
works. This keeps an organizer in control on, say, a metered connection at a venue, at the cost of
one more setting; it is the only one.

## 4. Where it must stay out of the way

- **Development runs** (`app.isPackaged` is false): inert, unless `FDP_UPDATE_URL` is set (§7).
- **A tour:** the practice context is inert for everything external (AGENTS.md). Checks, downloads
  and the Restart button are not run for a touring window, and the banner is hidden. The service
  keeps its state meanwhile, so a pending update shows when the tour ends.
- **A running import or sync** does not matter: installing happens on restart or quit, and a quit
  during an import already works the way it does today.
- **Failure** of any kind is logged (the app's logger, which never throws) and otherwise silent.

## 5. The pieces

Following the codebase's shape: a pure service over an injected port, one Electron adapter.

- `src/shared/updates.ts` — `UpdateState` (the table above), `UPDATE_CHECK_MS`.
- `src/main/updates/update-service.ts` — `UpdateService` over an `Updater` port (`check()`,
  `onDownloaded`, `onError`, `quitAndInstall()`, `isEnabled()`), with injected timers and logger.
  Holds the state, schedules the checks, never throws. Pure; unit-tested.
- `src/main/updates/electron-updater.ts` — the one file that imports `electron-updater`: builds the
  `Updater`, sets `autoDownload = true`, `autoInstallOnAppQuit = true`, `allowPrerelease = false`,
  `allowDowngrade = false`, and `forceDevUpdateConfig` plus a generic feed when `FDP_UPDATE_URL`
  is set.
- `src/main/ipc/update-handlers.ts` — channels `updates:getState`, `updates:check` (returns the
  resulting state), `updates:install`; event `updates:state`. Added to `src/shared/contract.ts`.
- `src/main/menu.ts` — **Check for Updates…** in the app menu.
- `src/renderer/src/updates/UpdateBanner.tsx` (+ `.module.css`) and a small store/hook; mounted in
  `App` above the tabs next to the tour banner.
- `src/renderer/src/pages/SettingsPage.tsx` — the switch. `src/shared/settings.ts` — `updates.check`
  (boolean, default true).
- **Windows later:** a second matrix entry and its `latest.yml`; the service and banner are
  platform-neutral. Nothing else is done now.

## 6. The release pipeline

- `electron-builder.yml`: `mac.target` gains `zip` (universal) beside `dmg`; a `publish:` block names
  the GitHub provider, owner and repository. `npm run dist` still passes `--publish never`; the
  first task confirms that electron-builder still writes `latest-mac.yml` and the zip's blockmap
  into `dist/` with it. If it does not, a `generateUpdatesFilesForAllChannels`-style flag or a
  small script writes the yml instead; the plan settles it.
- Create Release's build job uploads `dist/*.dmg`, `dist/*.zip`, `dist/*.zip.blockmap` and
  `dist/latest-mac.yml`; the Publish job passes them all to `gh release create`, so the release is
  still all or nothing.
- `scripts/release.mts` gets a pure, unit-tested **`check-update-feed`**: the yml's `version` equals
  `package.json`'s and the tag's, the yml names a file that exists, and that file's sha512
  (base64, as electron-updater writes it) matches. The build job runs it on every run, **dry runs
  included**, so a wrong feed shows up before a real release.
- The prepare-release/CHANGELOG rules do not change.

## 7. Configuration for testing

`FDP_UPDATE_URL` (a generic feed's directory URL) points the updater at a local server instead of
GitHub. It is read only in main, and only to build the feed; it is the same idea as
`FDP_USER_DATA`. It is safe to ship: Squirrel.Mac still refuses an app that is not signed by the
running app's identity, and the checksum still has to match, so a wrong feed can fail an update but
not install a foreign build. With it set, a development run may check and download too (the
install step still needs a signed app). **As built:** the updater's download step also reads `app-update.yml` for its cache folder, which a development run lacks, so with `FDP_UPDATE_URL` set the adapter writes a generic-provider config file to the temp folder and points the library's test-only `updateConfigPath` at it. The end-to-end specs showed a development run reaches `ready` this way, so layer 3 asserts the banner.

## 8. Testing and verification

Four layers; the first three run in CI, the fourth is the maintainer's.

1. **Unit tests** (Vitest, no network): the service's state machine and schedule with a fake
   `Updater` and fake timers — check on start and every `UPDATE_CHECK_MS`; found → downloading →
   ready; error → logged and silent; disabled in development, in a tour and with the setting off;
   a manual check answers each case in §3.4; `install` while idle does nothing. Handlers and the
   menu item over the fakes. The banner component (appears on `ready`, Restart calls
   `updates:install`, the playing-music question, ✕ hides it until a newer version, hidden during a
   tour) and the Settings switch, with the fake API.
2. **`check-update-feed` unit tests**: good feed; wrong version; missing file; wrong checksum; a
   yml for another tag.
3. **End-to-end (Playwright)**: serve a fake `latest-mac.yml` and a small zip from a local server,
   launch the dev app with `FDP_UPDATE_URL`, and see the real check, download and checksum
   verification end in the banner, **Restart to Update** visible, and Help → Check for Updates…
   answering "up to date" against a feed at the current version. A feed with a bad checksum ends
   with no banner. This cannot press the button for real (the swap needs a signed app); it stops at
   the call to install, which a stub counts.
4. **The signed rehearsal (hardware checklist, the maintainer):** build two Developer ID-signed,
   notarized versions with CONTRIBUTING.md's steps — the real 0.3.0 and a throwaway 0.3.1 whose only
   difference is the version — and serve 0.3.1's zip and yml from localhost. Install 0.3.0, open it
   with `open --env FDP_UPDATE_URL=http://localhost:8123 <app>`, and check: the banner appears
   without a restart, a song playing keeps playing, **Restart to Update** asks about the playing
   song, then the app relaunches as 0.3.1 with the library intact; ⌘Q with a ready update installs
   at quit; Check for Updates… says "up to date" afterwards. This is the only proof of the swap and
   goes in `docs/manual-testing/pre-release-hardware.md`.

The first update from a published release is 0.3.0 → 0.3.1 (or the next); the rehearsal is the
stand-in for it, and the first real update is worth watching.

## 9. Risks

- **The swap fails on a real Mac** (signature requirement, a quarantine flag, a read-only
  location): found only by layer 4; the app stays on the old version, and the person can still
  install the `.dmg` by hand. The failure is logged and shown by Check for Updates….
- **`--publish never` skips the yml:** found by the first task and fixed in §6; not found by a
  user.
- **A bad release strands installed copies** (a release without its zip): `check-update-feed`
  and the all-or-nothing Publish job prevent it; if one ships anyway, installed copies simply see
  no update until the next, correct release.
- **The app is run from a read-only place** (a mounted `.dmg`, not Applications): Squirrel.Mac
  cannot replace it. The Check for Updates… message names this case ("Move the app to Applications
  to update it").
- **Size:** the Universal zip is about 230 MB per update. Background download only; the blockmap
  lets the updater fetch less when it can.

## 10. Documentation to update

- **AGENTS.md:** a decision — why `electron-updater` over Electron's built-in updater or
  `update-electron-app` (it reads the Releases page directly and is already from the builder's
  project); the banner-on-ready rule and never restarting by itself; the signing requirement; the
  feed check; `FDP_UPDATE_URL`.
- **CHANGELOG.md:** a line under Unreleased in the same commit as each user-facing change.
- **CONTRIBUTING.md:** the release now ships a zip and `latest-mac.yml`; the rehearsal steps.
- **Main spec:** §9 Packaging and §13.4 Releases.
- **Hardware checklist:** layer 4, and a first-run note for the first published update.
- **README.md:** how to update (in the release bump PR, as the other README changes).

## 11. Left to the builder

The exact class and file names beyond §5; `electron-updater`'s option names as its types give them;
the banner's styling (a Mantine `Alert` or `Paper` strip with a CSS module); the check's initial
delay (about 20 seconds after launch, so startup is not slowed); how the e2e feed server is written;
the small details of the Check for Updates… dialog's wording.
