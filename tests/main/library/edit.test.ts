import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  createDance,
  getSongDetail,
  linkDance,
  LibraryEditError,
  markDifferentDances,
  mergeDances,
  sameDance,
  searchDances,
  setDefaultDance,
  setTeacher,
  unlinkDance,
  updateDance,
  updateSong
} from '../../../src/main/library/edit'
import { addDance, addLibrarySong, link, searchSongs } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { toFtsQuery } from '../../../src/main/db/fts'
import { saveDeck, setDanceSlide } from '../../../src/main/canva/decks'

let db: DatabaseSync

const detail = (songId: number) => getSongDetail(db, songId)!
const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

beforeEach(() => {
  db = createTestDb()
})

describe('getSongDetail', () => {
  test('returns the song with every linked dance, default first', () => {
    const { songId, danceId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: {
        name: 'Pravo Rhodopsko Oro',
        country: 'Bulgaria',
        choreographer: 'Yves Moreau',
        teacher: 'Sonia'
      }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto', choreographer: 'Someone' })
    link(db, lesnoto, songId)
    const d = detail(songId)
    expect(d).toMatchObject({ songId, title: 'Pusteno Ludo', isFavorite: false, suggestions: [] })
    expect(d.dances.map((x) => [x.danceId, x.isDefault, x.teacher, x.label])).toEqual([
      [danceId, true, 'Sonia', 'Pravo Rhodopsko Oro (Yves Moreau) ♪ Pusteno Ludo'],
      [lesnoto, false, null, 'Lesnoto (Someone) ♪ Pusteno Ludo']
    ])
  })

  test('counts how many songs share each dance', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto 1', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, { title: 'Lesnoto 2' })
    link(db, a.danceId!, b.songId)
    expect(detail(a.songId).dances[0].songCount).toBe(2)
  })

  test("carries each dance's Canva slide, when it has one", () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    link(db, lesnoto, songId)
    const deckId = saveDeck(
      db,
      { viewUrl: 'https://www.canva.com/design/DAH/TOK/view', designId: 'DAH' },
      { title: 'Deck', pages: [{ id: 'P1', title: 'Hora' }] }
    )
    setDanceSlide(db, danceId!, deckId, 1)
    expect(detail(songId).dances.map((d) => d.slide)).toEqual([
      expect.objectContaining({ deckId, pageId: 'P1', title: 'Hora', status: 'ok' }),
      null
    ])
  })

  test('returns null for an unknown song', () => {
    expect(getSongDetail(db, 999)).toBeNull()
  })
})

describe('editing', () => {
  test('updates the song; a title is required', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora' })
    updateSong(db, songId, { title: '  Hora Veche ', artist: 'Taraf' })
    expect(detail(songId)).toMatchObject({ title: 'Hora Veche', artist: 'Taraf' })
    expect(() => updateSong(db, songId, { title: '  ' })).toThrow(LibraryEditError)
  })

  test('updates dance facts and personal fields, and keeps search current', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    updateDance(db, danceId!, {
      name: 'Hora Mare',
      country: 'Romania',
      choreographer: '',
      danceType: 'Open Circle',
      difficulty: 3,
      notes: 'W, 2 figures'
    })
    expect(detail(songId).dances[0]).toMatchObject({
      name: 'Hora Mare',
      country: 'Romania',
      choreographer: null,
      danceType: 'Open Circle',
      difficulty: 3,
      notes: 'W, 2 figures'
    })
    expect(searchSongs(db, toFtsQuery('romania')!)).toEqual(['Hora'])
  })

  test('rejects a blank dance name and an out-of-range difficulty', () => {
    const { danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(() => updateDance(db, danceId!, { name: ' ' })).toThrow(LibraryEditError)
    expect(() => updateDance(db, danceId!, { difficulty: 6 })).toThrow(LibraryEditError)
  })

  test('sets and clears the teacher on a pairing', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const pairingId = detail(songId).dances[0].pairingId
    setTeacher(db, pairingId, ' Sonia Dion ')
    expect(detail(songId).dances[0].teacher).toBe('Sonia Dion')
    setTeacher(db, pairingId, '')
    expect(detail(songId).dances[0].teacher).toBeNull()
  })

  test('sets the default dance, which must be linked', () => {
    const { songId } = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    const pravo = addDance(db, { name: 'Pravo Rhodopsko Oro' })
    expect(() => setDefaultDance(db, songId, pravo)).toThrow(LibraryEditError)
    link(db, pravo, songId)
    setDefaultDance(db, songId, pravo)
    expect(detail(songId).dances[0]).toMatchObject({ danceId: pravo, isDefault: true })
  })
})

describe('linking', () => {
  test('links an existing dance (once) and creates a new one', () => {
    const { songId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo Rhodopsko Oro' }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    linkDance(db, songId, lesnoto)
    linkDance(db, songId, lesnoto)
    const created = createDance(db, songId, 'Pravo Horo')
    expect(detail(songId).dances.map((d) => d.name)).toEqual([
      'Pravo Rhodopsko Oro',
      'Lesnoto',
      'Pravo Horo'
    ])
    expect(detail(songId).dances.find((d) => d.danceId === created)?.isDefault).toBe(false)
  })

  test('a song’s first dance becomes its default', () => {
    const { songId } = addLibrarySong(db, { title: 'Tune' })
    const id = createDance(db, songId, 'Lesnoto')
    expect(detail(songId).dances[0]).toMatchObject({ danceId: id, isDefault: true })
  })

  test('unlinking the default moves the default to the earliest remaining dance and keeps the dance', () => {
    const { songId, danceId } = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo' }
    })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    linkDance(db, songId, lesnoto)
    unlinkDance(db, songId, danceId!)
    expect(detail(songId).dances).toMatchObject([{ danceId: lesnoto, isDefault: true }])
    expect(db.prepare('SELECT COUNT(*) n FROM dances WHERE id = ?').get(danceId)).toEqual({ n: 1 })
  })
})

describe('mergeDances', () => {
  test('held pairs follow the merge, once per song, keeping their order', () => {
    const a = addLibrarySong(db, { title: 'Song A', dance: { name: 'Kept' } })
    const b = addLibrarySong(db, { title: 'Song B', dance: { name: 'Removed' } })
    const removed = b.danceId!
    link(db, a.danceId!, b.songId) // Song B is danced as both
    link(db, removed, a.songId) // and so is Song A
    const hold = db.prepare(
      'INSERT INTO holding_items (file_id, dance_id, position) VALUES (?, ?, ?)'
    )
    hold.run(a.fileId, removed, 1) // A as the dance that goes
    hold.run(b.fileId, a.danceId, 2) // B as the kept dance
    hold.run(b.fileId, removed, 3) // B as both: after the merge only one row
    hold.run(a.fileId, a.danceId, 4)
    const c = addLibrarySong(db, { title: 'Song C', dance: { name: 'Other' } })
    link(db, removed, c.songId)
    hold.run(c.fileId, removed, 5) // held only as the dance that goes: it must not be lost
    mergeDances(db, a.danceId!, removed)
    const held = db
      .prepare('SELECT file_id AS fileId, dance_id AS danceId FROM holding_items ORDER BY position')
      .all()
    // A's two rows would both be the kept dance: the one that already was stays, the other goes.
    expect(held).toEqual([
      { fileId: b.fileId, danceId: a.danceId },
      { fileId: a.fileId, danceId: a.danceId },
      { fileId: c.fileId, danceId: a.danceId }
    ])
  })

  test('deleting a dance removes the pairs held with it', () => {
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'Gone' } })
    db.prepare('INSERT INTO holding_items (file_id, dance_id, position) VALUES (?, ?, 1)').run(
      a.fileId,
      a.danceId
    )
    db.prepare('DELETE FROM dances WHERE id = ?').run(a.danceId)
    expect(count('holding_items')).toBe(0)
  })

  test('moves songs, teachers, defaults and history to the kept dance and fills its empty fields', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto A', dance: { name: 'Lesnoto', teacher: 'T1' } })
    const b = addLibrarySong(db, {
      title: 'Lesnoto B',
      dance: { name: 'Lesnoto', country: 'Macedonia', teacher: 'T2' }
    })
    db.prepare("INSERT INTO dance_prefs (dance_id, notes) VALUES (?, 'basic 3-measure')").run(
      b.danceId
    )
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('x')").run().lastInsertRowid)
    db.prepare(
      "INSERT INTO program_items (program_id, position, kind, file_id, dance_id) VALUES (?, 1, 'track', ?, ?)"
    ).run(p, b.fileId, b.danceId)
    db.prepare("INSERT INTO play_log (file_id, dance_id, kind) VALUES (?, ?, 'preview')").run(
      b.fileId,
      b.danceId
    )

    mergeDances(db, a.danceId!, b.danceId!)

    expect(count('dances')).toBe(1)
    expect(detail(b.songId).dances).toMatchObject([
      {
        danceId: a.danceId,
        isDefault: true,
        teacher: 'T2',
        country: 'Macedonia',
        notes: 'basic 3-measure',
        songCount: 2
      }
    ])
    expect(detail(a.songId).dances[0].teacher).toBe('T1')
    expect(db.prepare('SELECT dance_id FROM program_items').get()).toEqual({ dance_id: a.danceId })
    expect(db.prepare('SELECT dance_id FROM play_log').get()).toEqual({ dance_id: a.danceId })
    expect(searchSongs(db, toFtsQuery('macedonia')!)).toEqual(['Lesnoto A', 'Lesnoto B'])
  })

  test('a song linked to both dances keeps one pairing, keeping a teacher', () => {
    const a = addLibrarySong(db, { title: 'Tune', dance: { name: 'Lesnoto' } })
    const other = addDance(db, { name: 'Lesnoto' })
    link(db, other, a.songId, 'T2')
    mergeDances(db, a.danceId!, other)
    expect(detail(a.songId).dances).toMatchObject([{ danceId: a.danceId, teacher: 'T2' }])
  })

  test('keeps the notes of both dances', () => {
    const a = addLibrarySong(db, { title: 'Svornato A', dance: { name: 'Svornato' } })
    const b = addLibrarySong(db, { title: 'Svornato B', dance: { name: 'Svornato' } })
    updateDance(db, a.danceId!, { notes: 'hands in W' })
    updateDance(db, b.danceId!, { notes: 'slow start' })
    mergeDances(db, a.danceId!, b.danceId!)
    expect(detail(a.songId).dances[0].notes).toBe('hands in W\n\nslow start')
  })

  test('keeps the removed dance’s "Different dance" answers', () => {
    const s = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const a = addLibrarySong(db, { title: 'Other A', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, { title: 'Other B', dance: { name: 'Lesnoto' } })
    markDifferentDances(db, s.danceId!, a.danceId!)
    sameDance(db, s.songId, s.danceId!, b.danceId!)
    expect(detail(s.songId).suggestions).toEqual([])
  })

  test('refuses to merge a dance into itself', () => {
    const a = addLibrarySong(db, { title: 'Tune', dance: { name: 'Lesnoto' } })
    expect(() => mergeDances(db, a.danceId!, a.danceId!)).toThrow(LibraryEditError)
  })
})

describe('same-name suggestions', () => {
  test('suggests another dance with the same name, with the songs it is used for', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'lesnoto ', choreographer: 'X' }
    })
    expect(detail(a.songId).suggestions).toEqual([
      {
        forDanceId: a.danceId,
        candidate: {
          danceId: b.danceId,
          name: 'lesnoto ',
          choreographer: 'X',
          country: null,
          songTitles: ['Pusteno Ludo']
        }
      }
    ])
  })

  test('"Same dance" links the song to it and removes the unused automatic duplicate', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto', teacher: 'T' } })
    const b = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    sameDance(db, a.songId, a.danceId!, b.danceId!)
    expect(detail(a.songId).dances).toMatchObject([
      { danceId: b.danceId, isDefault: true, teacher: 'T' }
    ])
    expect(count('dances')).toBe(1)
    expect(detail(a.songId).suggestions).toEqual([])
  })

  test('"Same dance" keeps the song’s own dance when other songs still use it', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const c = addLibrarySong(db, { title: 'Third' })
    link(db, a.danceId!, c.songId)
    const b = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    sameDance(db, a.songId, a.danceId!, b.danceId!)
    expect(detail(a.songId).dances.map((d) => [d.danceId, d.isDefault])).toEqual([
      [b.danceId, true],
      [a.danceId, false]
    ])
    expect(count('dances')).toBe(2)
  })

  test('a dance no song uses is not suggested', () => {
    const a = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    addDance(db, { name: 'Lesnoto' })
    expect(detail(a.songId).suggestions).toEqual([])
  })

  test('"Different dance" stops the suggestion, in both directions', () => {
    const a = addLibrarySong(db, {
      title: 'Svornato',
      dance: { name: 'Svornato', choreographer: 'A' }
    })
    const b = addLibrarySong(db, {
      title: 'Svornato 2',
      dance: { name: 'Svornato', choreographer: 'B' }
    })
    markDifferentDances(db, b.danceId!, a.danceId!)
    markDifferentDances(db, a.danceId!, b.danceId!)
    expect(detail(a.songId).suggestions).toEqual([])
    expect(detail(b.songId).suggestions).toEqual([])
  })
})

describe('searchDances', () => {
  test('finds dances by name, choreographer or country, ignoring case and accents', () => {
    addLibrarySong(db, { title: 'x', dance: { name: 'Ali Paşa', country: 'Turkey' } })
    addLibrarySong(db, {
      title: 'y',
      dance: { name: 'Pravo Rhodopsko Oro', choreographer: 'Yves Moreau' }
    })
    expect(searchDances(db, 'pasa').map((d) => d.name)).toEqual(['Ali Paşa'])
    expect(searchDances(db, 'MOREAU').map((d) => d.name)).toEqual(['Pravo Rhodopsko Oro'])
    expect(searchDances(db, 'turk')[0]).toMatchObject({ name: 'Ali Paşa', songCount: 1 })
    expect(searchDances(db, '').length).toBe(2)
  })
})

describe('same as song', () => {
  const dance = (songId: number, danceId: number | null) =>
    detail(songId).dances.find((d) => d.danceId === danceId)!
  const names = (songId: number) => detail(songId).dances.map((d) => d.name)

  test('the default dance that is the only use of its name is sameAsSong', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    link(db, lesnoto, songId)
    const namesake = addDance(db, { name: 'Kolo' })
    link(db, namesake, songId)
    expect(dance(songId, danceId).sameAsSong).toBe(true)
    expect(dance(songId, lesnoto).sameAsSong).toBe(false)
    expect(dance(songId, namesake).sameAsSong).toBe(false) // not the default
  })

  test('a dance shared by two songs is never sameAsSong', () => {
    const a = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const b = addLibrarySong(db, { title: 'Other' })
    link(db, a.danceId!, b.songId)
    expect(dance(a.songId, a.danceId).sameAsSong).toBe(false)
  })

  test('a name that differs only by case or spaces counts as the same', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: ' kolo ' } })
    expect(dance(songId, danceId).sameAsSong).toBe(true)
  })

  test('renaming the song renames its same-named default dance, and only that one', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const namesake = addDance(db, { name: 'Kolo' })
    link(db, namesake, songId)
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    link(db, lesnoto, songId)
    updateSong(db, songId, { title: 'Kolo Veliko' })
    expect(dance(songId, danceId)).toMatchObject({ name: 'Kolo Veliko', sameAsSong: true })
    expect(dance(songId, namesake).name).toBe('Kolo')
    expect(dance(songId, lesnoto).name).toBe('Lesnoto')
  })

  test('after Make default, the new default is the one that follows', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const namesake = addDance(db, { name: 'Kolo' })
    link(db, namesake, songId)
    setDefaultDance(db, songId, namesake)
    updateSong(db, songId, { title: 'Kolo Veliko' })
    expect(dance(songId, namesake).name).toBe('Kolo Veliko')
    expect(dance(songId, danceId).name).toBe('Kolo')
  })

  test('the new title is trimmed for the dance too', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    updateSong(db, songId, { title: '  Kolo X ' })
    expect(dance(songId, danceId).name).toBe('Kolo X')
  })

  test('a dance with a different name is left alone', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Pusteno', dance: { name: 'Pravo' } })
    updateSong(db, songId, { title: 'Pusteno Ludo' })
    expect(dance(songId, danceId).name).toBe('Pravo')
  })

  test('a shared dance is not renamed with one of its songs', () => {
    const a = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const b = addLibrarySong(db, { title: 'Other' })
    link(db, a.danceId!, b.songId)
    updateSong(db, a.songId, { title: 'Kolo Veliko' })
    expect(names(a.songId)).toEqual(['Kolo'])
  })

  test('a blank title changes neither the song nor the dance', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    expect(() => updateSong(db, songId, { title: '  ' })).toThrow(LibraryEditError)
    expect(detail(songId).title).toBe('Kolo')
    expect(dance(songId, danceId).name).toBe('Kolo')
  })

  test('an artist-only edit leaves the dance alone', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    updateSong(db, songId, { artist: 'Taraf' })
    expect(dance(songId, danceId).name).toBe('Kolo')
  })

  test('keepDanceName leaves the dance as it is when the song is renamed', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    updateSong(db, songId, { title: 'Kolo Veliko', keepDanceName: true })
    expect(detail(songId).title).toBe('Kolo Veliko')
    expect(dance(songId, danceId).name).toBe('Kolo')
  })

  test('updateDance with sameAsSong sets the name to the song’s current title', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Pravo' } })
    updateDance(db, danceId!, { sameAsSong: true })
    expect(dance(songId, danceId)).toMatchObject({ name: 'Kolo', sameAsSong: true })
  })

  test('sameAsSong is refused for a dance used by several songs', () => {
    const a = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Pravo' } })
    const b = addLibrarySong(db, { title: 'Other' })
    link(db, a.danceId!, b.songId)
    expect(() => updateDance(db, a.danceId!, { sameAsSong: true })).toThrow(LibraryEditError)
    expect(dance(a.songId, a.danceId).name).toBe('Pravo')
  })
})

describe('getSongDetail: PDFs', () => {
  test('carries each dance’s PDF name and whether it is missing', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    link(db, lesnoto, songId)
    const info = (id: number) => (id === danceId ? { name: 'Hora notes.pdf', missing: true } : null)
    const dances = getSongDetail(db, songId, { pdfInfo: info })!.dances
    expect(dances.map((d) => d.notesPdf)).toEqual([{ name: 'Hora notes.pdf', missing: true }, null])
  })

  test('is null without an attachment store', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(getSongDetail(db, songId)!.dances[0].notesPdf).toBeNull()
  })
})

describe('mergeDances: PDFs', () => {
  const setPdf = (danceId: number, name: string, stored: string) =>
    db
      .prepare(
        `INSERT INTO dance_prefs (dance_id, notes_pdf_name, notes_pdf_path) VALUES (?, ?, ?)
         ON CONFLICT (dance_id) DO UPDATE SET notes_pdf_name = excluded.notes_pdf_name,
           notes_pdf_path = excluded.notes_pdf_path`
      )
      .run(danceId, name, stored)
  const pdf = (danceId: number) =>
    db
      .prepare(
        'SELECT notes_pdf_name AS name, notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?'
      )
      .get(danceId)
  const two = () => ({
    a: addLibrarySong(db, { title: 'A', dance: { name: 'Lesnoto' } }),
    b: addLibrarySong(db, { title: 'B', dance: { name: 'Lesnoto' } })
  })

  test('the kept dance keeps its PDF, and the removed dance’s file is reported unreferenced', () => {
    const { a, b } = two()
    setPdf(a.danceId!, 'keep.pdf', '1-aa.pdf')
    setPdf(b.danceId!, 'gone.pdf', '2-bb.pdf')
    expect(mergeDances(db, a.danceId!, b.danceId!)).toEqual(['dance-notes/2-bb.pdf'])
    expect(pdf(a.danceId!)).toEqual({ name: 'keep.pdf', path: '1-aa.pdf' })
  })

  test('the kept dance takes the removed dance’s PDF when it has none, and nothing is reported', () => {
    const { a, b } = two()
    setPdf(b.danceId!, 'gone.pdf', '2-bb.pdf')
    expect(mergeDances(db, a.danceId!, b.danceId!)).toEqual([])
    expect(pdf(a.danceId!)).toEqual({ name: 'gone.pdf', path: '2-bb.pdf' })
  })

  test('without PDFs nothing changes and nothing is reported', () => {
    const { a, b } = two()
    expect(mergeDances(db, a.danceId!, b.danceId!)).toEqual([])
    expect((pdf(a.danceId!) as { path: string | null } | undefined)?.path ?? null).toBeNull()
  })

  test('“Same dance” merges the same way and reports the unreferenced file', () => {
    const own = addLibrarySong(db, { title: 'Own', dance: { name: 'Lesnoto' } })
    const other = addLibrarySong(db, { title: 'Other', dance: { name: 'Lesnoto' } })
    setPdf(own.danceId!, 'mine.pdf', '1-aa.pdf')
    setPdf(other.danceId!, 'theirs.pdf', '2-bb.pdf')
    expect(sameDance(db, own.songId, own.danceId!, other.danceId!)).toEqual([
      'dance-notes/1-aa.pdf'
    ])
    expect(pdf(other.danceId!)).toEqual({ name: 'theirs.pdf', path: '2-bb.pdf' })
  })
})

describe('getSongDetail: slide images', () => {
  test('carries each dance’s image (with a version URL) and which slide is shown', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    link(db, lesnoto, songId)
    const attachments = {
      imageInfo: (id: number) =>
        id === danceId ? { name: 'a.png', version: '1-ab.png', missing: false } : null,
      slideShows: (id: number) => (id === danceId ? ('image' as const) : null)
    }
    const dances = getSongDetail(db, songId, attachments)!.dances
    expect(dances[0].slideImage).toEqual({
      name: 'a.png',
      url: `fdp-media://dance-image/${danceId}?v=1-ab.png`,
      missing: false
    })
    expect(dances[0].slideShows).toBe('image')
    expect(dances[1].slideImage).toBeNull()
    expect(dances[1].slideShows).toBeNull()
  })

  test('is null without an attachment store', () => {
    const { songId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(getSongDetail(db, songId)!.dances[0]).toMatchObject({
      slideImage: null,
      slideShows: null
    })
  })
})

describe('mergeDances: slide images and the slide choice', () => {
  const prefs = (danceId: number, cols: Record<string, string | number | null>) => {
    db.prepare('INSERT OR IGNORE INTO dance_prefs (dance_id) VALUES (?)').run(danceId)
    for (const [k, v] of Object.entries(cols)) {
      db.prepare(`UPDATE dance_prefs SET ${k} = ? WHERE dance_id = ?`).run(v, danceId)
    }
  }
  const read = (danceId: number) =>
    db
      .prepare(
        `SELECT slide_image_name AS name, slide_image_path AS path, slide_source AS source,
           canva_deck_id AS deck FROM dance_prefs WHERE dance_id = ?`
      )
      .get(danceId) as {
      name: string | null
      path: string | null
      source: string | null
      deck: number | null
    }
  const two = () => ({
    a: addLibrarySong(db, { title: 'A', dance: { name: 'Lesnoto' } }),
    b: addLibrarySong(db, { title: 'B', dance: { name: 'Lesnoto' } })
  })
  const deck = () =>
    Number(
      db
        .prepare("INSERT INTO canva_decks (view_url, design_id, pages) VALUES (?, 'D', '[]')")
        .run(`https://x/${Math.random()}/view`).lastInsertRowid
    )
  const canva = (danceId: number, deckId: number) =>
    prefs(danceId, { canva_deck_id: deckId, canva_page_id: 'P1', canva_page_index: 1 })

  test('the kept dance keeps its image; the removed dance’s file is reported unreferenced', () => {
    const { a, b } = two()
    prefs(a.danceId!, { slide_image_name: 'keep.png', slide_image_path: '1-aa.png' })
    prefs(b.danceId!, { slide_image_name: 'gone.png', slide_image_path: '2-bb.png' })
    expect(mergeDances(db, a.danceId!, b.danceId!)).toEqual(['slide-images/2-bb.png'])
    expect(read(a.danceId!)).toMatchObject({ name: 'keep.png', path: '1-aa.png' })
  })

  test('the kept dance takes the removed dance’s image when it has none', () => {
    const { a, b } = two()
    prefs(b.danceId!, { slide_image_name: 'gone.png', slide_image_path: '2-bb.png' })
    expect(mergeDances(db, a.danceId!, b.danceId!)).toEqual([])
    expect(read(a.danceId!)).toMatchObject({ name: 'gone.png', path: '2-bb.png' })
  })

  test('the kept dance’s own choice wins when it has both sources', () => {
    const { a, b } = two()
    const d = deck()
    canva(a.danceId!, d)
    prefs(a.danceId!, {
      slide_image_name: 'a.png',
      slide_image_path: '1-aa.png',
      slide_source: 'canva'
    })
    prefs(b.danceId!, {
      slide_image_name: 'b.png',
      slide_image_path: '2-bb.png',
      slide_source: 'image'
    })
    canva(b.danceId!, d)
    mergeDances(db, a.danceId!, b.danceId!)
    expect(read(a.danceId!).source).toBe('canva')
  })

  test('a kept dance that already had both sources keeps the default Canva choice', () => {
    const { a, b } = two()
    const d = deck()
    canva(a.danceId!, d)
    prefs(a.danceId!, { slide_image_name: 'a.png', slide_image_path: '1-aa.png' }) // choice never touched
    canva(b.danceId!, d)
    prefs(b.danceId!, {
      slide_image_name: 'b.png',
      slide_image_path: '2-bb.png',
      slide_source: 'image'
    })
    mergeDances(db, a.danceId!, b.danceId!)
    expect(read(a.danceId!)).toMatchObject({ path: '1-aa.png', source: null })
  })

  test('the removed dance’s choice is adopted when the kept dance had none and both sources now exist', () => {
    const { a, b } = two()
    canva(a.danceId!, deck())
    prefs(b.danceId!, {
      slide_image_name: 'b.png',
      slide_image_path: '2-bb.png',
      slide_source: 'image'
    })
    canva(b.danceId!, deck())
    mergeDances(db, a.danceId!, b.danceId!)
    expect(read(a.danceId!)).toMatchObject({ path: '2-bb.png', source: 'image' })
  })

  test('the choice is cleared when the merged dance does not have both', () => {
    const { a, b } = two()
    prefs(b.danceId!, {
      slide_image_name: 'b.png',
      slide_image_path: '2-bb.png',
      slide_source: 'image'
    })
    mergeDances(db, a.danceId!, b.danceId!)
    expect(read(a.danceId!)).toMatchObject({ path: '2-bb.png', source: null })
  })
})
