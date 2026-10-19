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
