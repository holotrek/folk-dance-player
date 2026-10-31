import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildDemoLibrary } from '../../../src/main/tour/demo-library'
import { listLibrary } from '../../../src/main/library/list'
import { listPlaylists, listPlaylistFolders } from '../../../src/main/library/playlists'
import { listPrograms } from '../../../src/main/programs/programs'
import { tunePath } from '../../../scripts/make-tour-tune.mjs'

const TUNE_DIR = dirname(tunePath('hava-nagila'))

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fdp-demo-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const all = {
  search: '',
  filter: { kind: 'all' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

describe('the practice library', () => {
  test('has about eight songs from several countries', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const rows = listLibrary(db, all)
    expect(rows.length).toBeGreaterThanOrEqual(7)
    expect(rows.length).toBeLessThanOrEqual(10)
    expect(new Set(rows.map((r) => r.country)).size).toBeGreaterThanOrEqual(4)
  })

  test('has one tune with two dances: Legnala Dana, as Legnala Dana and as Lesnoto', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const many = db
      .prepare(
        `SELECT s.title, GROUP_CONCAT(d.name, '|') AS dances FROM dance_songs ds
         JOIN songs s ON s.id = ds.song_id JOIN dances d ON d.id = ds.dance_id
         GROUP BY ds.song_id HAVING COUNT(*) = 2`
      )
      .all() as { title: string; dances: string }[]
    expect(many).toHaveLength(1)
    expect(many[0].title).toBe('Legnala Dana')
    expect(many[0].dances.split('|').sort()).toEqual(['Legnala Dana', 'Lesnoto'])
  })

  test('the two tunes that play are Hava Nagila and Korobushka, each its own audio', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const path = (title: string): string =>
      (
        db
          .prepare('SELECT f.path FROM files f JOIN songs s ON s.file_id = f.id WHERE s.title = ?')
          .get(title) as { path: string }
      ).path
    expect(readFileSync(path('Hava Nagila')).equals(readFileSync(tunePath('hava-nagila')))).toBe(
      true
    )
    expect(readFileSync(path('Korobushka')).equals(readFileSync(tunePath('korobushka')))).toBe(true)
  })

  test('has one dance used by two tunes, each with its own teacher', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const shared = db
      .prepare(
        'SELECT dance_id AS danceId, COUNT(*) AS n FROM dance_songs GROUP BY dance_id HAVING n = 2'
      )
      .all() as { danceId: number }[]
    expect(shared).toHaveLength(1)
    expect(
      (
        db.prepare('SELECT name FROM dances WHERE id = ?').get(shared[0].danceId) as {
          name: string
        }
      ).name
    ).toBe('Lesnoto')
    const teachers = db
      .prepare(
        `SELECT p.teacher FROM dance_songs ds JOIN dance_song_prefs p ON p.dance_song_id = ds.id
         WHERE ds.dance_id = ? ORDER BY ds.id`
      )
      .all(shared[0].danceId)
      .map((r) => r.teacher)
    expect(teachers).toHaveLength(2)
    expect(new Set(teachers).size).toBe(2)
  })

  test('names its dances for real dances, not after the tunes', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const names = db
      .prepare('SELECT name FROM dances ORDER BY name')
      .all()
      .map((r) => r.name)
    expect(names).toContain('Lesnoto')
    expect(names).toContain('Legnala Dana')
    expect(names).not.toContain('Misirlou')
    expect(names).toContain('Pravo Rhodopsko')
    // The two tunes of Lesnoto are labelled as that dance in the library.
    const labels = listLibrary(db, all)
      .filter((r) => r.title === 'Makedonsko Devojče')
      .map((r) => r.label)
    expect(labels).toEqual(['Lesnoto ♪ Makedonsko Devojče'])
  })

  test('has a favorite, a local playlist, a synced playlist in a folder, and a saved program', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    expect(
      listLibrary(db, { ...all, filter: { kind: 'favorites' } }).length
    ).toBeGreaterThanOrEqual(1)
    const playlists = listPlaylists(db)
    expect(playlists.some((p) => !p.mirror && p.itemCount > 0)).toBe(true)
    const mirror = playlists.find((p) => p.mirror)
    expect(mirror?.folderId).not.toBeNull()
    expect(mirror!.itemCount).toBeGreaterThan(0)
    expect(listPlaylistFolders(db).length).toBeGreaterThanOrEqual(1)
    const programs = listPrograms(db)
    expect(programs).toHaveLength(1)
    expect(programs[0].unplayedCount).toBeGreaterThan(0)
  })

  test('every song’s file exists, is the practice tune, and has its length recorded', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const files = db.prepare('SELECT path, duration_ms AS ms FROM files').all() as {
      path: string
      ms: number
    }[]
    expect(files.length).toBeGreaterThanOrEqual(7)
    const tunes = (['hava-nagila', 'korobushka'] as const).map((n) => readFileSync(tunePath(n)))
    for (const f of files) {
      expect(f.path.startsWith(dir)).toBe(true)
      expect(existsSync(f.path)).toBe(true)
      const bytes = readFileSync(f.path)
      expect(tunes.some((t) => t.equals(bytes))).toBe(true)
      expect(f.ms).toBeGreaterThan(20_000)
    }
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length)
  })

  test('building in two folders gives independent libraries', () => {
    const other = mkdtempSync(join(tmpdir(), 'fdp-demo-test-'))
    try {
      const a = buildDemoLibrary(dir, TUNE_DIR)
      const b = buildDemoLibrary(other, TUNE_DIR)
      a.db.prepare("UPDATE songs SET title = 'Changed'").run()
      expect(listLibrary(b.db, all).some((r) => r.title === 'Changed')).toBe(false)
      expect(a.dbPath).not.toBe(b.dbPath)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  test('is a migrated library with the current schema', () => {
    const { db } = buildDemoLibrary(dir, TUNE_DIR)
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(version.user_version).toBeGreaterThanOrEqual(7)
  })
})
