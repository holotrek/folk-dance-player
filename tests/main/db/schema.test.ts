import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { FOLD_MAP, toFtsQuery } from '../../../src/main/db/fts'
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
    db.prepare("INSERT INTO play_log (file_id, program_id, kind) VALUES (?, ?, 'program')").run(
      f,
      p
    )

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

  test.each([
    ['kirmizi', 'Kırmızı Gül'],
    ['cicek dagi', 'Çiçek Dağı'],
    ['lodz', 'Łódź'],
    ['oland', 'Øland'],
    ['aevintyri', 'Ævintýri'],
    ['strassenpolka', 'Straßenpolka'],
    ['Kırmızı', 'Kırmızı Gül']
  ])('search %j finds %j (letters that are not combining accents)', (query, title) => {
    addSong(addFile('/1.mp3'), { title })
    expect(search(toFtsQuery(query)!)).toEqual([title])
  })

  // Migration 001 has its own frozen copy of the fold map; it must cover every FOLD_MAP entry.
  test.each(FOLD_MAP.map(([from, to]) => [from, to]))(
    'index folds %j like the query does (%j)',
    (from, to) => {
      addSong(addFile('/1.mp3'), { title: `x${from}y` })
      expect(search(toFtsQuery(`x${to}y`)!)).toEqual([`x${from}y`])
    }
  )

  // Review Focus 4: punctuation typed into the search box must not break MATCH.
  test('finds values containing punctuation through toFtsQuery', () => {
    addSong(addFile('/1.mp3'), { title: 'Ajde 4-Wall', country: "Côte d'Ivoire" })
    expect(search(toFtsQuery('4-Wall')!)).toEqual(['Ajde 4-Wall'])
    expect(search(toFtsQuery("d'Ivoire")!)).toEqual(['Ajde 4-Wall'])
  })

  test('raw search-box text is not safe to pass to MATCH', () => {
    expect(() => search('4-Wall')).toThrow()
  })

  test('stays in sync when a song is edited', () => {
    const s = addSong(addFile(), { title: 'Hora', teacher: 'Old Name' })
    db.prepare("UPDATE songs SET teacher = 'New Name' WHERE id = ?").run(s)
    expect(search('"old"')).toEqual([])
    expect(search('"new"')).toEqual(['Hora'])
  })
})
