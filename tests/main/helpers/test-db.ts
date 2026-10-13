import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'

export function createTestDb(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  return db
}
