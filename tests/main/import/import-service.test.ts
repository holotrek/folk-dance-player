import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'path'
import type { ImportProgress } from '@shared/import'
import { ImportBusyError, ImportService } from '../../../src/main/import/import-service'
import { startInProcessWorker } from '../../../src/main/import/in-process-worker'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { appleLibraryXml } from '../helpers/apple-xml'
import { mp3Bytes, tempDir, type TempDir } from '../helpers/audio-fixtures'
import { songView } from '../helpers/library-fixtures'
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

const fileIdOf = (title: string): number =>
  (db.prepare('SELECT file_id FROM songs WHERE title = ?').get(title) as { file_id: number })
    .file_id

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
    expect(songView(db, fileIdOf('Ajde Jano'))).toMatchObject({
      title: 'Ajde Jano',
      dance: 'Ajde Jano',
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
    expect(songView(db, fileIdOf('Ajde Jano'))).toMatchObject({
      title: 'Ajde Jano',
      dance: 'Ajde Jano',
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
