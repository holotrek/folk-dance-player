import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { holdSongs, listHolding } from '../../../src/main/library/holding'
import { moveFromHolding, moveToHolding } from '../../../src/main/programs/holding-moves'
import {
  addStop,
  addTracks,
  createProgram,
  getProgram,
  markPlayed,
  ProgramError
} from '../../../src/main/programs/programs'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let hora: ReturnType<typeof addLibrarySong>
let kolo: ReturnType<typeof addLibrarySong>
let bare: ReturnType<typeof addLibrarySong>
let program: number

beforeEach(() => {
  db = createTestDb()
  hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
  kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
  bare = addLibrarySong(db, { title: 'Bare' })
  program = createProgram(db, 'Set')
})

const items = () =>
  getProgram(db, program)!.items.map((i) => (i.kind === 'stop' ? 'STOP' : i.title))
const ids = () => getProgram(db, program)!.items.map((i) => i.id)
const held = () => listHolding(db).map((h) => h.label)

describe('program to Holding', () => {
  test('the song is held as the item’s dance, and the item leaves the program', () => {
    const second = addDance(db, { name: 'Hora Mare' })
    link(db, second, hora.songId)
    addTracks(db, program, [hora.fileId, kolo.fileId])
    db.prepare('UPDATE program_items SET dance_id = ? WHERE file_id = ?').run(second, hora.fileId)
    moveToHolding(db, program, [ids()[0]], null)
    expect(items()).toEqual(['Kolo'])
    expect(held()).toEqual(['Hora Mare ♪ Hora'])
  })

  test('an item with the default dance (none stored) is held as the song’s default, the same pair as from the library', () => {
    addTracks(db, program, [hora.fileId])
    db.prepare('UPDATE program_items SET dance_id = NULL').run()
    moveToHolding(db, program, ids(), null)
    holdSongs(db, [hora.fileId], null) // the library drag: the same pair
    expect(held()).toEqual(['Hora'])
  })

  test('a pair already held: the item is only removed, and the held row stays put', () => {
    const [first] = holdSongs(db, [hora.fileId, kolo.fileId], null)
    addTracks(db, program, [hora.fileId])
    moveToHolding(db, program, ids(), null) // asked to go to the end
    expect(items()).toEqual([])
    expect(held()).toEqual(['Hora', 'Kolo'])
    expect(listHolding(db)[0].id).toBe(first)
  })

  test('a different dance of a held song is added as a second row', () => {
    const second = addDance(db, { name: 'Hora Mare' })
    link(db, second, hora.songId)
    holdSongs(db, [hora.fileId], null)
    addTracks(db, program, [hora.fileId])
    db.prepare('UPDATE program_items SET dance_id = ?').run(second)
    moveToHolding(db, program, ids(), null)
    expect(held()).toEqual(['Hora', 'Hora Mare ♪ Hora'])
  })

  test('goes before the held row dropped on, in the program’s order', () => {
    const [kept] = holdSongs(db, [bare.fileId], null)
    addTracks(db, program, [hora.fileId, kolo.fileId])
    moveToHolding(db, program, [ids()[1], ids()[0]], kept) // asked out of order
    expect(held()).toEqual(['Hora', 'Kolo', 'Bare'])
  })

  test('STOP markers stay in the program, and only STOPs change nothing', () => {
    addTracks(db, program, [hora.fileId])
    addStop(db, program)
    moveToHolding(db, program, ids(), null)
    expect(items()).toEqual(['STOP'])
    expect(held()).toEqual(['Hora'])
    moveToHolding(db, program, ids(), null)
    expect(items()).toEqual(['STOP'])
    expect(held()).toEqual(['Hora'])
  })

  test('unknown and played items are ignored', () => {
    addTracks(db, program, [hora.fileId, kolo.fileId])
    const [played, next] = ids()
    markPlayed(db, played)
    moveToHolding(db, program, [played, next, 9999], null)
    expect(held()).toEqual(['Kolo'])
  })

  test('an unknown program changes nothing', () => {
    addTracks(db, program, [hora.fileId])
    expect(() => moveToHolding(db, 9999, ids(), null)).toThrow(ProgramError)
    expect(items()).toEqual(['Hora'])
    expect(held()).toEqual([])
  })
})

describe('Holding to a program', () => {
  test('the song joins as its held dance, before the item dropped on or at the end, and leaves Holding', () => {
    const second = addDance(db, { name: 'Hora Mare' })
    link(db, second, hora.songId)
    addTracks(db, program, [kolo.fileId])
    const [h1, h2] = holdSongs(db, [hora.fileId, bare.fileId], null)
    db.prepare('UPDATE holding_items SET dance_id = ? WHERE id = ?').run(second, h1)
    const added = moveFromHolding(db, program, [h1], ids()[0])
    expect(added).toHaveLength(1)
    expect(items()).toEqual(['Hora', 'Kolo'])
    expect(getProgram(db, program)!.items[0]).toMatchObject({ danceId: second })
    expect(held()).toEqual(['Bare'])
    moveFromHolding(db, program, [h2], null)
    expect(items()).toEqual(['Hora', 'Kolo', 'Bare'])
    expect(held()).toEqual([])
  })

  test('several rows join in the order they were held, and unknown ids are ignored', () => {
    const [a, b] = holdSongs(db, [hora.fileId, kolo.fileId], null)
    moveFromHolding(db, program, [b, a, 9999], null)
    expect(items()).toEqual(['Hora', 'Kolo'])
  })

  test('an unknown program changes nothing', () => {
    const [a] = holdSongs(db, [hora.fileId], null)
    expect(() => moveFromHolding(db, 9999, [a], null)).toThrow(ProgramError)
    expect(held()).toEqual(['Hora'])
  })
})
