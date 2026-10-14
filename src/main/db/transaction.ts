import type { DatabaseSync } from 'node:sqlite'

// Runs `fn` in a transaction: all of its writes happen, or none do. Joins a transaction that is
// already open (so operations can be composed).
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn()
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
