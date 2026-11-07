# Remote Accessibility: Restart notice and stale-entry docs (Plan 24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the organizer allows Folk Dance Player in System Settings → Accessibility and returns to the app, the app notices and either turns the remote on by itself (if re-registering works) or offers a **Restart** that does; and the stale-entry trap is documented.

**Spec:** `docs/superpowers/specs/2026-11-07-release-1-0-0-design.md` §3.1 and §3.2 (issue #90). Section numbers below are cited as §N of that spec.

**Architecture:** A pure `RemoteWatcher` in main over `isTrusted()` that reports the not-trusted to trusted flip; it is checked on the control window's `focus` and while Settings' Remote control section is open. `remote:status` computes `keys` where it is asked. Depending on the spike: main re-registers the keys on the flip (no restart), or broadcasts `remote:changed` and the renderer shows a notice with Restart (`app.relaunch()` then `app.exit()`).

## Global Constraints

- Main owns all state; the renderer holds no copy of the rule. New channels go in `InvokeContract`, `INVOKE_CHANNELS`/`EVENT_CHANNELS` and `createHandlers` (AGENTS.md). Add defaults in `tests/renderer/fake-api.ts`.
- Polling must use `isTrustedAccessibilityClient(false)` only; the prompt stays on the Allow button.
- macOS only; nothing on Windows. Inert and not shown during a tour (`tour.active()` / `useTour().touring`).
- Restart asks first while a song plays or counts down (as `UpdateBanner` does); the app never restarts without the person pressing Restart.
- Mantine components, custom CSS only in `*.module.css`; no Unicode symbol icons (use `components/icons.tsx`).
- Test-first (Vitest), conventional commits, CHANGELOG line under Unreleased and the AGENTS.md decision in the same commit as the change.
- Before pushing: `prettier --check .`, `npm run typecheck`, `npm test`, `npm run build` (e2e runs in CI only, for this item).

## Findings from reading the code

- `src/main/index.ts` (~L465-477) registers keys once and builds `remote = { status, requestAccess }` with `keys: mediaKeys` captured at startup, so `status` goes stale. `trusted()` already uses `isTrustedAccessibilityClient(prompt)` (true on non-darwin).
- `registerMediaKeys(shortcuts, player)` in `src/main/remote/media-keys.ts` is pure over a `ShortcutRegistrar` with only `register`; re-registering needs `unregisterAll` added to that port.
- `RemoteSection.tsx` fetches `remote:status` once on mount and says "then quit and reopen the app".
- `RemoteStatus` is `{ trusted, keys }` in `src/shared/program.ts`; `NO_REMOTE` is the fallback.
- The spec mentions `caps.mediaKeyTrust`; no such symbol exists in `src`. Platform is gated by `process.platform === 'darwin'` in `index.ts`. See open question 3.
- The focus hook exists: `mainWindow.on('focus', ...)` in `index.ts` (Apple sync and Canva use it).
- `UpdateBanner` (`src/renderer/src/updates/`) is the pattern for the notice: `useTour().touring`, `useProgram((s) => s.player.status)`, `ConfirmDialog`, a per-version dismissal, mounted in `App.tsx`.

## Files touched

Spike outcome A (re-register works): `src/main/remote/media-keys.ts`, `src/main/remote/remote-watcher.ts` (new), `src/main/index.ts`, `src/shared/program.ts`, `src/shared/contract.ts`, `src/renderer/src/components/RemoteSection.tsx`, `tests/renderer/fake-api.ts`, tests, docs.
Spike outcome B (restart needed): the same, plus `src/renderer/src/remote/RemoteNotice.tsx` (+ `.module.css`, `use-remote-status.ts`), `App.tsx`, and a `remote:restart` invoke channel.
Both: `CONTRIBUTING.md`, `AGENTS.md`, `CHANGELOG.md`, `docs/manual-testing/pre-release-hardware.md`, main spec §7.4.

---

> **Update (maintainer's answers on PR #100):** the spike is skipped. The maintainer already tested re-registering the keys after the grant and it needs a restart, so outcome B is built (notice with Restart). Platform gating is `process.platform === 'darwin'` (no `caps.mediaKeyTrust`). The notice is shown once per grant and its ✕ hides it until the next launch. The check runs on window focus only, with no 2 s polling in Settings (Settings refreshes on focus). The §3.2 docs ride in the same PR. Task 3 (re-register) is not built.

### Task 1: The spike (do first; no production code merges from it)

**Goal:** Settle spec §3.1's two unverified points on the packaged, Developer-ID-signed app, on the maintainer's Mac. Needs the maintainer (confirm before launching; it covers their screen and needs them to click in System Settings).

**Procedure:**

1. Build a throwaway spike branch (not the PR branch): a temporary menu item or `FDP_SPIKE_REMOTE=1` that, every second, logs `isTrustedAccessibilityClient(false)` and, via a menu item "Spike: re-register", calls `globalShortcut.unregisterAll()` then `registerMediaKeys(...)` and logs the returned list. Build and sign it as in CONTRIBUTING.md (Signing and notarizing); run it from `/Applications` with `open --env FDP_USER_DATA=/tmp/fdp-spike`.
2. Start with a clean state: `tccutil reset Accessibility com.folkdanceplayer.app`.
3. Check (a): with the app running, allow it in System Settings → Accessibility. Does the logged value flip to `true` without a relaunch? How soon after returning focus?
4. Check (b): press the remote's Play/Pause (or the keyboard media key). Expect dead (Apple Music opens). Then run "Spike: re-register" and press it again: does `toggle()` fire and Apple Music stay closed? Repeat for next/back.
5. Check (c), the stale case: allow a dev-run entry, then run the signed build. Does it report not trusted while the entry shows enabled? Does `tccutil reset` plus relaunch fix it? (Confirms §3.2's text.)
6. Record results in the PR (and a short `docs/spikes/remote-accessibility-regrant.md`, matching the existing spikes folder), then delete the spike code.

**How the plan changes:**

| Outcome                                        | Plan                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) flips live, (b) re-register works          | Outcome A: on the flip main re-registers the keys and broadcasts; the renderer shows a plain dismissible toast "Remote control is on". No Restart button, no `remote:restart`; Task 6's notice is replaced by a small toast, and Task 3 is built.                                                  |
| (a) flips live, (b) fails (expected)           | Outcome B, as decided in the spec: notice with **Restart**. This is the plan below.                                                                                                                                                                                                               |
| (a) does not flip live                         | A focus check cannot see the grant. Fall back to Settings help ("quit and reopen") plus the stale-entry docs only. Ask the maintainer before building anything further (the issue's wanted behavior is not reachable).                                                                             |
| (b) works but only for some keys               | Treat as A for the keys that work; the status line already lists keys another app holds. Raise with the maintainer.                                                                                                                                                                               |

Tasks 2-8 are written for outcome B, with the A differences in each.

---

### Task 2: Shared types and contract

**Files:** `src/shared/program.ts`, `src/shared/contract.ts`, `tests/renderer/fake-api.ts`, and the existing contract/shared tests.

- `RemoteStatus` gains `restartNeeded: boolean` (granted since startup, and the keys were registered while not trusted). `NO_REMOTE` gets `restartNeeded: false`.
- Contract: event `'remote:changed': RemoteStatus` in `EVENT_CHANNELS`; invoke `'remote:restart': { args: []; result: void }` in `INVOKE_CHANNELS` (B only).
- [ ] Step 1: failing test (`NO_REMOTE` shape; contract lists the new channels, following the existing contract test). Step 2: implement. Step 3: typecheck, `npm test`. Commit `feat: remote status carries restartNeeded; remote:changed and remote:restart channels`.

### Task 3: `registerMediaKeys` can be redone (outcome A only)

**Files:** `src/main/remote/media-keys.ts`, `tests/main/remote/media-keys.test.ts`.

- [ ] Add `unregisterAll(): void` to `ShortcutRegistrar`; test that re-registering calls it first and returns the new list. Skip in outcome B.

### Task 4: `RemoteWatcher` (pure)

**Files:** create `src/main/remote/remote-watcher.ts`, test `tests/main/remote/remote-watcher.test.ts`.

```ts
export class RemoteWatcher {
  constructor(deps: {
    isTrusted(): boolean
    registeredKeys: () => string[]
    trustedAtStart: boolean
    onChange(status: RemoteStatus): void
  })
  status(): RemoteStatus // trusted now, keys, restartNeeded
  check(): RemoteStatus // on focus / while Settings is open; fires onChange once on the not-trusted to trusted flip
}
```

- [ ] Failing tests first: no change when trust is unchanged; one `onChange` on false to true, not repeated on later checks; true to false (entry removed) updates `trusted` and clears `restartNeeded`; `restartNeeded` is false when trusted at start; the `isTrusted` port has no prompt argument; a throwing `isTrusted` is swallowed and treated as unchanged (side failures never stop the music); non-darwin: always trusted, never fires.
- [ ] Implement; verify; commit `feat: RemoteWatcher notices when Accessibility is allowed`.

### Task 5: Wire it in main

**Files:** `src/main/index.ts`, `src/main/ipc/handlers.ts` (+ its test).

- Build the watcher after `registerMediaKeys`; `trustedAtStart = trusted(false)`. `remote.status()` returns `watcher.check()` (so `keys` and `trusted` are never stale); `requestAccess` prompts via `trusted(true)` then returns `watcher.check()`.
- `mainWindow.on('focus', () => watcher.check())`; `onChange` broadcasts `remote:changed` unless `tour.active()` (the notice reads `remote:status` on mount, so it shows after the tour).
- `remote:restart` (B): `app.relaunch(); app.exit()`, injected into `createHandlers` as `restart()` so handlers stay Electron-free.
- A: on the flip, `unregisterAll()`, `registerMediaKeys(...)`, update the watcher's keys, then broadcast; no `remote:restart`.
- [ ] Failing handler tests (`remote:status` goes through the watcher; `remote:restart` calls the injected function), implement, typecheck, test. Commit `feat: remote status is recomputed and changes are broadcast`.

### Task 6: Renderer: the notice and Settings

**Files:** create `src/renderer/src/remote/RemoteNotice.tsx`, `RemoteNotice.module.css`, `use-remote-status.ts`; modify `App.tsx`, `RemoteSection.tsx`; tests `tests/renderer/remote/remote-notice.test.tsx`, extend the RemoteSection test.

- `useRemoteStatus(api)`: `remote:status` on mount, then `api.on('remote:changed')`, like `useUpdateState`.
- `RemoteNotice` (modeled on `UpdateBanner`): shows only when `restartNeeded && !touring`; text "Remote control is allowed. Restart Folk Dance Player to turn it on."; **Restart** (asks via `ConfirmDialog` first while `status === 'playing' || 'countdown'`, else invokes `remote:restart`); dismiss lasts until the next launch. Mounted beside `UpdateBanner`; the two stack, never overlap.
- `RemoteSection`: re-checks `remote:status` while mounted (subscribe to `remote:changed`, plus a 2 s interval while the section is open, because the person comes back from System Settings to this window); when `restartNeeded` it shows the same sentence and Restart button (shared hook with the notice). Not trusted: keep the Allow button, change the text to say to come back here, and add the stale-entry line: "Already allowed but still not working? Remove Folk Dance Player from the list with the minus button, then add it again."
- [ ] Failing tests: notice hidden when not needed, shown on `restartNeeded`, hidden while touring, hidden after dismiss, Restart invokes `remote:restart` immediately when idle and asks first while playing (cancel does not invoke); Settings shows the stale-entry help when not trusted and the Restart state when `restartNeeded`. Implement; typecheck; test. Commit `feat: offer Restart when Accessibility is allowed`.
- Outcome A: a Mantine notification "Remote control is on" replaces the notice component; Settings shows "ready".

### Task 7: Docs (§3.2 and the rest of §6 for this item)

- [ ] `CONTRIBUTING.md`: a short "Testing the remote" note near the hardware checks: macOS ties Accessibility to the code signature; development runs, ad-hoc builds (0.1.0) and the Developer ID release do not match though a packaged copy of each is `com.folkdanceplayer.app`; remove the entry with **−** in System Settings → Privacy & Security → Accessibility (or `tccutil reset Accessibility com.folkdanceplayer.app`), quit, reopen, allow again; "enabled in System Settings" is not proof, Settings → Remote control is.
- [ ] `AGENTS.md`: one decision entry (newest first, dated 2026-11-07): detection by polling `isTrustedAccessibilityClient(false)` on focus and while the section is open, the spike's result and why a restart is (or is not) needed, never prompting while polling, `RemoteStatus.keys` computed where asked, restart asks first during music, plus stale entries. _Rejected:_ detecting and repairing the entry from the app (it cannot be read or removed without the permission it is missing); an app-wide timer poll.
- [ ] `CHANGELOG.md`: a line under Unreleased.
- [ ] `docs/manual-testing/pre-release-hardware.md`: a new item (number after the highest at rebase time; siblings add items too): with a development or old ad-hoc entry in Accessibility, allow the packaged app, return (notice or toast appears), Restart, Play/Pause toggles the player and Apple Music stays closed; and the stale-entry route per CONTRIBUTING.
- [ ] Main spec `2026-10-13-folk-dance-player-electron-design.md` §7.4: a paragraph on the grant and restart behavior.
- [ ] Commit with the code (the spec says the docs ride with §3.1), or `docs: stale Accessibility entries (#90)` if split.

### Task 8: Verify and ship

- [ ] `npx prettier --check .`, `npm run typecheck`, `npm test`, `npm run build`, each exit code checked. No e2e locally. Push, `gh pr ready`, rewrite the PR description.

## Review Focus

1. Polling never prompts (`isTrustedAccessibilityClient(false)` only); the Allow button is the only prompt.
2. A stale entry (reports not trusted) never shows the Restart notice and shows the help text instead.
3. Restart while a song plays or counts down asks first; idle does not. Cancel does nothing.
4. Nothing appears during a tour or on Windows; an unchanged state fires one event, not one per focus.
5. `remote:status` is never stale after a grant (keys and trusted recomputed on each ask).
6. A throwing `isTrusted` cannot break focus handling or playback.

## Risks

- The grant may not be visible to a running process, or re-registering may not work: the spike decides, and Task 1's table says what changes.
- `app.relaunch()` in an unpackaged or e2e run restarts Electron oddly; the handler is injected and e2e does not cover it. The hardware checklist covers the real relaunch.
- A relaunch loses nothing (state is in SQLite) but stops the music; hence ask-first.
- Two banners (update and remote) at once: stack, do not overlap.
- Hardware-only behavior cannot be unit tested; the watcher's logic can, and is.

## Open questions for the maintainer

1. May I run the spike on your Mac with the signed build (it needs you to click in System Settings and to reset the app's Accessibility entry with `tccutil`)? Or would you run it from steps I write?
2. If re-registering works without a restart, is a plain "Remote control is on" toast what you want in place of Restart (the spec's recommendation)?
3. The spec cites `caps.mediaKeyTrust`, which does not exist in the code; I plan to keep gating on `process.platform === 'darwin'`. OK?
4. Dismissal of the notice: until next launch (as spec), and does it show once or on every window focus until dismissed?
5. Settings polling while the section is open: is a 2 s interval acceptable, or window focus only?
6. If the check never flips live in a running app (spike outcome 3), is "help text only" an acceptable fallback?
