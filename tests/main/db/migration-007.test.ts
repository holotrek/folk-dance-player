import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'

// A database at version 6 with these songs held (the old way), migrated to 7.
function atSix(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS.slice(0, 6))
  return db
}
const hold = (db: DatabaseSync, fileId: number, position: number | null) =>
  db
    .prepare('INSERT INTO file_prefs (file_id, in_holding, holding_position) VALUES (?, 1, ?)')
    .run(fileId, position)
const rows = (db: DatabaseSync) =>
  db
    .prepare(
      'SELECT file_id AS fileId, dance_id AS danceId, position FROM holding_items ORDER BY position'
    )
    .all()

describe('migration 007: holding items', () => {
  test('held songs move over in their saved order, each as its default dance', () => {
    const db = atSix()
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const other = addDance(db, { name: 'Hora Mare' })
    link(db, other, hora.songId) // a second dance; the default stays Hora
    hold(db, kolo.fileId, 2)
    hold(db, hora.fileId, 1)
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 6, to: 7 })
    expect(getSchemaVersion(db)).toBe(7)
    expect(rows(db)).toEqual([
      { fileId: hora.fileId, danceId: hora.danceId, position: 1 },
      { fileId: kolo.fileId, danceId: kolo.danceId, position: 2 }
    ])
  })

  test('a held song with no dance is held with no dance', () => {
    const db = atSix()
    const bare = addLibrarySong(db, { title: 'Bare' })
    hold(db, bare.fileId, 1)
    migrate(db, MIGRATIONS)
    expect(rows(db)).toEqual([{ fileId: bare.fileId, danceId: null, position: 1 }])
  })

  test('songs that are not held are not copied, and the old flag columns are gone', () => {
    const db = atSix()
    const free = addLibrarySong(db, { title: 'Free', dance: { name: 'Free' } })
    db.prepare('INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, 1)').run(free.fileId)
    migrate(db, MIGRATIONS)
    expect(rows(db)).toEqual([])
    const columns = db
      .prepare('PRAGMA table_info(file_prefs)')
      .all()
      .map((c) => c.name)
    expect(columns).not.toContain('in_holding')
    expect(columns).not.toContain('holding_position')
    // The favorite survives.
    expect(
      db.prepare('SELECT is_favorite AS fav FROM file_prefs WHERE file_id = ?').get(free.fileId)
    ).toEqual({ fav: 1 })
  })

  test('deleting a dance removes its held pairs, and deleting a file its rows', () => {
    const db = atSix()
    migrate(db, MIGRATIONS)
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'A' } })
    const b = addLibrarySong(db, { title: 'B', dance: { name: 'B' } })
    const add = db.prepare(
      'INSERT INTO holding_items (file_id, dance_id, position) VALUES (?, ?, ?)'
    )
    add.run(a.fileId, a.danceId, 1)
    add.run(b.fileId, b.danceId, 2)
    db.prepare('DELETE FROM dances WHERE id = ?').run(a.danceId)
    expect(rows(db).map((r) => r.fileId)).toEqual([b.fileId])
    db.prepare('DELETE FROM files WHERE id = ?').run(b.fileId)
    expect(rows(db)).toEqual([])
  })

  test('the same pair cannot be held twice; one song with two dances, and a pair with no dance, hold once each', () => {
    const db = atSix()
    migrate(db, MIGRATIONS)
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'A' } })
    const second = addDance(db, { name: 'A2' })
    const bare = addLibrarySong(db, { title: 'Bare' })
    const add = db.prepare(
      'INSERT INTO holding_items (file_id, dance_id, position) VALUES (?, ?, ?)'
    )
    add.run(a.fileId, a.danceId, 1)
    add.run(a.fileId, second, 2)
    add.run(bare.fileId, null, 3)
    expect(() => add.run(a.fileId, a.danceId, 4)).toThrow()
    expect(() => add.run(bare.fileId, null, 5)).toThrow()
    expect(rows(db)).toHaveLength(3)
  })
})
