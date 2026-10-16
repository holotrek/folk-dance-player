import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  disableSync,
  goneEstimate,
  markGone,
  resolveAllReview,
  resolveReview,
  reviewCount
} from '../../../src/main/apple-sync/review'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { pid } from './fixtures'

const NOW = '2026-10-16T12:00:00.000Z'
let db: DatabaseSync
let a: number
let b: number
let local: number

const synced = (n: number, title: string): number => {
  const s = addLibrarySong(db, { title, path: `/m/${title}.mp3` })
  db.prepare("UPDATE files SET apple_persistent_id = ?, apple_sync = 'synced' WHERE id = ?").run(
    pid(n),
    s.fileId
  )
  return s.fileId
}
const state = (id: number) =>
  db
    .prepare(
      'SELECT apple_sync AS sync, removed_at AS removed, is_missing AS missing FROM files WHERE id = ?'
    )
    .get(id)

beforeEach(() => {
  db = createTestDb()
  a = synced(1, 'A')
  b = synced(2, 'B')
  local = addLibrarySong(db, { title: 'Local' }).fileId
})

describe('markGone (sync spec §5.5)', () => {
  test('synced songs Music no longer has go to the review list, noting whether the file exists', () => {
    const { gone } = markGone(db, new Set([pid(1)]), (path) => path !== '/m/B.mp3')
    expect(gone).toEqual([{ path: '/m/B.mp3' }])
    expect(state(a)).toMatchObject({ sync: 'synced' })
    expect(state(b)).toMatchObject({ sync: 'gone', missing: 1 })
    expect(state(local)).toMatchObject({ sync: null })
    expect(reviewCount(db)).toBe(1)
  })

  test('a song already in the review list is not reported again', () => {
    markGone(db, new Set([pid(1)]), () => true)
    expect(markGone(db, new Set([pid(1)]), () => true).gone).toEqual([])
  })
})

describe('the review list', () => {
  beforeEach(() => void markGone(db, new Set(), () => true))

  test('Remove soft-deletes and takes the song out of the list', () => {
    resolveReview(db, [a], 'remove', NOW)
    expect(state(a)).toMatchObject({ sync: 'gone', removed: NOW })
    expect(reviewCount(db)).toBe(1)
  })

  test('Keep makes it an ordinary local song', () => {
    resolveReview(db, [a], 'keep', NOW)
    expect(state(a)).toMatchObject({ sync: null, removed: null })
  })

  test('Keep all and Remove all apply to the whole list, and only to it', () => {
    resolveAllReview(db, 'remove', NOW)
    expect([state(a), state(b)]).toMatchObject([{ removed: NOW }, { removed: NOW }])
    expect(state(local)).toMatchObject({ removed: null })
    expect(reviewCount(db)).toBe(0)
  })

  test('resolving ignores songs that are not in the list', () => {
    resolveReview(db, [local], 'remove', NOW)
    expect(state(local)).toMatchObject({ removed: null })
  })
})

describe('disableSync (sync spec §5.9)', () => {
  test('songs become local, gone songs are kept, removed songs stay removed, mirrors become editable', () => {
    markGone(db, new Set([pid(1)]), () => true)
    const removed = synced(3, 'C')
    db.prepare("UPDATE files SET apple_sync = 'gone', removed_at = ? WHERE id = ?").run(
      NOW,
      removed
    )
    db.prepare(
      "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES ('M', 'apple_xml', ?, 1)"
    ).run(pid(100))
    disableSync(db)
    expect([state(a), state(b)]).toMatchObject([{ sync: null }, { sync: null }])
    expect(state(removed)).toMatchObject({ sync: 'gone', removed: NOW })
    expect(
      db.prepare('SELECT apple_sync, apple_persistent_id AS pid FROM playlists').get()
    ).toEqual({ apple_sync: 0, pid: pid(100) })
    expect(reviewCount(db)).toBe(0)
  })
})

describe('goneEstimate (the shrink check)', () => {
  test('counts synced songs a snapshot no longer has, of all synced songs', () => {
    expect(goneEstimate(db, new Set([pid(1)]))).toEqual({ gone: 1, synced: 2 })
    expect(goneEstimate(db, new Set([pid(1), pid(2)]))).toEqual({ gone: 0, synced: 2 })
  })
})

describe('markGone reports missing-state changes (a quiet refresh)', () => {
  test('a gone song whose file disappears, or comes back, counts as a change', () => {
    const live = new Set([pid(1)])
    expect(markGone(db, live, () => true).missingChanged).toBe(false)
    expect(markGone(db, live, () => false).missingChanged).toBe(true)
    expect(markGone(db, live, () => false).missingChanged).toBe(false)
    expect(markGone(db, live, () => true).missingChanged).toBe(true)
  })
})
