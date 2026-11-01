# In-place updates (Plan 23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installed Folk Dance Player (0.3.0 and newer) finds a new GitHub release by itself, downloads it in the background, shows a "Restart to Update" banner, and replaces itself in place.

**Architecture:** A pure `UpdateService` in main over an injected `Updater` port (state machine, schedule, never throws), one Electron adapter around `electron-updater`, three invoke channels plus one event, a banner in the renderer, an app-menu item, and release-pipeline checks that a published release always carries a valid update feed.

**Tech Stack:** `electron-updater` (runtime dependency, exact pin), electron-builder (`zip` target, `publish` block), Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-01-in-place-updates-design.md` (the spec's section numbers are cited as §N).

## Global Constraints

- Main owns all state; renderers call channels in `src/shared/contract.ts`; add a channel to `InvokeContract`, `INVOKE_CHANNELS` and `createHandlers` (AGENTS.md).
- Pin exact dependency versions, each at least two weeks old when added: `electron-updater` **6.8.10** (6.8.11 from 2026-11-03).
- UI from Mantine components; custom CSS only in co-located `*.module.css`.
- Work test-first (Vitest); conventional commits; a `CHANGELOG.md` line under Unreleased with every user-facing change, in the same commit.
- The app never restarts, quits or relaunches itself unless the person pressed Restart to Update (or quit themselves, §3.3).
- A failed check is logged and silent; only a manual **Check for Updates…** shows an error (§1 anti-goals).
- Inert in development runs (unless `FDP_UPDATE_URL` is set) and for a touring window (§4).
- Run CI's steps before every push, with exit codes: `prettier --check .`, `npm run typecheck`, `npm test`, `npm run build`, `env -u ELECTRON_RUN_AS_NODE npx playwright test`.
- Add fakes for new channels in tests that render `App` (`tests/renderer/fake-api.ts`).

## Review Focus

1. A release whose zip or `latest-mac.yml` is missing, or whose checksum or version is wrong, fails the build (dry runs included) and never publishes.
2. Offline, a bad feed, or a throwing updater: no banner, no dialog, no unhandled rejection; the music is untouched.
3. An update that becomes ready during a tour: no banner while touring, and it shows when the tour ends.
4. Restart to Update while a song is playing or counting down asks first; with nothing playing it does not.
5. A dismissed banner stays hidden for that version for the rest of the run, and shows again for a newer version.
6. `autoInstallOnAppQuit` stays on, `allowPrerelease` and `allowDowngrade` off; the automatic check is skipped when `updates.check` is off, but Check for Updates… still works.

---

### Task 1: Release groundwork: dependency, builder config, feed check

**Files:**

- Modify: `package.json`, `package-lock.json` (add `electron-updater` 6.8.10 to `dependencies`, exact)
- Modify: `electron-builder.yml` (`mac.target` adds `zip`; add `publish:`)
- Modify: `scripts/release.mts` (add the pure `checkUpdateFeed` and a `check-feed` command)
- Modify: `.github/workflows/create-release.yml` (upload the update files, run `check-feed`)
- Test: `tests/scripts/release.test.ts` (extend the existing release-script tests; find them with `ls tests/scripts`)

**Interfaces:**

- Produces: `checkUpdateFeed(input: { yml: string; version: string; files: Record<string, Buffer | string> }): { ok: true } | { ok: false; error: string }` in `scripts/release.mts`; `node scripts/release.mts check-feed <dist-dir>` exits non-zero with the error.

- [ ] **Step 1: Install and configure.** `npm install --save-exact electron-updater@6.8.10`. In `electron-builder.yml`, set `mac.target` to `dmg` and `zip`, both `arch: universal`, and add at the top level `publish: { provider: github, owner: holotrek, repo: folk-dance-player }`.
- [ ] **Step 2: Learn what electron-builder writes.** Run `npm run dist` (ad-hoc signed is fine). Expected in `dist/`: the `.dmg`, a `.zip`, `.zip.blockmap`, and **`latest-mac.yml`**. If `latest-mac.yml` is missing because of `--publish never`, find the smallest fix that still writes it (electron-builder's `--config.publish` handling, or an `afterAllArtifactBuild` hook) and record it as a ledger ruling. Keep the real `latest-mac.yml` text as the fixture for Step 3.
- [ ] **Step 3: Write the failing tests** in `tests/scripts/release.test.ts` for `checkUpdateFeed`, using the real yml from Step 2 as the fixture text: `good feed → ok`; `yml version differs from version → error naming both`; `yml names a file that is not in files → error naming it`; `sha512 does not match the file's base64 sha512 → error`; `yml has no version → error`. Run: `npx vitest run tests/scripts/release.test.ts`. Expected: FAIL, `checkUpdateFeed` not defined.
- [ ] **Step 4: Implement `checkUpdateFeed`** (pure, in `scripts/release.mts`, exported). It reads `version:`, and the first `files:` entry's `url:` and `sha512:` with a small line-based reader (no YAML dependency); the checksum is `sha512` of the file, base64. Add the `check-feed` command: reads `latest-mac.yml` and the files from the directory argument, prints the error to stderr, exits 1. Run the tests; Expected: PASS.
- [ ] **Step 5: Workflow.** In the build job, replace the matrix `installer:` single path with the four paths (`dist/*.dmg`, `dist/*.zip`, `dist/*.zip.blockmap`, `dist/latest-mac.yml`) in the `upload-artifact` `path:`, run `node scripts/release.mts check-feed dist` right after the macOS build step (always, dry runs included), and keep `gh release create "v$VERSION" installers/*` (it now carries all four). Update the comments at the top of the workflow.
- [ ] **Step 6: Verify and commit.** Run `npx prettier --check .`, `npm run typecheck`, `npm test`. Commit: `git add -A && git commit -m "build: ship a zip and latest-mac.yml, and check the update feed"` (CHANGELOG: none, not user-facing yet).

---

### Task 2: Shared types, the setting, and the contract

**Files:**

- Create: `src/shared/updates.ts`
- Modify: `src/shared/settings.ts` (key `updates.check`, boolean, default `true`, validated like the other booleans)
- Modify: `src/shared/contract.ts` (channels, event)
- Modify: `tests/renderer/fake-api.ts` (defaults)
- Test: `tests/shared/updates.test.ts`, extend `tests/shared/settings.test.ts` (or the existing settings test file)

**Interfaces:**

- Produces:

```ts
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }
export type UpdateCheckResult = UpdateState | { kind: 'unsupported' }
export const UPDATE_IDLE: UpdateState
export const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000
export const UPDATE_FIRST_CHECK_MS = 20_000
```

- Contract: `'updates:getState': { args: []; result: UpdateState }`, `'updates:check': { args: []; result: UpdateCheckResult }`, `'updates:install': { args: []; result: void }`; event `'updates:state': UpdateState`. All three in `INVOKE_CHANNELS`; the event in `EVENT_CHANNELS`.

- [ ] **Step 1: Failing tests.** `updates.test.ts`: `UPDATE_IDLE` is `{kind:'idle'}`; `UPDATE_CHECK_MS` is four hours. Settings test: default `updates.check` is `true`; a non-boolean value is rejected on `set` and falls back on read (follow the existing pattern in that test file). Run; Expected: FAIL.
- [ ] **Step 2: Implement** the types, constants, setting, and contract entries. `createHandlers` will not compile until Task 4 adds the handlers: add a temporary stub entry in `tests/` fakes only if needed; otherwise do Steps for Task 4's handlers first (the plan order allows Task 2 and 4's handler file to land in one commit if the type-check demands it; ledger it).
- [ ] **Step 3: fake-api.** In `tests/renderer/fake-api.ts` add default handlers `'updates:getState': { kind: 'idle' }`, `'updates:check': { kind: 'idle' }`, `'updates:install': undefined`.
- [ ] **Step 4: Verify and commit.** Run typecheck and `npm test`. Commit: `feat: update state, the updates.check setting and the contract`.

---

### Task 3: `UpdateService` (pure)

**Files:**

- Create: `src/main/updates/update-service.ts`
- Test: `tests/main/updates/update-service.test.ts`

**Interfaces:**

- Consumes: `UpdateState`, `UpdateCheckResult`, `UPDATE_IDLE`, `UPDATE_CHECK_MS`, `UPDATE_FIRST_CHECK_MS` (Task 2); `Logger` from `src/main/log/logger.ts`; `Timers` (the shape `PlayerSession` takes: `setTimeout`/`clearTimeout`; reuse it if exported, else copy the two-method shape).
- Produces:

```ts
export interface Updater {
  isEnabled(): boolean // packaged, or a test feed is set
  check(): Promise<void> // results arrive through the events below
  quitAndInstall(): void
  onAvailable(listener: (version: string) => void): void
  onNotAvailable(listener: () => void): void
  onDownloaded(listener: (version: string) => void): void
  onError(listener: (error: Error) => void): void
}
export interface UpdateServiceDeps {
  autoCheck(): boolean // the updates.check setting
  touring(): boolean
  timers: Timers
  log: Logger
  onState(state: UpdateState): void
}
export class UpdateService {
  constructor(updater: Updater, deps: UpdateServiceDeps)
  getState(): UpdateState
  start(): void // first check after UPDATE_FIRST_CHECK_MS, then every UPDATE_CHECK_MS
  stop(): void
  checkNow(): Promise<UpdateCheckResult> // manual: ignores autoCheck() and touring()
  install(): void // only from 'ready'; otherwise nothing
}
export function checkForUpdatesFromMenu(
  service: Pick<UpdateService, 'checkNow' | 'install'>,
  ui: {
    tell(message: string, detail?: string): void
    askRestart(version: string): Promise<boolean> // true: the person chose Restart
  },
  currentVersion: string
): Promise<void>
```

- [ ] **Step 1: Failing tests** (fake `Updater` that records calls and exposes its listeners; fake timers; array logger; each its own test):
  - starts `idle`; `start()` runs no check until `UPDATE_FIRST_CHECK_MS`, then checks, then again every `UPDATE_CHECK_MS`.
  - `onAvailable('0.3.1')` → state `downloading 0.3.1`; `onDownloaded('0.3.1')` → `ready 0.3.1`; each state change calls `deps.onState` once.
  - `onNotAvailable` after `checking` → `idle`.
  - `onError` / `check()` rejecting → state `error` is **not** broadcast from automatic checks (state returns to `idle`, the error is logged); a rejecting `check()` never throws out of `start`'s timer.
  - automatic checks are skipped when `autoCheck()` is false, when `touring()` is true, when `isEnabled()` is false, and while the state is `downloading` or `ready`.
  - `checkNow()` runs even when `autoCheck()` is false or touring; resolves `idle` (up to date), `downloading`, `ready`, or `error` with the message; resolves `{kind:'unsupported'}` when `isEnabled()` is false, without calling `check()`.
  - `install()` calls `quitAndInstall()` only from `ready`.
  - `checkForUpdatesFromMenu`: `unsupported` → tells "Updates only work in the installed app."; `idle` → "You have the latest version (0.3.0)."; `downloading` → says it will appear in the banner when ready; `ready` → `askRestart`, and `install()` only if true; `error` → tells the message plus "If the app is not in your Applications folder, move it there to update it."
    Run `npx vitest run tests/main/updates`. Expected: FAIL (module missing).

- [ ] **Step 2: Implement** `UpdateService` and `checkForUpdatesFromMenu` to make them pass. State changes go through one private `set(state)` that skips identical states and calls `deps.onState`. Wrap every call into the updater in try/catch.
- [ ] **Step 3: Verify and commit.** `npx vitest run tests/main/updates` (PASS), typecheck. Commit: `feat: the update service`.

---

### Task 4: Electron adapter, handlers, wiring, menu

**Files:**

- Create: `src/main/updates/electron-updater.ts`, `src/main/ipc/update-handlers.ts`
- Modify: `src/main/ipc/handlers.ts` (`HandlerDeps.updates?`, spread `updateHandlers`), `src/main/index.ts` (build the service, start it, broadcast `updates:state`, pass `updates` to handlers, menu action), `src/main/menu.ts` (`checkForUpdates` option, item under About)
- Test: `tests/main/ipc/update-handlers.test.ts`, extend `tests/main/app/menu.test.ts`

**Interfaces:**

- Consumes: `UpdateService`, `Updater`, `checkForUpdatesFromMenu` (Task 3); channels (Task 2).
- Produces: `createElectronUpdater(options: { log: Logger; feedUrl?: string }): Updater` (the only file importing `electron-updater`); `updateHandlers(deps: HandlerDeps): Pick<InvokeHandlers, 'updates:getState' | 'updates:check' | 'updates:install'>`; `HandlerDeps.updates?: Pick<UpdateService, 'getState' | 'checkNow' | 'install'>`; `menuTemplate` option `checkForUpdates: () => void`.

- [ ] **Step 1: Failing tests.** Handlers: with a fake `updates` dep each channel forwards to it; **without** `updates` (the practice context and most tests) `getState` is `{kind:'idle'}`, `check` is `{kind:'unsupported'}`, `install` does nothing. Menu: the app menu has a "Check for Updates…" item right after About, and clicking it calls `checkForUpdates`. Run; Expected: FAIL.
- [ ] **Step 2: Implement** the handlers and the menu item.
- [ ] **Step 3: Adapter.** `createElectronUpdater`: `import { autoUpdater } from 'electron-updater'`; set `autoDownload = true`, `autoInstallOnAppQuit = true`, `allowPrerelease = false`, `allowDowngrade = false`, `logger` to a thin wrapper over `log`; when `feedUrl` is set, `autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })` and `autoUpdater.forceDevUpdateConfig = true`; `isEnabled()` is `app.isPackaged || feedUrl !== undefined`; map the library's `update-available`/`update-not-available`/`update-downloaded`/`error` events to the port's listeners; `check()` awaits `autoUpdater.checkForUpdates()`.
- [ ] **Step 4: Wire `index.ts`.** `const updates = new UpdateService(createElectronUpdater({ log, feedUrl: process.env['FDP_UPDATE_URL'] }), { autoCheck: () => settings.get('updates.check'), touring: () => tour.active(), timers, log, onState: (s) => broadcast('updates:state', s) })`; `updates.start()`; `app.on('will-quit', () => updates.stop())`; pass `updates` into `createHandlers`; the menu's `checkForUpdates` is inert while `tour.active()`, otherwise runs `checkForUpdatesFromMenu` with a `ui` over `dialog.showMessageBox` (`tell`: one OK button; `askRestart`: buttons "Restart to Update" / "Later", resolving true for the first) and `app.getVersion()`. Order the construction after `tour` and `settings` exist.
- [ ] **Step 5: Verify and commit.** Run typecheck and `npm test` (the app-level and handler tests must still pass). Commit: `feat: check for updates in the background, and Check for Updates… in the app menu`. Add the CHANGELOG line in Task 5, with the banner.

---

### Task 5: The banner and the setting

**Files:**

- Create: `src/renderer/src/updates/UpdateBanner.tsx`, `src/renderer/src/updates/UpdateBanner.module.css`, `src/renderer/src/updates/use-update-state.ts`
- Modify: `src/renderer/src/App.tsx` (mount `<UpdateBanner />` above `TourBannerSlot` in the header), `src/renderer/src/pages/SettingsPage.tsx` (the switch), `CHANGELOG.md`
- Test: `tests/renderer/updates/update-banner.test.tsx`, extend `tests/renderer/settings-page.test.tsx`, `tests/renderer/app.test.tsx` if it asserts the header's children

**Interfaces:**

- Consumes: `UpdateState` and channels (Task 2); `useTour().touring`; `useProgram` for the player status (`'playing' | 'countdown'` count as playing); `ConfirmDialog`.
- Produces: `useUpdateState(api: RendererApi): UpdateState` (reads `updates:getState` once, then follows `updates:state`); `UpdateBanner` (no props).

- [ ] **Step 1: Failing tests** (fake API; the existing `renderWithLibrary`/program helpers):
  - nothing renders for `idle`, `checking`, `downloading`, `error`.
  - on `ready 0.3.1` it shows "Version 0.3.1 is ready." and a **Restart to Update** button; pressing it with an idle player calls `updates:install` and shows no question.
  - with the player `playing` (and again with `countdown`) it asks "Music is playing. Restart anyway?" first; **Keep playing** does not install; **Restart** does.
  - ✕ hides it; a later `ready 0.3.2` shows it again; the same version re-emitted stays hidden.
  - while touring it renders nothing, and renders after the tour ends.
  - Settings: the switch **Check for updates automatically** is on by default, and toggling saves `updates.check` false.
    Run; Expected: FAIL.
- [ ] **Step 2: Implement** the hook, the banner (a Mantine `Group` strip, styled like `TourBanner` but neutral, `role="status"`), the mount in `App`, and the Settings switch via the existing `toggle(...)` helper (add `'updates.check'` to its `BooleanKey` type).
- [ ] **Step 3: CHANGELOG** under Unreleased, Added: the app now finds new versions by itself, downloads them in the background, and offers **Restart to Update** in a banner; **Check for Updates…** is in the app menu, and **Check for updates automatically** is in Settings. (Say plainly that installed copies older than this release still need one manual download.)
- [ ] **Step 4: Verify and commit.** Run `npx prettier --write` on the new files, then typecheck and `npm test`. Commit: `feat: the update banner and the automatic-update setting`.

---

### Task 6: End-to-end against a local feed

**Files:**

- Create: `e2e/update-feed.ts` (a tiny static server serving `latest-mac.yml` and a zip, with the checksum computed), `e2e/updates.spec.ts`
- Modify: `e2e/app.ts` only if `launch` needs the env passed through (it already takes `extraEnv`)

**Interfaces:**

- Consumes: `FDP_UPDATE_URL` (Task 4); `launch(userData, env, size?)` from `e2e/app.ts`.

- [ ] **Step 1: Spike (timeboxed), then a ruling.** Serve a feed whose `version` is higher than `package.json`'s with a small zip, launch the dev app with `FDP_UPDATE_URL`, and see how far the real updater gets with an unsigned app. Squirrel.Mac may refuse before `update-downloaded` in an unsigned development run. Record in the ledger exactly how far it gets: (a) all the way to `ready` → the e2e asserts the banner; (b) only to `downloading`/the download completing → the e2e asserts the app reaches `downloading` for the fed version, a bad checksum yields no banner and no error dialog, and `ready` is left to the unit tests and the rehearsal; update spec §8 layer 3 to say so.
- [ ] **Step 2: Write the spec** `e2e/updates.spec.ts` for whichever of (a)/(b) the spike showed, plus: a feed at the **current** version → nothing shows and Check for Updates… (invoke `updates:check`) returns `idle`; a bad checksum → no banner. Use a short first-check delay if the service accepts one through an env seam; otherwise drive the check with `updates:check`.
- [ ] **Step 3: Run** `env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/updates.spec.ts`; then the whole suite. Expected: PASS.
- [ ] **Step 4: Commit:** `test: update checks end to end against a local feed`.

---

### Task 7: Documentation and the rehearsal checklist

**Files:**

- Modify: `AGENTS.md` (a decision, newest first, dated 2026-11-01), `CONTRIBUTING.md` (the release ships a zip and `latest-mac.yml`; the rehearsal), `docs/manual-testing/pre-release-hardware.md` (layer 4 as numbered steps), `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md` (§9, §13.4), `docs/superpowers/specs/2026-11-01-in-place-updates-design.md` (Status: built; any change the Task 6 ruling made)

- [ ] **Step 1: AGENTS.md decision** covering: `electron-updater` over Electron's built-in updater and `update-electron-app` (reads the Releases page directly, same project as the builder); the banner appears only when the update is `ready`; never restarts by itself, asks while music plays; installs at ⌘Q; the feed check on every release run; `FDP_UPDATE_URL`; inert in dev and during a tour; _Rejected:_ a progress bar, an in-app changelog, prereleases.
- [ ] **Step 2: Hardware checklist steps** (spec §8 layer 4, verbatim in intent): build two Developer ID–signed, notarized versions (the real 0.3.0 and a throwaway 0.3.1), serve 0.3.1's zip and yml from localhost, `open --env FDP_UPDATE_URL=http://localhost:8123 <installed app>`; check the banner appears without a restart; a playing song keeps playing; Restart to Update asks while it plays; the app relaunches as 0.3.1 with the library intact; ⌘Q with a ready update installs at quit; Check for Updates… afterwards says it is up to date; a copy run from the mounted `.dmg` says to move it to Applications. CONTRIBUTING.md gets the exact commands for the throwaway build.
- [ ] **Step 3: Verify and commit.** `npx prettier --write` the docs; `npx prettier --check .`. Commit: `docs: in-place updates`.

---

## Finish

Run the full CI sequence with exit codes (prettier, typecheck, `npm test`, `npm run build`, the whole Playwright suite), push `feat/in-place-updates`, and open the pull request with the layer-4 rehearsal as its test plan. Do not merge: the signed rehearsal is the maintainer's, before the 0.3.0 release PR.
