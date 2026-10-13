# Folk Dance Player — Plan 2: Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers can bring music into the library in bulk. They can add files and folders with a picker or by drag and drop, or import from Apple Music's `Library.xml` (the whole library or chosen playlists, with the playlists recreated). They confirm the tag mapping before each import, watch progress (and can cancel), and get a summary of what happened to every file.

**Architecture:**
- **Main process:** `ImportService` writes results to SQLite one file at a time, using the re-import rules in spec §5.4. It applies Apple playlists with the overwrite protection in §5.3 and streams progress to the renderer over a new event channel.
- **Utility process:** an Electron utility process, one per job, scans folders, reads tags and fingerprints files. Its job runner (`worker-core.ts`) has no Electron imports, so tests run the whole pipeline in-process against real generated MP3 files and Apple XML.
- **Renderer:** the Music page drives a Mantine dialog: mapping → Apple options → playlist decisions → progress → summary.

**Tech Stack:** As Plan 1, plus `music-metadata` 11.16.1 (tag reading) and `plist` 5.0.0 (Library.xml). Both are ESM-only, so they are **devDependencies** and Vite bundles them into the build.

**Spec:** `docs/superpowers/specs/2026-10-13-folk-dance-player-electron-design.md`. Read §4 (data model), §5 (importing music) and §9 (architecture).

This is plan 2 of 7. Plan 1 (Foundation) is merged. **Not in this plan:**
- **"Re-apply mapping to selected"** (spec §5.2) needs the song table, so it is in Plan 3, which reuses `mapTagsToSong()`.
- **Dropping onto the Program page's library list** arrives with that list in Plan 4, which reuses `DropZone`.

 Later plans: 3 Library · 4 Programs & playback · 5 Projector · 6 Canva slides · 7 Hardening & release.

## Global Constraints

- **Everything in Plan 1's Global Constraints still applies:**
  - exact version pins, at least two weeks old
  - `node:sqlite` only
  - renderers reach main only through `window.api`
  - Mantine components with CSS Modules
  - Prettier settings
  - CHANGELOG and AGENTS.md kept current
  - conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **`music-metadata` and `plist` must be devDependencies.** Both are ESM-only, and `plist` has no `require` export. As runtime dependencies, electron-vite leaves them out of the bundle, and the utility process crashes with an ES-module resolution error (verified). As devDependencies, Vite bundles them, and they work in the built app (verified).
- **Import `plist` as `import { parse } from 'plist'`.** Version 5 has no default export.
- **Playable formats** (Chromium `<audio>`): `.mp3 .m4a .aac .wav .flac .ogg .oga .opus`. AIFF and Apple Lossless are reported as "unsupported format" in v1 (spec §5.4).
- **Re-imports never overwrite song fields the user edited;** they only fill empty ones (spec §5.4). Edited Apple playlists are never replaced without the user's decision (spec §5.3).
- **Search-box text must go through `toFtsQuery()`.** Not needed in this plan, but don't bypass it if you touch search.
- **Run `npm run typecheck` and `npx prettier --check .` before every commit.** Plan 1's execution showed tests alone don't catch type errors in test files.

## Review Focus

These are the five failure modes most likely to bite an organizer. Each has a test in the task that owns it.

1. **Re-importing after editing a song:** hand-edited titles, teachers or countries must survive. Only empty fields are filled. Task 5: "refreshes raw tags but only fills song fields that are empty".
2. **Moving or renaming the music folder between imports:** the files must be relinked, keeping their songs, favorites and playlist entries, not duplicated. A copy whose original still exists is a new file. Task 5: the "relinks…" and "adds a copy…" tests.
3. **Non-ASCII and space-containing file paths in Library.xml** (`Ali%20Pa%C5%9Fa.mp3`): they must decode to the real path. Task 4: "reads tracks with decoded file paths…".
4. **Cancelling halfway:** already-imported songs are kept, and playlists are not half-written. Task 7: "stops early when cancelled…". The playlist step is skipped when cancelled.
5. **An edited Apple playlist on re-import:** never replaced silently. With no decision it is kept; "Keep both" turns the edited copy into a local playlist. Task 6 conflict tests, plus Task 9's UI decision test.

---

## File Structure

```
src/shared/import.ts                     request/progress/summary/preview types, ImportMapping, emptySummary()
src/shared/contract.ts (modify)          + import:* and library:stats channels, EventContract, on(), getPathsForFiles()
src/main/import/mapping.ts               mapTagsToSong(): tags → song fields using the mapping settings
src/main/import/formats.ts               classifyPath(), isPlayableCodec()
src/main/import/content-hash.ts          contentHash(): size + first/last 1 MB
src/main/import/scan.ts                  findAudioFiles(): expand picked/dropped files and folders
src/main/import/read-file.ts             readAudioFile(): facts + tags, or not_found/unsupported/unreadable
src/main/import/apple-library.ts         parseAppleLibrary(), previewAppleLibrary(), selectAppleImport()
src/main/import/save-file.ts             saveImportedFile(): added/updated/relinked/unchanged
src/main/import/save-playlists.ts        saveApplePlaylists(), findEditedApplePlaylists()
src/main/import/worker-protocol.ts       WorkerJob / WorkerMessage / WorkerHandle types
src/main/import/worker-core.ts           runWorkerJob(): the worker's job runner (no Electron)
src/main/import/in-process-worker.ts     WorkerHandle on the main event loop (tests)
src/main/import/worker-entry.ts          utility-process entry point
src/main/import/utility-worker.ts        WorkerHandle over utilityProcess.fork
src/main/import/import-service.ts        ImportService: run/cancel/previewApple/checkPlaylistConflicts
src/main/import/dialogs.ts               native file pickers
src/main/library/stats.ts                getLibraryStats()
src/main/ipc/handlers.ts (modify)        new channels
src/main/index.ts (modify)               create ImportService, broadcast progress
src/preload/index.ts (modify)            on(), getPathsForFiles()
src/renderer/src/ipc-error.ts            errorMessage(): strip Electron's IPC error prefix
src/renderer/src/import/*                useImportFlow + dialog steps + DropZone (+ .module.css)
src/renderer/src/pages/MusicPage.tsx     (modify) song count, import buttons, drop zone, dialog
src/renderer/src/App.tsx (modify)        pass api to MusicPage
tests/main/helpers/audio-fixtures.ts     mp3Bytes() (real ID3-tagged MP3s), tempDir()
tests/main/helpers/apple-xml.ts          appleLibraryXml(): Library.xml like Music.app exports
tests/main/import/*.test.ts              unit + pipeline tests
tests/renderer/fake-api.ts               createFakeApi() for component tests
tests/renderer/music-import.test.tsx     import UI tests
```

---

### Task 1: Dependencies, shared import types and tag mapping

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `src/shared/import.ts`, `src/main/import/mapping.ts`
- Test: `tests/main/import/mapping.test.ts`

**Interfaces:**
- Consumes: `TagTarget` from `src/shared/settings.ts` (Plan 1).
- Produces:
  - **`@shared/import`:** `ImportMapping`, `AppleSelection`, `PlaylistDecision`, `ImportRequest`, `ImportProgress`, `ImportSummaryItem`, `ImportSummary`, `ApplePlaylistInfo`, `ApplePreview`, `ApplePlaylistConflict`, `emptySummary()`.
  - **`mapping.ts`:** `RawTags { title; artist; albumArtist; genre }` (each `string | null`), `MappedSong { title: string; artist; teacher; choreographer; country }`, `mapTagsToSong(tags: RawTags, path: string, mapping: ImportMapping): MappedSong`. It also re-exports `ImportMapping`.

- [ ] **Step 1: Add the dependencies**

```bash
npm install --save-dev --save-exact music-metadata@11.16.1 plist@5.0.0
```

Expected: `package.json` devDependencies now include `"music-metadata": "11.16.1"` and `"plist": "5.0.0"`, with no `^`. `npm test` still passes; the pin test from Plan 1 guards the exact versions.

- [ ] **Step 2: Write the shared import types**

`src/shared/import.ts`:

```ts
// Types shared by the import pipeline (main + renderer). Spec §5.
import type { TagTarget } from './settings'

// The import mapping settings (spec §5.2), shown and editable before every import.
export interface ImportMapping {
  artistTagTarget: TagTarget
  albumArtistTagTarget: TagTarget
  genreIsCountry: boolean
}

export type AppleSelection = { mode: 'all' } | { mode: 'playlists'; persistentIds: string[] }

export type PlaylistDecision = 'replace' | 'keep' | 'both'

export type ImportRequest =
  | { kind: 'paths'; paths: string[] }
  | {
      kind: 'apple'
      xmlPath: string
      selection: AppleSelection
      // Only needed for Apple playlists edited locally since their last import (spec §5.3).
      decisions: Record<string, PlaylistDecision>
    }

export interface ImportProgress {
  phase: 'scanning' | 'reading' | 'done'
  done: number
  total: number
  currentPath: string | null
}

export interface ImportSummaryItem {
  path: string
  detail?: string
}

export interface ImportSummary {
  added: ImportSummaryItem[]
  updated: ImportSummaryItem[]
  relinked: ImportSummaryItem[]
  alreadyPresent: ImportSummaryItem[]
  notFound: ImportSummaryItem[]
  unsupported: ImportSummaryItem[]
  unreadable: ImportSummaryItem[]
  playlists: { created: string[]; replaced: string[]; kept: string[]; duplicated: string[] }
  cancelled: boolean
}

export interface ApplePlaylistInfo {
  persistentId: string
  name: string
  trackCount: number
}

export interface ApplePreview {
  trackCount: number
  playlists: ApplePlaylistInfo[]
}

export interface ApplePlaylistConflict {
  persistentId: string
  name: string
}

export function emptySummary(): ImportSummary {
  return {
    added: [],
    updated: [],
    relinked: [],
    alreadyPresent: [],
    notFound: [],
    unsupported: [],
    unreadable: [],
    playlists: { created: [], replaced: [], kept: [], duplicated: [] },
    cancelled: false
  }
}
```

- [ ] **Step 3: Write the failing mapping tests**

`tests/main/import/mapping.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { mapTagsToSong, type ImportMapping } from '../../../src/main/import/mapping'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'ignore',
  genreIsCountry: true
}

const tags = { title: 'Hora Mare', artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' }

describe('mapTagsToSong', () => {
  test('maps artist to artist and genre to country by default', () => {
    expect(mapTagsToSong(tags, '/m/hora.mp3', mapping)).toEqual({
      title: 'Hora Mare',
      artist: 'Taraf',
      teacher: null,
      choreographer: null,
      country: 'Romania'
    })
  })

  test('routes album artist to teacher when configured', () => {
    const song = mapTagsToSong(tags, '/m/hora.mp3', { ...mapping, albumArtistTagTarget: 'teacher' })
    expect(song.teacher).toBe('Sonia Dion')
    expect(song.artist).toBe('Taraf')
  })

  test('routes artist to choreographer when configured', () => {
    const song = mapTagsToSong(tags, '/m/hora.mp3', {
      ...mapping,
      artistTagTarget: 'choreographer'
    })
    expect(song.choreographer).toBe('Taraf')
    expect(song.artist).toBeNull()
  })

  test('the artist tag wins when both tags target the same field', () => {
    const song = mapTagsToSong(tags, '/m/hora.mp3', { ...mapping, albumArtistTagTarget: 'artist' })
    expect(song.artist).toBe('Taraf')
  })

  test('album artist fills a shared target when the artist tag is empty', () => {
    const song = mapTagsToSong({ ...tags, artist: null }, '/m/hora.mp3', {
      ...mapping,
      albumArtistTagTarget: 'artist'
    })
    expect(song.artist).toBe('Sonia Dion')
  })

  test('leaves country empty when genre is not country', () => {
    expect(
      mapTagsToSong(tags, '/m/hora.mp3', { ...mapping, genreIsCountry: false }).country
    ).toBeNull()
  })

  test('falls back to the file name for a missing or blank title', () => {
    expect(mapTagsToSong({ ...tags, title: null }, '/m/Ajde Jano.mp3', mapping).title).toBe(
      'Ajde Jano'
    )
    expect(mapTagsToSong({ ...tags, title: '  ' }, '/m/Ajde Jano.mp3', mapping).title).toBe(
      'Ajde Jano'
    )
  })

  test('trims values and treats blanks as empty', () => {
    const song = mapTagsToSong(
      { title: ' Hora ', artist: '  ', albumArtist: null, genre: ' Romania ' },
      '/m/x.mp3',
      mapping
    )
    expect(song).toMatchObject({ title: 'Hora', artist: null, country: 'Romania' })
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/main/import`
Expected: FAIL — `Cannot find module '../../../src/main/import/mapping'`.

- [ ] **Step 5: Implement the mapping**

`src/main/import/mapping.ts`:

```ts
import { basename, extname } from 'path'
import type { ImportMapping } from '@shared/import'

export type { ImportMapping }

export interface RawTags {
  title: string | null
  artist: string | null
  albumArtist: string | null
  genre: string | null
}

export interface MappedSong {
  title: string
  artist: string | null
  teacher: string | null
  choreographer: string | null
  country: string | null
}

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

// Spec §5.2: applied once when a song record is created (and by "Re-apply mapping").
export function mapTagsToSong(tags: RawTags, path: string, mapping: ImportMapping): MappedSong {
  const song: MappedSong = {
    title: clean(tags.title) ?? basename(path, extname(path)),
    artist: null,
    teacher: null,
    choreographer: null,
    country: mapping.genreIsCountry ? clean(tags.genre) : null
  }
  // The artist tag is applied first, so it wins when both tags target the same field.
  for (const [value, target] of [
    [clean(tags.artist), mapping.artistTagTarget],
    [clean(tags.albumArtist), mapping.albumArtistTagTarget]
  ] as const) {
    if (value && target !== 'ignore' && song[target] === null) song[target] = value
  }
  return song
}
```

- [ ] **Step 6: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 8 tests pass; typecheck and formatting are clean.

```bash
git add package.json package-lock.json src/shared/import.ts src/main/import/mapping.ts tests/main/import/mapping.test.ts
git commit -m "feat(import): add import types, dependencies and tag mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Finding music files: formats, fingerprint, folder scan

**Files:**
- Create: `src/main/import/formats.ts`, `src/main/import/content-hash.ts`, `src/main/import/scan.ts`
- Create: `tests/main/helpers/audio-fixtures.ts`
- Test: `tests/main/import/files.test.ts`

**Interfaces:**
- Produces:
  - `classifyPath(path: string): 'audio' | 'unsupported' | 'ignore'`
  - `isPlayableCodec(codec: string | undefined): boolean`
  - `contentHash(path: string): Promise<string>` (64 hex characters)
  - `findAudioFiles(roots: string[]): Promise<{ audio: string[]; unsupported: string[] }>`
  - **Test helpers:**
    - `mp3Bytes(tags: { title?; artist?; albumArtist?; genre? }, seconds = 1, salt = 0): Buffer` returns a real MP3 that `music-metadata` parses.
    - `tempDir(): { path; file(relative, contents): string; cleanup() }`

- [ ] **Step 1: Write the test helper**

`tests/main/helpers/audio-fixtures.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

export interface Id3Tags {
  title?: string
  artist?: string
  albumArtist?: string
  genre?: string
}

const syncsafe = (n: number): Buffer =>
  Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])

// A small, valid MP3: an ID3v2.4 tag (UTF-8 text frames) followed by silent MPEG-1 Layer III
// frames (128 kbps, 44.1 kHz; 417 bytes ≈ 26 ms each). `salt` changes the audio bytes, so files
// with identical tags still get different content hashes.
export function mp3Bytes(tags: Id3Tags, seconds = 1, salt = 0): Buffer {
  const ids: Record<keyof Id3Tags, string> = {
    title: 'TIT2',
    artist: 'TPE1',
    albumArtist: 'TPE2',
    genre: 'TCON'
  }
  const frames = (Object.keys(tags) as (keyof Id3Tags)[]).map((key) => {
    const data = Buffer.concat([Buffer.from([3]), Buffer.from(tags[key] ?? '', 'utf8')])
    return Buffer.concat([
      Buffer.from(ids[key], 'latin1'),
      syncsafe(data.length),
      Buffer.alloc(2),
      data
    ])
  })
  const body = Buffer.concat(frames)
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), syncsafe(body.length)])
  const frame = Buffer.alloc(417)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  frame[100] = salt & 0xff
  const count = Math.max(1, Math.round(seconds * 38.28))
  return Buffer.concat([header, body, ...Array.from({ length: count }, () => frame)])
}

export interface TempDir {
  path: string
  file(relative: string, contents: Buffer | string): string
  cleanup(): void
}

export function tempDir(): TempDir {
  const root = mkdtempSync(join(tmpdir(), 'fdp-import-'))
  return {
    path: root,
    file(relative, contents) {
      const full = join(root, relative)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, contents)
      return full
    },
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/import/files.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { symlinkSync } from 'fs'
import { join } from 'path'
import { contentHash } from '../../../src/main/import/content-hash'
import { classifyPath, isPlayableCodec } from '../../../src/main/import/formats'
import { findAudioFiles } from '../../../src/main/import/scan'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'

let dir: TempDir
beforeEach(() => {
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('classifyPath', () => {
  test.each(['a.mp3', 'a.M4A', 'a.aac', 'a.wav', 'a.flac', 'a.ogg', 'a.oga', 'a.opus'])(
    '%s is playable audio',
    (p) => expect(classifyPath(p)).toBe('audio')
  )
  test.each(['a.aif', 'a.aiff', 'a.wma', 'a.ape', 'a.alac', 'a.mid'])(
    '%s is audio we cannot play',
    (p) => expect(classifyPath(p)).toBe('unsupported')
  )
  test.each(['cover.jpg', 'notes.txt', 'a.m3u', 'noext'])('%s is ignored', (p) =>
    expect(classifyPath(p)).toBe('ignore')
  )
})

describe('isPlayableCodec', () => {
  test('rejects Apple Lossless', () => {
    expect(isPlayableCodec('ALAC')).toBe(false)
  })
  test('accepts common codecs and unknown ones', () => {
    expect(isPlayableCodec('MPEG 1 Layer 3')).toBe(true)
    expect(isPlayableCodec('MPEG-4/AAC')).toBe(true)
    expect(isPlayableCodec(undefined)).toBe(true)
  })
})

describe('contentHash', () => {
  test('is stable for the same bytes and differs for different bytes', async () => {
    const a = dir.file('a.mp3', mp3Bytes({ title: 'A' }, 120, 1))
    const b = dir.file('b.mp3', mp3Bytes({ title: 'A' }, 120, 1))
    const c = dir.file('c.mp3', mp3Bytes({ title: 'A' }, 120, 2))
    expect(await contentHash(a)).toBe(await contentHash(b))
    expect(await contentHash(a)).not.toBe(await contentHash(c))
  })

  test('includes the file size', async () => {
    const a = dir.file('a.bin', Buffer.alloc(10))
    const b = dir.file('b.bin', Buffer.alloc(11))
    expect(await contentHash(a)).not.toBe(await contentHash(b))
  })
})

describe('findAudioFiles', () => {
  test('walks folders recursively and sorts audio from unsupported files', async () => {
    dir.file('Balkan/Ajde Jano.mp3', 'x')
    dir.file('Balkan/Serbia/Kolo.flac', 'x')
    dir.file('Balkan/cover.jpg', 'x')
    dir.file('Old/Song.aiff', 'x')
    dir.file('Top.m4a', 'x')
    const found = await findAudioFiles([dir.path])
    expect(found.audio.map((p) => p.slice(dir.path.length + 1)).sort()).toEqual([
      'Balkan/Ajde Jano.mp3',
      'Balkan/Serbia/Kolo.flac',
      'Top.m4a'
    ])
    expect(found.unsupported.map((p) => p.slice(dir.path.length + 1))).toEqual(['Old/Song.aiff'])
  })

  test('accepts individual files as well as folders, without duplicates', async () => {
    const a = dir.file('a.mp3', 'x')
    dir.file('sub/b.mp3', 'x')
    const found = await findAudioFiles([a, dir.path, a])
    expect(found.audio.sort()).toEqual([a, join(dir.path, 'sub/b.mp3')].sort())
  })

  test('skips hidden files and folders', async () => {
    dir.file('.hidden/a.mp3', 'x')
    dir.file('._b.mp3', 'x')
    dir.file('c.mp3', 'x')
    const found = await findAudioFiles([dir.path])
    expect(found.audio).toEqual([join(dir.path, 'c.mp3')])
  })

  test('does not follow symlinked folders (no loops)', async () => {
    dir.file('music/a.mp3', 'x')
    symlinkSync(dir.path, join(dir.path, 'music/loop'))
    const found = await findAudioFiles([dir.path])
    expect(found.audio).toEqual([join(dir.path, 'music/a.mp3')])
  })

  test('ignores roots that do not exist', async () => {
    const found = await findAudioFiles([join(dir.path, 'missing')])
    expect(found).toEqual({ audio: [], unsupported: [] })
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/import/files.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/content-hash'`.

- [ ] **Step 4: Implement formats, fingerprint and scan**

`src/main/import/formats.ts`:

```ts
import { extname } from 'path'

// What Chromium's <audio> element can play (spec §5.4).
const PLAYABLE = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.oga', '.opus'])
// Audio formats we recognize but can't play in v1; reported as "unsupported format".
const UNSUPPORTED = new Set(['.aif', '.aiff', '.aifc', '.alac', '.wma', '.ape', '.mid', '.midi'])

export type PathKind = 'audio' | 'unsupported' | 'ignore'

export function classifyPath(path: string): PathKind {
  const ext = extname(path).toLowerCase()
  if (PLAYABLE.has(ext)) return 'audio'
  if (UNSUPPORTED.has(ext)) return 'unsupported'
  return 'ignore'
}

// Apple Lossless hides inside .m4a files, so the codec is checked after reading the file.
export function isPlayableCodec(codec: string | undefined): boolean {
  return codec?.toUpperCase() !== 'ALAC'
}
```

`src/main/import/content-hash.ts`:

```ts
import { createHash } from 'crypto'
import { open } from 'fs/promises'

const CHUNK = 1024 * 1024

// Spec §4: a fast fingerprint — file size plus the first and last 1 MB — used to recognize a
// file that was moved or renamed without re-hashing whole files.
export async function contentHash(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const hash = createHash('sha256').update(`${size}:`)
    const read = async (position: number, length: number): Promise<void> => {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      hash.update(buffer.subarray(0, bytesRead))
    }
    await read(0, Math.min(CHUNK, size))
    if (size > CHUNK) await read(Math.max(CHUNK, size - CHUNK), Math.min(CHUNK, size - CHUNK))
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}
```

`src/main/import/scan.ts`:

```ts
import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'
import { classifyPath } from './formats'

export interface ScanResult {
  audio: string[]
  unsupported: string[]
}

// Expands the files and folders the user picked or dropped into audio file paths. Folders are
// walked recursively; hidden entries (including macOS "._" files) and symlinked folders are
// skipped, and roots that don't exist are ignored.
export async function findAudioFiles(roots: string[]): Promise<ScanResult> {
  const audio = new Set<string>()
  const unsupported = new Set<string>()

  const consider = (path: string): void => {
    const kind = classifyPath(path)
    if (kind === 'audio') audio.add(path)
    else if (kind === 'unsupported') unsupported.add(path)
  }

  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) consider(path)
    }
  }

  for (const root of roots) {
    const info = await stat(root).catch(() => null)
    if (!info || basename(root).startsWith('.')) continue
    if (info.isDirectory()) await walk(root)
    else if (info.isFile()) consider(root)
  }
  return { audio: [...audio], unsupported: [...unsupported] }
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 35 tests pass (8 mapping + 27 file tests); typecheck and formatting are clean.

```bash
git add src/main/import tests/main/helpers/audio-fixtures.ts tests/main/import/files.test.ts
git commit -m "feat(import): find audio files, classify formats and fingerprint files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reading one audio file

**Files:**
- Create: `src/main/import/read-file.ts`
- Test: `tests/main/import/read-file.test.ts`

**Interfaces:**
- Consumes: `contentHash`, `classifyPath`, `isPlayableCodec` (Task 2); `RawTags` (Task 1).
- Produces:
  - `FileFacts { path; fileSize; mtimeMs; durationMs: number | null; contentHash; tags: RawTags }`
  - `ReadResult = { ok: true; facts } | { ok: false; path; reason: 'not_found' | 'unsupported' | 'unreadable'; detail }`
  - `KnownTags { tags: RawTags; durationMs: number | null; kind: string | null }`
  - `readAudioFile(path: string, known?: KnownTags): Promise<ReadResult>`

`music-metadata` doesn't throw on a corrupt file: it returns no `format.container`. That is what "unreadable" means here (verified).

- [ ] **Step 1: Write the failing tests**

`tests/main/import/read-file.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'path'
import { readAudioFile } from '../../../src/main/import/read-file'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'

let dir: TempDir
beforeEach(() => {
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('readAudioFile', () => {
  test('reads tags, duration, size and fingerprint from an MP3', async () => {
    const path = dir.file(
      'Kırmızı.mp3',
      mp3Bytes(
        { title: 'Kırmızı Gül', artist: 'Bora Özkök', albumArtist: 'Ensemble', genre: 'Turkey' },
        2
      )
    )
    const result = await readAudioFile(path)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.facts).toMatchObject({
      path,
      tags: { title: 'Kırmızı Gül', artist: 'Bora Özkök', albumArtist: 'Ensemble', genre: 'Turkey' }
    })
    expect(result.facts.fileSize).toBeGreaterThan(30_000)
    expect(result.facts.durationMs).toBeGreaterThan(1900)
    expect(result.facts.durationMs).toBeLessThan(2100)
    expect(result.facts.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('returns null tags for an untagged file', async () => {
    const result = await readAudioFile(dir.file('plain.mp3', mp3Bytes({})))
    expect(result.ok && result.facts.tags).toEqual({
      title: null,
      artist: null,
      albumArtist: null,
      genre: null
    })
  })

  test('uses known tags (from Apple Music) instead of parsing the file', async () => {
    const path = dir.file('song.mp3', mp3Bytes({ title: 'From the file' }))
    const known = {
      tags: { title: 'From Apple', artist: 'A', albumArtist: null, genre: 'Greece' },
      durationMs: 183000,
      kind: 'MPEG audio file'
    }
    const result = await readAudioFile(path, known)
    expect(result.ok && result.facts).toMatchObject({ tags: known.tags, durationMs: 183000 })
  })

  test('reports a missing file as not found', async () => {
    expect(await readAudioFile(join(dir.path, 'gone.mp3'))).toMatchObject({
      ok: false,
      reason: 'not_found'
    })
  })

  test('reports formats we cannot play as unsupported', async () => {
    expect(await readAudioFile(dir.file('a.aiff', 'x'))).toMatchObject({
      ok: false,
      reason: 'unsupported'
    })
  })

  test('reports Apple Lossless (by Apple Music kind) as unsupported', async () => {
    const path = dir.file('a.m4a', 'x')
    const known = {
      tags: { title: 'A', artist: null, albumArtist: null, genre: null },
      durationMs: 1000,
      kind: 'Apple Lossless audio file'
    }
    expect(await readAudioFile(path, known)).toMatchObject({ ok: false, reason: 'unsupported' })
  })

  test('reports a corrupt file as unreadable', async () => {
    const path = dir.file('broken.mp3', 'this is not audio at all '.repeat(40))
    expect(await readAudioFile(path)).toMatchObject({ ok: false, reason: 'unreadable', path })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/import/read-file.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/read-file'`.

- [ ] **Step 3: Implement**

`src/main/import/read-file.ts`:

```ts
import { stat } from 'fs/promises'
import { parseFile } from 'music-metadata'
import { contentHash } from './content-hash'
import { classifyPath, isPlayableCodec } from './formats'
import type { RawTags } from './mapping'

export interface FileFacts {
  path: string
  fileSize: number
  mtimeMs: number
  durationMs: number | null
  contentHash: string
  tags: RawTags
}

export type ReadFailure = 'not_found' | 'unsupported' | 'unreadable'

export type ReadResult =
  { ok: true; facts: FileFacts } | { ok: false; path: string; reason: ReadFailure; detail: string }

// Tags already known from Apple Music's Library.xml; the file itself isn't parsed (spec §5.3).
export interface KnownTags {
  tags: RawTags
  durationMs: number | null
  kind: string | null
}

const UNPLAYABLE_KINDS = /apple lossless|aiff/i

const fail = (path: string, reason: ReadFailure, detail: string): ReadResult => ({
  ok: false,
  path,
  reason,
  detail
})

export async function readAudioFile(path: string, known?: KnownTags): Promise<ReadResult> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return fail(path, 'not_found', 'File not found')
  if (classifyPath(path) !== 'audio') return fail(path, 'unsupported', 'Format not supported')
  if (known?.kind && UNPLAYABLE_KINDS.test(known.kind)) {
    return fail(path, 'unsupported', `${known.kind} is not supported`)
  }

  let tags: RawTags
  let durationMs: number | null
  if (known) {
    tags = known.tags
    durationMs = known.durationMs
  } else {
    try {
      const { format, common } = await parseFile(path)
      if (!format.container) return fail(path, 'unreadable', 'No audio data found')
      if (!isPlayableCodec(format.codec)) {
        return fail(path, 'unsupported', `${format.codec} is not supported`)
      }
      tags = {
        title: common.title ?? null,
        artist: common.artist ?? null,
        albumArtist: common.albumartist ?? null,
        genre: common.genre?.[0] ?? null
      }
      durationMs = format.duration ? Math.round(format.duration * 1000) : null
    } catch (err) {
      return fail(path, 'unreadable', err instanceof Error ? err.message : String(err))
    }
  }

  return {
    ok: true,
    facts: {
      path,
      fileSize: info.size,
      mtimeMs: Math.round(info.mtimeMs),
      durationMs,
      contentHash: await contentHash(path),
      tags
    }
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 42 tests pass; typecheck and formatting are clean.

```bash
git add src/main/import/read-file.ts tests/main/import/read-file.test.ts
git commit -m "feat(import): read tags, duration and fingerprint from an audio file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading Apple Music's Library.xml

**Files:**
- Create: `src/main/import/apple-library.ts`
- Create: `tests/main/helpers/apple-xml.ts`
- Test: `tests/main/import/apple-library.test.ts`

**Interfaces:**
- Consumes: `AppleSelection`, `ApplePreview` (Task 1); `RawTags` (Task 1).
- Produces:
  - **Types:** `AppleTrack { trackId; persistentId; path: string | null; tags: RawTags; durationMs; kind }`, `ApplePlaylist { persistentId; name; trackIds: number[] }`, `AppleLibrary { tracks: Map<number, AppleTrack>; playlists: ApplePlaylist[] }`, `class AppleLibraryError`.
  - **Functions:** `parseAppleLibrary(xml: string): AppleLibrary`, `previewAppleLibrary(lib): ApplePreview`, `selectAppleImport(lib, selection: AppleSelection): { tracks: AppleTrack[]; playlists: ApplePlaylist[] }`.
  - **Test helper:** `appleLibraryXml(tracks, playlists): string`.

**Rules (spec §5.3):**
- Tag values come from the XML.
- Streaming-only tracks (no `file://` `Location`, or a `Track Type` other than `File`) have no path and are skipped.
- System playlists (`Master`, `Distinguished Kind`), folders and hidden playlists are not the user's own.

- [ ] **Step 1: Write the test helper**

`tests/main/helpers/apple-xml.ts`:

```ts
import { build } from 'plist'
import { pathToFileURL } from 'url'

export interface FakeAppleTrack {
  id: number
  name: string
  path?: string // omitted = streaming-only track
  artist?: string
  albumArtist?: string
  genre?: string
  kind?: string
  totalTimeMs?: number
  persistentId?: string
}

export interface FakeApplePlaylist {
  name: string
  persistentId: string
  trackIds: number[]
  extra?: Record<string, unknown> // e.g. { Master: true }, { 'Distinguished Kind': 4 }, { Folder: true }
}

// Builds a Library.xml in the shape Music.app exports (File → Library → Export Library…).
export function appleLibraryXml(tracks: FakeAppleTrack[], playlists: FakeApplePlaylist[]): string {
  const trackDict: Record<string, Record<string, unknown>> = {}
  for (const t of tracks) {
    trackDict[String(t.id)] = {
      'Track ID': t.id,
      Name: t.name,
      ...(t.artist && { Artist: t.artist }),
      ...(t.albumArtist && { 'Album Artist': t.albumArtist }),
      ...(t.genre && { Genre: t.genre }),
      Kind: t.kind ?? 'MPEG audio file',
      'Total Time': t.totalTimeMs ?? 180000,
      'Persistent ID': t.persistentId ?? `TRACK${String(t.id).padStart(12, '0')}`,
      'Track Type': t.path ? 'File' : 'Remote',
      ...(t.path && { Location: pathToFileURL(t.path).href })
    }
  }
  return build({
    'Major Version': 1,
    'Minor Version': 1,
    'Application Version': '1.5.0.73',
    Tracks: trackDict,
    Playlists: playlists.map((p, i) => ({
      Name: p.name,
      'Playlist ID': 1000 + i,
      'Playlist Persistent ID': p.persistentId,
      'All Items': true,
      ...p.extra,
      'Playlist Items': p.trackIds.map((id) => ({ 'Track ID': id }))
    }))
  } as Parameters<typeof build>[0])
}
```

- [ ] **Step 2: Write the failing tests**

`tests/main/import/apple-library.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  AppleLibraryError,
  parseAppleLibrary,
  previewAppleLibrary,
  selectAppleImport
} from '../../../src/main/import/apple-library'
import { appleLibraryXml } from '../helpers/apple-xml'

const xml = appleLibraryXml(
  [
    {
      id: 101,
      name: 'Ajde Jano',
      path: '/Music/Balkan/Ajde Jano.mp3',
      artist: 'Ensemble',
      albumArtist: 'Bora Özkök',
      genre: 'Serbia',
      totalTimeMs: 201000,
      persistentId: 'AAA0000000000101'
    },
    { id: 102, name: 'Ali Paşa', path: '/Music/Ali Paşa.mp3', genre: 'Turkey' },
    { id: 103, name: 'Hora Mare', path: '/Music/Hora Mare.m4a', kind: 'Apple Lossless audio file' },
    { id: 104, name: 'Streaming Only' }
  ],
  [
    {
      name: 'Library',
      persistentId: 'LIB',
      trackIds: [101, 102, 103, 104],
      extra: { Master: true }
    },
    {
      name: 'Music',
      persistentId: 'MUS',
      trackIds: [101, 102],
      extra: { 'Distinguished Kind': 4 }
    },
    { name: 'Folk Folder', persistentId: 'FLD', trackIds: [], extra: { Folder: true } },
    { name: 'Hidden', persistentId: 'HID', trackIds: [101], extra: { Visible: false } },
    { name: 'Balkan', persistentId: 'BAL', trackIds: [102, 101, 104] },
    { name: 'Couple dances', persistentId: 'CPL', trackIds: [103] }
  ]
)

describe('parseAppleLibrary', () => {
  test('reads tracks with decoded file paths and Apple Music tags', () => {
    const lib = parseAppleLibrary(xml)
    expect(lib.tracks.get(101)).toEqual({
      trackId: 101,
      persistentId: 'AAA0000000000101',
      path: '/Music/Balkan/Ajde Jano.mp3',
      tags: { title: 'Ajde Jano', artist: 'Ensemble', albumArtist: 'Bora Özkök', genre: 'Serbia' },
      durationMs: 201000,
      kind: 'MPEG audio file'
    })
    expect(lib.tracks.get(102)?.path).toBe('/Music/Ali Paşa.mp3')
  })

  test('gives streaming-only tracks no path', () => {
    expect(parseAppleLibrary(xml).tracks.get(104)?.path).toBeNull()
  })

  test('keeps only the user’s own playlists, in order', () => {
    const lib = parseAppleLibrary(xml)
    expect(lib.playlists.map((p) => p.name)).toEqual(['Balkan', 'Couple dances'])
    expect(lib.playlists[0]).toEqual({
      persistentId: 'BAL',
      name: 'Balkan',
      trackIds: [102, 101, 104]
    })
  })

  test('rejects files that are not an Apple Music library', () => {
    expect(() => parseAppleLibrary('<plist version="1.0"><dict></dict></plist>')).toThrow(
      AppleLibraryError
    )
    expect(() => parseAppleLibrary('not xml at all')).toThrow(AppleLibraryError)
  })
})

describe('previewAppleLibrary', () => {
  test('counts local tracks and each playlist’s local tracks', () => {
    expect(previewAppleLibrary(parseAppleLibrary(xml))).toEqual({
      trackCount: 3,
      playlists: [
        { persistentId: 'BAL', name: 'Balkan', trackCount: 2 },
        { persistentId: 'CPL', name: 'Couple dances', trackCount: 1 }
      ]
    })
  })
})

describe('selectAppleImport', () => {
  test('whole library: every local track and every playlist', () => {
    const picked = selectAppleImport(parseAppleLibrary(xml), { mode: 'all' })
    expect(picked.tracks.map((t) => t.trackId)).toEqual([101, 102, 103])
    expect(picked.playlists.map((p) => p.persistentId)).toEqual(['BAL', 'CPL'])
  })

  test('chosen playlists: only their local tracks, without duplicates', () => {
    const picked = selectAppleImport(parseAppleLibrary(xml), {
      mode: 'playlists',
      persistentIds: ['BAL']
    })
    expect(picked.tracks.map((t) => t.trackId)).toEqual([102, 101])
    expect(picked.playlists.map((p) => p.persistentId)).toEqual(['BAL'])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/import/apple-library.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/apple-library'`.

- [ ] **Step 4: Implement**

`src/main/import/apple-library.ts`:

```ts
import { parse } from 'plist'
import { fileURLToPath } from 'url'
import type { AppleSelection, ApplePreview } from '@shared/import'
import type { RawTags } from './mapping'

export interface AppleTrack {
  trackId: number
  persistentId: string | null
  path: string | null // null for streaming-only tracks
  tags: RawTags
  durationMs: number | null
  kind: string | null
}

export interface ApplePlaylist {
  persistentId: string
  name: string
  trackIds: number[]
}

export interface AppleLibrary {
  tracks: Map<number, AppleTrack>
  playlists: ApplePlaylist[]
}

export class AppleLibraryError extends Error {
  constructor(message = 'This file is not an Apple Music library export (Library.xml).') {
    super(message)
    this.name = 'AppleLibraryError'
  }
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function trackPath(raw: Dict): string | null {
  const location = str(raw['Location'])
  const type = str(raw['Track Type'])
  if (!location?.startsWith('file://') || (type !== null && type !== 'File')) return null
  try {
    return fileURLToPath(location)
  } catch {
    return null
  }
}

// System playlists (Library, Music, Purchased, Downloaded…), folders and hidden lists aren't the
// user's own playlists (spec §5.3).
const isUserPlaylist = (raw: Dict): boolean =>
  raw['Master'] !== true &&
  raw['Distinguished Kind'] === undefined &&
  raw['Folder'] !== true &&
  raw['Visible'] !== false &&
  typeof raw['Playlist Persistent ID'] === 'string'

export function parseAppleLibrary(xml: string): AppleLibrary {
  let root: unknown
  try {
    root = parse(xml)
  } catch {
    throw new AppleLibraryError()
  }
  if (!isDict(root) || !isDict(root['Tracks'])) throw new AppleLibraryError()

  const tracks = new Map<number, AppleTrack>()
  for (const raw of Object.values(root['Tracks'])) {
    if (!isDict(raw)) continue
    const trackId = num(raw['Track ID'])
    if (trackId === null) continue
    tracks.set(trackId, {
      trackId,
      persistentId: str(raw['Persistent ID']),
      path: trackPath(raw),
      tags: {
        title: str(raw['Name']),
        artist: str(raw['Artist']),
        albumArtist: str(raw['Album Artist']),
        genre: str(raw['Genre'])
      },
      durationMs: num(raw['Total Time']),
      kind: str(raw['Kind'])
    })
  }

  const rawPlaylists = Array.isArray(root['Playlists']) ? root['Playlists'] : []
  const playlists: ApplePlaylist[] = rawPlaylists
    .filter(isDict)
    .filter(isUserPlaylist)
    .map((raw) => ({
      persistentId: raw['Playlist Persistent ID'] as string,
      name: str(raw['Name']) ?? 'Untitled playlist',
      trackIds: (Array.isArray(raw['Playlist Items']) ? raw['Playlist Items'] : [])
        .map((item) => (isDict(item) ? num(item['Track ID']) : null))
        .filter((id): id is number => id !== null)
    }))

  return { tracks, playlists }
}

const localTracks = (lib: AppleLibrary, ids: number[]): AppleTrack[] =>
  ids.map((id) => lib.tracks.get(id)).filter((t): t is AppleTrack => !!t?.path)

export function previewAppleLibrary(lib: AppleLibrary): ApplePreview {
  return {
    trackCount: [...lib.tracks.values()].filter((t) => t.path).length,
    playlists: lib.playlists.map((p) => ({
      persistentId: p.persistentId,
      name: p.name,
      trackCount: localTracks(lib, p.trackIds).length
    }))
  }
}

export function selectAppleImport(
  lib: AppleLibrary,
  selection: AppleSelection
): { tracks: AppleTrack[]; playlists: ApplePlaylist[] } {
  if (selection.mode === 'all') {
    return { tracks: localTracks(lib, [...lib.tracks.keys()]), playlists: lib.playlists }
  }
  const wanted = new Set(selection.persistentIds)
  const playlists = lib.playlists.filter((p) => wanted.has(p.persistentId))
  const ids = [...new Set(playlists.flatMap((p) => p.trackIds))]
  return { tracks: localTracks(lib, ids), playlists }
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 49 tests pass; typecheck and formatting are clean.

```bash
git add src/main/import/apple-library.ts tests/main/helpers/apple-xml.ts tests/main/import/apple-library.test.ts
git commit -m "feat(import): read tracks and playlists from Apple Music Library.xml

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Saving an imported file (re-import rules)

**Files:**
- Create: `src/main/import/save-file.ts`
- Test: `tests/main/import/save-file.test.ts`

**Interfaces:**
- Consumes: `FileFacts` (Task 3); `mapTagsToSong`, `ImportMapping`, `MappedSong` (Task 1); `createTestDb` (Plan 1).
- Produces: `SaveOutcome = 'added' | 'updated' | 'relinked' | 'unchanged'`, `SaveContext { source: 'files' | 'apple_xml'; applePersistentId: string | null; mapping }`, `saveImportedFile(db, facts, ctx): { outcome; fileId }`.

**Matching order (spec §5.4):**
1. Same path.
2. Same Apple persistent ID.
3. Same fingerprint, where the old copy is marked missing or no longer exists on disk. This is a **relink**: the file row keeps its id, so its song, prefs, playlists and history follow.
4. Otherwise, a new file and a new song (`crypto.randomUUID()`).

Existing songs only get *empty* fields filled.

- [ ] **Step 1: Write the failing tests**

`tests/main/import/save-file.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'
import type { ImportMapping } from '../../../src/main/import/mapping'
import type { FileFacts } from '../../../src/main/import/read-file'
import { saveImportedFile, type SaveContext } from '../../../src/main/import/save-file'
import { tempDir, type TempDir } from '../helpers/audio-fixtures'
import { createTestDb } from '../helpers/test-db'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'teacher',
  genreIsCountry: true
}
const fromFiles: SaveContext = { source: 'files', applePersistentId: null, mapping }

let db: DatabaseSync
let dir: TempDir

function facts(path: string, overrides: Partial<FileFacts> = {}): FileFacts {
  return {
    path,
    fileSize: 1000,
    mtimeMs: 1_700_000_000_000,
    durationMs: 180_000,
    contentHash: 'hash-1',
    tags: { title: 'Hora Mare', artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' },
    ...overrides
  }
}

const fileRow = (id: number) =>
  db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Record<string, unknown>
const songRow = (fileId: number) =>
  db.prepare('SELECT * FROM songs WHERE file_id = ?').get(fileId) as Record<string, unknown>

beforeEach(() => {
  db = createTestDb()
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('saveImportedFile', () => {
  test('adds a new file and its song, mapped from the tags', () => {
    const path = dir.file('hora.mp3', 'x')
    const { outcome, fileId } = saveImportedFile(db, facts(path), fromFiles)
    expect(outcome).toBe('added')
    expect(fileRow(fileId)).toMatchObject({
      path,
      file_size: 1000,
      duration_ms: 180_000,
      content_hash: 'hash-1',
      tag_title: 'Hora Mare',
      tag_album_artist: 'Sonia Dion',
      source: 'files',
      is_missing: 0
    })
    expect(songRow(fileId)).toMatchObject({
      title: 'Hora Mare',
      artist: 'Taraf',
      teacher: 'Sonia Dion',
      choreographer: null,
      country: 'Romania'
    })
    expect(songRow(fileId).uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('reports an identical re-import as unchanged', () => {
    const path = dir.file('hora.mp3', 'x')
    const first = saveImportedFile(db, facts(path), fromFiles)
    expect(saveImportedFile(db, facts(path), fromFiles)).toEqual({
      outcome: 'unchanged',
      fileId: first.fileId
    })
  })

  test('refreshes raw tags but only fills song fields that are empty', () => {
    const path = dir.file('hora.mp3', 'x')
    const { fileId } = saveImportedFile(
      db,
      facts(path, { tags: { title: 'Hora', artist: null, albumArtist: null, genre: null } }),
      fromFiles
    )
    db.prepare("UPDATE songs SET title = 'Hora Mare (edited)' WHERE file_id = ?").run(fileId)

    const result = saveImportedFile(db, facts(path, { mtimeMs: 1_800_000_000_000 }), fromFiles)

    expect(result.outcome).toBe('updated')
    expect(fileRow(fileId)).toMatchObject({ tag_genre: 'Romania', mtime_ms: 1_800_000_000_000 })
    expect(songRow(fileId)).toMatchObject({
      title: 'Hora Mare (edited)',
      artist: 'Taraf',
      teacher: 'Sonia Dion',
      country: 'Romania'
    })
  })

  test('matches an Apple Music track by persistent ID even when its file moved', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const newPath = dir.file('new/hora.mp3', 'x')
    const apple: SaveContext = { source: 'apple_xml', applePersistentId: 'PID1', mapping }
    const first = saveImportedFile(db, facts(oldPath), apple)
    const second = saveImportedFile(db, facts(newPath, { contentHash: 'hash-2' }), apple)
    expect(second).toEqual({ outcome: 'updated', fileId: first.fileId })
    expect(fileRow(first.fileId).path).toBe(newPath)
  })

  test('relinks a moved file by its fingerprint when the old path is gone', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(oldPath), fromFiles)
    db.prepare("UPDATE songs SET country = 'Moldova' WHERE file_id = ?").run(fileId)
    rmSync(oldPath)
    const newPath = dir.file('renamed/Hora Mare.mp3', 'x')

    expect(saveImportedFile(db, facts(newPath), fromFiles)).toEqual({ outcome: 'relinked', fileId })
    expect(fileRow(fileId)).toMatchObject({ path: newPath, is_missing: 0 })
    expect(songRow(fileId).country).toBe('Moldova')
  })

  test('adds a copy as a new file when the original is still on disk', () => {
    const original = dir.file('a/hora.mp3', 'x')
    const copy = dir.file('b/hora.mp3', 'x')
    const first = saveImportedFile(db, facts(original), fromFiles)
    const second = saveImportedFile(db, facts(copy), fromFiles)
    expect(second.outcome).toBe('added')
    expect(second.fileId).not.toBe(first.fileId)
  })

  test('clears the missing flag when a missing file is found at its path again', () => {
    const path = dir.file('hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(path), fromFiles)
    db.prepare(
      "UPDATE files SET is_missing = 1, missing_reason = 'File not found' WHERE id = ?"
    ).run(fileId)
    expect(saveImportedFile(db, facts(path), fromFiles).outcome).toBe('updated')
    expect(fileRow(fileId)).toMatchObject({ is_missing: 0, missing_reason: null })
  })

  test('relinks to a file marked missing even if a stale copy sits at the old path', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(oldPath), fromFiles)
    db.prepare('UPDATE files SET is_missing = 1 WHERE id = ?').run(fileId)
    const newPath = join(dir.path, 'new.mp3')
    expect(saveImportedFile(db, facts(newPath), fromFiles)).toEqual({ outcome: 'relinked', fileId })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/import/save-file.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/save-file'`.

- [ ] **Step 3: Implement**

`src/main/import/save-file.ts`:

```ts
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import { mapTagsToSong, type ImportMapping, type MappedSong } from './mapping'
import type { FileFacts } from './read-file'

export type SaveOutcome = 'added' | 'updated' | 'relinked' | 'unchanged'

export interface SaveContext {
  source: 'files' | 'apple_xml'
  applePersistentId: string | null
  mapping: ImportMapping
}

interface FileRow {
  id: number
  path: string
  file_size: number
  mtime_ms: number
  duration_ms: number | null
  content_hash: string | null
  tag_title: string | null
  tag_artist: string | null
  tag_album_artist: string | null
  tag_genre: string | null
  apple_persistent_id: string | null
  is_missing: number
}

type SongFields = Record<keyof MappedSong, string | null>

const SONG_FIELDS: (keyof MappedSong)[] = ['title', 'artist', 'teacher', 'choreographer', 'country']

// The file columns an import writes, keyed by column name.
function fileColumns(facts: FileFacts): Record<string, string | number | null> {
  return {
    path: facts.path,
    file_size: facts.fileSize,
    mtime_ms: facts.mtimeMs,
    duration_ms: facts.durationMs,
    content_hash: facts.contentHash,
    tag_title: facts.tags.title,
    tag_artist: facts.tags.artist,
    tag_album_artist: facts.tags.albumArtist,
    tag_genre: facts.tags.genre,
    is_missing: 0,
    missing_reason: null
  }
}

function findExisting(db: DatabaseSync, facts: FileFacts, ctx: SaveContext): FileRow | undefined {
  const byPath = db.prepare('SELECT * FROM files WHERE path = ?').get(facts.path) as
    FileRow | undefined
  if (byPath) return byPath
  if (ctx.applePersistentId) {
    return db
      .prepare('SELECT * FROM files WHERE apple_persistent_id = ?')
      .get(ctx.applePersistentId) as FileRow | undefined
  }
  return undefined
}

// A file with the same fingerprint whose old copy is gone (or already marked missing) has moved.
function findMoved(db: DatabaseSync, facts: FileFacts): FileRow | undefined {
  const candidates = db
    .prepare('SELECT * FROM files WHERE content_hash = ? ORDER BY is_missing DESC, id')
    .all(facts.contentHash) as unknown as FileRow[]
  return candidates.find((row) => row.is_missing === 1 || !existsSync(row.path))
}

function updateFile(db: DatabaseSync, row: FileRow, facts: FileFacts, ctx: SaveContext): boolean {
  const next = fileColumns(facts)
  if (ctx.applePersistentId && row.apple_persistent_id === null) {
    const taken = db
      .prepare('SELECT 1 FROM files WHERE apple_persistent_id = ?')
      .get(ctx.applePersistentId)
    if (!taken) next.apple_persistent_id = ctx.applePersistentId
  }
  const current = row as unknown as Record<string, unknown>
  const changed = Object.keys(next).filter((col) => (current[col] ?? null) !== next[col])
  if (changed.length === 0) return false
  db.prepare(`UPDATE files SET ${changed.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...changed.map((c) => next[c]),
    row.id
  )
  return true
}

// Re-imports never overwrite fields the user has edited; they only fill empty ones (spec §5.4).
function fillEmptySongFields(db: DatabaseSync, fileId: number, mapped: MappedSong): boolean {
  const song = db
    .prepare(`SELECT ${SONG_FIELDS.join(', ')} FROM songs WHERE file_id = ?`)
    .get(fileId) as SongFields
  const empty = SONG_FIELDS.filter((f) => (song[f] ?? '') === '' && mapped[f] !== null)
  if (empty.length === 0) return false
  db.prepare(`UPDATE songs SET ${empty.map((f) => `${f} = ?`).join(', ')} WHERE file_id = ?`).run(
    ...empty.map((f) => mapped[f]),
    fileId
  )
  return true
}

function insertFile(
  db: DatabaseSync,
  facts: FileFacts,
  ctx: SaveContext,
  mapped: MappedSong
): number {
  const cols = {
    ...fileColumns(facts),
    source: ctx.source,
    apple_persistent_id: ctx.applePersistentId
  }
  const names = Object.keys(cols)
  const fileId = Number(
    db
      .prepare(
        `INSERT INTO files (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
      )
      .run(...Object.values(cols)).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO songs (file_id, uuid, ${SONG_FIELDS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(fileId, randomUUID(), ...SONG_FIELDS.map((f) => mapped[f]))
  return fileId
}

export function saveImportedFile(
  db: DatabaseSync,
  facts: FileFacts,
  ctx: SaveContext
): { outcome: SaveOutcome; fileId: number } {
  const mapped = mapTagsToSong(facts.tags, facts.path, ctx.mapping)

  const existing = findExisting(db, facts, ctx)
  if (existing) {
    const fileChanged = updateFile(db, existing, facts, ctx)
    const songChanged = fillEmptySongFields(db, existing.id, mapped)
    return { outcome: fileChanged || songChanged ? 'updated' : 'unchanged', fileId: existing.id }
  }

  const moved = findMoved(db, facts)
  if (moved) {
    updateFile(db, moved, facts, ctx)
    fillEmptySongFields(db, moved.id, mapped)
    return { outcome: 'relinked', fileId: moved.id }
  }

  return { outcome: 'added', fileId: insertFile(db, facts, ctx, mapped) }
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 57 tests pass; typecheck and formatting are clean.

```bash
git add src/main/import/save-file.ts tests/main/import/save-file.test.ts
git commit -m "feat(import): save imported files, keeping user edits and relinking moved files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Saving Apple Music playlists

**Files:**
- Create: `src/main/import/save-playlists.ts`
- Test: `tests/main/import/save-playlists.test.ts`

**Interfaces:**
- Consumes: `ApplePlaylist` (Task 4); `ApplePlaylistConflict`, `ImportSummary`, `PlaylistDecision` (Task 1).
- Produces:
  - `findEditedApplePlaylists(db, persistentIds: string[]): ApplePlaylistConflict[]`
  - `saveApplePlaylists(db, playlists, fileIdByTrackId: Map<number, number>, decisions: Record<string, PlaylistDecision>, now: string): ImportSummary['playlists']`

**Rules (spec §5.3):**
- An import sets `imported_at = modified_at = now`, and local edits (plan 3) bump `modified_at`. So "edited" means `modified_at > imported_at`.
- A playlist that wasn't edited is replaced silently.
- An edited playlist follows the user's decision, and **defaults to keep**.
- **Keep both:**
  - the edited copy becomes a `local` playlist with no persistent ID
  - the Apple version is created as "Name (Apple Music)" and owns the persistent ID from then on

- [ ] **Step 1: Write the failing tests**

`tests/main/import/save-playlists.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ApplePlaylist } from '../../../src/main/import/apple-library'
import {
  findEditedApplePlaylists,
  saveApplePlaylists
} from '../../../src/main/import/save-playlists'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let fileIds: Map<number, number>

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'

function addFile(path: string): number {
  return Number(
    db
      .prepare(
        "INSERT INTO files (path, file_size, mtime_ms, source) VALUES (?, 1, 1, 'apple_xml')"
      )
      .run(path).lastInsertRowid
  )
}

const balkan = (trackIds: number[], name = 'Balkan'): ApplePlaylist => ({
  persistentId: 'BAL',
  name,
  trackIds
})

function playlists() {
  return db
    .prepare(
      'SELECT id, name, source, apple_persistent_id, imported_at, modified_at FROM playlists ORDER BY id'
    )
    .all()
}

function items(playlistName: string): string[] {
  return db
    .prepare(
      `SELECT f.path FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id
       JOIN files f ON f.id = i.file_id WHERE p.name = ? ORDER BY i.position`
    )
    .all(playlistName)
    .map((r) => r.path as string)
}

beforeEach(() => {
  db = createTestDb()
  fileIds = new Map([
    [101, addFile('/a.mp3')],
    [102, addFile('/b.mp3')],
    [103, addFile('/c.mp3')]
  ])
})

describe('saveApplePlaylists', () => {
  test('creates a new playlist in Apple Music order, skipping tracks that were not imported', () => {
    const result = saveApplePlaylists(db, [balkan([102, 999, 101])], fileIds, {}, T1)
    expect(result).toEqual({ created: ['Balkan'], replaced: [], kept: [], duplicated: [] })
    expect(items('Balkan')).toEqual(['/b.mp3', '/a.mp3'])
    expect(playlists()).toEqual([
      expect.objectContaining({
        name: 'Balkan',
        source: 'apple_xml',
        apple_persistent_id: 'BAL',
        imported_at: T1,
        modified_at: T1
      })
    ])
  })

  test('silently replaces a playlist that was not edited since it was imported', () => {
    saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
    const result = saveApplePlaylists(db, [balkan([103, 102], 'Balkan 2')], fileIds, {}, T2)
    expect(result.replaced).toEqual(['Balkan 2'])
    expect(items('Balkan 2')).toEqual(['/c.mp3', '/b.mp3'])
    expect(playlists()).toHaveLength(1)
  })

  describe('a playlist edited locally after its import', () => {
    beforeEach(() => {
      saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
      db.prepare('UPDATE playlists SET modified_at = ?').run(T2)
    })

    test('is listed as a conflict', () => {
      expect(findEditedApplePlaylists(db, ['BAL', 'OTHER'])).toEqual([
        { persistentId: 'BAL', name: 'Balkan' }
      ])
    })

    test('is kept by default', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, {}, T3)
      expect(result.kept).toEqual(['Balkan'])
      expect(items('Balkan')).toEqual(['/a.mp3'])
    })

    test('is replaced when the user chooses Replace', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, { BAL: 'replace' }, T3)
      expect(result.replaced).toEqual(['Balkan'])
      expect(items('Balkan')).toEqual(['/b.mp3'])
    })

    test('becomes a local playlist next to a new Apple copy when the user chooses Keep both', () => {
      const result = saveApplePlaylists(db, [balkan([102])], fileIds, { BAL: 'both' }, T3)
      expect(result.duplicated).toEqual(['Balkan (Apple Music)'])
      expect(items('Balkan')).toEqual(['/a.mp3'])
      expect(items('Balkan (Apple Music)')).toEqual(['/b.mp3'])
      expect(playlists()).toEqual([
        expect.objectContaining({ name: 'Balkan', source: 'local', apple_persistent_id: null }),
        expect.objectContaining({
          name: 'Balkan (Apple Music)',
          source: 'apple_xml',
          apple_persistent_id: 'BAL'
        })
      ])
    })
  })

  test('playlists never imported or not edited are not conflicts', () => {
    saveApplePlaylists(db, [balkan([101])], fileIds, {}, T1)
    expect(findEditedApplePlaylists(db, ['BAL', 'NEW'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/import/save-playlists.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/save-playlists'`.

- [ ] **Step 3: Implement**

`src/main/import/save-playlists.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { ApplePlaylistConflict, ImportSummary, PlaylistDecision } from '@shared/import'
import type { ApplePlaylist } from './apple-library'

interface PlaylistRow {
  id: number
  name: string
  imported_at: string | null
  modified_at: string
}

type PlaylistResult = ImportSummary['playlists']

// Any local edit bumps playlists.modified_at; an import sets imported_at = modified_at.
const isEdited = (row: PlaylistRow): boolean =>
  row.imported_at === null || row.modified_at > row.imported_at

function findByPersistentId(db: DatabaseSync, persistentId: string): PlaylistRow | undefined {
  return db
    .prepare(
      'SELECT id, name, imported_at, modified_at FROM playlists WHERE apple_persistent_id = ?'
    )
    .get(persistentId) as PlaylistRow | undefined
}

// Spec §5.3: Apple playlists edited locally since their last import need the user's decision.
export function findEditedApplePlaylists(
  db: DatabaseSync,
  persistentIds: string[]
): ApplePlaylistConflict[] {
  return persistentIds.flatMap((persistentId) => {
    const row = findByPersistentId(db, persistentId)
    return row && isEdited(row) ? [{ persistentId, name: row.name }] : []
  })
}

function writeItems(db: DatabaseSync, playlistId: number, fileIds: number[]): void {
  db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(playlistId)
  const insert = db.prepare(
    'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
  )
  fileIds.forEach((fileId, i) => insert.run(playlistId, i + 1, fileId))
}

function createPlaylist(db: DatabaseSync, name: string, persistentId: string, now: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at, created_at)
         VALUES (?, 'apple_xml', ?, ?, ?, ?)`
      )
      .run(name, persistentId, now, now, now).lastInsertRowid
  )
}

export function saveApplePlaylists(
  db: DatabaseSync,
  playlists: ApplePlaylist[],
  fileIdByTrackId: Map<number, number>,
  decisions: Record<string, PlaylistDecision>,
  now: string
): PlaylistResult {
  const result: PlaylistResult = { created: [], replaced: [], kept: [], duplicated: [] }

  for (const playlist of playlists) {
    const fileIds = playlist.trackIds
      .map((id) => fileIdByTrackId.get(id))
      .filter((id): id is number => id !== undefined)
    const existing = findByPersistentId(db, playlist.persistentId)

    if (!existing) {
      writeItems(db, createPlaylist(db, playlist.name, playlist.persistentId, now), fileIds)
      result.created.push(playlist.name)
      continue
    }

    // Without an explicit decision an edited playlist is kept: never lose the user's edits.
    const decision = isEdited(existing) ? (decisions[playlist.persistentId] ?? 'keep') : 'replace'
    if (decision === 'keep') {
      result.kept.push(existing.name)
    } else if (decision === 'replace') {
      db.prepare(
        'UPDATE playlists SET name = ?, imported_at = ?, modified_at = ? WHERE id = ?'
      ).run(playlist.name, now, now, existing.id)
      writeItems(db, existing.id, fileIds)
      result.replaced.push(playlist.name)
    } else {
      // Keep both: the edited copy becomes the user's own playlist; the Apple copy is new.
      db.prepare(
        "UPDATE playlists SET source = 'local', apple_persistent_id = NULL WHERE id = ?"
      ).run(existing.id)
      const name = `${playlist.name} (Apple Music)`
      writeItems(db, createPlaylist(db, name, playlist.persistentId, now), fileIds)
      result.duplicated.push(name)
    }
  }
  return result
}
```

- [ ] **Step 4: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 64 tests pass; typecheck and formatting are clean.

```bash
git add src/main/import/save-playlists.ts tests/main/import/save-playlists.test.ts
git commit -m "feat(import): recreate Apple Music playlists without overwriting local edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The import worker and ImportService

**Files:**
- Create: `src/main/import/worker-protocol.ts`, `src/main/import/worker-core.ts`, `src/main/import/in-process-worker.ts`, `src/main/import/import-service.ts`
- Test: `tests/main/import/import-service.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6; `SettingsStore` (Plan 1).
- Produces:
  - **`worker-protocol.ts`:** `WorkerJob`, `ParentMessage`, `WorkerMessage`, `WorkerHandle { start(job); cancel(); onMessage(l); onExit(l); dispose() }`, `StartWorker`.
  - **`worker-core.ts`:** `runWorkerJob(job, post, isCancelled): Promise<void>`.
  - **`in-process-worker.ts`:** `startInProcessWorker(): WorkerHandle`.
  - **`import-service.ts`:** `ImportServiceDeps { db; settings; startWorker; onProgress; now? }`, `class ImportBusyError`, and `class ImportService` with:
    - `run(request): Promise<ImportSummary>`
    - `cancel(): void`
    - `previewApple(xmlPath): Promise<ApplePreview>`
    - `checkPlaylistConflicts(ids): ApplePlaylistConflict[]`

**Design:**
- **The worker** sends `planned` once (total, unsupported files from the scan, Apple playlists), then one `file` message per file, then `done`; or `error`.
- **The service:**
  - saves each file in its own transaction as it arrives
  - emits `ImportProgress` (`scanning` → `reading` per file → `done`)
  - maps outcomes and failures into the summary
  - after a non-cancelled Apple import, applies the playlists in one transaction
- **One import runs at a time** (`ImportBusyError`).
- **Mapping:** read from settings when the import starts.

- [ ] **Step 1: Write the failing tests**

`tests/main/import/import-service.test.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'path'
import type { ImportProgress } from '@shared/import'
import { ImportBusyError, ImportService } from '../../../src/main/import/import-service'
import { startInProcessWorker } from '../../../src/main/import/in-process-worker'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { appleLibraryXml } from '../helpers/apple-xml'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let dir: TempDir
let progress: ImportProgress[]
let service: ImportService

function makeService(
  onProgress: (p: ImportProgress) => void = (p) => progress.push(p)
): ImportService {
  return new ImportService({
    db,
    settings: new SettingsStore(db),
    startWorker: startInProcessWorker,
    onProgress,
    now: () => '2026-10-13T12:00:00.000Z'
  })
}

const rel = (items: { path: string }[]): string[] =>
  items.map((i) => i.path.slice(dir.path.length + 1)).sort()

beforeEach(() => {
  db = createTestDb()
  dir = tempDir()
  progress = []
  service = makeService()
})
afterEach(() => dir.cleanup())

describe('ImportService: files and folders', () => {
  beforeEach(() => {
    dir.file(
      'Balkan/Ajde Jano.mp3',
      mp3Bytes({ title: 'Ajde Jano', albumArtist: 'Bora Özkök', genre: 'Serbia' }, 1, 1)
    )
    dir.file('Balkan/Kolo.mp3', mp3Bytes({ title: 'Kolo', genre: 'Serbia' }, 1, 2))
    dir.file('Balkan/Old.aiff', 'x')
    dir.file('Balkan/Broken.mp3', 'not audio '.repeat(50))
    dir.file('Balkan/cover.jpg', 'x')
  })

  test('imports a folder and summarizes every file', async () => {
    const summary = await service.run({ kind: 'paths', paths: [join(dir.path, 'Balkan')] })
    expect(rel(summary.added)).toEqual(['Balkan/Ajde Jano.mp3', 'Balkan/Kolo.mp3'])
    expect(rel(summary.unsupported)).toEqual(['Balkan/Old.aiff'])
    expect(rel(summary.unreadable)).toEqual(['Balkan/Broken.mp3'])
    expect(summary.cancelled).toBe(false)
  })

  test('maps tags using the current import settings', async () => {
    new SettingsStore(db).set('import.albumArtistTagTarget', 'teacher')
    await service.run({ kind: 'paths', paths: [dir.path] })
    expect(
      db.prepare("SELECT title, teacher, country FROM songs WHERE title = 'Ajde Jano'").get()
    ).toEqual({
      title: 'Ajde Jano',
      teacher: 'Bora Özkök',
      country: 'Serbia'
    })
  })

  test('reports files imported before as already present', async () => {
    await service.run({ kind: 'paths', paths: [dir.path] })
    const again = await service.run({ kind: 'paths', paths: [dir.path] })
    expect(again.added).toEqual([])
    expect(rel(again.alreadyPresent)).toEqual(['Balkan/Ajde Jano.mp3', 'Balkan/Kolo.mp3'])
  })

  test('reports progress through to done', async () => {
    await service.run({ kind: 'paths', paths: [dir.path] })
    expect(progress[0]).toMatchObject({ phase: 'scanning' })
    expect(progress.at(-1)).toEqual({ phase: 'done', done: 3, total: 3, currentPath: null })
  })

  test('stops early when cancelled and keeps what was already imported', async () => {
    for (let i = 0; i < 20; i++)
      dir.file(`Many/${i}.mp3`, mp3Bytes({ title: `Song ${i}` }, 1, 10 + i))
    service = makeService((p) => {
      if (p.phase === 'reading' && p.done === 2) service.cancel()
    })
    const summary = await service.run({ kind: 'paths', paths: [join(dir.path, 'Many')] })
    expect(summary.cancelled).toBe(true)
    expect(summary.added.length).toBeGreaterThanOrEqual(2)
    expect(summary.added.length).toBeLessThan(20)
    expect(db.prepare('SELECT COUNT(*) n FROM files').get()).toEqual({ n: summary.added.length })
  })

  test('runs one import at a time', async () => {
    const first = service.run({ kind: 'paths', paths: [dir.path] })
    await expect(service.run({ kind: 'paths', paths: [dir.path] })).rejects.toThrow(ImportBusyError)
    await first
  })
})

describe('ImportService: Apple Music', () => {
  let xmlPath: string

  beforeEach(() => {
    const ajde = dir.file('Music/Ajde Jano.mp3', mp3Bytes({ title: 'file tag' }, 1, 1))
    const kolo = dir.file('Music/Kolo.mp3', mp3Bytes({}, 1, 2))
    xmlPath = dir.file(
      'Library.xml',
      appleLibraryXml(
        [
          { id: 1, name: 'Ajde Jano', path: ajde, albumArtist: 'Bora Özkök', genre: 'Serbia' },
          { id: 2, name: 'Kolo', path: kolo, genre: 'Serbia' },
          { id: 3, name: 'Gone', path: join(dir.path, 'Music/Gone.mp3') },
          { id: 4, name: 'Streaming' }
        ],
        [
          { name: 'Balkan', persistentId: 'BAL', trackIds: [2, 1, 3, 4] },
          { name: 'Other', persistentId: 'OTH', trackIds: [1] }
        ]
      )
    )
  })

  test('previews the library’s local tracks and playlists', async () => {
    expect(await service.previewApple(xmlPath)).toEqual({
      trackCount: 3,
      playlists: [
        { persistentId: 'BAL', name: 'Balkan', trackCount: 3 },
        { persistentId: 'OTH', name: 'Other', trackCount: 1 }
      ]
    })
  })

  test('imports chosen playlists using Apple Music’s tags and recreates them', async () => {
    const summary = await service.run({
      kind: 'apple',
      xmlPath,
      selection: { mode: 'playlists', persistentIds: ['BAL'] },
      decisions: {}
    })
    expect(rel(summary.added)).toEqual(['Music/Ajde Jano.mp3', 'Music/Kolo.mp3'])
    expect(rel(summary.notFound)).toEqual(['Music/Gone.mp3'])
    expect(summary.playlists.created).toEqual(['Balkan'])
    expect(db.prepare("SELECT title, country FROM songs WHERE title = 'Ajde Jano'").get()).toEqual({
      title: 'Ajde Jano',
      country: 'Serbia'
    })
    const order = db
      .prepare(
        'SELECT s.title FROM playlist_items i JOIN songs s ON s.file_id = i.file_id ORDER BY i.position'
      )
      .all()
      .map((r) => r.title)
    expect(order).toEqual(['Kolo', 'Ajde Jano'])
    expect(db.prepare("SELECT COUNT(*) n FROM files WHERE source = 'apple_xml'").get()).toEqual({
      n: 2
    })
  })

  test('applies the user’s decision for an edited playlist', async () => {
    const request = {
      kind: 'apple' as const,
      xmlPath,
      selection: { mode: 'all' as const },
      decisions: {}
    }
    await service.run(request)
    db.prepare(
      "UPDATE playlists SET modified_at = '2026-10-13T13:00:00.000Z' WHERE name = 'Balkan'"
    ).run()

    expect(service.checkPlaylistConflicts(['BAL', 'OTH'])).toEqual([
      { persistentId: 'BAL', name: 'Balkan' }
    ])
    const summary = await service.run({ ...request, decisions: { BAL: 'both' } })
    expect(summary.playlists.duplicated).toEqual(['Balkan (Apple Music)'])
    expect(summary.playlists.replaced).toEqual(['Other'])
  })

  test('rejects a file that is not an Apple Music library', async () => {
    const bad = dir.file('notes.xml', '<plist version="1.0"><dict/></plist>')
    await expect(service.previewApple(bad)).rejects.toThrow(/not an Apple Music library/)
    await expect(
      service.run({ kind: 'apple', xmlPath: bad, selection: { mode: 'all' }, decisions: {} })
    ).rejects.toThrow(/not an Apple Music library/)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/import/import-service.test.ts`
Expected: FAIL — `Cannot find module '../../../src/main/import/import-service'`.

- [ ] **Step 3: Implement the protocol, the job runner and the in-process worker**

`src/main/import/worker-protocol.ts`:

```ts
import type { AppleSelection, ApplePreview } from '@shared/import'
import type { ApplePlaylist } from './apple-library'
import type { ReadResult } from './read-file'

// Messages between ImportService (main process) and the import worker (utility process).

export type WorkerJob =
  | { kind: 'preview-apple'; xmlPath: string }
  | { kind: 'import-paths'; paths: string[] }
  | { kind: 'import-apple'; xmlPath: string; selection: AppleSelection }

export type ParentMessage = { type: 'job'; job: WorkerJob } | { type: 'cancel' }

export type WorkerMessage =
  | { type: 'preview'; preview: ApplePreview }
  | { type: 'planned'; total: number; unsupported: string[]; playlists: ApplePlaylist[] }
  | {
      type: 'file'
      result: ReadResult
      apple: { trackId: number; persistentId: string | null } | null
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

// How ImportService talks to a worker; implemented over a utility process in the app and
// in-process in tests.
export interface WorkerHandle {
  start(job: WorkerJob): void
  cancel(): void
  onMessage(listener: (message: WorkerMessage) => void): void
  onExit(listener: () => void): void
  dispose(): void
}

export type StartWorker = () => WorkerHandle
```

`src/main/import/worker-core.ts`:

```ts
import { readFile } from 'fs/promises'
import {
  parseAppleLibrary,
  previewAppleLibrary,
  selectAppleImport,
  type AppleLibrary
} from './apple-library'
import { readAudioFile } from './read-file'
import { findAudioFiles } from './scan'
import type { WorkerJob, WorkerMessage } from './worker-protocol'

async function loadAppleLibrary(xmlPath: string): Promise<AppleLibrary> {
  return parseAppleLibrary(await readFile(xmlPath, 'utf8'))
}

// The import worker's job runner: no Electron APIs, so tests run it in-process.
export async function runWorkerJob(
  job: WorkerJob,
  post: (message: WorkerMessage) => void,
  isCancelled: () => boolean
): Promise<void> {
  try {
    if (job.kind === 'preview-apple') {
      post({ type: 'preview', preview: previewAppleLibrary(await loadAppleLibrary(job.xmlPath)) })
    } else if (job.kind === 'import-paths') {
      const { audio, unsupported } = await findAudioFiles(job.paths)
      post({ type: 'planned', total: audio.length, unsupported, playlists: [] })
      for (const path of audio) {
        if (isCancelled()) break
        post({ type: 'file', result: await readAudioFile(path), apple: null })
      }
    } else {
      const { tracks, playlists } = selectAppleImport(
        await loadAppleLibrary(job.xmlPath),
        job.selection
      )
      post({ type: 'planned', total: tracks.length, unsupported: [], playlists })
      for (const track of tracks) {
        if (isCancelled()) break
        const result = await readAudioFile(track.path as string, {
          tags: track.tags,
          durationMs: track.durationMs,
          kind: track.kind
        })
        post({
          type: 'file',
          result,
          apple: { trackId: track.trackId, persistentId: track.persistentId }
        })
      }
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
```

`src/main/import/in-process-worker.ts`:

```ts
import { runWorkerJob } from './worker-core'
import type { WorkerHandle, WorkerMessage } from './worker-protocol'

// Runs worker jobs on the main process's event loop. Used by tests; the app uses the
// utility-process worker so large imports never block the UI.
export function startInProcessWorker(): WorkerHandle {
  const listeners: ((message: WorkerMessage) => void)[] = []
  const exitListeners: (() => void)[] = []
  let cancelled = false
  return {
    start(job) {
      // Deliver messages asynchronously, as a real process would.
      void runWorkerJob(
        job,
        (m) => queueMicrotask(() => listeners.forEach((l) => l(m))),
        () => cancelled
      )
    },
    cancel: () => {
      cancelled = true
    },
    onMessage: (listener) => void listeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
    dispose: () => exitListeners.splice(0)
  }
}
```

- [ ] **Step 4: Implement ImportService**

`src/main/import/import-service.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import {
  emptySummary,
  type ApplePlaylistConflict,
  type ApplePreview,
  type ImportProgress,
  type ImportRequest,
  type ImportSummary
} from '@shared/import'
import type { SettingsStore } from '../settings/settings-store'
import type { ImportMapping } from './mapping'
import { saveImportedFile, type SaveOutcome } from './save-file'
import { findEditedApplePlaylists, saveApplePlaylists } from './save-playlists'
import type { ApplePlaylist } from './apple-library'
import type { StartWorker, WorkerHandle, WorkerJob, WorkerMessage } from './worker-protocol'

export class ImportBusyError extends Error {
  constructor() {
    super('An import is already running.')
    this.name = 'ImportBusyError'
  }
}

export interface ImportServiceDeps {
  db: DatabaseSync
  settings: SettingsStore
  startWorker: StartWorker
  onProgress: (progress: ImportProgress) => void
  now?: () => string
}

const SUMMARY_KEY: Record<SaveOutcome, 'added' | 'updated' | 'relinked' | 'alreadyPresent'> = {
  added: 'added',
  updated: 'updated',
  relinked: 'relinked',
  unchanged: 'alreadyPresent'
}

const FAILURE_KEY = {
  not_found: 'notFound',
  unsupported: 'unsupported',
  unreadable: 'unreadable'
} as const

// Runs imports (spec §5): the worker scans and reads files; this class writes the results to the
// database as they arrive, reports progress, and builds the summary.
export class ImportService {
  private current: WorkerHandle | null = null
  private cancelRequested = false

  constructor(private readonly deps: ImportServiceDeps) {}

  async previewApple(xmlPath: string): Promise<ApplePreview> {
    const { preview } = await this.runWorker({ kind: 'preview-apple', xmlPath }, () => undefined)
    return preview as ApplePreview
  }

  checkPlaylistConflicts(persistentIds: string[]): ApplePlaylistConflict[] {
    return findEditedApplePlaylists(this.deps.db, persistentIds)
  }

  cancel(): void {
    if (!this.current) return
    this.cancelRequested = true
    this.current.cancel()
  }

  async run(request: ImportRequest): Promise<ImportSummary> {
    if (this.current) throw new ImportBusyError()
    const { db, settings, onProgress } = this.deps
    const mapping: ImportMapping = {
      artistTagTarget: settings.get('import.artistTagTarget'),
      albumArtistTagTarget: settings.get('import.albumArtistTagTarget'),
      genreIsCountry: settings.get('import.genreIsCountry')
    }
    const source = request.kind === 'apple' ? 'apple_xml' : 'files'
    const summary = emptySummary()
    const fileIdByTrackId = new Map<number, number>()
    let playlists: ApplePlaylist[] = []
    let total = 0
    let done = 0

    onProgress({ phase: 'scanning', done: 0, total: 0, currentPath: null })
    const job: WorkerJob =
      request.kind === 'apple'
        ? { kind: 'import-apple', xmlPath: request.xmlPath, selection: request.selection }
        : { kind: 'import-paths', paths: request.paths }

    const { cancelled } = await this.runWorker(job, (message) => {
      if (message.type === 'planned') {
        total = message.total
        playlists = message.playlists
        summary.unsupported.push(
          ...message.unsupported.map((path) => ({ path, detail: 'Format not supported' }))
        )
        onProgress({ phase: 'reading', done, total, currentPath: null })
      } else if (message.type === 'file') {
        const { result } = message
        if (result.ok) {
          const { outcome, fileId } = this.inTransaction(() =>
            saveImportedFile(db, result.facts, {
              source,
              applePersistentId: message.apple?.persistentId ?? null,
              mapping
            })
          )
          summary[SUMMARY_KEY[outcome]].push({ path: result.facts.path })
          if (message.apple) fileIdByTrackId.set(message.apple.trackId, fileId)
        } else {
          summary[FAILURE_KEY[result.reason]].push({ path: result.path, detail: result.detail })
        }
        done += 1
        onProgress({
          phase: 'reading',
          done,
          total,
          currentPath: result.ok ? result.facts.path : result.path
        })
      }
    })

    summary.cancelled = cancelled
    // A cancelled import has only some of each playlist's tracks, so playlists are left alone.
    if (request.kind === 'apple' && !cancelled) {
      summary.playlists = this.inTransaction(() =>
        saveApplePlaylists(db, playlists, fileIdByTrackId, request.decisions, this.now())
      )
    }
    onProgress({ phase: 'done', done, total, currentPath: null })
    return summary
  }

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  private inTransaction<T>(fn: () => T): T {
    const { db } = this.deps
    db.exec('BEGIN')
    try {
      const value = fn()
      db.exec('COMMIT')
      return value
    } catch (err) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw err
    }
  }

  // Starts a worker job and settles when it finishes, with the preview (for a preview job) and
  // whether the job was cancelled.
  private runWorker(
    job: WorkerJob,
    onMessage: (message: WorkerMessage) => void
  ): Promise<{ preview: ApplePreview | null; cancelled: boolean }> {
    if (this.current) return Promise.reject(new ImportBusyError())
    const worker = this.deps.startWorker()
    this.current = worker
    this.cancelRequested = false

    return new Promise((resolve, reject) => {
      const finish = (settle: () => void): void => {
        this.current = null
        worker.dispose()
        settle()
      }
      worker.onMessage((message) => {
        if (this.current !== worker) return
        if (message.type === 'preview')
          finish(() => resolve({ preview: message.preview, cancelled: false }))
        else if (message.type === 'done')
          finish(() => resolve({ preview: null, cancelled: this.cancelRequested }))
        else if (message.type === 'error') finish(() => reject(new Error(message.message)))
        else {
          try {
            onMessage(message)
          } catch (err) {
            worker.cancel()
            finish(() => reject(err))
          }
        }
      })
      worker.onExit(() => {
        if (this.current === worker)
          finish(() => reject(new Error('The import stopped unexpectedly.')))
      })
      worker.start(job)
    })
  }
}
```

- [ ] **Step 5: Run the tests, typecheck and commit**

Run: `npx vitest run tests/main/import && npm run typecheck && npx prettier --check .`
Expected: 74 tests pass; typecheck and formatting are clean.

```bash
git add src/main/import tests/main/import/import-service.test.ts
git commit -m "feat(import): add import worker job runner and ImportService

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: IPC channels, progress events, file pickers and the utility process

**Files:**
- Modify: `src/shared/contract.ts`, `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/main/index.ts`, `tests/main/ipc/handlers.test.ts`, `tests/renderer/settings-page.test.tsx`
- Create: `src/main/library/stats.ts`, `src/main/import/worker-entry.ts`, `src/main/import/utility-worker.ts`, `src/main/import/dialogs.ts`, `tests/renderer/fake-api.ts`

**Interfaces:**
- Consumes: `ImportService` (Task 7).
- Produces:
  - **New invoke channels:**
    - `import:pickMusic`: `[]` → `string[]`
    - `import:pickAppleLibrary`: `[]` → `string | null`
    - `import:previewApple`: `[xmlPath]` → `ApplePreview`
    - `import:checkPlaylistConflicts`: `[persistentIds]` → `ApplePlaylistConflict[]`
    - `import:start`: `[ImportRequest]` → `ImportSummary`
    - `import:cancel`: `[]` → `void`
    - `library:stats`: `[]` → `LibraryStats { fileCount }`
  - **Events:** `EventContract { 'import:progress': ImportProgress }`, with `EVENT_CHANNELS` checked for completeness at compile time like `INVOKE_CHANNELS`.
  - **`RendererApi`** gains:
    - `on(channel, listener): () => void`
    - `getPathsForFiles(files: File[]): string[]` (preload, via `webUtils.getPathForFile`)
  - **`HandlerDeps`** gains `db`, `importer` (`Pick<ImportService, 'run' | 'cancel' | 'previewApple' | 'checkPlaylistConflicts'>`) and `dialogs: Dialogs { pickMusic(); pickAppleLibrary() }`.
  - **`startUtilityWorker(): WorkerHandle`**, which forks `worker-entry.ts` through electron-vite's `?modulePath` import.
  - **`createFakeApi(handlers?, paths?)`** for renderer tests: `{ api, calls, callsTo(channel), emit(channel, payload), settings }`.

- [ ] **Step 1: Write the failing handler tests**

Replace `tests/main/ipc/handlers.test.ts` with:

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, test } from 'vitest'
import { INVOKE_CHANNELS } from '@shared/contract'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { emptySummary, type ImportRequest } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { registerHandlers } from '../../../src/main/ipc/register'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

const appInfo = { version: '0.1.0', dbPath: '/tmp/test.sqlite', schemaVersion: 1 }

const summary = emptySummary()

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const db = createTestDb()
  return {
    db,
    settings: new SettingsStore(db),
    appInfo: () => appInfo,
    importer: {
      run: async () => summary,
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    ...overrides
  }
}

function makeHandlers(overrides: Partial<HandlerDeps> = {}) {
  return createHandlers(makeDeps(overrides))
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

describe('import and library handlers', () => {
  test('import:pickMusic returns what the user picked', async () => {
    const h = makeHandlers({
      dialogs: { pickMusic: async () => ['/Music/Balkan'], pickAppleLibrary: async () => null }
    })
    expect(await h['import:pickMusic']()).toEqual(['/Music/Balkan'])
  })

  test('import:pickAppleLibrary returns the chosen file or null', async () => {
    const h = makeHandlers({
      dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => '/x/Library.xml' }
    })
    expect(await h['import:pickAppleLibrary']()).toBe('/x/Library.xml')
  })

  test('import:start runs the import and returns its summary', async () => {
    const requests: ImportRequest[] = []
    const deps = makeDeps()
    deps.importer.run = async (request) => {
      requests.push(request)
      return summary
    }
    const result = await createHandlers(deps)['import:start']({ kind: 'paths', paths: ['/a.mp3'] })
    expect(result).toBe(summary)
    expect(requests).toEqual([{ kind: 'paths', paths: ['/a.mp3'] }])
  })

  test('import:cancel, previewApple and checkPlaylistConflicts delegate to the importer', async () => {
    const calls: string[] = []
    const deps = makeDeps()
    deps.importer = {
      run: async () => summary,
      cancel: () => void calls.push('cancel'),
      previewApple: async (path) => {
        calls.push(`preview ${path}`)
        return { trackCount: 1, playlists: [] }
      },
      checkPlaylistConflicts: (ids) => {
        calls.push(`conflicts ${ids.join(',')}`)
        return [{ persistentId: 'BAL', name: 'Balkan' }]
      }
    }
    const h = createHandlers(deps)
    await h['import:cancel']()
    expect(await h['import:previewApple']('/x/Library.xml')).toEqual({
      trackCount: 1,
      playlists: []
    })
    expect(await h['import:checkPlaylistConflicts'](['BAL'])).toEqual([
      { persistentId: 'BAL', name: 'Balkan' }
    ])
    expect(calls).toEqual(['cancel', 'preview /x/Library.xml', 'conflicts BAL'])
  })

  test('library:stats counts the files that are not missing', async () => {
    const deps = makeDeps()
    const add = deps.db.prepare(
      "INSERT INTO files (path, file_size, mtime_ms, source, is_missing) VALUES (?, 1, 1, 'files', ?)"
    )
    add.run('/a.mp3', 0)
    add.run('/b.mp3', 0)
    add.run('/c.mp3', 1)
    expect(await createHandlers(deps)['library:stats']()).toEqual({ fileCount: 2 })
  })
})

describe('registerHandlers', () => {
  test('registers exactly the contract channels and forwards arguments', async () => {
    type Listener = Parameters<IpcMain['handle']>[1]
    const registered = new Map<string, Listener>()
    registerHandlers({ handle: (ch, fn) => void registered.set(ch, fn) }, makeHandlers())

    expect([...registered.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort())
    const settings = (await registered.get('settings:set')!(
      {} as IpcMainInvokeEvent,
      'countdown.seconds',
      3
    )) as {
      'countdown.seconds': number
    }
    expect(settings['countdown.seconds']).toBe(3)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/ipc`
Expected: FAIL — the five new "import and library handlers" tests fail because the handlers don't exist.

- [ ] **Step 3: Extend the contract, add library stats, extend the handlers**

Replace `src/shared/contract.ts` with:

```ts
import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportProgress,
  ImportRequest,
  ImportSummary
} from './import'
import type { SettingKey, Settings } from './settings'

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
  'library:stats'
] as const satisfies readonly InvokeChannel[]

// Compile error if a channel in InvokeContract is missing from INVOKE_CHANNELS.
type MissingChannels = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
const allChannelsListed: [MissingChannels] extends [never] ? true : MissingChannels = true
void allChannelsListed

// Every main → renderer event. Add a channel here and to EVENT_CHANNELS.
export interface EventContract {
  'import:progress': ImportProgress
}

export type EventChannel = keyof EventContract

export const EVENT_CHANNELS = ['import:progress'] as const satisfies readonly EventChannel[]

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

`src/main/library/stats.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { LibraryStats } from '@shared/contract'

export function getLibraryStats(db: DatabaseSync): LibraryStats {
  const row = db.prepare('SELECT COUNT(*) AS n FROM files WHERE is_missing = 0').get() as {
    n: number
  }
  return { fileCount: row.n }
}
```

Replace `src/main/ipc/handlers.ts` with:

```ts
import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, InvokeHandlers } from '@shared/contract'
import type { ImportService } from '../import/import-service'
import { getLibraryStats } from '../library/stats'
import type { SettingsStore } from '../settings/settings-store'

export interface Dialogs {
  pickMusic(): Promise<string[]>
  pickAppleLibrary(): Promise<string | null>
}

export interface HandlerDeps {
  db: DatabaseSync
  settings: SettingsStore
  appInfo: () => AppInfo
  importer: Pick<ImportService, 'run' | 'cancel' | 'previewApple' | 'checkPlaylistConflicts'>
  dialogs: Dialogs
}

export function createHandlers(deps: HandlerDeps): InvokeHandlers {
  return {
    'app:getInfo': () => deps.appInfo(),
    'settings:getAll': () => deps.settings.getAll(),
    'settings:set': (key, value) => {
      deps.settings.set(key, value)
      return deps.settings.getAll()
    },
    'import:pickMusic': () => deps.dialogs.pickMusic(),
    'import:pickAppleLibrary': () => deps.dialogs.pickAppleLibrary(),
    'import:previewApple': (xmlPath) => deps.importer.previewApple(xmlPath),
    'import:checkPlaylistConflicts': (ids) => deps.importer.checkPlaylistConflicts(ids),
    'import:start': (request) => deps.importer.run(request),
    'import:cancel': () => deps.importer.cancel(),
    'library:stats': () => getLibraryStats(deps.db)
  }
}
```

- [ ] **Step 4: Run the handler tests**

Run: `npx vitest run tests/main/ipc`
Expected: 10 tests pass. (`npm run typecheck` still fails at this point because `src/main/index.ts` and the Settings page test's fake API haven't been updated; the next steps fix that.)

- [ ] **Step 5: Extend the preload bridge**

Replace `src/preload/index.ts` with:

```ts
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type RendererApi } from '@shared/contract'

const allowedInvoke = new Set<string>(INVOKE_CHANNELS)
const allowedEvents = new Set<string>(EVENT_CHANNELS)

const api: RendererApi = {
  invoke: ((channel: string, ...args: unknown[]) => {
    if (!allowedInvoke.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  }) as RendererApi['invoke'],
  on: ((channel: string, listener: (payload: unknown) => void) => {
    if (!allowedEvents.has(channel)) throw new Error(`Unknown event channel: ${channel}`)
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }) as RendererApi['on'],
  getPathsForFiles: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 6: Add the utility-process worker and the file pickers**

`src/main/import/worker-entry.ts`:

```ts
// Entry point of the import utility process (spec §9). Started by utility-worker.ts.
import { runWorkerJob } from './worker-core'
import type { ParentMessage } from './worker-protocol'

let cancelled = false

process.parentPort.on('message', (event) => {
  const message = event.data as ParentMessage
  if (message.type === 'cancel') {
    cancelled = true
  } else {
    void runWorkerJob(
      message.job,
      (m) => process.parentPort.postMessage(m),
      () => cancelled
    )
  }
})
```

`src/main/import/utility-worker.ts`:

```ts
import { utilityProcess } from 'electron'
import workerPath from './worker-entry?modulePath'
import type { ParentMessage, WorkerHandle, WorkerMessage } from './worker-protocol'

// One utility process per job, so a crash or a huge import never affects the main process.
export function startUtilityWorker(): WorkerHandle {
  const child = utilityProcess.fork(workerPath, [], { serviceName: 'Folk Dance Player Import' })
  let disposed = false
  const send = (message: ParentMessage): void => child.postMessage(message)
  return {
    start: (job) => send({ type: 'job', job }),
    cancel: () => send({ type: 'cancel' }),
    onMessage: (listener) => void child.on('message', (m: WorkerMessage) => listener(m)),
    onExit: (listener) =>
      void child.on('exit', () => {
        if (!disposed) listener()
      }),
    dispose: () => {
      disposed = true
      child.kill()
    }
  }
}
```

`src/main/import/dialogs.ts`:

```ts
import { BrowserWindow, dialog } from 'electron'
import type { Dialogs } from '../ipc/handlers'

const parent = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? undefined

export const importDialogs: Dialogs = {
  async pickMusic() {
    const options: Electron.OpenDialogOptions = {
      title: 'Add Music',
      buttonLabel: 'Add',
      properties: ['openFile', 'openDirectory', 'multiSelections']
    }
    const window = parent()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  },
  async pickAppleLibrary() {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose your Apple Music Library.xml',
      buttonLabel: 'Choose',
      properties: ['openFile'],
      filters: [{ name: 'Apple Music Library', extensions: ['xml'] }]
    }
    const window = parent()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}
```

- [ ] **Step 7: Wire the import into the main process**

Replace `src/main/index.ts` with:

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { importDialogs } from './import/dialogs'
import { ImportService } from './import/import-service'
import { startUtilityWorker } from './import/utility-worker'
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
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    onProgress: (progress) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('import:progress', progress)
      }
    }
  })
  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs
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

- [ ] **Step 8: Add the renderer fake API and update the Settings page test**

`tests/renderer/fake-api.ts`:

```ts
import type { EventChannel, EventContract, InvokeChannel, RendererApi } from '@shared/contract'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

type Handler = (...args: never[]) => unknown

export interface FakeApi {
  api: RendererApi
  // Every invoke, as [channel, ...args].
  calls: unknown[][]
  callsTo(channel: InvokeChannel): unknown[][]
  emit<C extends EventChannel>(channel: C, payload: EventContract[C]): void
  settings: Settings
}

// A RendererApi for component tests. `handlers` answer invoke channels (sync or async values,
// or functions of the call's arguments); settings:getAll/settings:set work out of the box.
export function createFakeApi(
  handlers: Partial<Record<InvokeChannel, unknown>> = {},
  paths: string[] = []
): FakeApi {
  const calls: unknown[][] = []
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const fake: FakeApi = {
    calls,
    callsTo: (channel) => calls.filter((c) => c[0] === channel).map((c) => c.slice(1)),
    emit: (channel, payload) => listeners.get(channel)?.forEach((l) => l(payload)),
    settings: { ...DEFAULT_SETTINGS },
    api: {
      invoke: (async (channel: InvokeChannel, ...args: unknown[]) => {
        calls.push([channel, ...args])
        if (channel in handlers) {
          const handler = handlers[channel]
          return typeof handler === 'function'
            ? (handler as Handler)(...(args as never[]))
            : handler
        }
        if (channel === 'settings:getAll') return fake.settings
        if (channel === 'settings:set') {
          const [key, value] = args as [keyof Settings, unknown]
          fake.settings = { ...fake.settings, [key]: value }
          return fake.settings
        }
        throw new Error(`No fake handler for ${channel}`)
      }) as RendererApi['invoke'],
      on: ((channel: string, listener: (payload: unknown) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel)!.add(listener)
        return () => listeners.get(channel)!.delete(listener)
      }) as RendererApi['on'],
      getPathsForFiles: () => paths
    }
  }
  return fake
}
```

In `tests/renderer/settings-page.test.tsx`, the fake API must now also provide `on` and `getPathsForFiles`. Change the end of the `api` object from:

```ts
      throw new Error(`unexpected channel ${channel}`)
    }) as RendererApi['invoke']
  }
```

to:

```ts
      throw new Error(`unexpected channel ${channel}`)
    }) as RendererApi['invoke'],
    on: () => () => undefined,
    getPathsForFiles: () => []
  }
```

- [ ] **Step 9: Run everything, build and commit**

```bash
npm test
npm run build
npx prettier --check .
```

Expected:
- All tests pass (170).
- The build output has a separate `out/main/worker-entry-*.js` chunk next to `index.js`.
- Formatting is clean.

```bash
git add -A
git commit -m "feat(import): IPC channels, progress events, file pickers and utility-process worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Import on the Music page

**Files:**
- Create: `src/renderer/src/ipc-error.ts`
- Create: `src/renderer/src/import/useImportFlow.ts`, `ImportMappingFields.tsx`, `AppleOptionsStep.tsx`, `PlaylistConflictsStep.tsx`, `ImportProgressStep.tsx`, `ImportSummaryStep.tsx`, `ImportDialog.tsx`, `DropZone.tsx`, `DropZone.module.css`, `file-name.ts`
- Modify: `src/renderer/src/pages/MusicPage.tsx`, `src/renderer/src/App.tsx`, `CHANGELOG.md`, `AGENTS.md`
- Test: `tests/renderer/music-import.test.tsx`

**Interfaces:**
- Consumes: the Task 8 contract; `createFakeApi` (Task 8); `renderWithMantine` (Plan 1).
- Produces:
  - `MusicPage({ api }: { api: RendererApi })`
  - `useImportFlow(api, onFinished)`, with the steps `closed → mapping | loading → apple → conflicts → running → summary | error`
  - `errorMessage(err): string`, which strips Electron's `Error invoking remote method '…': Error:` prefix. Plan 3 should reuse it for the Settings page's error text, a deferred minor from Plan 1.

**UI (spec §5):**
- **The Music page** shows the song count, **Add Music…**, **Import from Apple Music…** and a drop zone.
- **The dialog** (a Mantine `Modal`) steps through:
  1. *Import music* (mapping) or *Import from Apple Music* (song count, whole library or chosen playlists, mapping).
  2. Playlist decisions, only if an Apple playlist was edited since its last import.
  3. Progress, with Cancel.
  4. The summary: an `Accordion` of the non-empty categories, each listing its files, plus a playlist line.
- **The mapping** is saved to settings when the import starts.
- **While an import runs,** the dialog can't be dismissed except with Cancel.

- [ ] **Step 1: Write the failing UI tests**

`tests/renderer/music-import.test.tsx`:

```tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { emptySummary, type ImportSummary } from '@shared/import'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from './fake-api'
import { renderWithMantine } from './render'

const preview = {
  trackCount: 3,
  playlists: [
    { persistentId: 'BAL', name: 'Balkan', trackCount: 2 },
    { persistentId: 'CPL', name: 'Couple dances', trackCount: 1 }
  ]
}

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return { ...emptySummary(), ...overrides }
}

describe('Music page import', () => {
  test('shows how many songs are in the library', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 42 } })
    renderWithMantine(<MusicPage api={fake.api} />)
    expect(await screen.findByText('42 songs in your library')).toBeInTheDocument()
  })

  test('Add Music: pick, confirm the mapping, import, and see the summary', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music/Balkan'],
      'import:start': summary({
        added: [{ path: '/Music/Balkan/Ajde Jano.mp3' }, { path: '/Music/Balkan/Kolo.mp3' }],
        unsupported: [{ path: '/Music/Balkan/Old.aiff', detail: 'Format not supported' }]
      })
    })
    renderWithMantine(<MusicPage api={fake.api} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })
    expect(within(dialog).getByLabelText('Genre is Country')).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([[{ kind: 'paths', paths: ['/Music/Balkan'] }]])
    expect(await screen.findByText('Added (2)')).toBeInTheDocument()
    expect(screen.getByText('Unsupported format (1)')).toBeInTheDocument()
  })

  test('saves the mapping the user chose before importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': summary()
    })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import music' })

    await userEvent.click(within(dialog).getByLabelText('Genre is Country'))
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Album Artist → Teacher' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(fake.callsTo('import:start')).toHaveLength(1))
    expect(fake.settings['import.genreIsCountry']).toBe(false)
    expect(fake.settings['import.albumArtistTagTarget']).toBe('teacher')
  })

  test('does nothing when the picker is cancelled', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:pickMusic': [] })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await waitFor(() => expect(fake.callsTo('import:pickMusic')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows progress and can cancel a running import', async () => {
    let finish: (s: ImportSummary) => void = () => undefined
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickMusic': ['/Music'],
      'import:start': () => new Promise<ImportSummary>((resolve) => (finish = resolve)),
      'import:cancel': undefined
    })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )

    act(() =>
      fake.emit('import:progress', {
        phase: 'reading',
        done: 3,
        total: 10,
        currentPath: '/Music/Kolo.mp3'
      })
    )
    expect(await screen.findByText('3 of 10')).toBeInTheDocument()
    expect(screen.getByText('Kolo.mp3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }))
    expect(fake.callsTo('import:cancel')).toHaveLength(1)

    await act(async () => finish(summary({ cancelled: true, added: [{ path: '/Music/a.mp3' }] })))
    expect(
      await screen.findByText(/songs imported before you stopped it were kept/)
    ).toBeInTheDocument()
  })

  test('dropping files opens the import with their paths', async () => {
    const fake = createFakeApi({ 'library:stats': { fileCount: 0 }, 'import:start': summary() }, [
      '/Users/me/Desktop/Hora.mp3'
    ])
    renderWithMantine(<MusicPage api={fake.api} />)
    const zone = await screen.findByText(/Drop music files or folders here/)
    const file = new File(['x'], 'Hora.mp3')
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    expect(fake.callsTo('import:start')).toEqual([
      [{ kind: 'paths', paths: ['/Users/me/Desktop/Hora.mp3'] }]
    ])
  })

  test('refreshes the song count after an import', async () => {
    let count = 0
    const fake = createFakeApi({
      'library:stats': () => ({ fileCount: count }),
      'import:pickMusic': ['/Music'],
      'import:start': () => {
        count = 5
        return summary({ added: [{ path: '/Music/a.mp3' }] })
      }
    })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Music…' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' })
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(await screen.findByText('5 songs in your library')).toBeInTheDocument()
  })
})

describe('Apple Music import', () => {
  test('imports chosen playlists and asks about playlists edited since the last import', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [{ persistentId: 'BAL', name: 'Balkan' }],
      'import:start': summary({
        playlists: { created: [], replaced: [], kept: [], duplicated: ['Balkan (Apple Music)'] }
      })
    })
    renderWithMantine(<MusicPage api={fake.api} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import from Apple Music' })
    expect(await within(dialog).findByText('3 songs with files on this Mac')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Choose playlists' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Balkan (2 songs)' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL']]])
    expect(await screen.findByText(/changed since you last imported/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Keep both' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(fake.callsTo('import:start')).toEqual([
      [
        {
          kind: 'apple',
          xmlPath: '/Users/me/Library.xml',
          selection: { mode: 'playlists', persistentIds: ['BAL'] },
          decisions: { BAL: 'both' }
        }
      ]
    ])
    expect(await screen.findByText(/imported as a copy: 1/)).toBeInTheDocument()
  })

  test('whole library with no conflicts goes straight to importing', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/Library.xml',
      'import:previewApple': preview,
      'import:checkPlaylistConflicts': [],
      'import:start': summary()
    })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(fake.callsTo('import:checkPlaylistConflicts')).toEqual([[['BAL', 'CPL']]])
    await waitFor(() =>
      expect(fake.callsTo('import:start')).toEqual([
        [
          {
            kind: 'apple',
            xmlPath: '/Users/me/Library.xml',
            selection: { mode: 'all' },
            decisions: {}
          }
        ]
      ])
    )
  })

  test('explains when the file is not an Apple Music library', async () => {
    const fake = createFakeApi({
      'library:stats': { fileCount: 0 },
      'import:pickAppleLibrary': '/Users/me/notes.xml',
      'import:previewApple': () => {
        throw new Error(
          "Error invoking remote method 'import:previewApple': Error: This file is not an Apple Music library export (Library.xml)."
        )
      }
    })
    renderWithMantine(<MusicPage api={fake.api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Import from Apple Music…' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not an Apple Music library export (Library.xml).'
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('invoking remote method')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/renderer/music-import.test.tsx`
Expected: FAIL — all 10 tests fail, because the Music page has no import UI.

- [ ] **Step 3: Implement the error helper and the import flow hook**

`src/renderer/src/ipc-error.ts`:

```ts
// Electron prefixes errors thrown by main-process handlers with
// "Error invoking remote method '<channel>': Error: ". Organizers should only see the message.
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
```

`src/renderer/src/import/useImportFlow.ts`:

```ts
import { useCallback, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import type {
  AppleSelection,
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress,
  ImportRequest,
  ImportSummary,
  PlaylistDecision
} from '@shared/import'
import { errorMessage } from '../ipc-error'

export type ImportFlowState =
  | { step: 'closed' }
  | { step: 'loading'; title: string; message: string }
  | { step: 'mapping'; paths: string[] }
  | { step: 'apple'; xmlPath: string; preview: ApplePreview }
  | {
      step: 'conflicts'
      xmlPath: string
      selection: AppleSelection
      conflicts: ApplePlaylistConflict[]
    }
  | { step: 'running'; title: string; progress: ImportProgress | null; cancelling: boolean }
  | { step: 'summary'; summary: ImportSummary }
  | { step: 'error'; title: string; message: string }

export const MUSIC_TITLE = 'Import music'
export const APPLE_TITLE = 'Import from Apple Music'

// The import dialog's steps (spec §5): mapping → (Apple options → playlist decisions) →
// progress → summary.
export function useImportFlow(api: RendererApi, onFinished: () => void) {
  const [state, setState] = useState<ImportFlowState>({ step: 'closed' })
  const [mapping, setMapping] = useState<ImportMapping | null>(null)

  const loadMapping = useCallback(async () => {
    const s = await api.invoke('settings:getAll')
    setMapping({
      artistTagTarget: s['import.artistTagTarget'],
      albumArtistTagTarget: s['import.albumArtistTagTarget'],
      genreIsCountry: s['import.genreIsCountry']
    })
  }, [api])

  // The mapping is remembered for next time (spec §5.2).
  const saveMapping = async (): Promise<void> => {
    if (!mapping) return
    await api.invoke('settings:set', 'import.artistTagTarget', mapping.artistTagTarget)
    await api.invoke('settings:set', 'import.albumArtistTagTarget', mapping.albumArtistTagTarget)
    await api.invoke('settings:set', 'import.genreIsCountry', mapping.genreIsCountry)
  }

  const openPaths = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    await loadMapping()
    setState({ step: 'mapping', paths })
  }

  const run = async (title: string, request: ImportRequest): Promise<void> => {
    setState({ step: 'running', title, progress: null, cancelling: false })
    const unsubscribe = api.on('import:progress', (progress) =>
      setState((s) => (s.step === 'running' ? { ...s, progress } : s))
    )
    try {
      setState({ step: 'summary', summary: await api.invoke('import:start', request) })
    } catch (err) {
      setState({ step: 'error', title, message: errorMessage(err) })
    } finally {
      unsubscribe()
    }
  }

  return {
    state,
    mapping,
    setMapping,
    addMusic: async () => openPaths(await api.invoke('import:pickMusic')),
    dropFiles: (files: File[]) => openPaths(api.getPathsForFiles(files)),
    importFromApple: async () => {
      const xmlPath = await api.invoke('import:pickAppleLibrary')
      if (!xmlPath) return
      setState({
        step: 'loading',
        title: APPLE_TITLE,
        message: 'Reading your Apple Music library…'
      })
      try {
        const [preview] = await Promise.all([
          api.invoke('import:previewApple', xmlPath),
          loadMapping()
        ])
        setState({ step: 'apple', xmlPath, preview })
      } catch (err) {
        setState({ step: 'error', title: APPLE_TITLE, message: errorMessage(err) })
      }
    },
    startPaths: async (paths: string[]) => {
      await saveMapping()
      await run(MUSIC_TITLE, { kind: 'paths', paths })
    },
    continueApple: async (xmlPath: string, preview: ApplePreview, selection: AppleSelection) => {
      await saveMapping()
      const ids =
        selection.mode === 'all'
          ? preview.playlists.map((p) => p.persistentId)
          : selection.persistentIds
      const conflicts = await api.invoke('import:checkPlaylistConflicts', ids)
      if (conflicts.length > 0) setState({ step: 'conflicts', xmlPath, selection, conflicts })
      else await run(APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions: {} })
    },
    startApple: (
      xmlPath: string,
      selection: AppleSelection,
      decisions: Record<string, PlaylistDecision>
    ) => run(APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions }),
    cancel: async () => {
      setState((s) => (s.step === 'running' ? { ...s, cancelling: true } : s))
      await api.invoke('import:cancel')
    },
    close: () => {
      setState({ step: 'closed' })
      onFinished()
    }
  }
}

export type ImportFlow = ReturnType<typeof useImportFlow>
```

- [ ] **Step 4: Implement the dialog steps**

`src/renderer/src/import/file-name.ts`:

```ts
// The last part of a file path ("/Music/Balkan/Kolo.mp3" → "Kolo.mp3").
export const fileName = (path: string): string => path.split('/').pop() || path
```

`src/renderer/src/import/ImportMappingFields.tsx`:

```tsx
import { Group, Radio, Stack, Switch } from '@mantine/core'
import type { ImportMapping } from '@shared/import'
import type { TagTarget } from '@shared/settings'

const TARGETS: { value: TagTarget; label: string }[] = [
  { value: 'artist', label: 'Artist' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'choreographer', label: 'Choreographer' },
  { value: 'ignore', label: 'Ignore' }
]

function TargetChoice(props: {
  tag: string
  value: TagTarget
  onChange: (value: TagTarget) => void
}): React.JSX.Element {
  return (
    <Radio.Group
      label={`${props.tag} tag goes to`}
      value={props.value}
      onChange={(v) => props.onChange(v as TagTarget)}
    >
      <Group mt={4}>
        {TARGETS.map((t) => (
          <Radio
            key={t.value}
            value={t.value}
            label={t.label}
            aria-label={`${props.tag} → ${t.label}`}
          />
        ))}
      </Group>
    </Radio.Group>
  )
}

// Spec §5.2: shown before every import; the choices are remembered for next time.
export default function ImportMappingFields({
  value,
  onChange
}: {
  value: ImportMapping
  onChange: (value: ImportMapping) => void
}): React.JSX.Element {
  return (
    <Stack gap="sm">
      <TargetChoice
        tag="Artist"
        value={value.artistTagTarget}
        onChange={(artistTagTarget) => onChange({ ...value, artistTagTarget })}
      />
      <TargetChoice
        tag="Album Artist"
        value={value.albumArtistTagTarget}
        onChange={(albumArtistTagTarget) => onChange({ ...value, albumArtistTagTarget })}
      />
      <Switch
        label="Genre is Country"
        checked={value.genreIsCountry}
        onChange={(e) => onChange({ ...value, genreIsCountry: e.currentTarget.checked })}
      />
    </Stack>
  )
}
```

`src/renderer/src/import/AppleOptionsStep.tsx`:

```tsx
import { useState } from 'react'
import { Button, Checkbox, Group, Radio, ScrollArea, Stack, Text } from '@mantine/core'
import type { AppleSelection, ApplePreview, ImportMapping } from '@shared/import'
import ImportMappingFields from './ImportMappingFields'

const songs = (n: number): string => `${n} ${n === 1 ? 'song' : 'songs'}`

export default function AppleOptionsStep(props: {
  preview: ApplePreview
  mapping: ImportMapping
  onMappingChange: (mapping: ImportMapping) => void
  onContinue: (selection: AppleSelection) => void
  onCancel: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<'all' | 'playlists'>('all')
  const [chosen, setChosen] = useState<string[]>([])
  const { preview } = props

  return (
    <Stack>
      <Text>{songs(preview.trackCount)} with files on this Mac</Text>
      <Radio.Group label="What to import" value={mode} onChange={(v) => setMode(v as typeof mode)}>
        <Stack gap="xs" mt={4}>
          <Radio
            value="all"
            label="Whole library (all songs and playlists)"
            aria-label="Whole library"
          />
          <Radio value="playlists" label="Choose playlists" />
        </Stack>
      </Radio.Group>
      {mode === 'playlists' && (
        <ScrollArea.Autosize mah={240}>
          <Checkbox.Group value={chosen} onChange={setChosen}>
            <Stack gap={6}>
              {preview.playlists.map((p) => (
                <Checkbox
                  key={p.persistentId}
                  value={p.persistentId}
                  label={`${p.name} (${songs(p.trackCount)})`}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </ScrollArea.Autosize>
      )}
      <ImportMappingFields value={props.mapping} onChange={props.onMappingChange} />
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          disabled={mode === 'playlists' && chosen.length === 0}
          onClick={() =>
            props.onContinue(mode === 'all' ? { mode } : { mode, persistentIds: chosen })
          }
        >
          Continue
        </Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/import/PlaylistConflictsStep.tsx`:

```tsx
import { useState } from 'react'
import { Button, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import type { ApplePlaylistConflict, PlaylistDecision } from '@shared/import'

// Spec §5.3: Apple playlists edited here since their last import are never overwritten silently.
export default function PlaylistConflictsStep(props: {
  conflicts: ApplePlaylistConflict[]
  onImport: (decisions: Record<string, PlaylistDecision>) => void
  onCancel: () => void
}): React.JSX.Element {
  const [decisions, setDecisions] = useState<Record<string, PlaylistDecision>>(() =>
    Object.fromEntries(props.conflicts.map((c) => [c.persistentId, 'keep' as const]))
  )

  return (
    <Stack>
      <Text>
        These playlists have changed since you last imported them from Apple Music. What should
        happen to each one?
      </Text>
      {props.conflicts.map((c) => (
        <Paper key={c.persistentId} withBorder p="sm">
          <Radio.Group
            label={c.name}
            value={decisions[c.persistentId]}
            onChange={(v) =>
              setDecisions((d) => ({ ...d, [c.persistentId]: v as PlaylistDecision }))
            }
          >
            <Stack gap={6} mt={4}>
              <Radio
                value="keep"
                label="Keep mine"
                description="Skip the Apple Music version this time"
              />
              <Radio
                value="replace"
                label="Replace"
                description="Use the Apple Music version; my changes are lost"
              />
              <Radio
                value="both"
                label="Keep both"
                description={`Import it as "${c.name} (Apple Music)"`}
              />
            </Stack>
          </Radio.Group>
        </Paper>
      ))}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button onClick={() => props.onImport(decisions)}>Import</Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/import/ImportProgressStep.tsx`:

```tsx
import { Button, Group, Loader, Progress, Stack, Text } from '@mantine/core'
import type { ImportProgress } from '@shared/import'
import { fileName } from './file-name'

export default function ImportProgressStep(props: {
  progress: ImportProgress | null
  cancelling: boolean
  onCancel: () => void
}): React.JSX.Element {
  const { progress } = props
  const reading = progress?.phase === 'reading' && progress.total > 0

  return (
    <Stack>
      {reading ? (
        <>
          <Progress value={(progress.done / progress.total) * 100} animated />
          <Group justify="space-between">
            <Text size="sm">{`${progress.done} of ${progress.total}`}</Text>
            {progress.currentPath && (
              <Text size="sm" c="dimmed" truncate maw={320}>
                {fileName(progress.currentPath)}
              </Text>
            )}
          </Group>
        </>
      ) : (
        <Group>
          <Loader size="sm" />
          <Text>Looking for music…</Text>
        </Group>
      )}
      <Group justify="flex-end">
        <Button
          variant="default"
          onClick={props.onCancel}
          loading={props.cancelling}
          aria-label="Cancel import"
        >
          Cancel
        </Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/import/ImportSummaryStep.tsx`:

```tsx
import { Accordion, Alert, Button, Group, List, ScrollArea, Stack, Text } from '@mantine/core'
import type { ImportSummary } from '@shared/import'
import { fileName } from './file-name'

type FileCategory = Exclude<keyof ImportSummary, 'playlists' | 'cancelled'>

const CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: 'added', label: 'Added' },
  { key: 'updated', label: 'Updated' },
  { key: 'relinked', label: 'Found after moving' },
  { key: 'alreadyPresent', label: 'Already in your library' },
  { key: 'notFound', label: 'Not found on disk' },
  { key: 'unsupported', label: 'Unsupported format' },
  { key: 'unreadable', label: "Couldn't be read" }
]

function playlistLine(p: ImportSummary['playlists']): string | null {
  const parts = [
    [p.created.length, 'created'],
    [p.replaced.length, 'replaced'],
    [p.kept.length, 'kept yours'],
    [p.duplicated.length, 'imported as a copy']
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${label}: ${n}`)
  return parts.length ? `Playlists — ${parts.join(', ')}` : null
}

// Spec §5.4: every category expands to list its files.
export default function ImportSummaryStep(props: {
  summary: ImportSummary
  onDone: () => void
}): React.JSX.Element {
  const { summary } = props
  const categories = CATEGORIES.filter((c) => summary[c.key].length > 0)
  const playlists = playlistLine(summary.playlists)

  return (
    <Stack>
      {summary.cancelled && (
        <Alert color="yellow">
          Import cancelled — the songs imported before you stopped it were kept.
        </Alert>
      )}
      {categories.length === 0 && <Text>No music files were found.</Text>}
      <Accordion multiple variant="separated">
        {categories.map((c) => (
          <Accordion.Item key={c.key} value={c.key}>
            <Accordion.Control>{`${c.label} (${summary[c.key].length})`}</Accordion.Control>
            <Accordion.Panel>
              <ScrollArea.Autosize mah={200}>
                <List size="sm">
                  {summary[c.key].map((item) => (
                    <List.Item key={item.path}>
                      {fileName(item.path)}
                      {item.detail && (
                        <Text span size="xs" c="dimmed">
                          {` — ${item.detail}`}
                        </Text>
                      )}
                    </List.Item>
                  ))}
                </List>
              </ScrollArea.Autosize>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {playlists && <Text size="sm">{playlists}</Text>}
      <Group justify="flex-end">
        <Button onClick={props.onDone}>Done</Button>
      </Group>
    </Stack>
  )
}
```

`src/renderer/src/import/ImportDialog.tsx`:

```tsx
import { Alert, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import AppleOptionsStep from './AppleOptionsStep'
import ImportMappingFields from './ImportMappingFields'
import ImportProgressStep from './ImportProgressStep'
import ImportSummaryStep from './ImportSummaryStep'
import PlaylistConflictsStep from './PlaylistConflictsStep'
import { APPLE_TITLE, MUSIC_TITLE, type ImportFlow } from './useImportFlow'

function title(flow: ImportFlow): string {
  const { state } = flow
  switch (state.step) {
    case 'mapping':
      return MUSIC_TITLE
    case 'apple':
    case 'conflicts':
      return APPLE_TITLE
    case 'loading':
    case 'running':
    case 'error':
      return state.title
    case 'summary':
      return state.summary.cancelled ? 'Import stopped' : 'Import finished'
    default:
      return ''
  }
}

export default function ImportDialog({ flow }: { flow: ImportFlow }): React.JSX.Element {
  const { state, mapping } = flow
  const running = state.step === 'running'

  return (
    <Modal
      opened={state.step !== 'closed'}
      onClose={flow.close}
      title={title(flow)}
      size="lg"
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      withCloseButton={!running}
    >
      {state.step === 'loading' && (
        <Group>
          <Loader size="sm" />
          <Text>{state.message}</Text>
        </Group>
      )}
      {state.step === 'mapping' && mapping && (
        <Stack>
          <Text>
            {state.paths.length === 1
              ? '1 file or folder'
              : `${state.paths.length} files or folders`}{' '}
            selected. Choose how their tags are used:
          </Text>
          <ImportMappingFields value={mapping} onChange={flow.setMapping} />
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => flow.startPaths(state.paths)}>Import</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'apple' && mapping && (
        <AppleOptionsStep
          preview={state.preview}
          mapping={mapping}
          onMappingChange={flow.setMapping}
          onContinue={(selection) => flow.continueApple(state.xmlPath, state.preview, selection)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'conflicts' && (
        <PlaylistConflictsStep
          conflicts={state.conflicts}
          onImport={(decisions) => flow.startApple(state.xmlPath, state.selection, decisions)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'running' && (
        <ImportProgressStep
          progress={state.progress}
          cancelling={state.cancelling}
          onCancel={flow.cancel}
        />
      )}
      {state.step === 'summary' && (
        <ImportSummaryStep summary={state.summary} onDone={flow.close} />
      )}
      {state.step === 'error' && (
        <Stack>
          <Alert color="red" role="alert">
            {state.message}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={flow.close}>Close</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
```

- [ ] **Step 5: Implement the drop zone and the Music page**

`src/renderer/src/import/DropZone.module.css`:

```css
.zone {
  border-style: dashed;
  border-width: 2px;
  text-align: center;
  transition: background-color 120ms ease;
}

.active {
  background-color: var(--mantine-primary-color-light);
  border-color: var(--mantine-primary-color-filled);
}
```

`src/renderer/src/import/DropZone.tsx`:

```tsx
import { useState } from 'react'
import { Paper, Text } from '@mantine/core'
import classes from './DropZone.module.css'

// Drop target for music files and folders (spec §5.1).
export default function DropZone({
  onFiles
}: {
  onFiles: (files: File[]) => void
}): React.JSX.Element {
  const [active, setActive] = useState(false)
  return (
    <Paper
      withBorder
      p="xl"
      className={`${classes.zone} ${active ? classes.active : ''}`}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault()
        setActive(true)
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault()
        setActive(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) onFiles(files)
      }}
    >
      <Text c="dimmed">Drop music files or folders here</Text>
    </Paper>
  )
}
```

Replace `src/renderer/src/pages/MusicPage.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import DropZone from '../import/DropZone'
import ImportDialog from '../import/ImportDialog'
import { useImportFlow } from '../import/useImportFlow'

const songCount = (n: number): string =>
  n === 0 ? 'Your library is empty.' : `${n} ${n === 1 ? 'song' : 'songs'} in your library`

// Spec §6.3. The editable song table arrives in plan 3.
export default function MusicPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [fileCount, setFileCount] = useState<number | null>(null)
  const refresh = useCallback(() => {
    api.invoke('library:stats').then((s) => setFileCount(s.fileCount))
  }, [api])
  useEffect(refresh, [refresh])
  const flow = useImportFlow(api, refresh)

  return (
    <Stack p="md">
      <Title order={2}>Music</Title>
      {fileCount !== null && <Text c="dimmed">{songCount(fileCount)}</Text>}
      <Group>
        <Button onClick={flow.addMusic}>Add Music…</Button>
        <Button variant="default" onClick={flow.importFromApple}>
          Import from Apple Music…
        </Button>
      </Group>
      <DropZone onFiles={flow.dropFiles} />
      <ImportDialog flow={flow} />
    </Stack>
  )
}
```

In `src/renderer/src/App.tsx`, pass the API to the Music page. Change:

```tsx
        {page === 'music' && <MusicPage />}
```

to:

```tsx
        {page === 'music' && <MusicPage api={window.api} />}
```

- [ ] **Step 6: Run the UI tests, then everything**

Run: `npx vitest run tests/renderer && npm test && npm run typecheck && npx prettier --check .`
Expected:
- The renderer tests pass (14).
- The whole suite passes (180), with no React `act(...)` warnings in the output.
- Typecheck and formatting are clean.

- [ ] **Step 7: Release notes and decision log**

Append to the existing `### Added` list under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
- Import music with **Add Music…** (files and folders, including folders inside folders) or by dragging them onto the Music page.
- Import from Apple Music: choose the `Library.xml` you exported from Music and import the whole library or just the playlists you pick. Playlists are recreated in the same order.
- Before each import, choose whether the Artist and Album Artist tags become the Artist, Teacher or Choreographer, and whether Genre is the Country. Your choice is remembered.
- Importing again keeps your edits, recognizes files you moved or renamed, and asks before replacing an Apple Music playlist you've changed.
- After each import, a summary lists what was added or updated, and any files that were missing, unreadable, or in a format the player can't play yet (such as AIFF or Apple Lossless).
```

Add these entries to the top of the Decisions list in `AGENTS.md` (newest first):

```markdown
- **2026-10-13 — Imports run in a utility process (one per job), and the main process writes the results.** The worker scans folders, reads tags and fingerprints files. `ImportService` saves each file in its own transaction as results arrive, streams `import:progress` events, and runs one import at a time. `worker-core.ts` has no Electron imports, so tests run the real pipeline in-process against generated MP3s and Apple XML. A cancelled Apple import leaves playlists untouched, because they'd be incomplete. _Rejected:_ importing on the main process (blocks the UI on large libraries); worker threads (a crash in a parser would take down the main process).
- **2026-10-13 — `music-metadata` and `plist` are devDependencies, so Vite bundles them.** Both are ESM-only, and `plist` exports only an `import` condition. Left external, the utility process crashed with an ES-module resolution error; bundled, both work in the built app. Import `plist` as `import { parse } from 'plist'`.
- **2026-10-13 — Re-import matching order: same path, then Apple persistent ID, then fingerprint (only when the old copy is missing or gone).** A fingerprint match keeps the file row, so songs, prefs, playlists and history follow a moved file. A copy whose original still exists is a new file. Existing songs only get empty fields filled.
- **2026-10-13 — An edited Apple playlist defaults to "keep" on re-import.** "Keep both" turns the edited copy into a `local` playlist, and the Apple copy ("Name (Apple Music)") takes over the persistent ID.
- **2026-10-13 — Renderer error messages go through `errorMessage()`,** which strips Electron's "Error invoking remote method…" prefix before organizers see them.
```

- [ ] **Step 8: Manual check — import through the real app**

```bash
npm run build
npm start
```

Expected:
1. **Music page:** shows the song count (or "Your library is empty."), **Add Music…**, **Import from Apple Music…** and a dashed drop zone.
2. **Add Music…:**
   1. Pick a folder of music. The *Import music* dialog shows the mapping, with your saved settings selected.
   2. Choose **Import**. A progress bar counts files, and a summary follows.
   3. **Done**. The song count updates.
3. **Run the same import again:** everything is listed under **Already in your library (N)**.
4. **Drag a few audio files** from Finder onto the drop zone. The same dialog opens.
5. **Apple Music:**
   1. In Music.app, choose File → Library → Export Library… and save `Library.xml`.
   2. Choose **Import from Apple Music…** and pick that file. The dialog shows "N songs with files on this Mac" and your playlists.
   3. Choose a couple of playlists and import.
6. **Cancel:** start a large import and choose **Cancel** partway. The summary says the import was cancelled and the songs imported before stopping were kept.

- [ ] **Step 9: Commit**

```bash
npx prettier --write .
npm test
git add -A
git commit -m "feat(import): import music from the Music page (files, folders, drag and drop, Apple Music)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test` passes: 180 tests, including the full import pipeline against real generated MP3s and Apple XML.
- `npm run typecheck`, `npx prettier --check .` and `npm run build` are clean, and the build includes the `worker-entry` chunk.
- In the running app: you can add files and folders (picker or drag and drop), import from an exported Apple Music `Library.xml` with chosen playlists, cancel a running import, and read the summary.
