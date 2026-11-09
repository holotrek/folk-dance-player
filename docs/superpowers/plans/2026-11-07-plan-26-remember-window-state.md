# Remember the control window's size and state (Plan 26) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The control window reopens at the size, position and maximized state it had when the app last ran; if the saved place no longer fits any connected display, it opens somewhere visible on a display that exists (issue #92).

**Architecture:** One new pure module, `src/main/window-state.ts`: `restoreBounds(saved, displays, minimum)` (the fit rule) and `createWindowStateSaver(...)` (debounced saving over injected window and settings ports, so it is unit-tested with fake timers). `createMainWindow` in `src/main/index.ts` reads the setting before constructing the `BrowserWindow` (no jump after show) and hooks the saver. Storage is one setting, no migration.

**Tech Stack:** Electron `BrowserWindow`/`screen`, the existing `SettingsStore`, Vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.4 (cited as §N), with §4-§7.

## Global Constraints

- Main owns all state; the renderer is untouched (no new channel).
- Settings are validated on write and read; a bad stored value falls back to the default (AGENTS.md, 2026-10-13).
- Only the control window: not the projector, not the tour (a tour never resizes the window; the tour reloads the same window, so saved bounds are untouched by it).
- Keep `minWidth: 1000`, `minHeight: 640`. Full screen is not restored; maximized is.
- Test-first (Vitest); conventional commits; `CHANGELOG.md` line under Unreleased and an AGENTS.md decision in the implementing commit.
- Verification for the implementing run: unit tests, `npm run typecheck`, `prettier --check .`, `npm run build`. No e2e here; CI runs it.

## Findings from the code

- `Settings` already has an **unused** `'window.bounds': WindowBounds | null` (`src/shared/settings.ts`, default `null`, validator `isBoundsOrNull`, a test in `settings-store.test.ts`). Nothing reads or writes it. Plan: **replace it** with `window.control` (adds `maximized`) rather than keep two window settings. Safe: no code sets it, so no saved row exists in any released version. (Open question 1.)
- `createMainWindow()` (`src/main/index.ts`) builds `new BrowserWindow({ width: 1280, height: 800, minWidth: 1000, minHeight: 640, ... })`. It runs after `settings` exists, so it can take the settings as a parameter.
- **The spec's Windows content-size note does not match the code:** no window sets `useContentSize`. `width`/`height` are the outer size on both platforms, and `getNormalBounds()` is the outer size too, so one rule works everywhere. The plan drops the `getContentBounds()` branch. (Open question 2.)
- A tour reloads the same window, so nothing needs excluding from saving beyond not touching the projector window.

## Review Focus

1. A window that was moved to a disconnected display opens fully visible on a display that exists, never off-screen, and never smaller than 1000 x 640.
2. Un-maximizing after a restart returns to the previous normal size (we save normal bounds, and `maximized` separately).
3. Saving never throws or blocks (a failed settings write is logged; the window keeps working), and no save runs after the window is destroyed.
4. First launch and `FDP_USER_DATA` test runs (no setting) open exactly as today.

---

### Task 1: The setting `window.control`

**Files:**

- Modify: `src/shared/settings.ts` (replace `'window.bounds'` with `'window.control': WindowState | null`; type `WindowState = { x; y; width; height; maximized }`; validator: finite numbers, positive width/height, boolean `maximized`; default `null`)
- Test: `tests/main/settings/settings-store.test.ts` (replace the `window.bounds` cases)

- [ ] Step 1: Rewrite the `window.bounds` tests for `window.control`: a valid value round-trips; `{width: 0}`, a missing `maximized`, a non-boolean `maximized`, `NaN` and a string are rejected on set and fall back to `null` when a stored row is corrupt.
- [ ] Step 2: Run them; they fail (unknown key).
- [ ] Step 3: Implement the type, validator and default. Run; they pass.
- [ ] Step 4: Commit `feat: window.control setting`.

### Task 2: `restoreBounds`, the pure fit rule

**Files:**

- Create: `src/main/window-state.ts`
- Test: `tests/main/app/window-state.test.ts`

Signature: `restoreBounds(saved: WindowState | null, displays: DisplayArea[], minimum: Size): { bounds: Rect | null; maximized: boolean }`, where `DisplayArea = { workArea: Rect; primary: boolean }` (plain data, so no Electron import in tests). `null` bounds means "no saved state: use today's defaults".

Rule (spec §3.4): keep the bounds if at least 100 x 50 px of the window's top strip (its title area) lies inside some display's work area; otherwise keep the size, clamped to that display and to the minimum, and center it on the display with the most overlap with the saved rectangle, else the primary display. Size is also raised to the minimum, and lowered to the chosen display's work area (the minimum wins when a display is smaller than it).

- [ ] Step 1: Write failing tests: `null` saved gives `null` bounds; saved fully inside one display kept as is; partly off an edge but with 100 x 50 of the title strip visible kept; only a sliver visible, recentered; saved on a display that no longer exists, centered on the primary; two displays, saved straddling, picks the one with more overlap; saved larger than the display clamps; saved smaller than the minimum is raised; a display smaller than the minimum keeps the minimum; negative coordinates (display left of the primary) kept; `maximized` passed through, and a maximized window whose bounds don't fit still gets repaired bounds (so un-maximize is visible).
- [ ] Step 2: Run; fail.
- [ ] Step 3: Implement. Run; pass.
- [ ] Step 4: Commit `feat: fit saved window bounds to the displays that exist`.

### Task 3: `createWindowStateSaver`, debounced saving

**Files:**

- Modify: `src/main/window-state.ts`
- Test: `tests/main/app/window-state.test.ts`

Shape: `createWindowStateSaver({ window: StateWindow, save(state), debounceMs = 500, setTimer/clearTimer })`. `StateWindow` is the port: `getNormalBounds()`, `isMaximized()`, `isFullScreen()`, `isDestroyed()`, `on(event, cb)`. It subscribes to `resized`, `moved`, `maximize`, `unmaximize` (debounced) and `close` (flush at once). It saves `getNormalBounds()` plus `maximized: isMaximized()`. While in full screen it saves nothing (the last non-full-screen state stays). A throwing `save` is caught and logged.

- [ ] Step 1: Failing tests with a fake window and fake timers: several `resized` events within 500 ms produce one save with the latest bounds; a later `moved` saves again; `maximize` saves `maximized: true` with the normal (not maximized) bounds; `close` saves immediately and cancels the pending timer; nothing saves after `isDestroyed()`; a full-screen window saves nothing; a throwing `save` doesn't escape.
- [ ] Step 2: Run; fail. Step 3: Implement; pass.
- [ ] Step 4: Commit `feat: save the control window's bounds as it changes`.

### Task 4: Wire it into `createMainWindow`

**Files:**

- Modify: `src/main/index.ts` (`createMainWindow(settings)`; map `screen.getAllDisplays()` to `DisplayArea`; apply `restoreBounds`; construct with `x`, `y`, `width`, `height` when present, else today's `1280 x 800`; call `win.maximize()` before show when `maximized`; attach the saver; log failed saves)

- [ ] Step 1: Implement the wiring (not unit-testable without Electron; the pure parts are covered by Tasks 2-3). The window is built with the restored bounds, so it never flashes at the default position.
- [ ] Step 2: `npm run typecheck` and `npm test` pass. Step 3: Commit `feat: reopen the control window where it was`.

### Task 5: End-to-end spec (written here, run by CI only)

**Files:**

- Create: `e2e/window-state.spec.ts` (launch with a temp `FDP_USER_DATA`, resize through the main process, quit, relaunch with the same folder, expect the same size; a second case writes an off-screen `window.control` first and expects a visible window)

- [ ] Step 1: Write the spec following the `e2e/app.ts` helpers. Do not run it locally (parallel agents' windows collide).
- [ ] Step 2: Commit `test: e2e for the remembered window size`.

### Task 6: Docs, changelog, checklist

**Files:**

- Modify: `CHANGELOG.md` (Unreleased: the window reopens at the size and position you left it, and maximized if it was)
- Modify: `AGENTS.md` (decision, newest first: the setting, normal bounds plus `maximized`, the fit rule and its 100 x 50 title-strip test, why `window.bounds` was replaced, full screen not restored, projector and tour excluded; _Rejected:_ a saved layout per display configuration, `electron-window-state` (a dependency for about 60 lines))
- Modify: `docs/manual-testing/pre-release-hardware.md` and the Windows checklist (resize, maximize, quit and reopen; reopen with the saved display unplugged)
- Modify: the main spec's "Settings keys" (`window.control` replaces `window.bounds`); the 1.0.0 design spec's §3.4 state to done, with the Windows content-size note corrected.

- [ ] Step 1: Make the edits. Step 2: `npx prettier --check .`, `npm run typecheck`, `npm test`, `npm run build` all exit 0. Step 3: Commit `docs: remembered window state`.

## Risks

- **Display coordinates differ per platform** (macOS work areas exclude the menu bar and Dock; Windows can have negative coordinates; scale factors). The fit rule uses DIP work areas straight from `screen`, the same units as Electron's bounds, so no conversion; tested with negative origins.
- **`getNormalBounds()` while maximized or minimized** is reliable on macOS and Windows.
- **A display's work area changes between saving and loading** (Dock moved, resolution): handled by the same fit rule at read time.
- **Save during quit:** `close` flushes synchronously and the `node:sqlite` write is synchronous, so it lands before the app quits (the app quits on `closed`, after `close`).
- **Maximized at launch on a different display size:** Electron maximizes to the current display; the repaired normal bounds still apply to a later un-maximize.
- **E2E can't prove behavior with an unplugged display;** that is the hardware checklist's job.

## Open questions for the maintainer

1. Replace the existing unused `window.bounds` setting with `window.control` (my plan; nothing uses it), or keep both?
2. The spec's Windows content-size note (`useContentSize`, save `getContentBounds()`) doesn't match the code: no window sets `useContentSize`, so outer bounds are used everywhere. Drop that note, or is a content-size change coming that should land first?
3. If the saved display is gone, still maximize on the fallback display (my plan), or open un-maximized?
4. Is 100 x 50 px of the title strip the right "enough visible" threshold?
