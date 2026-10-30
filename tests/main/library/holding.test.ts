import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { LibraryEditError } from '../../../src/main/library/edit'
import {
  holdSongs,
  listHolding,
  moveHolding,
  releaseHolding,
  setHoldingDance
} from '../../../src/main/library/holding'
import { addDance, addLibrarySong, link, removeSong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let a: ReturnType<typeof addLibrarySong>
let b: ReturnType<typeof addLibrarySong>
let c: ReturnType<typeof addLibrarySong>

beforeEach(() => {
  db = createTestDb()
  a = addLibrarySong(db, { title: 'A', dance: { name: 'Alpha' } })
  b = addLibrarySong(db, { title: 'B', dance: { name: 'Beta' } })
  c = addLibrarySong(db, { title: 'C' })
})

const titles = (): string[] => listHolding(db).map((h) => h.title)

describe('holding', () => {
  test('holds a song as its default dance, at the end or before a held row', () => {
    const [first] = holdSongs(db, [c.fileId, a.fileId], null)
    expect(titles()).toEqual(['C', 'A'])
    expect(listHolding(db)[1]).toMatchObject({ danceId: a.danceId, label: 'Alpha ♪ A' })
    holdSongs(db, [b.fileId], first)
    expect(titles()).toEqual(['B', 'C', 'A'])
  })

  test('returns the holding ids of the songs, in the order given', () => {
    const ids = holdSongs(db, [b.fileId, a.fileId], null)
    expect(listHolding(db).map((h) => h.id)).toEqual(ids)
  })

  test('holding a pair that is already held moves it to the new spot', () => {
    const [x, y] = holdSongs(db, [a.fileId, b.fileId], null)
    const again = holdSongs(db, [b.fileId], x)
    expect(again).toEqual([y]) // the same row, not a second one
    expect(titles()).toEqual(['B', 'A'])
  })

  test('a song with no dance is held once', () => {
    holdSongs(db, [c.fileId], null)
    holdSongs(db, [c.fileId], null)
    expect(titles()).toEqual(['C'])
    expect(listHolding(db)[0].danceId).toBeNull()
  })

  test('a different dance of the same song is a second row', () => {
    const second = addDance(db, { name: 'Alpha Two' })
    link(db, second, a.songId)
    const [first] = holdSongs(db, [a.fileId], null)
    const other = holdSongs(db, [a.fileId], null)
    expect(other).toEqual([first]) // the default dance again: the same row
    setHoldingDance(db, first, second)
    holdSongs(db, [a.fileId], null)
    expect(listHolding(db).map((h) => h.label)).toEqual(['Alpha Two ♪ A', 'Alpha ♪ A'])
  })

  test('the list carries the held dance and keeps removed songs, flagged', () => {
    holdSongs(db, [a.fileId, b.fileId], null)
    removeSong(db, b.fileId)
    expect(listHolding(db).map((h) => [h.title, h.isRemoved])).toEqual([
      ['A', false],
      ['B', true]
    ])
  })

  test('moveHolding keeps the moved rows in their relative order and ignores unknown ids', () => {
    const ids = holdSongs(db, [a.fileId, b.fileId, c.fileId], null)
    moveHolding(db, [ids[2], ids[0], 999], ids[1])
    expect(titles()).toEqual(['A', 'C', 'B'])
    moveHolding(db, [ids[0]], null)
    expect(titles()).toEqual(['C', 'B', 'A'])
  })

  test('releaseHolding removes rows and the rest keep their order', () => {
    const ids = holdSongs(db, [a.fileId, b.fileId, c.fileId], null)
    releaseHolding(db, [ids[1], 999])
    expect(titles()).toEqual(['A', 'C'])
    holdSongs(db, [b.fileId], null)
    expect(titles()).toEqual(['A', 'C', 'B'])
  })

  test('setHoldingDance changes the dance, and refuses a pair that is already held', () => {
    const second = addDance(db, { name: 'Alpha Two' })
    link(db, second, a.songId)
    const [first] = holdSongs(db, [a.fileId], null)
    setHoldingDance(db, first, second)
    expect(listHolding(db)[0].danceId).toBe(second)
    const [again] = holdSongs(db, [a.fileId], null) // the default dance: a second row
    expect(again).not.toBe(first)
    expect(() => setHoldingDance(db, again, second)).toThrow(LibraryEditError)
    expect(() => setHoldingDance(db, again, second)).toThrow('already held')
  })
})
