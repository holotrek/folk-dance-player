import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

describe('migration 002: distinct dances', () => {
  test('a library already at schema 1 is upgraded without losing data', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 1))
    const d = addDance(db, { name: 'Svornato' })
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 1, to: 2 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(db.prepare('SELECT name FROM dances WHERE id = ?').get(d)).toEqual({ name: 'Svornato' })
  })

  test('records a pair of dances the user said are different, once, in a fixed order', () => {
    const db = createTestDb()
    const a = addDance(db, { name: 'Svornato' })
    const b = addDance(db, { name: 'Svornato' })
    const add = db.prepare('INSERT INTO distinct_dances (dance_a, dance_b) VALUES (?, ?)')
    add.run(a, b)
    expect(() => add.run(a, b)).toThrow(/UNIQUE|PRIMARY/)
    expect(() => add.run(b, a)).toThrow(/CHECK/)
    db.prepare('DELETE FROM dances WHERE id = ?').run(a)
    expect(db.prepare('SELECT COUNT(*) n FROM distinct_dances').get()).toEqual({ n: 0 })
  })
})
