import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

test('enables foreign keys', () => {
  const db = openDatabase(':memory:')
  expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
})

test('uses WAL journal mode for on-disk databases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-'))
  dirs.push(dir)
  const db = openDatabase(join(dir, 'test.sqlite'))
  expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
  db.close()
})
