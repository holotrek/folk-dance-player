import { existsSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ImportProgress } from '@shared/import'
import { runSync, statFile, type SyncEngineDeps } from '../../../src/main/apple-sync/engine'
import { reviewCount } from '../../../src/main/apple-sync/review'
import type { Snapshot } from '../../../src/main/apple-sync/snapshot'
import { ImportService, savedMapping } from '../../../src/main/import/import-service'
import { startInProcessWorker } from '../../../src/main/import/in-process-worker'
import { listLibrary } from '../../../src/main/library/list'
import { addTracks, createProgram, getProgram } from '../../../src/main/programs/programs'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid, snapTrack, snapshot } from './fixtures'

const NOW = '2026-10-16T12:00:00.000Z'
let db: DatabaseSync
let dir: TempDir
let service: ImportService
let reads: string[]
let progress: ImportProgress[]
let kolo: string
let hora: string

function deps(): SyncEngineDeps {
  return {
    db,
    mapping: savedMapping(new SettingsStore(db)),
    readTracks: (tracks, onResult) => {
      reads.push(...tracks.map((t) => t.path))
      return service.readTracks(tracks, onResult)
    },
    stat: statFile,
    exists: existsSync,
    now: () => NOW,
    onProgress: (p) => progress.push(p)
  }
}
const sync = (s: Snapshot, decisions = {}) => runSync(deps(), s, decisions)
const titles = () =>
  listLibrary(db, {
    search: '',
    filter: { kind: 'all' },
    sort: { column: 'title', direction: 'asc' }
  }).map((r) => r.title)
const library = (
  tracks = [
    snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' }),
    snapTrack(2, hora, { title: 'Hora' })
  ]
) =>
  snapshot({
    tracks,
    playlists: [
      { persistentId: pid(100), name: 'Week 3', parentId: null, itemIds: [pid(2), pid(1)] }
    ]
  })
const fileId = (title: string) =>
  (db.prepare('SELECT file_id AS id FROM songs WHERE title = ?').get(title) as { id: number }).id

beforeEach(() => {
  db = createTestDb()
  dir = tempDir()
  reads = []
  progress = []
  service = new ImportService({
    db,
    settings: new SettingsStore(db),
    startWorker: startInProcessWorker,
    onProgress: () => undefined
  })
  kolo = dir.file('Music/Kolo.mp3', mp3Bytes({ title: 'Kolo' }, 1, 1))
  hora = dir.file('Music/Hora.mp3', mp3Bytes({ title: 'Hora' }, 1, 2))
})
afterEach(() => dir.cleanup())

describe('ImportService.readTracks', () => {
  test('reads each file with the tags given, reporting results by key', async () => {
    const results: [number, unknown][] = []
    await service.readTracks(
      [
        {
          key: 7,
          path: kolo,
          persistentId: pid(1),
          tags: { title: 'Music title', artist: null, albumArtist: null, genre: null },
          durationMs: 1000,
          kind: 'MPEG audio file'
        },
        {
          key: 8,
          path: join(dir.path, 'gone.mp3'),
          persistentId: pid(2),
          tags: { title: null, artist: null, albumArtist: null, genre: null },
          durationMs: null,
          kind: null
        }
      ],
      (key, result) => results.push([key, result])
    )
    expect(results).toMatchObject([
      [7, { ok: true, facts: { path: kolo, tags: { title: 'Music title' } } }],
      [8, { ok: false, reason: 'not_found' }]
    ])
    expect(service.busy).toBe(false)
  })
})

describe('runSync', () => {
  test('the first sync brings in tracks and playlists, skipping what is not synced', async () => {
    const s = library([
      snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' }),
      snapTrack(2, hora, { title: 'Hora' }),
      snapTrack(3, '/cloud.mp3', { locationType: 'remote', location: null }),
      snapTrack(4, join(dir.path, 'Old.aiff'), { kind: 'AIFF audio file' })
    ])
    const summary = await sync(s)
    expect(summary.added.map((i) => i.path).sort()).toEqual([hora, kolo].sort())
    expect(summary.skipped).toEqual([{ reason: 'In the cloud or streamed', count: 1 }])
    expect(summary.unsupported).toHaveLength(1)
    expect(summary.playlists.created).toEqual(['Week 3'])
    expect(summary.finishedAt).toBe(NOW)
    expect(titles()).toEqual(['Hora', 'Kolo'])
    expect(progress.at(0)?.phase).toBe('scanning')
    expect(progress.at(-1)).toMatchObject({ phase: 'done', done: 2, total: 2 })
  })

  test('a second sync with no changes changes nothing and reads no file', async () => {
    await sync(library())
    reads = []
    const summary = await sync(library())
    expect(reads).toEqual([])
    expect(summary.added).toEqual([])
    expect(summary.updated).toEqual([])
    expect(summary.playlists).toEqual({ created: [], updated: [], deleted: [] })
  })

  test('a tag edited in Music updates the song without reading the file', async () => {
    await sync(library())
    reads = []
    const summary = await sync(
      library([
        snapTrack(1, kolo, { title: 'Kolo', genre: 'Macedonia' }),
        snapTrack(2, hora, { title: 'Hora' })
      ])
    )
    expect(reads).toEqual([])
    expect(summary.updated.map((i) => i.path)).toEqual([kolo])
  })

  test('a file Music moved is relinked', async () => {
    await sync(library())
    dir.file('Music/Serbia/.keep', '')
    const moved = join(dir.path, 'Music/Serbia/Kolo.mp3')
    renameSync(kolo, moved)
    const summary = await sync(
      library([
        snapTrack(1, moved, { title: 'Kolo', genre: 'Serbia' }),
        snapTrack(2, hora, { title: 'Hora' })
      ])
    )
    expect(summary.relinked.map((i) => i.path)).toEqual([moved])
    expect(titles()).toEqual(['Hora', 'Kolo'])
  })

  // Review Focus 5.
  test('a track Music deleted goes to review, but stays in the program and playable; back, it is synced', async () => {
    await sync(library())
    const program = createProgram(db, 'Tonight')
    addTracks(db, program, [fileId('Hora')])
    const summary = await sync(library([snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' })]))
    expect(summary.gone.map((i) => i.path)).toEqual([hora])
    expect(reviewCount(db)).toBe(1)
    expect(titles()).toEqual(['Hora', 'Kolo'])
    expect(getProgram(db, program)!.items[0]).toMatchObject({
      title: 'Hora',
      isRemoved: false,
      isMissing: false
    })
    expect(summary.playlists.updated).toEqual(['Week 3'])

    const back = await sync(library())
    expect(back.gone).toEqual([])
    expect(reviewCount(db)).toBe(0)
  })

  // Review Focus 4.
  test('a track whose file is gone from disk is missing, not gone', async () => {
    await sync(library())
    rmSync(hora)
    const summary = await sync(library())
    expect(summary.missing.map((i) => i.path)).toEqual([hora])
    expect(summary.gone).toEqual([])
    expect(reviewCount(db)).toBe(0)
    expect(
      db.prepare('SELECT is_missing AS m, apple_sync AS s FROM files WHERE path = ?').get(hora)
    ).toEqual({ m: 1, s: 'synced' })
  })

  // Final review: gone means "no longer in the snapshot" (sync spec §5.5), not "no longer synced".
  test('a track still in Music but no longer syncable (now cloud-only) is not sent to review', async () => {
    await sync(library())
    const summary = await sync(
      library([
        snapTrack(1, kolo, { title: 'Kolo', genre: 'Serbia' }),
        snapTrack(2, hora, { title: 'Hora', locationType: 'remote', location: null })
      ])
    )
    expect(summary.gone).toEqual([])
    expect(reviewCount(db)).toBe(0)
  })

  test('a new track whose file is missing is counted, not added', async () => {
    const summary = await sync(library([snapTrack(1, join(dir.path, 'nowhere.mp3'))]))
    expect(summary.missing).toHaveLength(1)
    expect(titles()).toEqual([])
  })

  test('songs already in the library (Add Music…) are adopted without reading them', async () => {
    await service.run({ kind: 'paths', paths: [join(dir.path, 'Music')] })
    reads = []
    const summary = await sync(library())
    expect(reads).toEqual([])
    expect(summary.adopted.map((i) => i.path).sort()).toEqual([hora, kolo].sort())
    expect(summary.added).toEqual([])
  })

  test('a second Music track pointing at the same file is unreadable', async () => {
    const summary = await sync(
      library([snapTrack(1, kolo, { title: 'Kolo' }), snapTrack(2, kolo, { title: 'Kolo again' })])
    )
    expect(summary.added).toHaveLength(1)
    expect(summary.unreadable).toEqual([
      { path: kolo, detail: 'Another Apple Music track uses this file' }
    ])
  })

  test('playlist decisions are passed on', async () => {
    db.prepare(
      `INSERT INTO playlists (name, source, apple_persistent_id, imported_at, modified_at)
       VALUES ('Week 3', 'apple_xml', ?, '2026-10-01', '2026-10-02')`
    ).run(pid(100))
    await sync(library(), { [pid(100)]: 'replace' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlists').get()).toEqual({ n: 1 })
  })
})
