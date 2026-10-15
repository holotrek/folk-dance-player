# Folk Dance Player — Plan 7: Packaging, Backups and Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Folk Dance Player can be handed to another organizer. Specifically:
- **A `.dmg` to install from:** Universal, so it runs on Apple silicon and Intel Macs.
- **The library is backed up every time the app starts.** The last 5 copies are kept.
- **What happened is written to a log** that Help → Reveal Logs in Finder opens.
- **A proper app menu:** About, Settings… (⌘,), Edit (copy and paste in text fields), Window, and Help.
- **End-to-end tests drive the real app,** both the build and the packaged `.app`.

**Architecture:**
- **Main process:** three small pieces, each unit-tested:
  - `backupDatabase` (`src/main/db/backup.ts`): `VACUUM INTO` a timestamped copy, keeping the newest 5.
  - `createLogger` (`src/main/log/logger.ts`): an appending log that rolls over by size and never throws.
  - `menuTemplate` (`src/main/menu.ts`): the menu as data, with its actions injected.
- **`main/index.ts` wires them in:**
  - the log goes in `app.getPath('logs')`, or under `FDP_USER_DATA` for test runs
  - the backup runs before migrations
  - the menu and the About panel are set up
  - uncaught errors, renderer crashes, utility-process crashes and renderer console errors are logged
  - Settings… sends a new event, `app:showPage`, that the control window follows
- **Packaging:** electron-builder 26 makes `dist/Folk Dance Player-<version>-universal.dmg`. It is ad-hoc signed for now; CONTRIBUTING.md says how to sign and notarize once there's a Developer ID.
- **End-to-end:** Playwright's Electron support (`_electron`) launches the app on a throwaway library of silent MP3s. The same tests run against `out/` (`npm run test:e2e`) and against the packaged `.app` (`npm run test:e2e:dist`).

**Tech Stack:** As Plans 1–6, plus two exact-pinned dev dependencies:
- `electron-builder` 26.15.3 (npm's `latest` tag, released 2026-06-09)
- `@playwright/test` 1.63.0 (released 2026-09-04)

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §9 (packaging), §10.1 (backups and the log), §10.2 (end-to-end tests) and §13 (release routines). Task 7 updates the spec with this plan's decisions.

This is plan 7 of 7. Plans 1–6 and the tweaks PR are merged. **Not in this plan:**
- **Developer ID signing and notarization:** the steps are documented and switch on with configuration, but they're untested without a certificate.
- **The 1.0.0 release:** version bump, tag and GitHub release, after the projector checks on real hardware that are still open from Plans 5 and 6.
- **Automatic updates and Windows:** post-v1.

**Decisions made with the user while planning** (recorded in the spec by Task 7):
- **Unsigned for now:** the `.dmg` is ad-hoc signed. Apple silicon needs a signature, and a consistent one means a downloaded copy is "from an unidentified developer" (Open Anyway in System Settings) rather than "damaged".
- **Universal:** one `.dmg` for Apple silicon and Intel, about 230 MB (Electron's frameworks for both architectures are about 500 MB of the 524 MB app).
- **End-to-end tests are included.**
- **Build only:** Plan 7 makes the `.dmg`; the 1.0.0 release comes after the hardware checks.

**Verified while planning** (each is built into a task):
- **The packaged app works:** it opens its library, imports through the utility process inside `app.asar`, plays through `fdp-media://`, reports its own version, and passes all six end-to-end tests. (Tasks 5, 6)
- **The ad-hoc signature verifies** (`codesign --verify --deep --strict`), and the binary holds `x86_64 arm64`. (Task 5)
- **Playwright's real drag and drop works** with the app's native HTML5 drags (library → program, reordering). Names need `exact: true` where one contains another ("Play" is inside "New playlist"). (Task 6)
- **Launched as `electron out/main/index.js`, the app reports Electron's version (44.4.5)**, because there's no `package.json` beside it. Launch it as `electron .` (the tests do) or packaged. (Task 6)

## Global Constraints

- **Everything in Plans 1–6 still applies:**
  - exact version pins, at least two weeks old
  - `node:sqlite` only; no schema change in this plan
  - renderers reach main only through their preload
  - Mantine with CSS Modules
  - Prettier settings
  - spec, CHANGELOG and AGENTS.md kept current
  - conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Side failures never stop the app (spec §10.1).** A backup that fails is logged, and startup goes on. Logging never throws. Uncaught errors are logged, not shown.
- **Test runs never touch the real library or the real log.** `FDP_USER_DATA` moves both the library and the logs.
- **Ask the user before any test that covers their screen** (the end-to-end tests open the control window but never the projector).
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.**

## Review Focus

These are the five failure modes most likely to bite an organizer. Each has a test in the task that owns it, or a check in its steps.

1. **The packaged app behaves differently from development:** asar paths, the utility process, the media scheme, the version. Task 6: `npm run test:e2e:dist` runs every end-to-end test against the packaged `.app`, including the version in the log.
2. **A start that can't back up stops the app.** The backup runs inside a `try` that only logs (Task 4, `openLibraryDatabase`). Task 1: "a brand-new, empty library has nothing to back up"; Task 6: "each start backs up the library first, and the log says so".
3. **The log fills the disk, or breaks the app when it can't be written.** Task 2: "rolls over to main.1.log when the file is full…" and "never throws, even when the log can't be written".
4. **Old backups pile up, or a stray file in the backups folder is deleted.** Task 1: "keeps the last 5 backups, and leaves other files alone".
5. **A downloaded copy won't open on another Mac** (Gatekeeper). Task 5 checks the ad-hoc signature; Task 7's README tells organizers how to open it the first time.

---

## File Structure

```
src/main/db/backup.ts          backupDatabase(db, dir, now): the startup backup (spec §10.1)
src/main/log/logger.ts         createLogger({ dir, now?, maxBytes?, keep? }): the app log
src/main/menu.ts               menuTemplate({ appName, dev, showSettings, revealLogs, revealBackups })
src/main/index.ts (modify)     logs path, backup before migrations, menu, About panel, error logging
src/shared/contract.ts, src/renderer/src/App.tsx (modify)   the app:showPage event (Settings…)
electron-builder.yml           the Universal .dmg (ad-hoc signed)
package.json (modify)          author; dist, test:e2e, test:e2e:dist scripts; the two dev dependencies
playwright.config.ts, e2e/app.ts, e2e/app.spec.ts   end-to-end tests
tsconfig.node.json, .gitignore (modify)
README.md, CONTRIBUTING.md, CHANGELOG.md, AGENTS.md, the spec (modify)
```

---

### Task 1: The startup backup

**Files:**
- Create: `src/main/db/backup.ts`
- Test: `tests/main/db/backup.test.ts`

**Interfaces:**
- Produces: **`backupDatabase(db: DatabaseSync, dir: string, now: Date): string | null`.** It copies the open library with `VACUUM INTO` to `<dir>/folk-dance-player-YYYY-MM-DD_HHMMSS-mmm.sqlite` and keeps the newest 5 such files, leaving any other files alone. It returns the copy's path, or `null` for a brand-new library (`user_version` 0). Errors are thrown; the caller logs them (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `tests/main/db/backup.test.ts`:

```ts
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { backupDatabase } from '../../../src/main/db/backup'
import { openDatabase } from '../../../src/main/db/connection'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-backup-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

// A library on disk with one song title in it, at schema version 3.
function library(dir: string, title = 'Hora'): DatabaseSync {
  const db = openDatabase(join(dir, 'folk-dance-player.sqlite'))
  db.exec(`CREATE TABLE songs (title TEXT); PRAGMA user_version = 3;`)
  db.prepare('INSERT INTO songs VALUES (?)').run(title)
  return db
}
const at = (minute: number) => new Date(2026, 9, 14, 20, minute, 5, 123)

describe('the startup backup (spec §10.1)', () => {
  test('copies the library, readable on its own, named by when it was taken', () => {
    const dir = tempDir()
    const db = library(dir)
    const path = backupDatabase(db, join(dir, 'backups'), at(30))
    expect(path).toBe(join(dir, 'backups', 'folk-dance-player-2026-10-14_203005-123.sqlite'))
    const copy = new DatabaseSync(path!, { readOnly: true })
    expect(copy.prepare('SELECT title FROM songs').all()).toEqual([{ title: 'Hora' }])
    expect(copy.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 })
  })

  test('keeps the last 5 backups, and leaves other files alone', () => {
    const dir = tempDir()
    const backups = join(dir, 'backups')
    const db = library(dir)
    backupDatabase(db, backups, at(1))
    writeFileSync(join(backups, 'notes.txt'), 'mine')
    for (let minute = 2; minute <= 7; minute++) backupDatabase(db, backups, at(minute))
    expect(readdirSync(backups).sort()).toEqual([
      'folk-dance-player-2026-10-14_200305-123.sqlite',
      'folk-dance-player-2026-10-14_200405-123.sqlite',
      'folk-dance-player-2026-10-14_200505-123.sqlite',
      'folk-dance-player-2026-10-14_200605-123.sqlite',
      'folk-dance-player-2026-10-14_200705-123.sqlite',
      'notes.txt'
    ])
  })

  test('a brand-new, empty library has nothing to back up', () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'folk-dance-player.sqlite'))
    expect(backupDatabase(db, join(dir, 'backups'), at(1))).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/db/backup.test.ts`
Expected: FAIL: "Cannot find module '../../../src/main/db/backup'".

- [ ] **Step 3: Implement**

Create `src/main/db/backup.ts`:

```ts
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

const KEEP = 5
const NAME = /^folk-dance-player-\d{4}-\d{2}-\d{2}_\d{6}-\d{3}\.sqlite$/

const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`

// Spec §10.1: at startup, before migrations, the library is copied to `dir` (VACUUM INTO: a
// consistent copy, safe while the database is open), keeping the newest `KEEP` copies. Names sort
// by time, so the oldest go first; other files in `dir` are left alone. A brand-new library
// (schema 0) has nothing to protect. Returns the copy's path, or null when none was made.
export function backupDatabase(db: DatabaseSync, dir: string, now: Date): string | null {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (user_version === 0) return null
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `folk-dance-player-${stamp(now)}.sqlite`)
  db.prepare('VACUUM INTO ?').run(path)
  const backups = readdirSync(dir)
    .filter((f) => NAME.test(f))
    .sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(dir, old), { force: true })
  }
  return path
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/db && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/db`: 72 pass; the suite: 593; typecheck and formatting are clean.

```bash
git add src/main/db/backup.ts tests/main/db/backup.test.ts
git commit -m "feat(db): back up the library to a rotating set of 5 copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The app log

**Files:**
- Create: `src/main/log/logger.ts`
- Test: `tests/main/log/logger.test.ts`

**Interfaces:**
- Produces: **`createLogger({ dir, now?, maxBytes? = 1_000_000, keep? = 3 }): Logger`** with `dir`, `info(message)`, `warn(message)` and `error(message, err?)`.
  - **Lines:** `<ISO time> [<level>] <message>`; an error adds `: <stack>`.
  - **Roll-over:** `main.log` rolls over to `main.1.log` … `main.<keep>.log` before a line would push it past `maxBytes`.
  - **It never throws.**

- [ ] **Step 1: Write the failing tests**

Create `tests/main/log/logger.test.ts`:

```ts
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createLogger } from '../../../src/main/log/logger'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-log-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const now = () => new Date('2026-10-14T20:30:05.123Z')

describe('the app log (spec §10.1)', () => {
  test('appends timestamped lines; an error carries its stack', () => {
    const dir = tempDir()
    const log = createLogger({ dir, now })
    log.info('Started 0.1.0')
    log.warn('Canva unreachable')
    log.error('Import failed', new Error('disk full'))
    const lines = readFileSync(join(dir, 'main.log'), 'utf8').split('\n')
    expect(lines[0]).toBe('2026-10-14T20:30:05.123Z [info] Started 0.1.0')
    expect(lines[1]).toBe('2026-10-14T20:30:05.123Z [warn] Canva unreachable')
    expect(lines[2]).toBe('2026-10-14T20:30:05.123Z [error] Import failed: Error: disk full')
    expect(lines[3]).toMatch(/^\s+at /) // the stack
    expect(log.dir).toBe(dir)
  })

  test('rolls over to main.1.log when the file is full, keeping a few old files', () => {
    const dir = tempDir()
    const log = createLogger({ dir, now, maxBytes: 200, keep: 2 })
    for (let i = 0; i < 20; i++) log.info(`line ${i} ${'x'.repeat(30)}`)
    expect(readdirSync(dir).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log'])
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toContain('line 19')
    expect(readFileSync(join(dir, 'main.log'), 'utf8').length).toBeLessThanOrEqual(200)
  })

  test('never throws, even when the log can’t be written', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'blocked'), '')
    const log = createLogger({ dir: join(dir, 'blocked'), now })
    expect(() => log.error('still fine', 'not an Error')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/log`
Expected: FAIL: "Cannot find module '../../../src/main/log/logger'".

- [ ] **Step 3: Implement**

Create `src/main/log/logger.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Logger {
  readonly dir: string
  info(message: string): void
  warn(message: string): void
  error(message: string, err?: unknown): void
}

const describe = (err: unknown): string =>
  err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)

// Spec §10.1: the app log, in `dir` (~/Library/Logs/Folk Dance Player). main.log rolls over to
// main.1.log … main.<keep>.log when it would pass `maxBytes`. Logging never throws: a log that
// can't be written must not stop the music.
export function createLogger(options: {
  dir: string
  now?: () => Date
  maxBytes?: number
  keep?: number
}): Logger {
  const { dir, now = () => new Date(), maxBytes = 1_000_000, keep = 3 } = options
  const file = (n: number) => join(dir, n === 0 ? 'main.log' : `main.${n}.log`)

  const rollOver = () => {
    rmSync(file(keep), { force: true })
    for (let n = keep - 1; n >= 0; n--) if (existsSync(file(n))) renameSync(file(n), file(n + 1))
  }

  const write = (level: 'info' | 'warn' | 'error', message: string) => {
    const line = `${now().toISOString()} [${level}] ${message}\n`
    try {
      mkdirSync(dir, { recursive: true })
      const size = existsSync(file(0)) ? statSync(file(0)).size : 0
      if (size > 0 && size + Buffer.byteLength(line) > maxBytes) rollOver()
      appendFileSync(file(0), line)
    } catch {
      // Nowhere left to report it.
    }
  }

  return {
    dir,
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message, err) =>
      write('error', err === undefined ? message : `${message}: ${describe(err)}`)
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/log && npm test && npm run typecheck && npx prettier --check .`
Expected: `tests/main/log`: 3 pass; the suite: 596; typecheck and formatting are clean.

```bash
git add src/main/log tests/main/log
git commit -m "feat(log): the app log, rolling over by size and never throwing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The app menu, and Settings… opening the Settings page

**Files:**
- Create: `src/main/menu.ts`
- Modify: `src/shared/contract.ts` (replace), `src/renderer/src/App.tsx` (replace)
- Test: `tests/main/app/menu.test.ts`, `tests/renderer/app.test.tsx` (replace)

**Interfaces:**
- Produces:
  - **`menuTemplate({ appName, dev, showSettings, revealLogs, revealBackups }): MenuItemConstructorOptions[]`.** The menus, in order:
    - the app menu: About, Settings… (`CmdOrCtrl+,`), Services, Hide, Quit
    - `editMenu`
    - View: reload and the developer tools in development only, then fullscreen
    - `windowMenu`
    - Help: Reveal Logs in Finder, Reveal Library Backups in Finder
  - **The event `'app:showPage': 'settings'`.** The control window switches to that page.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/app/menu.test.ts`:

```ts
import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, test, vi } from 'vitest'
import { menuTemplate } from '../../../src/main/menu'

function setup(dev = false) {
  const actions = {
    showSettings: vi.fn(),
    revealLogs: vi.fn(),
    revealBackups: vi.fn()
  }
  return { actions, menu: menuTemplate({ appName: 'Folk Dance Player', dev, ...actions }) }
}

const submenu = (menu: MenuItemConstructorOptions[], label: string) =>
  menu.find((m) => m.label === label || m.role === label)!.submenu as MenuItemConstructorOptions[]
const item = (items: MenuItemConstructorOptions[], label: string) =>
  items.find((i) => i.label === label)!
const click = (i: MenuItemConstructorOptions) => (i.click as () => void)()

describe('the app menu', () => {
  test('the app menu has About, Settings… (⌘,) and Quit', () => {
    const { menu, actions } = setup()
    const app = submenu(menu, 'Folk Dance Player')
    expect(app[0].role).toBe('about')
    const settings = item(app, 'Settings…')
    expect(settings.accelerator).toBe('CmdOrCtrl+,')
    click(settings)
    expect(actions.showSettings).toHaveBeenCalled()
    expect(app.at(-1)!.role).toBe('quit')
  })

  test('Edit and Window are the standard ones, so copy, paste and ⌘W work', () => {
    const { menu } = setup()
    expect(menu.map((m) => m.role ?? m.label)).toEqual([
      'Folk Dance Player',
      'editMenu',
      'View',
      'windowMenu',
      'help'
    ])
  })

  test('Help reveals the logs and the library backups in Finder', () => {
    const { menu, actions } = setup()
    const help = submenu(menu, 'help')
    click(item(help, 'Reveal Logs in Finder'))
    click(item(help, 'Reveal Library Backups in Finder'))
    expect(actions.revealLogs).toHaveBeenCalled()
    expect(actions.revealBackups).toHaveBeenCalled()
  })

  test('the developer tools are in View only in development', () => {
    const roles = (dev: boolean) => submenu(setup(dev).menu, 'View').map((i) => i.role)
    expect(roles(true)).toContain('toggleDevTools')
    expect(roles(false)).not.toContain('toggleDevTools')
    expect(roles(false)).toContain('togglefullscreen')
  })
})
```

Replace `tests/renderer/app.test.tsx` with:

```tsx
import { MantineProvider } from '@mantine/core'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import App from '@renderer/App'
import { createFakeApi } from './fake-api'
import { playing, track } from './program/fixtures'
import { testTheme } from './test-theme'

const hora = track(101, 'Hora')

afterEach(() => {
  delete (window as { api?: unknown }).api
})

function setup() {
  const fake = createFakeApi({
    'player:getState': playing(hora),
    'player:pause': undefined,
    'app:getInfo': { version: '0.1.0', dbPath: '/data/fdp.sqlite', schemaVersion: 2 }
  })
  ;(window as { api?: unknown }).api = fake.api
  render(
    <MantineProvider theme={testTheme}>
      <App />
    </MantineProvider>
  )
  return fake
}

describe('App', () => {
  test('the player is above the tabs and keeps playing on every page', async () => {
    const fake = setup()
    const audio = screen.getByTestId('player-audio')
    await waitFor(() => expect((audio as HTMLAudioElement).src).toBe('fdp-media://file/101'))
    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(audio)
    expect(banner).toContainElement(screen.getByRole('tab', { name: 'Music' }))

    for (const tab of ['Music', 'Settings', 'Program']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      // The same element, never remounted: the song isn't cut off by changing pages.
      expect(screen.getByTestId('player-audio')).toBe(audio)
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Music' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
  })

  test('Settings… in the app menu opens the Settings page', async () => {
    const fake = setup()
    await screen.findByRole('tab', { name: 'Settings' })
    act(() => fake.emit('app:showPage', 'settings'))
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })

  test('the logo sits beside the page tabs', async () => {
    setup()
    const logo = await screen.findByRole('img', { name: 'Folk Dance Player' })
    expect(logo.closest('header')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/app/menu.test.ts tests/renderer/app.test.tsx`
Expected: FAIL. `menu.test.ts` can't import `menu`, and "Settings… in the app menu opens the Settings page" fails because the Settings tab isn't selected.

- [ ] **Step 3: Implement**

Create `src/main/menu.ts`:

```ts
import type { MenuItemConstructorOptions } from 'electron'

// The macOS menu bar (spec §10.1: Help → Reveal logs). Settings… opens the Settings page; the
// Edit menu gives text fields copy, paste and undo; Window gives ⌘W and ⌘M. The developer tools
// are offered only in development.
export function menuTemplate(o: {
  appName: string
  dev: boolean
  showSettings: () => void
  revealLogs: () => void
  revealBackups: () => void
}): MenuItemConstructorOptions[] {
  return [
    {
      label: o.appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: o.showSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(o.dev
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' }
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Reveal Logs in Finder', click: o.revealLogs },
        { label: 'Reveal Library Backups in Finder', click: o.revealBackups }
      ]
    }
  ]
}
```

Replace `src/shared/contract.ts` with:

```ts
import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress,
  ImportRequest,
  ImportSummary
} from './import'
import type {
  DancePatch,
  DanceSearchResult,
  LibraryQuery,
  LibraryRow,
  PlaylistSummary,
  ReapplyResult,
  SongDetail,
  SongTags,
  SongPatch,
  Suggestions
} from './library'
import type {
  PlayedEntry,
  PlayerState,
  ProgramDetail,
  ProgramSummary,
  RemoteStatus
} from './program'
import type {
  DisplayChoice,
  ProjectorProgress,
  ProjectorSnapshot,
  ProjectorStatus
} from './projector'
import type { SettingKey, Settings } from './settings'
import type { CanvaDeck, CanvaPage, CaptureStatus, DanceSlide, RefreshSummary } from './canva'

export interface AppInfo {
  version: string
  dbPath: string
  schemaVersion: number
}

export interface LibraryStats {
  fileCount: number
}

// Every renderer → main request. Add a channel here, to INVOKE_CHANNELS, and to createHandlers.
export interface InvokeContract {
  'app:getInfo': { args: []; result: AppInfo }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: Settings }
  'import:pickMusic': { args: []; result: string[] }
  'import:pickAppleLibrary': { args: []; result: string | null }
  'import:previewApple': { args: [xmlPath: string]; result: ApplePreview }
  'import:checkPlaylistConflicts': {
    args: [persistentIds: string[]]
    result: ApplePlaylistConflict[]
  }
  'import:start': { args: [request: ImportRequest]; result: ImportSummary }
  'import:cancel': { args: []; result: void }
  'library:stats': { args: []; result: LibraryStats }
  'library:list': { args: [query: LibraryQuery]; result: LibraryRow[] }
  'library:song': { args: [songId: number]; result: SongDetail | null }
  'library:updateSong': { args: [songId: number, patch: SongPatch]; result: void }
  'library:updateDance': { args: [danceId: number, patch: DancePatch]; result: void }
  'library:setTeacher': { args: [pairingId: number, teacher: string | null]; result: void }
  'library:setDefaultDance': { args: [songId: number, danceId: number]; result: void }
  'library:linkDance': { args: [songId: number, danceId: number]; result: void }
  'library:createDance': { args: [songId: number, name: string]; result: number }
  'library:unlinkDance': { args: [songId: number, danceId: number]; result: void }
  'library:mergeDances': { args: [keepId: number, removeId: number]; result: void }
  'library:sameDance': { args: [songId: number, ownId: number, otherId: number]; result: void }
  'library:markDifferent': { args: [danceA: number, danceB: number]; result: void }
  'library:searchDances': { args: [text: string]; result: DanceSearchResult[] }
  'library:setFavorite': { args: [fileIds: number[], favorite: boolean]; result: void }
  'library:songTags': { args: [songIds: number[]]; result: SongTags[] }
  'library:reapplyMapping': {
    args: [songIds: number[], mapping: ImportMapping]
    result: ReapplyResult
  }
  'library:suggestions': { args: []; result: Suggestions }
  'playlists:list': { args: []; result: PlaylistSummary[] }
  'playlists:create': { args: [name: string]; result: number }
  'playlists:rename': { args: [playlistId: number, name: string]; result: void }
  'playlists:duplicate': { args: [playlistId: number]; result: number }
  'playlists:delete': { args: [playlistId: number]; result: void }
  'playlists:add': { args: [playlistId: number, fileIds: number[]]; result: void }
  'playlists:remove': { args: [playlistId: number, itemIds: number[]]; result: void }
  'playlists:reorder': { args: [playlistId: number, itemIds: number[]]; result: void }
  // Holding places songs before `beforeFileId` (a held song) or at the end; held songs move.
  'library:setHolding': {
    args: [fileIds: number[], held: boolean, beforeFileId?: number | null]
    result: void
  }
  'programs:list': { args: [search: string]; result: ProgramSummary[] }
  'programs:get': { args: [programId: number]; result: ProgramDetail | null }
  'programs:create': { args: [name: string]; result: number }
  'programs:rename': { args: [programId: number, name: string]; result: void }
  'programs:duplicate': { args: [programId: number]; result: number }
  'programs:delete': { args: [programId: number]; result: void }
  // Loads a program (spec §6.1): it becomes current, and its files are checked (§10.1).
  'programs:setCurrent': { args: [programId: number | null]; result: void }
  'programs:addTracks': {
    args: [programId: number, fileIds: number[], beforeItemId: number | null]
    result: number[]
  }
  'programs:addStop': { args: [programId: number, beforeItemId: number | null]; result: number }
  'programs:reorder': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:removeItems': { args: [programId: number, itemIds: number[]]; result: void }
  'programs:setItemDance': { args: [itemId: number, danceId: number]; result: void }
  'programs:played': { args: [programId: number]; result: PlayedEntry[] }
  'player:getState': { args: []; result: PlayerState }
  'player:play': { args: []; result: void }
  'player:pause': { args: []; result: void }
  'player:stop': { args: []; result: void }
  'player:next': { args: []; result: void }
  'player:preview': { args: [fileId: number]; result: void }
  'player:replay': { args: [logId: number]; result: void }
  // Reports from the control window's <audio> element, for play `playId`.
  'player:ended': { args: [playId: number]; result: void }
  'player:failed': { args: [playId: number, message: string]; result: void }
  'player:setSpeed': { args: [speed: number]; result: void }
  'player:setSpeedLocked': { args: [locked: boolean]; result: void }
  'player:setVolume': { args: [volume: number]; result: void }
  'player:setAutoContinue': {
    args: [change: { enabled?: boolean; seconds?: number }]
    result: void
  }
  'player:dismissWarning': { args: []; result: void }
  'player:restart': { args: []; result: void }
  'remote:status': { args: []; result: RemoteStatus }
  // Asks macOS for Accessibility permission (its own dialog), then reports the status.
  'remote:requestAccess': { args: []; result: RemoteStatus }
  // The player bar's projector toggle (spec §8.1).
  'projector:status': { args: []; result: ProjectorStatus }
  'projector:setEnabled': { args: [on: boolean]; result: ProjectorStatus }
  'projector:displays': { args: []; result: DisplayChoice[] }
  'projector:setDisplay': { args: [displayId: number | null]; result: ProjectorStatus }
  // The projector window asks for the current snapshot when it loads.
  'projector:getSnapshot': { args: []; result: ProjectorSnapshot }
  // The control window reports the playing song's position, for the projector's red line.
  'projector:reportProgress': {
    args: [playId: number, positionMs: number, durationMs: number | null]
    result: void
  }
  // Canva slides (spec §6.3, §8.3): decks, a dance's slide, and refreshing the saved images.
  'canva:decks': { args: []; result: CanvaDeck[] }
  'canva:deckPages': { args: [deckId: number]; result: CanvaPage[] }
  'canva:addDeck': { args: [link: string]; result: CanvaDeck }
  'canva:linkSlide': {
    args: [danceId: number, deckId: number, position: number]
    result: DanceSlide | null
  }
  'canva:linkPageLink': { args: [danceId: number, link: string]; result: DanceSlide | null }
  'canva:clearSlide': { args: [danceId: number]; result: void }
  'canva:refreshSlides': { args: []; result: RefreshSummary }
  'canva:captureStatus': { args: []; result: CaptureStatus }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'settings:getAll',
  'settings:set',
  'import:pickMusic',
  'import:pickAppleLibrary',
  'import:previewApple',
  'import:checkPlaylistConflicts',
  'import:start',
  'import:cancel',
  'library:stats',
  'library:list',
  'library:song',
  'library:updateSong',
  'library:updateDance',
  'library:setTeacher',
  'library:setDefaultDance',
  'library:linkDance',
  'library:createDance',
  'library:unlinkDance',
  'library:mergeDances',
  'library:sameDance',
  'library:markDifferent',
  'library:searchDances',
  'library:setFavorite',
  'library:songTags',
  'library:reapplyMapping',
  'library:suggestions',
  'playlists:list',
  'playlists:create',
  'playlists:rename',
  'playlists:duplicate',
  'playlists:delete',
  'playlists:add',
  'playlists:remove',
  'playlists:reorder',
  'library:setHolding',
  'programs:list',
  'programs:get',
  'programs:create',
  'programs:rename',
  'programs:duplicate',
  'programs:delete',
  'programs:setCurrent',
  'programs:addTracks',
  'programs:addStop',
  'programs:reorder',
  'programs:removeItems',
  'programs:setItemDance',
  'programs:played',
  'player:getState',
  'player:play',
  'player:pause',
  'player:stop',
  'player:next',
  'player:preview',
  'player:replay',
  'player:ended',
  'player:failed',
  'player:setSpeed',
  'player:setSpeedLocked',
  'player:setVolume',
  'player:setAutoContinue',
  'player:dismissWarning',
  'player:restart',
  'remote:status',
  'remote:requestAccess',
  'projector:status',
  'projector:setEnabled',
  'projector:displays',
  'projector:setDisplay',
  'projector:getSnapshot',
  'projector:reportProgress',
  'canva:decks',
  'canva:deckPages',
  'canva:addDeck',
  'canva:linkSlide',
  'canva:linkPageLink',
  'canva:clearSlide',
  'canva:refreshSlides',
  'canva:captureStatus'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

// Every main → renderer event. Add a channel here and to EVENT_CHANNELS.
export interface EventContract {
  'import:progress': ImportProgress
  // Songs, dances, playlists or favorites changed (an edit or a finished import): refetch.
  'library:changed': null
  // Programs, their items or the play log changed: refetch.
  'programs:changed': null
  // The player's state after every change (spec §9).
  'player:state': PlayerState
  // To the control window: the projector opened, closed or moved.
  'projector:status': ProjectorStatus
  // To the projector window only: what to show, and the playing song's position.
  'projector:snapshot': ProjectorSnapshot
  'projector:progress': ProjectorProgress
  // Background slide captures started, progressed or finished.
  'canva:captureStatus': CaptureStatus
  // To the control window: the app menu asks for a page (Settings…).
  'app:showPage': 'settings'
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = [
  'import:progress',
  'library:changed',
  'programs:changed',
  'player:state',
  'projector:status',
  'projector:snapshot',
  'projector:progress',
  'canva:captureStatus',
  'app:showPage'
] as const satisfies readonly EventChannel[]

type MissingEvents = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
const allEventsListed: [MissingEvents] extends [never] ? true : MissingEvents = true
void allEventsListed

export interface RendererApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  // Subscribes to a main → renderer event; returns the unsubscribe function.
  on<C extends EventChannel>(channel: C, listener: (payload: EventContract[C]) => void): () => void
  // File paths for files dropped onto the window (Electron's webUtils.getPathForFile).
  getPathsForFiles(files: File[]): string[]
}

export type InvokeHandlers = {
  [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
}
```

Replace `src/renderer/src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { AppShell, Group, Tabs } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { useAppearance } from './appearance'
import Logo from './components/Logo'
import Sidebar from './components/Sidebar'
import { LibraryProvider } from './library/LibraryProvider'
import { ProgramProvider } from './program/ProgramProvider'
import PlayerBar from './program/PlayerBar'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'
import classes from './App.module.css'

type Page = 'program' | 'music' | 'settings'

// Before the header has been measured (and in tests, where nothing has a size).
const HEADER_FALLBACK = 170

// Spec §6: the player bar is above the tabs on every page, mounted once, so the audio keeps
// playing — and stays controllable — whichever page is open.
export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  const header = useElementSize()
  useAppearance(window.api)
  useEffect(() => window.api.on('app:showPage', setPage), [])
  return (
    <LibraryProvider api={window.api}>
      <ProgramProvider api={window.api}>
        <AppShell
          header={{ height: Math.ceil(header.height) || HEADER_FALLBACK }}
          navbar={{ width: 220, breakpoint: 0, collapsed: { desktop: page === 'settings' } }}
          padding="sm"
        >
          <AppShell.Header px="sm">
            <div ref={header.ref} className={classes.header}>
              <PlayerBar />
              <Group gap="sm" wrap="nowrap">
                <Logo
                  size={40}
                  label="Folk Dance Player"
                  color="var(--mantine-primary-color-filled)"
                />
                <Tabs value={page} onChange={(v) => v && setPage(v as Page)} variant="pills">
                  <Tabs.List>
                    <Tabs.Tab value="program">Program</Tabs.Tab>
                    <Tabs.Tab value="music">Music</Tabs.Tab>
                    <Tabs.Tab value="settings">Settings</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
              </Group>
            </div>
          </AppShell.Header>
          <AppShell.Navbar p="sm">
            <Sidebar />
          </AppShell.Navbar>
          <AppShell.Main className={classes.main}>
            {page === 'program' && <ProgramPage />}
            {page === 'music' && <MusicPage />}
            {page === 'settings' && <SettingsPage api={window.api} />}
          </AppShell.Main>
        </AppShell>
      </ProgramProvider>
    </LibraryProvider>
  )
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/app tests/renderer/app.test.tsx && npm test && npm run typecheck && npx prettier --check .`
Expected: those files: 12 pass; the suite: 601; typecheck and formatting are clean.

```bash
git add src/main/menu.ts src/shared/contract.ts src/renderer/src/App.tsx tests/main/app/menu.test.ts tests/renderer/app.test.tsx
git commit -m "feat(app): the app menu (Settings…, Edit, Window, Help) and app:showPage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wiring the backup, the log and the menu into the app

**Files:**
- Modify: `src/main/index.ts` (replace)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces, in the running app:
  - **The log:** `app.setAppLogsPath()`, so `~/Library/Logs/Folk Dance Player`, or `$FDP_USER_DATA/logs`. It records the start (with the version), each backup, finished imports, failed slide captures, uncaught exceptions and unhandled rejections, renderer and utility-process crashes, and renderer console errors.
  - **The backup:** `$userData/backups`, taken by `openLibraryDatabase` before `migrate`. A failure is logged and startup goes on.
  - **The menu:** `Menu.setApplicationMenu`, plus `app.setAboutPanelOptions`. Settings… shows the control window and sends `app:showPage`; Help reveals the log and backups folders.

This task changes only wiring. Its tests are the end-to-end tests of Task 6 ("Settings… in the app menu…" and "each start backs up the library first…"); here, the build and a two-start run check it.

- [ ] **Step 1: Implement**

Replace `src/main/index.ts` with:

```ts
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
  systemPreferences
} from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import type { EventChannel, EventContract } from '@shared/contract'
import { MEDIA_SCHEME, parseMediaUrl, parseSlideUrl } from '@shared/media'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CanvaService } from './canva/canva-service'
import { CaptureQueue } from './canva/capture-queue'
import { slideImagePath } from './canva/decks'
import { canvaFetcher, createCanvaPage, createLiveView } from './canva/electron-canva'
import { createSlideCapturer } from './canva/slide-capturer'
import { backupDatabase } from './db/backup'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { importDialogs } from './import/dialogs'
import { ImportService } from './import/import-service'
import { startUtilityWorker } from './import/utility-worker'
import { createHandlers } from './ipc/handlers'
import { createLogger } from './log/logger'
import { mediaResponse } from './media/media-response'
import { menuTemplate } from './menu'
import { KeepAwake } from './power/keep-awake'
import { ActivityWatcher } from './projector/activity'
import {
  ProjectorController,
  type DisplayInfo,
  type ProjectorWindow,
  type Rect
} from './projector/projector-controller'
import { createProjectorFeed } from './projector/projector-feed'
import { followProjectorWindow, LiveSlide } from './projector/live-slide'
import { registerMediaKeys } from './remote/media-keys'
import { checkProgramFiles } from './programs/file-check'
import { getProgram } from './programs/programs'
import { trackPath } from './programs/tracks'
import { PlayerSession } from './session/player-session'
import { createSessionPorts } from './session/session-ports'
import { guardNavigation } from './navigation'
import { registerHandlers } from './ipc/register'
import { SettingsStore } from './settings/settings-store'

// A separate library for end-to-end tests and smoke runs, so they never touch the real one.
if (process.env['FDP_USER_DATA']) app.setPath('userData', process.env['FDP_USER_DATA'])

// The app log (spec §10.1): ~/Library/Logs/Folk Dance Player, or beside a test library.
app.setAppLogsPath(
  process.env['FDP_USER_DATA'] ? join(process.env['FDP_USER_DATA'], 'logs') : undefined
)
const log = createLogger({ dir: app.getPath('logs') })
// Logged rather than shown: a side failure must never stop the music (spec §10.1).
process.on('uncaughtException', (err) => log.error('Uncaught exception', err))
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason))

// One app at a time: a second copy would open the same library and fight over the projector.
if (!app.requestSingleInstanceLock()) app.exit(0)

// The remote's media keys go to PlayerSession (global shortcuts, spec §7.4). Chromium's own media
// key handling would pause or play the <audio> element behind the session's back.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService')

// Audio is served to the control window by file id (spec §9). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }
])

// Loads one of the renderer's pages: index.html (the control window) or projector.html.
function loadPage(win: BrowserWindow, page: 'index.html' | 'projector.html'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}`)
  } else {
    win.loadFile(join(__dirname, '../renderer', page))
  }
}

// Spec §8.1: borderless over a whole display, above everything, never taking focus, so the
// control window keeps the keyboard. Always-on-top is set before the bounds, or macOS keeps the
// window below the menu bar.
// `hooks` lets the live Canva view follow the window (spec §8.3).
function createProjectorWindow(
  bounds: Rect,
  hooks: {
    opened(win: BrowserWindow): void
    resized(): void
    closed(win: BrowserWindow): void
  }
): ProjectorWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    enableLargerThanScreen: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#000',
    title: 'Folk Dance Player — Projector',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/projector.js'),
      sandbox: true
    }
  })
  hooks.opened(win)
  // Read-only: the mouse passes through, so the operator's cursor never wakes Canva's controls.
  // (Laptop mode still closes on mouse movement: ActivityWatcher polls the cursor.)
  win.setIgnoreMouseEvents(true)
  win.on('resize', hooks.resized)
  win.once('closed', () => hooks.closed(win))
  win.setAlwaysOnTop(true, 'screen-saver')
  // skipTransformProcessType: without it, macOS briefly makes the whole app a background app on
  // every call, hiding the control window and the Dock icon, and after sleep it can stay that way.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setBounds(bounds)
  guardNavigation(win.webContents)
  win.once('ready-to-show', () => win.showInactive())
  loadPage(win, 'projector.html')
  return {
    setBounds: (b) => win.setBounds(b),
    close: () => {
      if (!win.isDestroyed()) win.close()
    },
    onceClosed: (callback) => win.once('closed', callback),
    send: (channel, payload) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

const toDisplay = (d: Electron.Display): DisplayInfo => ({
  id: d.id,
  label: d.label || `Display ${d.id}`,
  internal: d.internal,
  bounds: d.bounds
})

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Folk Dance Player',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  win.on('ready-to-show', () => win.show())
  guardNavigation(win.webContents)
  loadPage(win, 'index.html')
  return win
}

function broadcast<C extends EventChannel>(channel: C, payload: EventContract[C]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

// Runs `fn` once after the current task, however many times it was asked for in it.
function coalesced(fn: () => void): () => void {
  let pending = false
  return () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      fn()
    })
  }
}

// Opens the library, backs it up (before any migration changes it), then migrates it.
function openLibraryDatabase(dbPath: string, backupsDir: string): DatabaseSync {
  const db = openDatabase(dbPath)
  try {
    const copy = backupDatabase(db, backupsDir, new Date())
    if (copy) log.info(`Backed up the library to ${copy}`)
  } catch (err) {
    log.error("Couldn't back up the library", err)
  }
  try {
    migrate(db, MIGRATIONS)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

function startupErrorMessage(err: unknown): string {
  if (err instanceof SchemaTooNewError) {
    return (
      'This music library was created by a newer version of Folk Dance Player ' +
      `(schema ${err.dbVersion}; this version supports up to ${err.appVersion}).\n\n` +
      'Please update the app. Your library has not been changed.'
    )
  }
  return `The music library could not be opened.\n\n${err instanceof Error ? err.message : String(err)}`
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folkdanceplayer.app')
  // The packaged app gets its icon from the bundle (build/icon.icns); unpackaged, the Dock would
  // show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(icon)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  log.info(`Folk Dance Player ${app.getVersion()} starting (Electron ${process.versions.electron})`)
  app.on('web-contents-created', (_, contents) => {
    contents.on('console-message', (e) => {
      if (e.level === 'error') log.warn(`Renderer: ${e.message}`)
    })
    contents.on('render-process-gone', (_, details) =>
      log.error(`A window's renderer stopped: ${details.reason}`)
    )
  })
  app.on('child-process-gone', (_, details) =>
    log.error(`The ${details.name ?? details.type} process stopped: ${details.reason}`)
  )

  const dbPath = join(app.getPath('userData'), 'folk-dance-player.sqlite')
  const backupsDir = join(app.getPath('userData'), 'backups')
  let db: DatabaseSync
  try {
    db = openLibraryDatabase(dbPath, backupsDir)
  } catch (err) {
    log.error("Couldn't open the library", err)
    dialog.showErrorBox('Folk Dance Player', startupErrorMessage(err))
    app.exit(1)
    return
  }

  const settings = new SettingsStore(db)
  // The projector's snapshot is rebuilt after anything it shows may have changed (set up below).
  let updateProjector = (): void => undefined
  const programsChanged = coalesced(() => {
    broadcast('programs:changed', null)
    updateProjector()
  })
  const libraryChanged = coalesced(() => {
    broadcast('library:changed', null)
    updateProjector()
  })
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    onProgress: (progress) => {
      broadcast('import:progress', progress)
      if (progress.phase === 'done') {
        log.info(`Import finished: ${progress.done} of ${progress.total} files read`)
        libraryChanged()
      }
    }
  })
  // A program that was deleted outside the app's control is forgotten; the current one's files
  // are checked before the event (spec §10.1). Playback never resumes on its own after a restart.
  const current = settings.get('currentProgramId')
  if (current !== null && !getProgram(db, current)) settings.set('currentProgramId', null)
  else if (current !== null) checkProgramFiles(db, current)

  const player = new PlayerSession(
    createSessionPorts(db, settings, undefined, { programsChanged, libraryChanged }),
    { setTimeout, clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) },
    (state) => {
      broadcast('player:state', state)
      updateProjector()
    }
  )
  protocol.handle(MEDIA_SCHEME, (request) => {
    const fileId = parseMediaUrl(request.url)
    const slide = parseSlideUrl(request.url)
    const path =
      fileId !== null
        ? trackPath(db, fileId)
        : slide
          ? slideImagePath(db, slide.deckId, slide.pageId)
          : null
    return mediaResponse(path, request.headers.get('range'))
  })

  // Canva slides (spec §8.3): saved images under the app data folder, captured in the background.
  const slidesDir = join(app.getPath('userData'), 'slides')
  const captures = new CaptureQueue({
    db,
    capturer: createSlideCapturer({
      createPage: createCanvaPage,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    }),
    slidesDir,
    writeFile: async (path, data) => {
      await mkdir(slidesDir, { recursive: true })
      await writeFile(path, data)
    },
    onStatus: (status) => {
      broadcast('canva:captureStatus', status)
      if (!status.running && status.failed > 0)
        log.warn(`${status.failed} of ${status.total} slide images couldn't be saved`)
    },
    onCaptured: libraryChanged
  })
  const canva = new CanvaService({
    db,
    fetcher: canvaFetcher,
    queue: captures,
    onChange: libraryChanged
  })

  const mediaKeys = registerMediaKeys(globalShortcut, player)
  // macOS delivers media keys only to an app trusted for Accessibility; other platforms don't ask.
  const trusted = (prompt: boolean) =>
    process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(prompt)
  const remote = {
    status: () => ({ trusted: trusted(false), keys: mediaKeys }),
    requestAccess: () => ({ trusted: trusted(true), keys: mediaKeys })
  }

  // One control window; closing it quits, so the projector is never left on its own.
  const mainWindow = createMainWindow()
  mainWindow.on('closed', () => app.quit())
  app.setAboutPanelOptions({
    applicationName: 'Folk Dance Player',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Evan Kaiser',
    credits: 'For folk dance organizers. Inspired by MITPlayer.'
  })
  const reveal = (dir: string) => () =>
    void mkdir(dir, { recursive: true }).then(() => shell.openPath(dir))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        appName: 'Folk Dance Player',
        dev: is.dev,
        showSettings: () => {
          mainWindow.show()
          mainWindow.webContents.send('app:showPage', 'settings')
        },
        revealLogs: reveal(log.dir),
        revealBackups: reveal(backupsDir)
      })
    )
  )
  app.on('second-instance', () => {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  // The live Canva view lives in the projector window, over the saved image.
  const live: LiveSlide = new LiveSlide({
    createView: () => createLiveView(projectorWindows.current()!),
    online: () => projectorWindows.current() !== null && net.isOnline(),
    size: () => projectorWindows.current()?.getContentBounds() ?? null,
    onChange: () => updateProjector()
  })
  const projectorWindows = followProjectorWindow<BrowserWindow>(live)

  const controller = new ProjectorController({
    displays: () => screen.getAllDisplays().map(toDisplay),
    controlDisplayId: () =>
      mainWindow.isDestroyed()
        ? screen.getPrimaryDisplay().id
        : screen.getDisplayMatching(mainWindow.getBounds()).id,
    moveControlTo: (display) => {
      const { width, height } = mainWindow.getBounds()
      const area =
        screen.getAllDisplays().find((d) => d.id === display.id)?.workArea ?? display.bounds
      mainWindow.setBounds({
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width: Math.min(width, area.width),
        height: Math.min(height, area.height)
      })
    },
    createWindow: (bounds) =>
      createProjectorWindow(bounds, {
        opened: projectorWindows.opened,
        resized: () => live.resize(),
        closed: projectorWindows.closed
      }),
    settings: {
      enabled: () => settings.get('projector.enabled'),
      setEnabled: (on) => settings.set('projector.enabled', on),
      displayId: () => settings.get('projector.displayId')
    },
    onStatus: (status) => {
      broadcast('projector:status', status)
      updateProjector()
    }
  })
  const feed = createProjectorFeed({ db, player, projector: controller, live })
  const keepAwake = new KeepAwake(powerSaveBlocker)
  updateProjector = coalesced(() => {
    feed.update()
    keepAwake.update(
      KeepAwake.needed({
        projectorOpen: controller.status().open,
        status: player.getState().status
      })
    )
  })
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(event as 'display-added', () => controller.displaysChanged())
  }

  mainWindow.on('moved', () => controller.keepControlReachable())

  const activity = new ActivityWatcher({
    cursor: () => screen.getCursorScreenPoint(),
    systemIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    playing: () => ['playing', 'countdown'].includes(player.getState().status),
    autoFullscreen: () => ({
      enabled: settings.get('autoFullscreen.enabled'),
      seconds: settings.get('autoFullscreen.seconds')
    }),
    projector: controller
  })
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown') activity.keyInput(input.key)
  })
  const primaryId = () => screen.getPrimaryDisplay().id

  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs,
      player,
      remote,
      projector: {
        status: () => controller.status(),
        setEnabled: (on) => controller.setEnabled(on),
        displays: () =>
          screen.getAllDisplays().map((d) => ({
            id: d.id,
            label: toDisplay(d).label,
            primary: d.id === primaryId(),
            internal: d.internal
          })),
        displayChoiceChanged: () => controller.displayChoiceChanged(),
        snapshot: () => feed.snapshot(),
        progress: (progress) => feed.progress(progress)
      },
      canva: { service: canva, captureStatus: () => captures.current() },
      onLibraryChanged: () => {
        player.refresh() // labels or missing flags of the next item may have changed
        libraryChanged()
      },
      onProgramsChanged: programsChanged
    })
  )

  // After sleep, displays come back renumbered and windows may have moved: re-check them, and make
  // sure the control window is showing.
  powerMonitor.on('resume', () => {
    controller.displaysChanged()
    if (process.platform === 'darwin') void app.dock?.show()
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  })

  controller.start()
  activity.start()
  // Re-read the decks and capture linked slides that have no image yet (spec §8.3).
  void canva.startup(net.isOnline())
  app.on('will-quit', () => {
    activity.stop()
    globalShortcut.unregisterAll()
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Build, and start the app twice on a throwaway library**

Run (no projector, so nothing covers the screen; each start is closed after a few seconds, and the next waits for it to exit: a second copy would be turned away by the single-instance lock):

```bash
npm run build
rm -rf /tmp/fdp-p7
for i in 1 2; do
  env -u ELECTRON_RUN_AS_NODE FDP_USER_DATA=/tmp/fdp-p7 ./node_modules/.bin/electron . &
  sleep 6; kill $!; wait $! # the next start must not find this one still running
done
ls /tmp/fdp-p7/backups; cat /tmp/fdp-p7/logs/main.log
```

Expected: one backup, `folk-dance-player-<date>_<time>.sqlite`, from the second start (the first library was brand new). The log has two `[info] Folk Dance Player 0.1.0 starting (Electron 44.4.5)` lines and one `Backed up the library to …` line.

- [ ] **Step 3: Run the tests, typecheck and commit**

Run: `npm test && npm run typecheck && npx prettier --check .`
Expected: the suite: 601; typecheck and formatting are clean.

```bash
git add src/main/index.ts
git commit -m "feat(app): back up at startup, log to ~/Library/Logs, and set the app menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Universal `.dmg`

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`, `package-lock.json` (through `npm install`)

**Interfaces:**
- Produces:
  - **`npm run dist`:** builds and writes `dist/Folk Dance Player-<version>-universal.dmg`. It also leaves `dist/mac-universal/Folk Dance Player.app`, which Task 6 tests.
  - **The `.app`:** app ID `com.folkdanceplayer.app`, the icon from `build/icon.icns`, and ad-hoc signed (`identity: '-'`, no hardened runtime).

- [ ] **Step 1: Add electron-builder and the dist script**

Run: `npm install --save-dev --save-exact electron-builder@26.15.3`

Replace `package.json` with (this adds `author`, which electron-builder asks for, and the `dist` script):

```json
{
  "name": "folk-dance-player",
  "productName": "Folk Dance Player",
  "version": "0.1.0",
  "description": "A music player for folk dance organizers",
  "author": "Evan Kaiser",
  "main": "./out/main/index.js",
  "private": true,
  "scripts": {
    "dev": "env -u ELECTRON_RUN_AS_NODE electron-vite dev",
    "start": "env -u ELECTRON_RUN_AS_NODE electron-vite preview",
    "build": "npm run typecheck && electron-vite build",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write .",
    "dist": "npm run build && env -u ELECTRON_RUN_AS_NODE electron-builder --mac",
    "icon": "env -u ELECTRON_RUN_AS_NODE electron scripts/make-icon.cjs",
    "postinstall": "install-electron"
  },
  "dependencies": {
    "@electron-toolkit/preload": "3.0.2",
    "@electron-toolkit/utils": "4.0.0",
    "@mantine/core": "9.6.3",
    "@mantine/hooks": "9.6.3",
    "@tanstack/react-virtual": "3.14.13",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "2.0.0",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/node": "24.13.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "5.2.0",
    "electron": "44.4.5",
    "electron-builder": "26.15.3",
    "electron-vite": "5.0.0",
    "jsdom": "30.1.1",
    "music-metadata": "11.16.1",
    "plist": "5.0.0",
    "prettier": "3.9.9",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "typescript": "5.9.3",
    "vite": "7.3.6",
    "vitest": "4.1.11"
  },
  "allowScripts": {
    "esbuild@0.25.12": true,
    "esbuild@0.28.2": true
  }
}
```

Create `electron-builder.yml`:

```yaml
# Packaging (spec §9): a Universal macOS .dmg. Build with `npm run dist`; the result is in dist/.
appId: com.folkdanceplayer.app
productName: Folk Dance Player
copyright: Copyright © 2026 Evan Kaiser
directories:
  buildResources: build
  output: dist
# electron-vite's output; production dependencies are added by electron-builder.
files:
  - out/**
  - package.json
mac:
  target:
    - target: dmg
      arch: universal
  category: public.app-category.music
  icon: build/icon.icns
  # Ad-hoc signed until there's a Developer ID: Apple silicon needs a signature, and a consistent
  # one lets macOS offer "Open Anyway" for a downloaded copy. See CONTRIBUTING.md to sign and
  # notarize.
  identity: '-'
  hardenedRuntime: false
dmg:
  title: Folk Dance Player
```

- [ ] **Step 2: Build the `.dmg`**

Run: `npm run dist` (a few minutes; the first run downloads Electron for both architectures)
Expected: the log shows `signing … identityName=-`, `skipped macOS notarization`, and a `building … target=DMG arch=universal` line, and `dist/Folk Dance Player-0.1.0-universal.dmg` exists.

- [ ] **Step 3: Check the app**

Run:

```bash
APP="dist/mac-universal/Folk Dance Player.app"
codesign --verify --deep --strict "$APP" && echo "signature ok"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature"
lipo -archs "$APP/Contents/MacOS/Folk Dance Player"
ls -la dist/*.dmg
```

Expected: `signature ok`, `Identifier=com.folkdanceplayer.app`, `Signature=adhoc`, `x86_64 arm64`, and a `.dmg` of about 230 MB. Task 6 runs the end-to-end tests against this app.

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npm test && npm run typecheck && npx prettier --check .`
Expected: the suite: 601; typecheck and formatting are clean.

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "build: a Universal macOS .dmg with electron-builder (ad-hoc signed)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end tests, on the build and on the packaged app

**Files:**
- Create: `playwright.config.ts`, `e2e/app.ts`, `e2e/app.spec.ts`
- Modify: `package.json`, `package-lock.json` (through `npm install`), `tsconfig.node.json` (replace), `.gitignore` (replace)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - **The scripts:** `npm run test:e2e` builds, then runs the end-to-end tests against `out/`. `npm run test:e2e:dist` runs them against `dist/mac-universal/Folk Dance Player.app` (after `npm run dist`).
  - **The helpers:** `workspace(songs)` makes a throwaway library folder and a folder of silent 30-second MP3s. `launch(userData)` starts the app on that library and returns `{ app, page, invoke }`; when `FDP_APP` is set, it starts the packaged app.

- [ ] **Step 1: Add Playwright and the scripts**

Run: `npm install --save-dev --save-exact @playwright/test@1.63.0`

Replace `package.json` with:

```json
{
  "name": "folk-dance-player",
  "productName": "Folk Dance Player",
  "version": "0.1.0",
  "description": "A music player for folk dance organizers",
  "author": "Evan Kaiser",
  "main": "./out/main/index.js",
  "private": true,
  "scripts": {
    "dev": "env -u ELECTRON_RUN_AS_NODE electron-vite dev",
    "start": "env -u ELECTRON_RUN_AS_NODE electron-vite preview",
    "build": "npm run typecheck && electron-vite build",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run build && env -u ELECTRON_RUN_AS_NODE playwright test",
    "test:e2e:dist": "env -u ELECTRON_RUN_AS_NODE FDP_APP=\"dist/mac-universal/Folk Dance Player.app\" playwright test",
    "format": "prettier --write .",
    "dist": "npm run build && env -u ELECTRON_RUN_AS_NODE electron-builder --mac",
    "icon": "env -u ELECTRON_RUN_AS_NODE electron scripts/make-icon.cjs",
    "postinstall": "install-electron"
  },
  "dependencies": {
    "@electron-toolkit/preload": "3.0.2",
    "@electron-toolkit/utils": "4.0.0",
    "@mantine/core": "9.6.3",
    "@mantine/hooks": "9.6.3",
    "@tanstack/react-virtual": "3.14.13",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "2.0.0",
    "@playwright/test": "1.63.0",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/node": "24.13.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "5.2.0",
    "electron": "44.4.5",
    "electron-builder": "26.15.3",
    "electron-vite": "5.0.0",
    "jsdom": "30.1.1",
    "music-metadata": "11.16.1",
    "plist": "5.0.0",
    "prettier": "3.9.9",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "typescript": "5.9.3",
    "vite": "7.3.6",
    "vitest": "4.1.11"
  },
  "allowScripts": {
    "esbuild@0.25.12": true,
    "esbuild@0.28.2": true
  }
}
```

Replace `tsconfig.node.json` with (the end-to-end files are typechecked with main's settings):

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "vitest.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "tests/*.ts",
    "tests/main/**/*",
    "tests/shared/**/*",
    "e2e/**/*",
    "playwright.config.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  }
}
```

Replace `.gitignore` with:

```
node_modules/
dist/
out/
.DS_Store
*.log

# Written when the remote spike runs
docs/spikes/remote-spike/remote-log.txt

# Playwright
test-results/
playwright-report/
```

- [ ] **Step 2: Write the tests**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

// End-to-end tests (spec §10.2): the built app (`npm run build`), driven by Playwright, each test
// on its own throwaway library. One at a time: each opens the app's windows.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list'
})
```

Create `e2e/app.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mp3Bytes, type Id3Tags } from '../tests/main/helpers/audio-fixtures'

export interface Running {
  app: ElectronApplication
  page: Page // the control window
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
}

// A throwaway library folder and a music folder of silent MP3s (30 s each), removed afterwards.
export function workspace(songs: Id3Tags[]) {
  const root = mkdtempSync(join(tmpdir(), 'fdp-e2e-'))
  const music = join(root, 'music')
  mkdirSync(music)
  songs.forEach((tags, i) => writeFileSync(join(music, `${tags.title}.mp3`), mp3Bytes(tags, 30, i)))
  return {
    userData: join(root, 'library'),
    music,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}

// The packaged app, when FDP_APP names its .app (npm run test:e2e:dist); otherwise the build in
// out/, started as `electron .` so it reports its own version.
const PACKAGED = process.env['FDP_APP']
  ? join(process.env['FDP_APP'], 'Contents', 'MacOS', basename(process.env['FDP_APP'], '.app'))
  : null

// Starts the app on the library in `userData`.
export async function launch(userData: string): Promise<Running> {
  const env = { ...process.env, FDP_USER_DATA: userData } as Record<string, string>
  delete env['ELECTRON_RUN_AS_NODE'] // set by VS Code's terminal; Electron would run as Node
  const app = await electron.launch(
    PACKAGED ? { executablePath: PACKAGED, args: [], env } : { args: ['.'], env }
  )
  const page = await app.firstWindow()
  await page.getByRole('tab', { name: 'Program' }).waitFor()
  return {
    app,
    page,
    invoke: (channel, ...args) =>
      page.evaluate(
        ([c, a]) => (window as unknown as { api: { invoke: Function } }).api.invoke(c, ...a),
        [channel, args] as const
      )
  }
}
```

Create `e2e/app.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, workspace, type Running } from './app'

// Spec §10.2's end-to-end tests. The file dialog is native, so music is imported through the
// app's own import channel; everything after that goes through the windows.
const SONGS = [
  { title: 'Hora', genre: 'Romania' },
  { title: 'Kolo', genre: 'Serbia' },
  { title: 'Tfilati', genre: 'Israel' }
]

let space: ReturnType<typeof workspace>
let running: Running

test.beforeEach(async () => {
  space = workspace(SONGS)
  running = await launch(space.userData)
  await running.invoke('settings:set', 'countdown.seconds', 0)
  await running.invoke('import:start', { kind: 'paths', paths: [space.music] })
})

test.afterEach(async () => {
  await running?.app.close()
  space.cleanup()
})

const libraryRow = (title: string) =>
  running.page.getByRole('table', { name: 'Songs' }).getByRole('row').filter({ hasText: title })
const programItems = () =>
  running.page.getByRole('list', { name: 'Program items' }).getByRole('listitem')

test('import a folder, then search', async () => {
  const { page } = running
  await page.getByRole('tab', { name: 'Music' }).click()
  await expect(page.getByText('3 songs in your library')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search music' }).fill('kol')
  await expect(libraryRow('Kolo')).toBeVisible()
  await expect(libraryRow('Hora')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(libraryRow('Hora')).toBeVisible()
})

test('drag songs into a program, then reorder them', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await libraryRow('Hora').dragTo(program)
  await expect(programItems()).toHaveCount(1)
  await libraryRow('Kolo').dragTo(program)
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])
  await programItems()
    .filter({ hasText: 'Kolo' })
    .dragTo(programItems().filter({ hasText: 'Hora' }))
  await expect(programItems()).toHaveText([/Kolo/, /Hora/])
})

test('play, and the projector’s snapshot follows', async () => {
  const { page, invoke } = running
  await libraryRow('Tfilati').dragTo(page.getByRole('region', { name: 'Program' }))
  await expect(page.getByTestId('player-title')).toHaveText('Next up: Tfilati')
  type Snapshot = { middle: { kind: string; entry: { parts: { dance: string } } } | null }
  expect((await invoke<Snapshot>('projector:getSnapshot')).middle).toMatchObject({ kind: 'next' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('player-title')).toHaveText('Tfilati')
  await expect
    .poll(async () => (await invoke<Snapshot>('projector:getSnapshot')).middle)
    .toMatchObject({ kind: 'now', entry: { parts: { dance: 'Tfilati' } } })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
})

test('a program is saved, and loads again, also after a restart', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await libraryRow('Hora').dragTo(program)
  await libraryRow('Kolo').dragTo(program)
  await page.getByRole('button', { name: 'Rename program' }).click()
  await page.getByRole('dialog', { name: 'Rename program' }).getByLabel('Name').fill('Tuesday')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Program: Tuesday')).toBeVisible()

  // Another program, then back to Tuesday from the sidebar.
  await page.getByRole('button', { name: 'New program' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Wednesday')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Program: Wednesday')).toBeVisible()
  await expect(programItems()).toHaveCount(0)
  await page.getByRole('group', { name: 'Programs' }).getByText('Tuesday').click()
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])

  // Restart: Tuesday is still the loaded program, with its songs.
  await running.app.close()
  running = await launch(space.userData)
  await expect(running.page.getByText('Program: Tuesday')).toBeVisible()
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])
})

test('Settings… in the app menu opens the Settings page', async () => {
  await running.app.evaluate(({ Menu }) => {
    const app = Menu.getApplicationMenu()!.items[0].submenu!
    app.items.find((i) => i.label === 'Settings…')!.click()
  })
  await expect(running.page.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

test('each start backs up the library first, and the log says so', async () => {
  await running.app.close()
  running = await launch(space.userData)
  const backups = readdirSync(join(space.userData, 'backups'))
  expect(backups).toEqual([expect.stringMatching(/^folk-dance-player-.*\.sqlite$/)])
  const log = readFileSync(join(space.userData, 'logs', 'main.log'), 'utf8')
  expect(log).toMatch(/\[info\] Folk Dance Player 0\.\d+\.\d+ starting/)
  expect(log).toContain(`Backed up the library to ${join(space.userData, 'backups', backups[0])}`)
})
```

- [ ] **Step 3: Run them against the build**

These open the control window (never the projector) for about 20 seconds. Tell the user before running them.

Run: `npm run test:e2e`
Expected: `6 passed`. If a test fails on a name, remember that Playwright matches names case-insensitively and partially: use `exact: true` when one name is inside another.

- [ ] **Step 4: Run them against the packaged app**

Run: `npm run dist && npm run test:e2e:dist`
Expected: `6 passed`. That includes "each start backs up the library first…", whose log line shows the packaged app's own version, `0.1.0`.

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npm test && npm run typecheck && npx prettier --check .`
Expected: the suite: 601 (the end-to-end tests are separate); typecheck and formatting are clean.

```bash
git add package.json package-lock.json tsconfig.node.json .gitignore playwright.config.ts e2e
git commit -m "test(e2e): Playwright end-to-end tests on the build and the packaged app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs, and installing the `.dmg` like an organizer would

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`

- [ ] **Step 1: Install from the `.dmg` (ask the user first: it opens Finder and the app)**

Open `dist/Folk Dance Player-0.1.0-universal.dmg`, drag the app to Applications, and open it.
Expected:
- **The `.dmg` window:** "Folk Dance Player" with the app icon and an Applications shortcut.
- **First open:** a copy built on this Mac opens directly. A downloaded copy says "Folk Dance Player" can't be opened because it's from an unidentified developer; System Settings → Privacy & Security → Open Anyway opens it.
- **The running app:** shows its icon in the Dock, Folk Dance Player → About shows version 0.1.0, and Help → Reveal Logs in Finder opens `~/Library/Logs/Folk Dance Player`.

- [ ] **Step 2: Update the docs**

- **README:**
  - **Status:** Status: v0.x, feature-complete for v1 and in testing.
  - **A new "Install" section:** download the `.dmg`, drag the app to Applications, and open it. The first time, System Settings → Privacy & Security → Open Anyway, because the app isn't signed with a Developer ID yet. Your library lives in `~/Library/Application Support/Folk Dance Player`; backups are in its `backups` folder; logs are in `~/Library/Logs/Folk Dance Player`.
- **CONTRIBUTING.md:**
  - **Scripts:** `npm run dist`, `npm run test:e2e` and `npm run test:e2e:dist`.
  - **Signing and notarizing (untested until there's a Developer ID):**
    - Put the "Developer ID Application" certificate in the keychain.
    - Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
    - Run `npm run build && env -u ELECTRON_RUN_AS_NODE npx electron-builder --mac -c.mac.identity="Developer ID Application: <name> (<team>)" -c.mac.hardenedRuntime=true -c.mac.notarize=true`.
  - **Release checklist:**
    - `npm run test:e2e` and `npm run test:e2e:dist` pass.
    - Build the `.dmg` with `npm run dist`.
    - Attach it to the GitHub release.
- **Spec:**
  - **§9 Tooling, packaging:** electron-builder 26 makes a Universal `.dmg`, ad-hoc signed until there's a Developer ID; see the signing steps in CONTRIBUTING.md.
  - **§10.1:**
    - **Backups:** `$userData/backups`, taken before migrations, `VACUUM INTO`, the last 5 kept, never blocking startup.
    - **The log:** `main.log`, rolling over at 1 MB to 3 old files. It lists what's logged.
    - **The menu:** Help → Reveal Logs in Finder, Reveal Library Backups in Finder; Settings… (⌘,).
  - **§10.2:** the end-to-end tests run on the build and the packaged app (`npm run test:e2e`, `test:e2e:dist`), with the list of six.
  - **§13.2:** the release checklist's `.dmg` step.
  - **Carried over from the tweaks PR:**
    - the logo beside the page tabs (in the app's red) and in Settings → About
    - the app icon: the logo in white on a red tile, regenerated with `npm run icon`
- **CHANGELOG (`Unreleased`):**
  - a downloadable Universal `.dmg`
  - the library backed up at every start (last 5)
  - an app log with Help → Reveal Logs in Finder, and Reveal Library Backups in Finder
  - the app menu with Settings… (⌘,)
- **AGENTS.md:** add decisions for (newest first):
  - **Ad-hoc signing (`identity: '-'`) until a Developer ID:** why a consistent signature matters on Apple silicon and for Gatekeeper.
  - **Backups by `VACUUM INTO` before migrations, and why logging never throws.**
  - **End-to-end tests launch `electron .`, not `out/main/index.js`:** the version. Use `exact: true` for names. `FDP_APP` runs them against the packaged app.

- [ ] **Step 3: Check and commit**

Run: `npm test && npm run typecheck && npx prettier --check .`
Expected: the suite: 601; typecheck and formatting are clean.

```bash
git add README.md CONTRIBUTING.md CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md
git commit -m "docs: packaging, backups, logs and end-to-end tests in the spec, README and guides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
