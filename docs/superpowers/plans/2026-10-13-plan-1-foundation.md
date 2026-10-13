# Folk Dance Player — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Electron + React + TypeScript app that starts up, creates and migrates its SQLite database (the full schema from the spec), stores typed settings, and shows the control-window shell (sidebar + Program / Music / Settings pages). The Settings page reads and writes real settings through a typed IPC contract.

**Architecture:** The main process owns the database (`node:sqlite`) and every piece of state. Renderers call it only through one typed request/response contract (`src/shared/contract.ts`), exposed by the preload as `window.api.invoke`. Database code, the migration runner, the settings store and the IPC handlers are plain TypeScript with no Electron imports, so Vitest tests them directly against an in-memory database.

**Tech Stack:** Electron 44.4.5, electron-vite 5.0.0, Vite 7.3.6, React 19.3.0, TypeScript 5.9.3, `node:sqlite` (built into Node 24 / Electron 44), Vitest 4.1.11, Testing Library + jsdom, Prettier 3.9.9.

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §4 (data model) and §9 (architecture) before starting.

This is plan 1 of 7. Later plans: 2 Import · 3 Library · 4 Programs & playback · 5 Projector · 6 Canva slides · 7 Hardening & release.

## Global Constraints

- **macOS is the primary platform.** The code must not assume macOS except where a task says so.
- **Pin exact package versions** as listed in Task 1, with no `^` or `~`.
- **Use `node:sqlite` for the database,** not `better-sqlite3` or any other native SQLite add-on.
- **Every npm script that launches Electron must unset `ELECTRON_RUN_AS_NODE`.** VS Code's terminal sets it, and it makes Electron run as plain Node.
- **Renderers never touch Node or the database directly.** Every call goes through `window.api.invoke(channel, ...args)`, and the preload only allows channels listed in `INVOKE_CHANNELS`.
- **Keep the data layers separate.** Shareable song facts (`songs`), local file facts (`files`) and personal data (`file_prefs`, `playlists`, `slide_cache`) never share a table (spec §4).
- **Code style:** Prettier with `singleQuote: true`, `semi: false`, `printWidth: 100`, `trailingComma: none`.
- **File names** are kebab-case `.ts`. React components are PascalCase `.tsx`.
- **Commit after every task** with a conventional-commit message. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Review Focus

These are the five failure modes most likely to bite a real user that the spec implies but doesn't spell out. Each line names the condition and the expected behavior, and each has a test in the task that owns the code.

1. **Database from a newer app version** (`PRAGMA user_version` higher than this app knows): the app must refuse to touch it and show "created by a newer version" instead of corrupting it. Covered by Task 2 (`migrate` throws `SchemaTooNewError`, database unchanged) and Task 6 (startup dialog).
2. **A migration fails partway:** nothing from that migration may remain, and `user_version` must stay at the old value. Covered by Task 2.
3. **A stored setting holds a wrong-type or corrupt value** (hand-edited, or written by an older version): reading it returns the default and nothing crashes. Covered by Task 4.
4. **Searching without diacritics:** "pasa" must find "Paşa", and punctuation in values like "4-Wall" must not break the full-text index. Covered by Task 3.
5. **Launching from the VS Code terminal** (`ELECTRON_RUN_AS_NODE=1`): `npm run dev` and `npm start` must still open the app window. Covered by Task 1 (test asserts both scripts unset the variable).

---

## File Structure

```
package.json                     scripts, pinned deps
electron.vite.config.ts          build config for main / preload / renderer (+ @shared alias)
vitest.config.ts                 two test projects: node (main/shared) and renderer (jsdom)
tsconfig.json / tsconfig.node.json / tsconfig.web.json
.prettierrc.yaml / .prettierignore
src/shared/settings.ts           Settings type, DEFAULT_SETTINGS, SETTING_KEYS, isSettingKey, isValidSetting
src/shared/contract.ts           IPC contract types, INVOKE_CHANNELS, RendererApi, InvokeHandlers, AppInfo
src/main/index.ts                Electron entry: open DB, migrate, register IPC, create window
src/main/db/connection.ts        openDatabase(path) — pragmas
src/main/db/migrate.ts           migrate(), getSchemaVersion(), SchemaTooNewError, MigrationError
src/main/db/migrations/index.ts  MIGRATIONS list
src/main/db/migrations/001-initial.ts   full schema from spec §4
src/main/settings/settings-store.ts     SettingsStore, InvalidSettingError
src/main/ipc/handlers.ts         createHandlers(deps): InvokeHandlers
src/main/ipc/register.ts         registerHandlers(ipc, handlers)
src/preload/index.ts             exposes window.api
src/preload/index.d.ts           Window.api typing
src/renderer/index.html
src/renderer/src/main.tsx        React root
src/renderer/src/App.tsx         page switching + layout
src/renderer/src/styles.css
src/renderer/src/components/Sidebar.tsx
src/renderer/src/pages/ProgramPage.tsx
src/renderer/src/pages/MusicPage.tsx
src/renderer/src/pages/SettingsPage.tsx
tests/project.test.ts            package.json script guard
tests/main/helpers/test-db.ts    createTestDb()
tests/main/db/connection.test.ts
tests/main/db/migrate.test.ts
tests/main/db/schema.test.ts
tests/main/settings/settings-store.test.ts
tests/main/ipc/handlers.test.ts
tests/renderer/setup.ts
tests/renderer/settings-page.test.tsx
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.prettierrc.yaml`, `.prettierignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/env.d.ts`
- Create: `tests/project.test.ts`
- Delete: `spikes/` (throwaway spike; findings are in spec §11)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - **npm scripts:** `dev`, `start`, `build`, `typecheck`, `test`, `format`.
  - **Path aliases:** `@shared/*` → `src/shared/*` (main, preload, renderer, tests) and `@renderer/*` → `src/renderer/src/*`.

- [ ] **Step 1: Remove the spike and write `package.json`**

```bash
rm -rf spikes
```

`package.json`:

```json
{
  "name": "folk-dance-player",
  "productName": "Folk Dance Player",
  "version": "0.1.0",
  "description": "A music player for folk dance organizers",
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
    "format": "prettier --write ."
  },
  "dependencies": {
    "@electron-toolkit/preload": "3.0.2",
    "@electron-toolkit/utils": "4.0.0"
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
    "electron-vite": "5.0.0",
    "jsdom": "30.1.1",
    "prettier": "3.9.9",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "typescript": "5.9.3",
    "vite": "7.3.6",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Write the config files**

`electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
```

`vitest.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/*.test.ts', 'tests/main/**/*.test.ts', 'tests/shared/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx'],
          setupFiles: ['tests/renderer/setup.ts']
        }
      }
    ]
  }
})
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:

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
    "tests/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  }
}
```

`tsconfig.web.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts",
    "src/shared/**/*",
    "tests/renderer/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

`.prettierrc.yaml`:

```yaml
singleQuote: true
semi: false
printWidth: 100
trailingComma: none
```

`.prettierignore`:

```
out
dist
node_modules
package-lock.json
```

- [ ] **Step 3: Write the minimal app source**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

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
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.folkdanceplayer.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts` (filled in by Task 5):

```ts
export {}
```

`src/preload/index.d.ts` (filled in by Task 5):

```ts
export {}
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Folk Dance Player</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`src/renderer/src/App.tsx` (replaced in Task 6):

```tsx
export default function App(): React.JSX.Element {
  return <h1>Folk Dance Player</h1>
}
```

- [ ] **Step 4: Write the failing project test**

`tests/project.test.ts`:

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, test } from 'vitest'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))

describe('package.json', () => {
  // VS Code's terminal sets ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node.
  test.each(['dev', 'start'])('%s script unsets ELECTRON_RUN_AS_NODE', (name) => {
    expect(pkg.scripts[name]).toMatch(/^env -u ELECTRON_RUN_AS_NODE /)
  })

  test('all dependency versions are pinned exactly', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>
    const loose = Object.entries(all).filter(([, v]) => /^[\^~]/.test(v))
    expect(loose).toEqual([])
  })
})
```

- [ ] **Step 5: Install and run the tests**

```bash
npm install --no-audit --no-fund
npm install-scripts approve esbuild
npm test
```

Expected: `tests/project.test.ts` — 3 passed. (`npm install-scripts approve esbuild` writes an `allowScripts` entry to `package.json`; npm 12 blocks install scripts by default. Electron downloads its binary on first launch, not at install.)

- [ ] **Step 6: Check that the pins test catches a loose version**

Temporarily change `"vite": "7.3.6"` to `"vite": "^7.3.6"` in `package.json` and run `npm test`.
Expected: FAIL in "all dependency versions are pinned exactly", listing `vite`. Then revert the change and re-run `npm test`, which should PASS.

- [ ] **Step 7: Typecheck, build and launch**

```bash
npm run typecheck
npx electron-vite build
ELECTRON_RUN_AS_NODE=1 npm start
```

Expected:
- typecheck and build succeed.
- `npm start` opens a window titled "Folk Dance Player" with the heading "Folk Dance Player", even though `ELECTRON_RUN_AS_NODE=1` was set. The first launch prints "Downloading Electron binary...".

Quit the app (⌘Q).

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write .
git add -A
git commit -m "chore: scaffold Electron + React + TypeScript project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database connection and migration runner

**Files:**
- Create: `src/main/db/connection.ts`, `src/main/db/migrate.ts`
- Test: `tests/main/db/connection.test.ts`, `tests/main/db/migrate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `openDatabase(path: string): DatabaseSync` turns on foreign keys, sets a 5 s busy timeout, and uses WAL mode for files on disk.
  - `interface Migration { version: number; name: string; sql: string }`
  - `getSchemaVersion(db: DatabaseSync): number`
  - `migrate(db: DatabaseSync, migrations: readonly Migration[]): { from: number; to: number }`
  - `class SchemaTooNewError extends Error { dbVersion: number; appVersion: number }`
  - `class MigrationError extends Error { migration: Migration }` (with `cause` set)

- [ ] **Step 1: Write the failing tests**

`tests/main/db/connection.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

test('enables foreign keys', () => {
  const db = openDatabase(':memory:')
  expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
})

test('uses WAL journal mode for on-disk databases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-'))
  dirs.push(dir)
  const db = openDatabase(join(dir, 'test.sqlite'))
  expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
  db.close()
})
```

`tests/main/db/migrate.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import {
  getSchemaVersion,
  migrate,
  MigrationError,
  SchemaTooNewError,
  type Migration
} from '../../../src/main/db/migrate'

const m1: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' }
const m2: Migration = { version: 2, name: 'two', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY);' }

function tables(db: ReturnType<typeof openDatabase>): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name as string)
}

describe('migrate', () => {
  test('applies all migrations to a new database and sets user_version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, [m1, m2])).toEqual({ from: 0, to: 2 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(tables(db)).toEqual(['a', 'b'])
  })

  test('applies only pending migrations', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1])
    expect(migrate(db, [m1, m2])).toEqual({ from: 1, to: 2 })
    expect(tables(db)).toEqual(['a', 'b'])
  })

  test('is a no-op when up to date', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1, m2])
    expect(migrate(db, [m1, m2])).toEqual({ from: 2, to: 2 })
  })

  // Review Focus 1: a library written by a newer app version must not be touched.
  test('refuses a database newer than the app and leaves it unchanged', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1, m2])
    const error = (() => {
      try {
        migrate(db, [m1])
      } catch (e) {
        return e
      }
    })()
    expect(error).toBeInstanceOf(SchemaTooNewError)
    expect(error).toMatchObject({ dbVersion: 2, appVersion: 1 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(tables(db)).toEqual(['a', 'b'])
  })

  // Review Focus 2: a failing migration leaves nothing behind.
  test('rolls back a failing migration completely', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1])
    const bad: Migration = {
      version: 2,
      name: 'bad',
      sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY); CREATE TABLE a (id INTEGER PRIMARY KEY);'
    }
    expect(() => migrate(db, [m1, bad])).toThrow(MigrationError)
    expect(() => migrate(db, [m1, bad])).toThrow(/Migration 2 \(bad\) failed/)
    expect(getSchemaVersion(db)).toBe(1)
    expect(tables(db)).toEqual(['a'])
  })

  test('rejects a migration list that is not 1..n in order', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [m2])).toThrow(/must be numbered 1\.\.n in order/)
    expect(() => migrate(db, [m2, m1])).toThrow(/must be numbered 1\.\.n in order/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db`
Expected: FAIL — cannot resolve `src/main/db/connection` / `src/main/db/migrate`.

- [ ] **Step 3: Implement `connection.ts`**

```ts
import { DatabaseSync } from 'node:sqlite'

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;')
  return db
}
```

- [ ] **Step 4: Implement `migrate.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  name: string
  sql: string
}

export class SchemaTooNewError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number
  ) {
    super(`Database schema ${dbVersion} is newer than this app supports (${appVersion})`)
    this.name = 'SchemaTooNewError'
  }
}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    cause: unknown
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Migration ${migration.version} (${migration.name}) failed: ${detail}`, { cause })
    this.name = 'MigrationError'
  }
}

export function getSchemaVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[]
): { from: number; to: number } {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error('Migrations must be numbered 1..n in order')
  })
  const from = getSchemaVersion(db)
  const latest = migrations.length
  if (from > latest) throw new SchemaTooNewError(from, latest)

  for (const m of migrations.slice(from)) {
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new MigrationError(m, err)
    }
  }
  return { from, to: Math.max(from, latest) }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/db tests/main/db
git commit -m "feat(db): add SQLite connection and transactional migration runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Initial schema (migration 001)

**Files:**
- Create: `src/main/db/migrations/001-initial.ts`, `src/main/db/migrations/index.ts`
- Create: `tests/main/helpers/test-db.ts`
- Test: `tests/main/db/schema.test.ts`

**Interfaces:**
- Consumes: `openDatabase`, `migrate`, `Migration` (Task 2).
- Produces:
  - `MIGRATIONS: readonly Migration[]` from `src/main/db/migrations/index.ts`.
  - `createTestDb(): DatabaseSync` from `tests/main/helpers/test-db.ts`: in memory, fully migrated.
  - **Tables** (column names exactly as below; all later plans rely on them): `files`, `songs`, `songs_fts`, `file_prefs`, `slide_cache`, `playlists`, `playlist_items`, `programs`, `program_items`, `play_log`, `settings`.

- [ ] **Step 1: Write the test helper**

`tests/main/helpers/test-db.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'

export function createTestDb(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  return db
}
```

- [ ] **Step 2: Write the failing schema tests**

`tests/main/db/schema.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

function addFile(path = '/music/a.mp3'): number {
  const r = db
    .prepare(
      "INSERT INTO files (path, file_size, mtime_ms, source) VALUES (?, 1000, 1700000000000, 'files')"
    )
    .run(path)
  return Number(r.lastInsertRowid)
}

function addSong(fileId: number, fields: Record<string, string | number | null> = {}): number {
  const row = { title: 'Untitled', uuid: crypto.randomUUID(), ...fields }
  const cols = Object.keys(row)
  const r = db
    .prepare(
      `INSERT INTO songs (file_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`
    )
    .run(fileId, ...Object.values(row))
  return Number(r.lastInsertRowid)
}

function search(query: string): string[] {
  return db
    .prepare(
      'SELECT s.title FROM songs_fts JOIN songs s ON s.id = songs_fts.rowid WHERE songs_fts MATCH ? ORDER BY s.title'
    )
    .all(query)
    .map((r) => r.title as string)
}

beforeEach(() => {
  db = createTestDb()
})

describe('initial schema', () => {
  test('creates every table from spec §4', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
      .all()
      .map((r) => r.name as string)
    for (const t of [
      'files',
      'songs',
      'songs_fts',
      'file_prefs',
      'slide_cache',
      'playlists',
      'playlist_items',
      'programs',
      'program_items',
      'play_log',
      'settings'
    ]) {
      expect(names).toContain(t)
    }
  })

  test('file paths are unique', () => {
    addFile('/music/a.mp3')
    expect(() => addFile('/music/a.mp3')).toThrow(/UNIQUE/)
  })

  test('each file has at most one song', () => {
    const f = addFile()
    addSong(f)
    expect(() => addSong(f)).toThrow(/UNIQUE/)
  })

  test('apple_persistent_id is unique when present, many NULLs allowed', () => {
    addFile('/a.mp3')
    addFile('/b.mp3')
    const set = db.prepare('UPDATE files SET apple_persistent_id = ? WHERE path = ?')
    set.run('ABC123', '/a.mp3')
    expect(() => set.run('ABC123', '/b.mp3')).toThrow(/UNIQUE/)
  })

  test('deleting a file removes its song and prefs but keeps history', () => {
    const f = addFile()
    addSong(f, { title: 'Hora' })
    db.prepare('INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, 1)').run(f)
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('Tue')").run().lastInsertRowid)
    db.prepare(
      "INSERT INTO program_items (program_id, position, kind, file_id) VALUES (?, 1, 'track', ?)"
    ).run(p, f)
    db.prepare("INSERT INTO play_log (file_id, program_id, kind) VALUES (?, ?, 'program')").run(f, p)

    db.prepare('DELETE FROM files WHERE id = ?').run(f)

    expect(db.prepare('SELECT COUNT(*) n FROM songs').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM file_prefs').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT file_id FROM program_items').get()).toEqual({ file_id: null })
    expect(db.prepare('SELECT file_id FROM play_log').get()).toEqual({ file_id: null })
    expect(search('hora')).toEqual([])
  })

  test('check constraints reject invalid values', () => {
    const f = addFile()
    expect(() =>
      db.prepare('INSERT INTO file_prefs (file_id, difficulty) VALUES (?, 6)').run(f)
    ).toThrow(/CHECK/)
    expect(() => addSong(f, { canva_page: 0 })).toThrow(/CHECK/)
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('x')").run().lastInsertRowid)
    expect(() =>
      db
        .prepare(
          "INSERT INTO program_items (program_id, position, kind, file_id) VALUES (?, 1, 'stop', ?)"
        )
        .run(p, f)
    ).toThrow(/CHECK/)
    expect(() =>
      db.prepare("INSERT INTO play_log (file_id, kind) VALUES (?, 'other')").run(f)
    ).toThrow(/CHECK/)
  })

  test('programs.updated_at is set automatically', () => {
    db.prepare("INSERT INTO programs (name) VALUES ('x')").run()
    const row = db.prepare('SELECT created_at, updated_at FROM programs').get() as {
      created_at: string
      updated_at: string
    }
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(row.updated_at).toBe(row.created_at)
  })
})

describe('songs full-text index', () => {
  test('finds songs by title, teacher, choreographer, country and artist', () => {
    addSong(addFile('/1.mp3'), { title: 'Ajde Jano', country: 'Serbia' })
    addSong(addFile('/2.mp3'), { title: 'Tfilati', teacher: 'Sonia Dion' })
    addSong(addFile('/3.mp3'), { title: 'Mayim', choreographer: 'Else Dublon' })
    addSong(addFile('/4.mp3'), { title: 'Kendime', artist: 'Ensemble X' })
    expect(search('serbia')).toEqual(['Ajde Jano'])
    expect(search('sonia')).toEqual(['Tfilati'])
    expect(search('dublon')).toEqual(['Mayim'])
    expect(search('ensemble')).toEqual(['Kendime'])
  })

  // Review Focus 4: searching without diacritics, and punctuation in values.
  test('matches without diacritics and with prefixes', () => {
    addSong(addFile('/1.mp3'), { title: 'Ali Paşa', country: 'Türkiye' })
    expect(search('"pasa"')).toEqual(['Ali Paşa'])
    expect(search('"turk"*')).toEqual(['Ali Paşa'])
  })

  test('indexes values containing punctuation', () => {
    addSong(addFile('/1.mp3'), { title: 'Hasapiko', dance_type: '4-Wall', country: "Côte d'Ivoire" })
    expect(search('"ivoire"')).toEqual(['Hasapiko'])
  })

  test('stays in sync when a song is edited', () => {
    const s = addSong(addFile(), { title: 'Hora', teacher: 'Old Name' })
    db.prepare("UPDATE songs SET teacher = 'New Name' WHERE id = ?").run(s)
    expect(search('"old"')).toEqual([])
    expect(search('"new"')).toEqual(['Hora'])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db/schema.test.ts`
Expected: FAIL — cannot resolve `src/main/db/migrations`.

- [ ] **Step 4: Implement the migration**

`src/main/db/migrations/001-initial.ts`:

```ts
import type { Migration } from '../migrate'

const now = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

// Full v1 schema — spec §4. Three layers: local file facts (files), shareable song facts (songs),
// personal/local data (file_prefs, playlists, slide_cache).
export const initial: Migration = {
  version: 1,
  name: 'initial',
  sql: `
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      duration_ms INTEGER,
      content_hash TEXT,
      tag_title TEXT,
      tag_artist TEXT,
      tag_album_artist TEXT,
      tag_genre TEXT,
      source TEXT NOT NULL CHECK (source IN ('files', 'apple_xml')),
      apple_persistent_id TEXT,
      is_missing INTEGER NOT NULL DEFAULT 0 CHECK (is_missing IN (0, 1)),
      missing_reason TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE INDEX files_content_hash ON files (content_hash);
    CREATE UNIQUE INDEX files_apple_persistent_id ON files (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    CREATE TABLE songs (
      id INTEGER PRIMARY KEY,
      file_id INTEGER NOT NULL UNIQUE REFERENCES files (id) ON DELETE CASCADE,
      uuid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT,
      teacher TEXT,
      choreographer TEXT,
      country TEXT,
      dance_type TEXT,
      canva_url TEXT,
      canva_page INTEGER CHECK (canva_page IS NULL OR canva_page >= 1)
    );

    CREATE VIRTUAL TABLE songs_fts USING fts5 (
      title, teacher, choreographer, country, artist,
      content = 'songs', content_rowid = 'id',
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER songs_fts_insert AFTER INSERT ON songs BEGIN
      INSERT INTO songs_fts (rowid, title, teacher, choreographer, country, artist)
      VALUES (new.id, new.title, new.teacher, new.choreographer, new.country, new.artist);
    END;
    CREATE TRIGGER songs_fts_delete AFTER DELETE ON songs BEGIN
      INSERT INTO songs_fts (songs_fts, rowid, title, teacher, choreographer, country, artist)
      VALUES ('delete', old.id, old.title, old.teacher, old.choreographer, old.country, old.artist);
    END;
    CREATE TRIGGER songs_fts_update AFTER UPDATE ON songs BEGIN
      INSERT INTO songs_fts (songs_fts, rowid, title, teacher, choreographer, country, artist)
      VALUES ('delete', old.id, old.title, old.teacher, old.choreographer, old.country, old.artist);
      INSERT INTO songs_fts (rowid, title, teacher, choreographer, country, artist)
      VALUES (new.id, new.title, new.teacher, new.choreographer, new.country, new.artist);
    END;

    CREATE TABLE file_prefs (
      file_id INTEGER PRIMARY KEY REFERENCES files (id) ON DELETE CASCADE,
      is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
      in_holding INTEGER NOT NULL DEFAULT 0 CHECK (in_holding IN (0, 1)),
      difficulty INTEGER CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5)
    );

    CREATE TABLE slide_cache (
      canva_url TEXT NOT NULL,
      canva_page INTEGER NOT NULL,
      image_path TEXT,
      captured_at TEXT,
      last_error TEXT,
      PRIMARY KEY (canva_url, canva_page)
    );

    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('local', 'apple_xml')),
      apple_persistent_id TEXT,
      imported_at TEXT,
      modified_at TEXT NOT NULL DEFAULT ${now},
      created_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE UNIQUE INDEX playlists_apple_persistent_id ON playlists (apple_persistent_id)
      WHERE apple_persistent_id IS NOT NULL;

    CREATE TABLE playlist_items (
      id INTEGER PRIMARY KEY,
      playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE
    );
    CREATE INDEX playlist_items_order ON playlist_items (playlist_id, position);

    CREATE TABLE programs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${now},
      updated_at TEXT NOT NULL DEFAULT ${now}
    );
    CREATE INDEX programs_recent ON programs (updated_at DESC);

    CREATE TABLE program_items (
      id INTEGER PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('track', 'stop')),
      file_id INTEGER REFERENCES files (id) ON DELETE SET NULL,
      played_at TEXT,
      CHECK (kind = 'track' OR file_id IS NULL)
    );
    CREATE INDEX program_items_order ON program_items (program_id, position);

    CREATE TABLE play_log (
      id INTEGER PRIMARY KEY,
      file_id INTEGER REFERENCES files (id) ON DELETE SET NULL,
      played_at TEXT NOT NULL DEFAULT ${now},
      program_id INTEGER REFERENCES programs (id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('program', 'preview', 'replay'))
    );
    CREATE INDEX play_log_program ON play_log (program_id, played_at DESC);
    CREATE INDEX play_log_file ON play_log (file_id, played_at DESC);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `
}
```

The `strftime` default means `created_at` and `updated_at` get the same timestamp in one insert, so the `programs.updated_at` test passes.

`src/main/db/migrations/index.ts`:

```ts
import type { Migration } from '../migrate'
import { initial } from './001-initial'

// Append new migrations here; versions must stay 1..n in order.
export const MIGRATIONS: readonly Migration[] = [initial]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db`
Expected: PASS (all of Task 2's tests plus 11 schema tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations tests/main/helpers tests/main/db/schema.test.ts
git commit -m "feat(db): add initial schema with full-text song search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Typed settings and settings store

**Files:**
- Create: `src/shared/settings.ts`, `src/main/settings/settings-store.ts`
- Test: `tests/main/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: `createTestDb` (Task 3) and the `settings` table.
- Produces (`src/shared/settings.ts`):
  - `type TagTarget = 'artist' | 'teacher' | 'choreographer' | 'ignore'`
  - `interface WindowBounds { x: number; y: number; width: number; height: number }`
  - `interface Settings` (keys below), `type SettingKey = keyof Settings`
  - `DEFAULT_SETTINGS: Settings`, `SETTING_KEYS: readonly SettingKey[]`
  - `isSettingKey(key: unknown): key is SettingKey`
  - `isValidSetting<K extends SettingKey>(key: K, value: unknown): value is Settings[K]`
- Produces (`src/main/settings/settings-store.ts`):
  - `class SettingsStore { constructor(db: DatabaseSync); get<K>(key: K): Settings[K]; getAll(): Settings; set(key: unknown, value: unknown): void }`
  - `class InvalidSettingError extends Error`

- [ ] **Step 1: Write the failing tests**

`tests/main/settings/settings-store.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

let db: ReturnType<typeof createTestDb>
let store: SettingsStore

beforeEach(() => {
  db = createTestDb()
  store = new SettingsStore(db)
})

describe('SettingsStore', () => {
  test('returns defaults when nothing is stored', () => {
    expect(store.getAll()).toEqual(DEFAULT_SETTINGS)
    expect(store.get('autoContinue.enabled')).toBe(true)
    expect(store.get('autoContinue.seconds')).toBe(5)
  })

  test('persists a value and reads it back', () => {
    store.set('autoContinue.seconds', 12)
    expect(new SettingsStore(db).get('autoContinue.seconds')).toBe(12)
  })

  test('overwrites an existing value', () => {
    store.set('import.genreIsCountry', false)
    store.set('import.genreIsCountry', true)
    expect(store.get('import.genreIsCountry')).toBe(true)
  })

  test('stores structured values', () => {
    store.set('window.bounds', { x: 10, y: 20, width: 1200, height: 800 })
    store.set('danceTypeSuggestions', ['Line', 'Couple'])
    expect(store.get('window.bounds')).toEqual({ x: 10, y: 20, width: 1200, height: 800 })
    expect(store.get('danceTypeSuggestions')).toEqual(['Line', 'Couple'])
  })

  test('returned defaults are copies, not shared objects', () => {
    store.get('danceTypeSuggestions').push('Mutated')
    expect(store.get('danceTypeSuggestions')).toEqual(DEFAULT_SETTINGS.danceTypeSuggestions)
  })

  test('rejects unknown keys', () => {
    expect(() => store.set('nope', 1)).toThrow(InvalidSettingError)
  })

  test.each([
    ['autoContinue.seconds', -1],
    ['autoContinue.seconds', 2.5],
    ['autoContinue.seconds', '5'],
    ['import.artistTagTarget', 'composer'],
    ['import.genreIsCountry', 'yes'],
    ['danceTypeSuggestions', ['Line', '']],
    ['window.bounds', { x: 0, y: 0, width: 0, height: 10 }],
    ['currentProgramId', 0]
  ])('rejects invalid value for %s: %j', (key, value) => {
    expect(() => store.set(key, value)).toThrow(InvalidSettingError)
  })

  // Review Focus 3: wrong-type or corrupt stored values fall back to the default.
  test('falls back to the default for a wrong-type stored value', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('autoContinue.seconds', '\"ten\"')").run()
    expect(store.get('autoContinue.seconds')).toBe(5)
  })

  test('falls back to the default for corrupt JSON', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('autoContinue.enabled', '{not json')").run()
    expect(store.get('autoContinue.enabled')).toBe(true)
    expect(() => store.getAll()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/settings`
Expected: FAIL — cannot resolve `@shared/settings` / `settings-store`.

- [ ] **Step 3: Implement `src/shared/settings.ts`**

```ts
export type TagTarget = 'artist' | 'teacher' | 'choreographer' | 'ignore'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

// Spec §4 "Settings keys".
export interface Settings {
  'import.artistTagTarget': TagTarget
  'import.albumArtistTagTarget': TagTarget
  'import.genreIsCountry': boolean
  danceTypeSuggestions: string[]
  'autoContinue.enabled': boolean
  'autoContinue.seconds': number
  'countdown.seconds': number
  'projector.enabled': boolean
  'projector.displayId': number | null
  'autoFullscreen.enabled': boolean
  'autoFullscreen.seconds': number
  'window.bounds': WindowBounds | null
  currentProgramId: number | null
}

export type SettingKey = keyof Settings

export const DEFAULT_SETTINGS: Settings = {
  'import.artistTagTarget': 'artist',
  'import.albumArtistTagTarget': 'ignore',
  'import.genreIsCountry': true,
  danceTypeSuggestions: [
    'Open Circle',
    'Closed Circle',
    'Line',
    'Separated',
    '4-Wall',
    'Couple',
    'Mixer',
    'Trio',
    'Set'
  ],
  'autoContinue.enabled': true,
  'autoContinue.seconds': 5,
  'countdown.seconds': 5,
  'projector.enabled': false,
  'projector.displayId': null,
  'autoFullscreen.enabled': true,
  'autoFullscreen.seconds': 15,
  'window.bounds': null,
  currentProgramId: null
}

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as readonly SettingKey[]

const TAG_TARGETS: readonly unknown[] = ['artist', 'teacher', 'choreographer', 'ignore']

const isBool = (v: unknown): boolean => typeof v === 'boolean'
const isIntIn =
  (min: number, max: number) =>
  (v: unknown): boolean =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isTagTarget = (v: unknown): boolean => TAG_TARGETS.includes(v)
const isIdOrNull = (v: unknown): boolean => v === null || (Number.isInteger(v) && (v as number) > 0)
const isDisplayIdOrNull = (v: unknown): boolean => v === null || Number.isInteger(v)
const isBoundsOrNull = (v: unknown): boolean => {
  if (v === null) return true
  if (typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return (
    ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(b[k])) &&
    (b.width as number) > 0 &&
    (b.height as number) > 0
  )
}
const isSuggestionList = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length <= 100 &&
  v.every((s) => typeof s === 'string' && s.trim().length > 0)

const VALIDATORS: { [K in SettingKey]: (v: unknown) => boolean } = {
  'import.artistTagTarget': isTagTarget,
  'import.albumArtistTagTarget': isTagTarget,
  'import.genreIsCountry': isBool,
  danceTypeSuggestions: isSuggestionList,
  'autoContinue.enabled': isBool,
  'autoContinue.seconds': isIntIn(0, 600),
  'countdown.seconds': isIntIn(0, 60),
  'projector.enabled': isBool,
  'projector.displayId': isDisplayIdOrNull,
  'autoFullscreen.enabled': isBool,
  'autoFullscreen.seconds': isIntIn(5, 3600),
  'window.bounds': isBoundsOrNull,
  currentProgramId: isIdOrNull
}

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && Object.hasOwn(VALIDATORS, key)
}

export function isValidSetting<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  return VALIDATORS[key](value)
}
```

- [ ] **Step 4: Implement `src/main/settings/settings-store.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_SETTINGS,
  isSettingKey,
  isValidSetting,
  SETTING_KEYS,
  type SettingKey,
  type Settings
} from '@shared/settings'

export class InvalidSettingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSettingError'
  }
}

export class SettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  get<K extends SettingKey>(key: K): Settings[K] {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    if (row) {
      try {
        const value: unknown = JSON.parse(row.value)
        if (isValidSetting(key, value)) return value
      } catch {
        // Corrupt JSON: fall through to the default.
      }
    }
    return structuredClone(DEFAULT_SETTINGS[key])
  }

  getAll(): Settings {
    return Object.fromEntries(SETTING_KEYS.map((key) => [key, this.get(key)])) as unknown as Settings
  }

  set(key: unknown, value: unknown): void {
    if (!isSettingKey(key)) throw new InvalidSettingError(`Unknown setting: ${String(key)}`)
    if (!isValidSetting(key, value)) {
      throw new InvalidSettingError(`Invalid value for ${key}: ${JSON.stringify(value)}`)
    }
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/settings`
Expected: PASS (16 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/settings.ts src/main/settings tests/main/settings
git commit -m "feat(settings): add typed settings with validation and SQLite store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Typed IPC contract, handlers and preload bridge

**Files:**
- Create: `src/shared/contract.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`
- Test: `tests/main/ipc/handlers.test.ts`

**Interfaces:**
- Consumes: `SettingsStore` (Task 4); `Settings`, `SettingKey` (Task 4).
- Produces (`src/shared/contract.ts`):
  - `interface AppInfo { version: string; dbPath: string; schemaVersion: number }`
  - `interface InvokeContract` with these channels:
    - `'app:getInfo'`: `[]` → `AppInfo`
    - `'settings:getAll'`: `[]` → `Settings`
    - `'settings:set'`: `[key: SettingKey, value: unknown]` → `Settings`
  - `type InvokeChannel`, `InvokeArgs<C>`, `InvokeResult<C>`
  - `INVOKE_CHANNELS: readonly InvokeChannel[]`. A type-level check ensures it lists every channel.
  - `interface RendererApi { invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> }`
  - `type InvokeHandlers = { [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>> }`
- Produces (main):
  - `createHandlers(deps: { settings: SettingsStore; appInfo: () => AppInfo }): InvokeHandlers`
  - `registerHandlers(ipc: Pick<IpcMain, 'handle'>, handlers: InvokeHandlers): void`
- Produces (preload): `window.api: RendererApi`

**How to extend this in later plans:** to add a channel, (1) add it to `InvokeContract`, (2) add it to `INVOKE_CHANNELS` (the type check fails until you do), and (3) implement it in `createHandlers`.

- [ ] **Step 1: Write the failing tests**

`tests/main/ipc/handlers.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { INVOKE_CHANNELS } from '@shared/contract'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { registerHandlers } from '../../../src/main/ipc/register'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

const appInfo = { version: '0.1.0', dbPath: '/tmp/test.sqlite', schemaVersion: 1 }

function makeHandlers() {
  return createHandlers({ settings: new SettingsStore(createTestDb()), appInfo: () => appInfo })
}

describe('createHandlers', () => {
  test('app:getInfo returns app info', async () => {
    expect(await makeHandlers()['app:getInfo']()).toEqual(appInfo)
  })

  test('settings:getAll returns defaults for a new database', async () => {
    expect(await makeHandlers()['settings:getAll']()).toEqual(DEFAULT_SETTINGS)
  })

  test('settings:set saves and returns the updated settings', async () => {
    const h = makeHandlers()
    const result = await h['settings:set']('autoContinue.seconds', 9)
    expect(result['autoContinue.seconds']).toBe(9)
    expect((await h['settings:getAll']())['autoContinue.seconds']).toBe(9)
  })

  test('settings:set rejects invalid values', async () => {
    const h = makeHandlers()
    expect(() => h['settings:set']('autoContinue.seconds', -3)).toThrow(InvalidSettingError)
  })
})

describe('registerHandlers', () => {
  test('registers exactly the contract channels and forwards arguments', async () => {
    const registered = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    registerHandlers({ handle: (ch, fn) => void registered.set(ch, fn) }, makeHandlers())

    expect([...registered.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort())
    const settings = (await registered.get('settings:set')!({}, 'countdown.seconds', 3)) as {
      'countdown.seconds': number
    }
    expect(settings['countdown.seconds']).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/ipc`
Expected: FAIL — cannot resolve `@shared/contract`.

- [ ] **Step 3: Implement `src/shared/contract.ts`**

```ts
import type { SettingKey, Settings } from './settings'

export interface AppInfo {
  version: string
  dbPath: string
  schemaVersion: number
}

// Every renderer → main request. Add a channel here, to INVOKE_CHANNELS, and to createHandlers.
export interface InvokeContract {
  'app:getInfo': { args: []; result: AppInfo }
  'settings:getAll': { args: []; result: Settings }
  'settings:set': { args: [key: SettingKey, value: unknown]; result: Settings }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result']

export const INVOKE_CHANNELS = [
  'app:getInfo',
  'settings:getAll',
  'settings:set'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

export interface RendererApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
}

export type InvokeHandlers = {
  [C in InvokeChannel]: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
}
```

- [ ] **Step 4: Implement the handlers and registration**

`src/main/ipc/handlers.ts`:

```ts
import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { SettingsStore } from '../settings/settings-store'

export interface HandlerDeps {
  settings: SettingsStore
  appInfo: () => AppInfo
}

export function createHandlers(deps: HandlerDeps): InvokeHandlers {
  return {
    'app:getInfo': () => deps.appInfo(),
    'settings:getAll': () => deps.settings.getAll(),
    'settings:set': (key, value) => {
      deps.settings.set(key, value)
      return deps.settings.getAll()
    }
  }
}
```

`src/main/ipc/register.ts`:

```ts
import type { IpcMain } from 'electron'
import { INVOKE_CHANNELS, type InvokeHandlers } from '@shared/contract'

export function registerHandlers(ipc: Pick<IpcMain, 'handle'>, handlers: InvokeHandlers): void {
  for (const channel of INVOKE_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipc.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }
}
```

- [ ] **Step 5: Implement the preload bridge**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, type RendererApi } from '@shared/contract'

const allowed = new Set<string>(INVOKE_CHANNELS)

const api: RendererApi = {
  invoke: ((channel: string, ...args: unknown[]) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }) as RendererApi['invoke']
}

contextBridge.exposeInMainWorld('api', api)
```

`src/preload/index.d.ts`:

```ts
import type { RendererApi } from '../shared/contract'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/main/ipc && npm run typecheck`
Expected: PASS (5 tests). Typecheck succeeds.

Then check the exhaustiveness guard. Temporarily remove `'settings:set'` from `INVOKE_CHANNELS` and run `npm run typecheck`. Expected: an error on `allChannelsListed` mentioning `"settings:set"`. Restore the line and run `npm run typecheck` again; it should pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/contract.ts src/main/ipc src/preload tests/main/ipc
git commit -m "feat(ipc): add typed IPC contract, handlers and preload bridge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Startup wiring and control-window shell

**Files:**
- Modify: `src/main/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`
- Create: `src/renderer/src/styles.css`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/pages/ProgramPage.tsx`, `src/renderer/src/pages/MusicPage.tsx`, `src/renderer/src/pages/SettingsPage.tsx`
- Create: `tests/renderer/setup.ts`
- Test: `tests/renderer/settings-page.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - `SettingsPage({ api }: { api: RendererApi })` (default export from `pages/SettingsPage.tsx`).
  - `Sidebar()`, `ProgramPage()`, `MusicPage()` as layout placeholders. Plans 3 and 4 fill them in.
  - The app opens `<userData>/folk-dance-player.sqlite` at startup and migrates it. If that fails, it shows an error dialog and quits without touching the file.

- [ ] **Step 1: Write the renderer test setup and the failing Settings page tests**

`tests/renderer/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
```

`tests/renderer/settings-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { RendererApi } from '@shared/contract'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import SettingsPage from '@renderer/pages/SettingsPage'

function fakeApi(initial: Settings = DEFAULT_SETTINGS) {
  let current: Settings = { ...initial }
  const calls: unknown[][] = []
  const api: RendererApi = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      if (channel === 'settings:getAll') return current
      if (channel === 'app:getInfo')
        return { version: '0.1.0', dbPath: '/data/folk-dance-player.sqlite', schemaVersion: 1 }
      if (channel === 'settings:set') {
        const [key, value] = args as [keyof Settings, unknown]
        if (key === 'autoContinue.seconds' && (value as number) < 0) {
          throw new Error('Invalid value for autoContinue.seconds')
        }
        current = { ...current, [key]: value }
        return current
      }
      throw new Error(`unexpected channel ${channel}`)
    }) as RendererApi['invoke']
  }
  return { api, calls }
}

describe('SettingsPage', () => {
  test('shows the stored settings', async () => {
    const { api } = fakeApi({ ...DEFAULT_SETTINGS, 'autoContinue.seconds': 8 })
    render(<SettingsPage api={api} />)
    expect(await screen.findByLabelText('Genre is Country')).toBeChecked()
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue(8)
    expect(await screen.findByText('/data/folk-dance-player.sqlite')).toBeInTheDocument()
  })

  test('saves a toggled setting', async () => {
    const { api, calls } = fakeApi()
    render(<SettingsPage api={api} />)
    await userEvent.click(await screen.findByLabelText('Genre is Country'))
    expect(calls).toContainEqual(['settings:set', 'import.genreIsCountry', false])
    expect(screen.getByLabelText('Genre is Country')).not.toBeChecked()
  })

  test('saves a number setting', async () => {
    const { api, calls } = fakeApi()
    render(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Countdown before first song (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '3')
    await userEvent.tab()
    expect(calls).toContainEqual(['settings:set', 'countdown.seconds', 3])
  })

  test('shows an error and keeps the saved value when a save is rejected', async () => {
    const { api } = fakeApi()
    render(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Auto-continue after (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '-4')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save setting")
    // The field re-mounts after a rejected save, so look it up again.
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project renderer`
Expected: FAIL — cannot resolve `@renderer/pages/SettingsPage`.

- [ ] **Step 3: Implement the Settings page**

`src/renderer/src/pages/SettingsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { AppInfo, RendererApi } from '@shared/contract'
import type { SettingKey, Settings } from '@shared/settings'

type NumberKey = 'autoContinue.seconds' | 'countdown.seconds' | 'autoFullscreen.seconds'
type BooleanKey = 'import.genreIsCountry' | 'autoContinue.enabled' | 'autoFullscreen.enabled'

export default function SettingsPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a rejected save so number inputs re-mount showing the saved value.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    api.invoke('settings:getAll').then(setSettings)
    api.invoke('app:getInfo').then(setInfo)
  }, [api])

  async function save(key: SettingKey, value: unknown): Promise<void> {
    try {
      setSettings(await api.invoke('settings:set', key, value))
      setError(null)
    } catch (e) {
      setError(`Couldn't save setting: ${(e as Error).message}`)
      setRevision((r) => r + 1)
    }
  }

  if (!settings) return <p>Loading settings…</p>

  const checkbox = (key: BooleanKey, label: string): React.JSX.Element => (
    <label className="setting">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => save(key, e.target.checked)}
      />
      {label}
    </label>
  )

  const number = (key: NumberKey, label: string, min: number, max: number): React.JSX.Element => (
    <label className="setting">
      {label}
      <input
        key={`${key}-${revision}`}
        type="number"
        min={min}
        max={max}
        defaultValue={settings[key]}
        onBlur={(e) => {
          const value = Number(e.target.value)
          if (e.target.value !== '' && value !== settings[key]) save(key, value)
        }}
      />
    </label>
  )

  return (
    <div className="page settings-page">
      <h2>Settings</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section>
        <h3>Import</h3>
        {checkbox('import.genreIsCountry', 'Genre is Country')}
      </section>
      <section>
        <h3>Playback</h3>
        {checkbox('autoContinue.enabled', 'Auto-continue to the next song')}
        {number('autoContinue.seconds', 'Auto-continue after (seconds)', 0, 600)}
        {number('countdown.seconds', 'Countdown before first song (seconds)', 0, 60)}
      </section>
      <section>
        <h3>Fullscreen on this screen</h3>
        {checkbox('autoFullscreen.enabled', 'Show fullscreen view when idle')}
        {number('autoFullscreen.seconds', 'Idle time before fullscreen (seconds)', 5, 3600)}
      </section>
      {info && (
        <section className="about">
          <h3>About</h3>
          <p>Version {info.version}</p>
          <p>
            Library database (schema {info.schemaVersion}): <code>{info.dbPath}</code>
          </p>
        </section>
      )}
    </div>
  )
}
```

The database path is wrapped in its own `<code>` element so the test can find it with `findByText`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project renderer`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the shell: sidebar, placeholder pages, App, styles**

`src/renderer/src/components/Sidebar.tsx`:

```tsx
// Layout per spec §6.1. Library/playlist/program data arrives in plans 3 and 4.
export default function Sidebar(): React.JSX.Element {
  return (
    <nav className="sidebar" aria-label="Library">
      <h4>Library</h4>
      <ul>
        <li>♪ All Music</li>
        <li>★ Favorites</li>
      </ul>
      <h4>Playlists</h4>
      <p className="empty">No playlists yet</p>
      <h4>Programs</h4>
      <input type="search" placeholder="Search programs…" aria-label="Search programs" />
      <div className="programs-list">
        <p className="empty">No programs yet</p>
      </div>
    </nav>
  )
}
```

`src/renderer/src/pages/ProgramPage.tsx`:

```tsx
// Layout per spec §6.2. Filled in by plan 4.
export default function ProgramPage(): React.JSX.Element {
  return (
    <div className="page program-page">
      <div className="player-bar">Player</div>
      <div className="program-grid">
        <section className="panel">Previously played</section>
        <section className="panel">Holding</section>
        <section className="panel">Program</section>
        <section className="panel">Library</section>
      </div>
    </div>
  )
}
```

`src/renderer/src/pages/MusicPage.tsx`:

```tsx
// Spec §6.3. Filled in by plans 2 and 3.
export default function MusicPage(): React.JSX.Element {
  return (
    <div className="page">
      <h2>Music</h2>
      <p className="empty">Your library is empty.</p>
    </div>
  )
}
```

`src/renderer/src/App.tsx`:

```tsx
import { useState } from 'react'
import Sidebar from './components/Sidebar'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'

type Page = 'program' | 'music' | 'settings'
const PAGES: { id: Page; label: string }[] = [
  { id: 'program', label: 'Program' },
  { id: 'music', label: 'Music' },
  { id: 'settings', label: 'Settings' }
]

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  return (
    <div className={`app ${page === 'settings' ? 'no-sidebar' : ''}`}>
      <header className="tabs" role="tablist">
        {PAGES.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={page === p.id}
            onClick={() => setPage(p.id)}
          >
            {p.label}
          </button>
        ))}
      </header>
      {page !== 'settings' && <Sidebar />}
      <main>
        {page === 'program' && <ProgramPage />}
        {page === 'music' && <MusicPage />}
        {page === 'settings' && <SettingsPage api={window.api} />}
      </main>
    </div>
  )
}
```

`src/renderer/src/styles.css`:

```css
:root {
  --bg: #f6f6f7;
  --panel: #ffffff;
  --text: #1d1d1f;
  --muted: #6e6e73;
  --border: #d9d9de;
  --accent: #c8102e;
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1e;
    --panel: #2c2c2e;
    --text: #f2f2f7;
    --muted: #98989d;
    --border: #3a3a3c;
  }
}

body {
  margin: 0;
}

.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  height: 100vh;
}
.app.no-sidebar {
  grid-template-columns: 1fr;
}
.tabs {
  grid-column: 1 / -1;
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  border: 0;
  background: none;
  padding: 6px 14px;
  border-radius: 6px;
  color: var(--text);
  font: inherit;
}
.tabs button[aria-selected='true'] {
  background: var(--panel);
  font-weight: 600;
}
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 12px;
  border-right: 1px solid var(--border);
}
.sidebar h4 {
  margin: 14px 0 4px;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
}
.sidebar ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sidebar li {
  padding: 4px 6px;
}
.programs-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 6px;
}
main {
  min-height: 0;
  overflow: auto;
}
.page {
  padding: 12px 16px;
}
.empty {
  color: var(--muted);
}
.program-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}
.player-bar {
  padding: 10px;
  margin-bottom: 8px;
  background: var(--panel);
  border-radius: 8px;
}
.program-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 3fr;
  gap: 8px;
  min-height: 0;
}
.panel {
  background: var(--panel);
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
}
.settings-page section {
  margin-bottom: 18px;
}
.setting {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
.setting input[type='number'] {
  width: 70px;
}
.error {
  color: var(--accent);
}
```

`src/renderer/src/main.tsx` — add the stylesheet import as the first line:

```tsx
import './styles.css'
```

- [ ] **Step 6: Wire the database and IPC into the main process**

Replace `src/main/index.ts` with:

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { createHandlers } from './ipc/handlers'
import { registerHandlers } from './ipc/register'
import { SettingsStore } from './settings/settings-store'

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
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function openLibraryDatabase(dbPath: string): DatabaseSync {
  const db = openDatabase(dbPath)
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
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dbPath = join(app.getPath('userData'), 'folk-dance-player.sqlite')
  let db: DatabaseSync
  try {
    db = openLibraryDatabase(dbPath)
  } catch (err) {
    dialog.showErrorBox('Folk Dance Player', startupErrorMessage(err))
    app.exit(1)
    return
  }

  const settings = new SettingsStore(db)
  registerHandlers(
    ipcMain,
    createHandlers({
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) })
    })
  )

  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
  app.on('will-quit', () => db.close())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 7: Run all tests, typecheck and build**

```bash
npm test
npm run build
```

Expected:
- All tests pass: the project tests, every node test from Tasks 2–5, and the 4 renderer tests.
- Typecheck and build succeed.

- [ ] **Step 8: Manual check — the app runs end to end**

```bash
npm start
```

Expected:
1. The window shows the **Program / Music / Settings** tabs. Program and Music show the sidebar (Library, Playlists, Programs with a search box). Program shows the four-panel placeholder grid.
2. **Settings** shows the toggles and number fields, plus an About section with version `0.1.0`, schema `1` and a path ending in `Folk Dance Player/folk-dance-player.sqlite`.
3. Untick **Genre is Country**, change **Auto-continue after** to `9`, then press Tab. Quit with ⌘Q and run `npm start` again. Both changes are still there.
4. Type `-1` into **Auto-continue after** and press Tab. A red "Couldn't save setting…" message appears, and the field goes back to `9`.

- [ ] **Step 9: Manual check — a newer-schema database is refused (Review Focus 1)**

```bash
DB="$HOME/Library/Application Support/Folk Dance Player/folk-dance-player.sqlite"
cp "$DB" /tmp/fdp-backup.sqlite
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec('PRAGMA user_version = 99');d.close()" "$DB"
npm start
```

Expected: an error dialog saying "created by a newer version … (schema 99; this version supports up to 1)", and the app quits after OK.

Then confirm the file was untouched and restore it:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);console.log(d.prepare('PRAGMA user_version').get())" "$DB"
cp /tmp/fdp-backup.sqlite "$DB"
```

The first command prints `{ user_version: 99 }`. The `cp` restores your library.

- [ ] **Step 10: Format and commit**

```bash
npx prettier --write .
npm test
git add -A
git commit -m "feat(app): open and migrate library on startup; control-window shell and settings page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test` passes (project, database, schema, settings, IPC and renderer tests).
- `npm run build` succeeds.
- `npm start` opens the shell, and settings persist across restarts.
- A database from a newer version is refused without being modified.
