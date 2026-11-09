import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'

describe('migration 008: log cleared mark', () => {
  test('adds programs.log_cleared_at, empty for existing programs', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 7))
    db.prepare("INSERT INTO programs (name) VALUES ('Set')").run()
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 7, to: 8 })
    expect(getSchemaVersion(db)).toBe(8)
    expect(db.prepare('SELECT log_cleared_at AS at FROM programs').get()).toEqual({ at: null })
  })
})
