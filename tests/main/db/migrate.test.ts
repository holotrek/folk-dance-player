import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import {
  getSchemaVersion,
  migrate,
  MigrationError,
  SchemaTooNewError,
  type Migration
} from '../../../src/main/db/migrate'

const m1: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' }
const m2: Migration = { version: 2, name: 'two', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY);' }

function tables(db: ReturnType<typeof openDatabase>): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name as string)
}

describe('migrate', () => {
  test('applies all migrations to a new database and sets user_version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, [m1, m2])).toEqual({ from: 0, to: 2 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(tables(db)).toEqual(['a', 'b'])
  })

  test('applies only pending migrations', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1])
    expect(migrate(db, [m1, m2])).toEqual({ from: 1, to: 2 })
    expect(tables(db)).toEqual(['a', 'b'])
  })

  test('is a no-op when up to date', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1, m2])
    expect(migrate(db, [m1, m2])).toEqual({ from: 2, to: 2 })
  })

  // Review Focus 1: a library written by a newer app version must not be touched.
  test('refuses a database newer than the app and leaves it unchanged', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1, m2])
    const error = (() => {
      try {
        migrate(db, [m1])
      } catch (e) {
        return e
      }
    })()
    expect(error).toBeInstanceOf(SchemaTooNewError)
    expect(error).toMatchObject({ dbVersion: 2, appVersion: 1 })
    expect(getSchemaVersion(db)).toBe(2)
    expect(tables(db)).toEqual(['a', 'b'])
  })

  // Review Focus 2: a failing migration leaves nothing behind.
  test('rolls back a failing migration completely', () => {
    const db = openDatabase(':memory:')
    migrate(db, [m1])
    const bad: Migration = {
      version: 2,
      name: 'bad',
      sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY); CREATE TABLE a (id INTEGER PRIMARY KEY);'
    }
    expect(() => migrate(db, [m1, bad])).toThrow(MigrationError)
    expect(() => migrate(db, [m1, bad])).toThrow(/Migration 2 \(bad\) failed/)
    expect(getSchemaVersion(db)).toBe(1)
    expect(tables(db)).toEqual(['a'])
  })

  test('rejects a migration list that is not 1..n in order', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [m2])).toThrow(/must be numbered 1\.\.n in order/)
    expect(() => migrate(db, [m2, m1])).toThrow(/must be numbered 1\.\.n in order/)
  })
})
