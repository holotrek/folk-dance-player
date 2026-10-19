import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { LibraryQuery } from '@shared/library'
import { listLibrary } from '../../../src/main/library/list'
import { addDance, addLibrarySong, link, setDefaultDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

const all: LibraryQuery = {
  search: '',
  filter: { kind: 'all' },
  sort: { column: 'title', direction: 'asc' }
}
const titles = (q: Partial<LibraryQuery> = {}): string[] =>
  listLibrary(db, { ...all, ...q }).map((r) => r.title)

beforeEach(() => {
  db = createTestDb()
})

describe('listLibrary', () => {
  test('lists each song with its default dance, that pairing’s teacher and a label', () => {
    const { fileId, songId, danceId } = addLibrarySong(db, {
      title: 'Hora de la Munte',
      artist: 'Taraf',
      durationMs: 183_000,
      dance: { name: 'Hora Mare', country: 'Romania', teacher: 'Sonia Dion' }
    })
    expect(listLibrary(db, all)).toEqual([
      {
        fileId,
        songId,
        title: 'Hora de la Munte',
        artist: 'Taraf',
        path: '/music/Hora de la Munte.mp3',
        durationMs: 183_000,
        isMissing: false,
        isFavorite: false,
        danceId,
        danceName: 'Hora Mare',
        country: 'Romania',
        choreographer: null,
        teacher: 'Sonia Dion',
        danceType: null,
        difficulty: null,
        danceCount: 1,
        label: 'Hora Mare ♪ Hora de la Munte',
        playlistItemId: null,
        playlistNumber: null
      }
    ])
  })

  test('shows the default dance of a song with several, and the choreographer to tell them apart', () => {
    const { songId } = addLibrarySong(db, {
      title: 'Svornato',
      dance: { name: 'Svornato', choreographer: 'Jaap Leegwater' }
    })
    link(db, addDance(db, { name: 'Svornato', choreographer: 'Someone Else' }), songId)
    const [row] = listLibrary(db, all)
    expect(row).toMatchObject({ danceCount: 2, choreographer: 'Jaap Leegwater' })
    expect(row.label).toBe('Svornato (Jaap Leegwater)')
  })

  test('falls back to the earliest-linked dance when the default is no longer linked', () => {
    const { songId, danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora Mare' } })
    const other = addDance(db, { name: 'Sârba', country: 'Romania' })
    link(db, other, songId)
    db.prepare('DELETE FROM dance_songs WHERE dance_id = ?').run(danceId)
    expect(listLibrary(db, all)[0]).toMatchObject({
      danceId: other,
      danceName: 'Sârba',
      danceCount: 1
    })
  })

  test('labels a song with no dance by its title', () => {
    addLibrarySong(db, { title: 'Untitled Tune' })
    expect(listLibrary(db, all)[0]).toMatchObject({
      danceId: null,
      danceCount: 0,
      label: 'Untitled Tune'
    })
  })

  test('searches song, dance, teacher, choreographer and country, ignoring accents', () => {
    addLibrarySong(db, {
      title: 'Pusteno Ludo',
      dance: { name: 'Pravo Rhodopsko Oro', country: 'Bulgaria', choreographer: 'Yves Moreau' }
    })
    addLibrarySong(db, {
      title: 'Ali Paşa',
      dance: { name: 'Ali Paşa', country: 'Turkey', teacher: 'Bora Özkök' }
    })
    expect(titles({ search: 'rhodopsko' })).toEqual(['Pusteno Ludo'])
    expect(titles({ search: 'moreau' })).toEqual(['Pusteno Ludo'])
    expect(titles({ search: 'ozkok' })).toEqual(['Ali Paşa'])
    expect(titles({ search: 'pasa turk' })).toEqual(['Ali Paşa'])
    expect(titles({ search: '  ' })).toEqual(['Ali Paşa', 'Pusteno Ludo'])
    expect(titles({ search: '"4-Wall' })).toEqual([])
  })

  test('filters to favorites', () => {
    const { fileId } = addLibrarySong(db, { title: 'Hora' })
    addLibrarySong(db, { title: 'Kolo' })
    db.prepare('INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, 1)').run(fileId)
    expect(titles({ filter: { kind: 'favorites' } })).toEqual(['Hora'])
    expect(listLibrary(db, all).find((r) => r.title === 'Hora')?.isFavorite).toBe(true)
  })

  test('lists a playlist in its own order, with each item’s id', () => {
    const a = addLibrarySong(db, { title: 'A' })
    const b = addLibrarySong(db, { title: 'B' })
    const p = Number(
      db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
        .lastInsertRowid
    )
    const add = db.prepare(
      'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
    )
    const itemB = Number(add.run(p, 1, b.fileId).lastInsertRowid)
    add.run(p, 2, a.fileId)
    const rows = listLibrary(db, {
      ...all,
      filter: { kind: 'playlist', playlistId: p },
      sort: { column: 'position', direction: 'asc' }
    })
    expect(rows.map((r) => r.title)).toEqual(['B', 'A'])
    expect(rows[0].playlistItemId).toBe(itemB)
  })

  test("numbers a playlist's songs in its own order, whatever the sort or search", () => {
    const a = addLibrarySong(db, { title: 'A' })
    const b = addLibrarySong(db, { title: 'B' })
    const c = addLibrarySong(db, { title: 'C' })
    const p = Number(
      db.prepare("INSERT INTO playlists (name, source) VALUES ('Mine', 'local')").run()
        .lastInsertRowid
    )
    const add = db.prepare(
      'INSERT INTO playlist_items (playlist_id, position, file_id) VALUES (?, ?, ?)'
    )
    add.run(p, 10, c.fileId) // positions need not be 1, 2, 3
    add.run(p, 20, a.fileId)
    add.run(p, 30, b.fileId)
    const numbers = (q: Partial<LibraryQuery>) =>
      listLibrary(db, { ...all, filter: { kind: 'playlist', playlistId: p }, ...q }).map(
        (r) => `${r.playlistNumber} ${r.title}`
      )
    expect(numbers({ sort: { column: 'title', direction: 'asc' } })).toEqual(['2 A', '3 B', '1 C'])
    expect(numbers({ search: 'b' })).toEqual(['3 B'])
    expect(listLibrary(db, all).map((r) => r.playlistNumber)).toEqual([null, null, null])
  })

  test('sorts by a column in either direction, keeping empty values last', () => {
    addLibrarySong(db, { title: 'A', dance: { name: 'A', country: 'Serbia' } })
    addLibrarySong(db, { title: 'B', dance: { name: 'B', country: 'bulgaria' } })
    addLibrarySong(db, { title: 'C', dance: { name: 'C' } })
    expect(titles({ sort: { column: 'country', direction: 'asc' } })).toEqual(['B', 'A', 'C'])
    expect(titles({ sort: { column: 'country', direction: 'desc' } })).toEqual(['A', 'B', 'C'])
  })

  test('sorts by dance name, then song title, a song with no dance under its own title', () => {
    addLibrarySong(db, { title: 'Zeta', dance: { name: 'Alunelul' } })
    addLibrarySong(db, { title: 'Alpha', dance: { name: 'Alunelul' } })
    addLibrarySong(db, { title: 'Beta' })
    expect(titles({ sort: { column: 'dance', direction: 'asc' } })).toEqual([
      'Alpha',
      'Zeta',
      'Beta'
    ])
    expect(titles({ sort: { column: 'dance', direction: 'desc' } })).toEqual([
      'Beta',
      'Alpha',
      'Zeta'
    ])
  })

  test('sorts by duration numerically', () => {
    addLibrarySong(db, { title: 'Long', durationMs: 300_000 })
    addLibrarySong(db, { title: 'Short', durationMs: 90_000 })
    expect(titles({ sort: { column: 'duration', direction: 'asc' } })).toEqual(['Short', 'Long'])
  })

  test('flags missing files', () => {
    const { fileId } = addLibrarySong(db, { title: 'Gone' })
    db.prepare('UPDATE files SET is_missing = 1 WHERE id = ?').run(fileId)
    expect(listLibrary(db, all)[0].isMissing).toBe(true)
  })

  test('uses the song’s own default even when another dance was linked first', () => {
    const { songId } = addLibrarySong(db, { title: 'Pusteno Ludo', dance: { name: 'Lesnoto' } })
    const pravo = addDance(db, { name: 'Pravo Rhodopsko Oro' })
    link(db, pravo, songId)
    setDefaultDance(db, songId, pravo)
    expect(listLibrary(db, all)[0].danceName).toBe('Pravo Rhodopsko Oro')
  })
})
