import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addLibrarySong } from '../helpers/library-fixtures'

describe('migration 003: holding order', () => {
  test('songs already held keep a place, in title order', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 2))
    const kolo = addLibrarySong(db, { title: 'Kolo' })
    const hora = addLibrarySong(db, { title: 'Hora' })
    const free = addLibrarySong(db, { title: 'Free' })
    const hold = db.prepare('INSERT INTO file_prefs (file_id, in_holding) VALUES (?, ?)')
    hold.run(kolo.fileId, 1)
    hold.run(hora.fileId, 1)
    hold.run(free.fileId, 0)
    expect(migrate(db, MIGRATIONS.slice(0, 3))).toEqual({ from: 2, to: 3 })
    expect(getSchemaVersion(db)).toBe(3)
    const rows = db
      .prepare('SELECT file_id AS fileId, holding_position AS pos FROM file_prefs ORDER BY file_id')
      .all()
    expect(rows).toEqual([
      { fileId: kolo.fileId, pos: 2 },
      { fileId: hora.fileId, pos: 1 },
      { fileId: free.fileId, pos: null }
    ])
  })
})
