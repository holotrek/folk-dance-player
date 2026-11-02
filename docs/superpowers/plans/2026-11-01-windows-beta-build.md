# Windows Beta Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An unsigned Windows installer (`npm run dist` on a Windows machine) that installs per-user, starts, shows no Mac-only features or wording, and keeps its library in `%LOCALAPPDATA%`, so the maintainer can test it on a Windows box.

**Architecture:** One platform module (`src/shared/platform.ts`) decides what differs; main resolves the platform once and tells the renderer through `app:getInfo`. The menu, tour, wording, data folder and projector window read from it. Build scripts become cross-platform Node scripts, and electron-builder gets a Windows NSIS target.

**Tech Stack:** Electron 44, electron-builder 26.17 (NSIS), TypeScript, Vitest, React/Mantine, Node 24 running `.mts` scripts directly.

**Spec:** `docs/superpowers/specs/2026-11-01-windows-release-design.md` (this plan is its first slice: §3, §7.1, §8 scripts, §9.2, §9.3, §9.5 data folder; signing, CI matrix, the generalized update feed check, the site and relocate-songs are later plans).

## Global Constraints

- Platform differences live in `src/shared/platform.ts` only; no new `process.platform` checks elsewhere except the one that calls `platformFrom` (spec §2 anti-goals).
- `FDP_PLATFORM` is honored only when the app is **not** packaged (spec §3.1).
- Mac-only features are hidden on Windows, not greyed out (spec §11).
- Windows install is **per-user NSIS**, desktop shortcut on, `deleteAppDataOnUninstall: false`, x64 only, artifact name `Folk-Dance-Player-Setup-${version}.exe` (no spaces) (spec §7.1, Q4, Q8).
- Windows data folder is `%LOCALAPPDATA%\Folk Dance Player`; `FDP_USER_DATA` still wins; the unpackaged dev folder rule is unchanged (spec §9.5, Q11).
- Menu bar stays always visible (no `autoHideMenuBar`) (Q10).
- Windows 10 or later; first release is labeled "Windows (beta)" (Q12, Q13).
- Windows tour text must not contain "Apple", "Mac", "Finder" or "⌘" (spec §3.4).
- UI uses Mantine; custom CSS only in `*.module.css`. Tests first (Vitest). Conventional commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Add a `CHANGELOG.md` line under `Unreleased` for the user-facing change, and an AGENTS.md decision (Task 8).
- No new dependencies.

## Review Focus

- A packaged build launched with `FDP_PLATFORM=windows` in the environment must still behave as the real platform (Task 1 test).
- `LOCALAPPDATA` unset or empty on Windows must fall back to Electron's default folder, never a relative path (Task 3 test).
- The Windows practice library has no Apple mirrors, and every step of the Windows tours targets something that exists there — no step may wait on a playlist or folder that isn't present (Task 2 tests).
- The Windows menu contains no macOS-only roles (`about`, `services`, `hide`, `hideOthers`, `unhide`) and still has Quit and Check for Updates… (Task 4 test).
- Paths with spaces (`Folk Dance Player.exe`, a Windows user name with a space) in the dist and packaged-e2e scripts (Task 6 test).

---

### Task 1: The platform module

**Files:**
- Create: `src/shared/platform.ts`
- Test: `tests/shared/platform.test.ts`
- Modify: `src/shared/contract.ts` (`AppInfo` gains `platform: Platform`), `src/main/index.ts` (the `appInfo` dependency passes it), `tests/renderer/fake-api.ts` (`app:getInfo` answers `platform: 'mac'`), any other fake of `AppInfo` the typecheck finds.

**Interfaces:**
- Produces:
  ```ts
  export type Platform = 'mac' | 'windows' | 'linux'
  export interface Capabilities {
    platform: Platform
    appleMusicSync: boolean // true only on 'mac'
    mediaKeyTrust: boolean // macOS asks for Accessibility; true only on 'mac'
    fileManager: 'Finder' | 'File Explorer' | 'file manager'
    computer: 'Mac' | 'computer' // 'Mac' on mac, 'computer' elsewhere
  }
  export function platformFrom(nodePlatform: string, env: NodeJS.ProcessEnv, isPackaged: boolean): Platform
  export function capabilitiesFor(platform: Platform): Capabilities
  ```
  `platformFrom` maps `'darwin'→'mac'`, `'win32'→'windows'`, anything else `'linux'`. An `FDP_PLATFORM` of `mac|windows|linux` replaces the result only when `isPackaged` is false; anything else is ignored.

- [ ] **Step 1: Write the failing tests** in `tests/shared/platform.test.ts`: `platformFrom('darwin', {}, true)` is `'mac'`; `'win32'` is `'windows'`; `'freebsd'` is `'linux'`; `platformFrom('darwin', { FDP_PLATFORM: 'windows' }, false)` is `'windows'`; **`platformFrom('darwin', { FDP_PLATFORM: 'windows' }, true)` is `'mac'`**; `FDP_PLATFORM: 'beos'` is ignored; `capabilitiesFor('windows')` equals `{ platform: 'windows', appleMusicSync: false, mediaKeyTrust: false, fileManager: 'File Explorer', computer: 'computer' }`; `capabilitiesFor('mac')` has `appleMusicSync: true`, `mediaKeyTrust: true`, `'Finder'`, `'Mac'`; linux has `'file manager'`.
- [ ] **Step 2: Run** `npx vitest run tests/shared/platform.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/shared/platform.ts` per the Interfaces block; add `platform` to `AppInfo` and populate it in `index.ts` with `platformFrom(process.platform, process.env, app.isPackaged)` computed once at module top (export nothing new from index.ts; later tasks use the same constant).
- [ ] **Step 4: Run** `npx vitest run tests/shared/platform.test.ts` and `npm run typecheck` — expect PASS / no errors.
- [ ] **Step 5: Commit** `feat: a platform module for what differs between systems`.

### Task 2: The renderer knows the platform; the tours follow it

**Files:**
- Create: `src/renderer/src/platform.tsx` (`PlatformProvider`, `usePlatform`), `src/renderer/src/tour/resolve.ts`
- Modify: `src/renderer/src/tour/steps.ts`, `basic-steps.ts`, `advanced-steps.ts`, `TourProvider.tsx`, `src/renderer/src/main.tsx` (mount the provider; also in the test render helper), `src/main/tour/demo-library.ts`, `src/main/tour/practice-context.ts`, `src/main/index.ts`
- Test: `tests/renderer/tour-platform.test.ts`, `tests/main/tour/demo-library.test.ts` (extend the existing one if present, else create)

**Interfaces:**
- Consumes: `Capabilities`, `capabilitiesFor` (Task 1); `app:getInfo` returning `platform`.
- Produces:
  - `usePlatform(): Capabilities` — `PlatformProvider` calls `api.invoke('app:getInfo')` once and **renders nothing until it answers** (no wrong-platform flash); the test render helper supplies the Mac capabilities synchronously.
  - In `steps.ts`: `TourStep.body: string | ((caps: Capabilities) => string)` and `TourStep.when?: (caps: Capabilities) => boolean` (default: always).
  - `resolveSteps(steps: TourStep[], caps: Capabilities): ResolvedStep[]` in `tour/resolve.ts`, where `ResolvedStep` is `Omit<TourStep, 'body' | 'when'> & { body: string }`: drops steps whose `when` is false and calls function bodies. `TourProvider` applies it to `stepsFor()`'s result using `usePlatform()`; the overlay keeps receiving plain-string bodies (change its step type to `ResolvedStep`).
  - `buildDemoLibrary(dir: string, tuneDir: string, opts?: { appleMirrors?: boolean }): DemoLibrary` — `appleMirrors` defaults to `true`; when false the `Festival 2026` folder and `Balkan night` mirror are not created. `PracticeOptions` gains `appleMirrors: boolean`, passed from `index.ts` as `capabilities.appleMusicSync`.

- [ ] **Step 1: Write failing tests.**
  - `demo-library`: with `{ appleMirrors: false }` no playlist named `Balkan night` and no folder `Festival 2026` exists; default still has both.
  - `tour-platform.test.ts`: `resolveSteps` drops a step with `when: () => false` and resolves a function body; for `capabilitiesFor('windows')`, every resolved step of `BASIC_STEPS` and `ADVANCED_STEPS` has `title` and `body` free of `/Apple|Mac\b|Finder|⌘/`; no Windows step has a `target` starting `sidebar.folder:` or `sidebar.playlist-options:Balkan night`, and none whose `done` reads the `Balkan night` playlist; for `capabilitiesFor('mac')` the resolved list equals today's list text-for-text (snapshot the Mac bodies before changing them).
- [ ] **Step 2: Run** `npx vitest run tests/renderer/tour-platform.test.ts tests/main/tour` — expect FAIL.
- [ ] **Step 3: Implement.** In `basic-steps.ts` make `basic.import`'s body a function: on `appleMusicSync` it is today's text; otherwise the same text without the Apple Music sentence. In `advanced-steps.ts`: `advanced.playlists` body is a function dropping the "Playlists from Apple Music are marked…" paragraph when `!appleMusicSync`; `advanced.open-folder` and `advanced.mirror` get `when: (c) => c.appleMusicSync`; `advanced.settings-appearance` body says `follows your ${caps.computer}`. Fix any other step the wording test flags the same way.
- [ ] **Step 4: Run** `npx vitest run` for the tour and renderer projects, then `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: the tours follow the platform; no Apple Music steps on Windows`.

### Task 3: The Windows data folder

**Files:**
- Modify: `src/main/user-data.ts`, `src/main/index.ts:81`
- Test: `tests/main/app/user-data.test.ts`

**Interfaces:**
- Produces: `userDataOverride(env: NodeJS.ProcessEnv, isPackaged: boolean, appData: string, platform: Platform): string | undefined`. Unchanged for `FDP_USER_DATA` (wins) and for unpackaged runs (`<appData>/Folk Dance Player (dev)`). New: packaged and `platform === 'windows'` returns `join(env.LOCALAPPDATA, 'Folk Dance Player')` when `LOCALAPPDATA` is a non-empty **absolute** path, else `undefined`. Packaged on other platforms: `undefined`.

- [ ] **Step 1: Write failing tests** (use `path.win32`-independent assertions: build expected values with `join`): packaged Windows with `LOCALAPPDATA: '/home/u/AppData/Local'` ends with `Folk Dance Player`; **empty and missing `LOCALAPPDATA` give `undefined`; a relative `LOCALAPPDATA: 'AppData'` gives `undefined`**; `FDP_USER_DATA` still wins on Windows; packaged mac unchanged (`undefined`); unpackaged Windows still returns the dev folder.
- [ ] **Step 2: Run** `npx vitest run tests/main/app/user-data.test.ts` — expect FAIL.
- [ ] **Step 3: Implement**; `index.ts` passes the platform constant from Task 1. Update the comment above the function (and the `~/Library/Logs` comment in `index.ts:84`) to say where logs live per platform.
- [ ] **Step 4: Run** the same test and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: Windows keeps its library in %LOCALAPPDATA%`.

### Task 4: The Windows menu

**Files:**
- Modify: `src/main/menu.ts`, `src/main/index.ts` (menu construction at ~line 500 and the About handling)
- Test: `tests/main/app/menu.test.ts`

**Interfaces:**
- Consumes: `Capabilities` (Task 1).
- Produces: `menuTemplate` input gains `caps: Capabilities` (replacing `appleSync: boolean`; the Apple File item shows iff `caps.appleMusicSync`) and `showAbout: () => void`. For `caps.platform === 'windows' | 'linux'` the template is: **File** (`Settings…` with `CmdOrCtrl+,`, separator, `{ role: 'quit' }` labeled Exit), **Edit** (`editMenu`), **View** (as today), **Window** (`{ role: 'minimize' }` only — still no Close Window, spec comment in the file), **Help** (the two tours, separator, `Check for Updates…`, `About Folk Dance Player` → `showAbout`, separator, `Show Logs in ${caps.fileManager}`, `Show Library Backups in ${caps.fileManager}`). macOS template is unchanged except the two reveal labels use `caps.fileManager`.
- `showAbout` in `index.ts` calls `dialog.showMessageBox(mainWindow, { type: 'info', title: 'About Folk Dance Player', message: 'Folk Dance Player', detail: `Version ${app.getVersion()}\n© 2026 Evan Kaiser\nFor folk dance organizers. Inspired by MITPlayer.` })`.

- [ ] **Step 1: Write failing tests:** walking the Windows template recursively, no item has `role` in `about|services|hide|hideOthers|unhide|windowMenu`, one has `role: 'quit'`, a `Check for Updates…` item exists under Help and calls `checkForUpdates`, no item labeled with "Apple"; About calls `showAbout`; reveal labels read "Show Logs in File Explorer"; the mac template still has `about` and the Apple item when `appleMusicSync` and keeps "Finder" in its labels.
- [ ] **Step 2: Run** `npx vitest run tests/main/app/menu.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** and update the two existing callers/tests of `menuTemplate` for the new input shape.
- [ ] **Step 4: Run** the menu test and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: a Windows menu`.

### Task 5: Wording, remote and projector window on Windows

**Files:**
- Modify: `src/renderer/src/components/RemoteSection.tsx`, `src/renderer/src/pages/SettingsPage.tsx` (any "Mac" copy), `src/renderer/src/import/AppleOptionsStep.tsx:22`, `src/renderer/src/use-online.ts` (comment only), `src/main/index.ts` (the `trusted` helper, `setVisibleOnAllWorkspaces`, the `app.dock` guards, `powerMonitor` resume)
- Test: `tests/renderer/platform-wording.test.tsx`

**Interfaces:**
- Consumes: `usePlatform()` (Task 2), `capabilitiesFor` (Task 1).

- [ ] **Step 1: Write failing tests** (render with the Windows capabilities): `RemoteSection` never shows "Accessibility", "Mac" or "System Settings", and says "computer" where it mentioned the volume; the Apple options step reads "with files on this computer"; with Mac capabilities the old wording is unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/renderer/platform-wording.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** the wording from `caps.computer`. In `index.ts` replace the four `process.platform === 'darwin'` checks with the Task 1 constant / capabilities (`trusted` returns `true` unless `caps.mediaKeyTrust`; the macOS-only `setVisibleOnAllWorkspaces` call and the dock calls run only when `platform === 'mac'`; `window-all-closed` quits unless mac). Leave the projector window's other behavior untouched: the Windows taskbar/DPI behavior is a hardware spike (spec §9.1), not guessed here.
- [ ] **Step 4: Run** the test, the full renderer project, and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: Windows wording; macOS-only window calls only on macOS`.

### Task 6: Cross-platform scripts

**Files:**
- Create: `scripts/run.mts` (strips `ELECTRON_RUN_AS_NODE`, then runs the rest of `argv` as a command, forwarding the exit code; `shell: true` on Windows), `scripts/dist.mts`, `.gitattributes`
- Modify: `package.json` scripts, `e2e/app.ts:34`, `.prettierrc.yaml`
- Test: `tests/scripts/dist.test.ts`

**Interfaces:**
- Produces in `scripts/dist.mts` (exported pure functions, with the CLI guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` like `release.mts`):
  ```ts
  export function distSteps(platform: NodeJS.Platform): string[][] // argv lists, run in order
  export function packagedApp(platform: NodeJS.Platform): string // path to the unpacked app/exe
  ```
  `distSteps('darwin')` is `[['npm','run','build'],['npm','run','build:helper'],['npx','electron-builder','--mac','--publish','never']]`; `'win32'` is the same without the helper step and with `--win`; other platforms throw `Error('No installer for <platform>')`. `packagedApp('darwin')` is `dist/mac-universal/Folk Dance Player.app`; `'win32'` is `dist/win-unpacked/Folk Dance Player.exe`.
- `package.json`: `dev`, `start`, `test:e2e`, `icon` run through `node scripts/run.mts …`; `dist` is `node scripts/dist.mts`; `test:e2e:dist` is `node scripts/run.mts node scripts/e2e-dist.mts` or equivalent that sets `FDP_APP` to `packagedApp(process.platform)` before `playwright test`. `e2e/app.ts` derives the executable: on a `.app` the existing `Contents/MacOS/<name>` path, otherwise `FDP_APP` itself.
- `.gitattributes`: `* text=auto eol=lf`; `.prettierrc.yaml` gains `endOfLine: lf`.

- [ ] **Step 1: Write failing tests** in `tests/scripts/dist.test.ts`: the two `distSteps` lists exactly as above; an unsupported platform throws; `packagedApp` for both; paths keep their spaces as single strings.
- [ ] **Step 2: Run** `npx vitest run tests/scripts/dist.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the scripts and rewrite the `package.json` entries; check by hand that `npm run test:e2e -- --list` and `npm run dist` still work on this Mac.
- [ ] **Step 4: Run** `npx vitest run tests/scripts` and `npx prettier --check .` (ignore `.worktrees/`) — expect PASS.
- [ ] **Step 5: Commit** `build: cross-platform dist, dev and e2e scripts`.

### Task 7: electron-builder for Windows, and the `.ico`

**Files:**
- Create: `scripts/ico.cjs` (`buildIco(images: { size: number; png: Buffer }[]): Buffer`), `build/icon.ico` (generated)
- Modify: `electron-builder.yml`, `scripts/make-icon.cjs`
- Test: `tests/scripts/ico.test.ts`

**Interfaces:**
- `buildIco` writes the ICONDIR header (reserved 0, type 1, count) and one 16-byte ICONDIRENTRY per image followed by the PNG data; a `size` of 256 is stored as `0` in the width/height bytes.
- `electron-builder.yml`:
  - top-level `extraResources` with the two tour tunes (`hava-nagila.wav`, `korobushka.wav`), removed from `mac.extraResources`; `fdp-music-library` stays under `mac:`.
  - `win: { target: [{ target: nsis, arch: [x64] }], icon: build/icon.ico, artifactName: Folk-Dance-Player-Setup-${version}.${ext} }`.
  - `nsis: { oneClick: true, perMachine: false, createDesktopShortcut: always, createStartMenuShortcut: true, deleteAppDataOnUninstall: false, shortcutName: Folk Dance Player }`.
  - Update the header comment (no longer "a Universal macOS .dmg").
- `make-icon.cjs`: writes `build/icon.ico` (sizes 16, 24, 32, 48, 64, 128, 256 via `nativeImage.resize`) on every platform; the `sips`/`iconutil` section runs only on macOS.

- [ ] **Step 1: Write failing tests:** `buildIco` with two images has header bytes `00 00 01 00 02 00`, an entry for a 256 image stores width byte `0`, entry offsets point at the PNG bytes (read them back), and total length equals `6 + 16*n + sum(png lengths)`.
- [ ] **Step 2: Run** `npx vitest run tests/scripts/ico.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `buildIco`, wire it into `make-icon.cjs`, edit `electron-builder.yml`, then run `npm run icon` here and commit the generated `build/icon.ico`.
- [ ] **Step 4: Verify the mac build is unaffected and the tour tunes are still packaged:** `npm run dist` on this Mac, then `ls "dist/mac-universal/Folk Dance Player.app/Contents/Resources" | grep -E "wav|fdp-music"` shows both tunes and the helper. Run `npx vitest run tests/scripts`.
- [ ] **Step 5: Commit** `build: a Windows (NSIS) installer target and icon`.

### Task 8: Docs, changelog, and handing the build over

**Files:**
- Modify: `CHANGELOG.md` (Unreleased), `AGENTS.md` (decisions, newest first), `README.md` (status line), `CONTRIBUTING.md` (building and installing the unsigned Windows build; SmartScreen's "More info → Run anyway"; the "Adding an OS" bullets), `docs/manual-testing/` (new `pre-release-hardware-windows.md` with the checks from spec §10.4)
- Test: none (documentation); run `npx prettier --check` on the touched files.

- [ ] **Step 1: Write the AGENTS.md decision** dated 2026-11-01: one platform module with `FDP_PLATFORM` (unpackaged only); mac-only features hidden; Windows data in `%LOCALAPPDATA%`; per-user NSIS, x64 only; always-visible menu bar; unsigned beta until a signing route is accepted; MITPlayer importer rejected (headerless CSV). Add the CHANGELOG line ("Windows (beta): …") and update README's status line.
- [ ] **Step 2: Write `pre-release-hardware-windows.md`** as a task-list checklist covering install on a clean user, SmartScreen, first launch, tours, drag from Explorer, projector on the TV (extend and duplicate, unplug/replug, taskbar covered?, mixed DPI), media keys, Canva slide, uninstall keeps the library, and "not covered: lid/sleep, docking" (spec §10).
- [ ] **Step 3: Run the full local gate:** `npx prettier --check .` (ignoring `.worktrees/`), `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Every command must exit 0; report any failure verbatim.
- [ ] **Step 4: Commit** `docs: Windows beta build`.
- [ ] **Step 5: Hand over:** tell the maintainer to run, on the Windows box, `git fetch && git checkout feat/windows-release`, `npm ci`, `npm run dist`, then run `dist\Folk-Dance-Player-Setup-<version>.exe`, and what to look for first (spec §9.1: taskbar over the projector, DPI scaling, media keys).
