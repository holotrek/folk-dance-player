import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { backupDatabase } from '../../../src/main/db/backup'
import { openDatabase } from '../../../src/main/db/connection'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-backup-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

// A library on disk with one song title in it, at schema version 3.
function library(dir: string, title = 'Hora'): DatabaseSync {
  const db = openDatabase(join(dir, 'folk-dance-player.sqlite'))
  db.exec(`CREATE TABLE songs (title TEXT); PRAGMA user_version = 3;`)
  db.prepare('INSERT INTO songs VALUES (?)').run(title)
  return db
}
const at = (minute: number) => new Date(2026, 9, 14, 20, minute, 5, 123)

describe('the startup backup (spec §10.1)', () => {
  test('copies the library, readable on its own, named by when it was taken', () => {
    const dir = tempDir()
    const db = library(dir)
    const path = backupDatabase(db, join(dir, 'backups'), at(30))
    expect(path).toBe(join(dir, 'backups', 'folk-dance-player-2026-10-14_203005-123.sqlite'))
    const copy = new DatabaseSync(path!, { readOnly: true })
    expect(copy.prepare('SELECT title FROM songs').all()).toEqual([{ title: 'Hora' }])
    expect(copy.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 })
  })

  test('keeps the last 5 backups, and leaves other files alone', () => {
    const dir = tempDir()
    const backups = join(dir, 'backups')
    const db = library(dir)
    backupDatabase(db, backups, at(1))
    writeFileSync(join(backups, 'notes.txt'), 'mine')
    for (let minute = 2; minute <= 7; minute++) backupDatabase(db, backups, at(minute))
    expect(readdirSync(backups).sort()).toEqual([
      'folk-dance-player-2026-10-14_200305-123.sqlite',
      'folk-dance-player-2026-10-14_200405-123.sqlite',
      'folk-dance-player-2026-10-14_200505-123.sqlite',
      'folk-dance-player-2026-10-14_200605-123.sqlite',
      'folk-dance-player-2026-10-14_200705-123.sqlite',
      'notes.txt'
    ])
  })

  test('a brand-new, empty library has nothing to back up', () => {
    const dir = tempDir()
    const db = openDatabase(join(dir, 'folk-dance-player.sqlite'))
    expect(backupDatabase(db, join(dir, 'backups'), at(1))).toBeNull()
  })
})
