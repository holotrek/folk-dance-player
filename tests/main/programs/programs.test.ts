import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ProgramItem } from '@shared/program'
import { mergeDances } from '../../../src/main/library/edit'
import { setFavorite } from '../../../src/main/library/playlists'
import {
  addStop,
  addTracks,
  createProgram,
  deleteProgram,
  duplicateProgram,
  getProgram,
  listPrograms,
  markPlayed,
  nextItem,
  ProgramError,
  removeItems,
  renameProgram,
  reorderItems,
  setItemDance,
  upcomingDanceIds
} from '../../../src/main/programs/programs'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync
let hora: ReturnType<typeof addLibrarySong>
let kolo: ReturnType<typeof addLibrarySong>
let tune: ReturnType<typeof addLibrarySong>

const labels = (programId: number): string[] =>
  getProgram(db, programId)!.items.map((i) => (i.kind === 'stop' ? 'STOP' : i.label))
const ids = (programId: number): number[] => getProgram(db, programId)!.items.map((i) => i.id)
const setUpdated = (programId: number, at: string) =>
  db.prepare('UPDATE programs SET updated_at = ? WHERE id = ?').run(at, programId)

beforeEach(() => {
  db = createTestDb()
  hora = addLibrarySong(db, {
    title: 'Hora',
    durationMs: 185_000,
    dance: { name: 'Hora', country: 'Romania', teacher: 'Sonia Dion' }
  })
  kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Žikino Kolo', country: 'Serbia' } })
  tune = addLibrarySong(db, {
    title: 'Pusteno',
    dance: { name: 'Pravo', choreographer: 'Yves Moreau' }
  })
})

describe('programs', () => {
  test('lists programs newest edit first, filtered by name', () => {
    const a = createProgram(db, 'Tue Oct 14')
    const b = createProgram(db, '  Beginner night ')
    setUpdated(a, '2000-01-02T00:00:00.000Z')
    setUpdated(b, '2000-01-01T00:00:00.000Z')
    addTracks(db, b, [hora.fileId, kolo.fileId])
    addStop(db, b)
    expect(listPrograms(db).map((p) => [p.name, p.unplayedCount])).toEqual([
      ['Beginner night', 2],
      ['Tue Oct 14', 0]
    ])
    expect(listPrograms(db, 'OCT').map((p) => p.name)).toEqual(['Tue Oct 14'])
  })

  test('a program’s summary carries the unplayed songs’ time and the gaps between them', () => {
    const setMs = (song: typeof hora, ms: number | null) =>
      db.prepare('UPDATE files SET duration_ms = ? WHERE id = ?').run(ms, song.fileId)
    setMs(hora, 180_000)
    setMs(kolo, 120_000)
    setMs(tune, 60_000)
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId, kolo.fileId])
    addStop(db, p)
    addTracks(db, p, [tune.fileId])
    const summary = () => listPrograms(db).find((s) => s.id === p)!
    // Hora and Kolo play back to back; the STOP removes the gap before Pusteno.
    expect(summary()).toMatchObject({ unplayedDurationMs: 360_000, unplayedGaps: 1 })

    markPlayed(db, getProgram(db, p)!.items[0].id) // Hora is played: only Kolo, STOP, Pusteno remain
    expect(summary()).toMatchObject({ unplayedDurationMs: 180_000, unplayedGaps: 0 })

    db.prepare('UPDATE files SET is_missing = 1 WHERE id = ?').run(tune.fileId)
    expect(summary()).toMatchObject({ unplayedDurationMs: 120_000, unplayedGaps: 0 })

    setMs(kolo, null) // no known duration counts as zero
    expect(summary()).toMatchObject({ unplayedDurationMs: 0, unplayedGaps: 0 })
  })

  test('the dances still to come: unplayed tracks in order, without STOP markers or played items', () => {
    const p = createProgram(db, 'Tonight')
    const [first] = addTracks(db, p, [hora.fileId, kolo.fileId, tune.fileId])
    addStop(db, p)
    markPlayed(db, first)
    expect(upcomingDanceIds(db, p)).toEqual([kolo.danceId, tune.danceId])
    expect(upcomingDanceIds(db, 9999)).toEqual([])
  })

  test('renames, rejecting a blank name, and deletes', () => {
    const p = createProgram(db, 'Draft')
    renameProgram(db, p, 'Festival')
    expect(listPrograms(db).map((x) => x.name)).toEqual(['Festival'])
    expect(() => renameProgram(db, p, '  ')).toThrow(ProgramError)
    expect(() => createProgram(db, '')).toThrow(ProgramError)
    deleteProgram(db, p)
    expect(listPrograms(db)).toEqual([])
    expect(getProgram(db, p)).toBeNull()
  })

  test('duplicating makes a fresh copy with every item unplayed', () => {
    const p = createProgram(db, 'Set A')
    const [first] = addTracks(db, p, [hora.fileId, kolo.fileId])
    addStop(db, p)
    markPlayed(db, first)
    const copy = duplicateProgram(db, p)
    expect(listPrograms(db).find((x) => x.id === copy)?.name).toBe('Set A copy')
    expect(labels(copy)).toEqual(['Hora', 'Žikino Kolo ♪ Kolo', 'STOP'])
    expect(labels(p)).toEqual(['Žikino Kolo ♪ Kolo', 'STOP'])
  })
})

describe('program items', () => {
  test('adds songs with their default dance, label, country and teacher', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId])
    const [item] = getProgram(db, p)!.items as Extract<ProgramItem, { kind: 'track' }>[]
    expect(item).toMatchObject({
      kind: 'track',
      fileId: hora.fileId,
      danceId: hora.danceId,
      label: 'Hora',
      parts: { song: null, dance: 'Hora', choreographer: null },
      country: 'Romania',
      teacher: 'Sonia Dion',
      durationMs: 185_000,
      isMissing: false,
      danceCount: 1,
      hasNotesPdf: false
    })
  })

  test('each song item says whether its dance has a PDF attached', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId, kolo.fileId])
    db.prepare(
      "INSERT INTO dance_prefs (dance_id, notes_pdf_name, notes_pdf_path) VALUES (?, 'kolo.pdf', '1-ab.pdf')"
    ).run(kolo.danceId)
    const items = getProgram(db, p)!.items as Extract<ProgramItem, { kind: 'track' }>[]
    expect(items.map((i) => i.hasNotesPdf)).toEqual([false, true])
  })

  test('each song item says whether its song is a favorite', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [hora.fileId, kolo.fileId])
    setFavorite(db, [kolo.fileId], true)
    const items = getProgram(db, p)!.items as Extract<ProgramItem, { kind: 'track' }>[]
    expect(items.map((i) => i.isFavorite)).toEqual([false, true])
  })

  test('adds before an item or at the end, and inserts STOP markers', () => {
    const p = createProgram(db, 'Set')
    const [h] = addTracks(db, p, [hora.fileId])
    addTracks(db, p, [kolo.fileId])
    addTracks(db, p, [tune.fileId], h)
    addStop(db, p, h)
    expect(labels(p)).toEqual(['Pravo ♪ Pusteno', 'STOP', 'Hora', 'Žikino Kolo ♪ Kolo'])
  })

  test('the same song can be added twice; unknown files are skipped', () => {
    const p = createProgram(db, 'Set')
    expect(addTracks(db, p, [hora.fileId, 9999, hora.fileId])).toHaveLength(2)
    expect(labels(p)).toEqual(['Hora', 'Hora'])
  })

  test('reorders with the complete new order, and refuses a stale one', () => {
    const p = createProgram(db, 'Set')
    const [h, k, t] = addTracks(db, p, [hora.fileId, kolo.fileId, tune.fileId])
    reorderItems(db, p, [t, h, k])
    expect(ids(p)).toEqual([t, h, k])
    expect(() => reorderItems(db, p, [t, h])).toThrow(ProgramError)
    expect(() => reorderItems(db, p, [t, h, h])).toThrow(ProgramError)
  })

  test('played items leave the view, keep their place, and reordering ignores them', () => {
    const p = createProgram(db, 'Set')
    const [h, k, t] = addTracks(db, p, [hora.fileId, kolo.fileId, tune.fileId])
    markPlayed(db, h)
    expect(ids(p)).toEqual([k, t])
    reorderItems(db, p, [t, k])
    expect(ids(p)).toEqual([t, k])
    expect(nextItem(db, p)?.id).toBe(t)
  })

  test('next up is the first unplayed item, which may be a STOP marker', () => {
    const p = createProgram(db, 'Set')
    expect(nextItem(db, p)).toBeNull()
    const s = addStop(db, p)
    addTracks(db, p, [hora.fileId])
    expect(nextItem(db, p)).toEqual({ id: s, kind: 'stop' })
    markPlayed(db, s)
    expect(nextItem(db, p)).toMatchObject({ kind: 'track', label: 'Hora' })
  })

  test('removes items', () => {
    const p = createProgram(db, 'Set')
    const [h, k] = addTracks(db, p, [hora.fileId, kolo.fileId])
    removeItems(db, p, [h])
    expect(ids(p)).toEqual([k])
  })

  test('switches an item to another dance linked to its song', () => {
    const other = addDance(db, { name: 'Hora Mare', choreographer: 'Theodor Vasilescu' })
    link(db, other, hora.songId)
    const p = createProgram(db, 'Set')
    const [h] = addTracks(db, p, [hora.fileId])
    setItemDance(db, h, other)
    expect(labels(p)).toEqual(['Hora Mare ♪ Hora'])
    const unlinked = addDance(db, { name: 'Sârba' })
    expect(() => setItemDance(db, h, unlinked)).toThrow("isn't linked")
  })

  test('an item follows a merge of its dance', () => {
    const p = createProgram(db, 'Set')
    addTracks(db, p, [kolo.fileId])
    const keep = addDance(db, { name: 'Žikino Kolo', choreographer: 'Trad' })
    mergeDances(db, keep, kolo.danceId!)
    expect(getProgram(db, p)!.items[0]).toMatchObject({ danceId: keep })
  })

  test('every edit moves the program to the top of the list', () => {
    const a = createProgram(db, 'A')
    const b = createProgram(db, 'B')
    setUpdated(a, '2000-01-01T00:00:00.000Z')
    setUpdated(b, '2000-01-02T00:00:00.000Z')
    addTracks(db, a, [hora.fileId])
    expect(listPrograms(db)[0].name).toBe('A')
    setUpdated(a, '2000-01-01T00:00:00.000Z')
    markPlayed(db, ids(a)[0])
    expect(listPrograms(db)[0].name).toBe('A')
  })

  test('edits to a deleted program are refused', () => {
    const p = createProgram(db, 'Gone')
    deleteProgram(db, p)
    expect(() => addTracks(db, p, [hora.fileId])).toThrow(ProgramError)
    expect(() => addStop(db, p)).toThrow(ProgramError)
  })
})
