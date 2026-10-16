import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { FOLD_MAP, toFtsQuery } from '../../../src/main/db/fts'
import { addDance, addFile, addSong, link, searchSongs } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

const search = (query: string): string[] => searchSongs(db, query)

beforeEach(() => {
  db = createTestDb()
})

describe('initial schema', () => {
  test('creates every table from spec §4', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name as string)
    for (const t of [
      'files',
      'songs',
      'dances',
      'dance_songs',
      'song_prefs',
      'dance_prefs',
      'dance_song_prefs',
      'file_prefs',
      'canva_decks',
      'slide_cache',
      'playlists',
      'playlist_items',
      'programs',
      'program_items',
      'play_log',
      'library_fts',
      'playlist_folders',
      'settings'
    ]) {
      expect(names).toContain(t)
    }
  })

  test('file paths are unique', () => {
    addFile(db, '/music/a.mp3')
    expect(() => addFile(db, '/music/a.mp3')).toThrow(/UNIQUE/)
  })

  test('each file has at most one song', () => {
    const f = addFile(db)
    addSong(db, f, { title: 'A' })
    expect(() => addSong(db, f, { title: 'B' })).toThrow(/UNIQUE/)
  })

  test('apple_persistent_id is unique when present, many NULLs allowed', () => {
    addFile(db, '/a.mp3')
    addFile(db, '/b.mp3')
    const set = db.prepare('UPDATE files SET apple_persistent_id = ? WHERE path = ?')
    set.run('ABC123', '/a.mp3')
    expect(() => set.run('ABC123', '/b.mp3')).toThrow(/UNIQUE/)
  })

  test('dances and songs are many-to-many, and a pairing is unique', () => {
    const lesnoto = addDance(db, { name: 'Lesnoto' })
    const pravo = addDance(db, { name: 'Pravo Rhodopsko Oro' })
    const s1 = addSong(db, addFile(db, '/1.mp3'), { title: 'Pusteno Ludo' })
    const s2 = addSong(db, addFile(db, '/2.mp3'), { title: 'Lesnoto Oro' })
    link(db, lesnoto, s1)
    link(db, lesnoto, s2)
    link(db, pravo, s1)
    expect(count('dance_songs')).toBe(3)
    expect(() => link(db, lesnoto, s1)).toThrow(/UNIQUE/)
  })

  test('dance names are not unique', () => {
    addDance(db, { name: 'Svornato', choreographer: 'Jaap Leegwater' })
    expect(() => addDance(db, { name: 'Svornato', choreographer: 'Someone Else' })).not.toThrow()
  })

  test('deleting a file removes its song, pairings and prefs but keeps dances and history', () => {
    const f = addFile(db)
    const s = addSong(db, f, { title: 'Hora' })
    const d = addDance(db, { name: 'Hora Mare' })
    link(db, d, s, 'Sonia Dion')
    db.prepare('INSERT INTO file_prefs (file_id, is_favorite) VALUES (?, 1)').run(f)
    db.prepare('INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)').run(s, d)
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('Tue')").run().lastInsertRowid)
    db.prepare(
      "INSERT INTO program_items (program_id, position, kind, file_id, dance_id) VALUES (?, 1, 'track', ?, ?)"
    ).run(p, f, d)
    db.prepare(
      "INSERT INTO play_log (file_id, dance_id, program_id, kind) VALUES (?, ?, ?, 'program')"
    ).run(f, d, p)

    db.prepare('DELETE FROM files WHERE id = ?').run(f)

    for (const t of ['songs', 'dance_songs', 'dance_song_prefs', 'song_prefs', 'file_prefs']) {
      expect(count(t)).toBe(0)
    }
    expect(count('dances')).toBe(1)
    expect(db.prepare('SELECT file_id, dance_id FROM program_items').get()).toEqual({
      file_id: null,
      dance_id: d
    })
    expect(db.prepare('SELECT file_id, dance_id FROM play_log').get()).toEqual({
      file_id: null,
      dance_id: d
    })
    expect(search('hora')).toEqual([])
  })

  test('deleting a dance removes its pairings and prefs and clears references to it', () => {
    const s = addSong(db, addFile(db), { title: 'Hora' })
    const d = addDance(db, { name: 'Hora Mare' })
    link(db, d, s, 'Sonia Dion')
    db.prepare("INSERT INTO dance_prefs (dance_id, notes) VALUES (?, 'W, 2 figures')").run(d)
    db.prepare('INSERT INTO song_prefs (song_id, default_dance_id) VALUES (?, ?)').run(s, d)

    db.prepare('DELETE FROM dances WHERE id = ?').run(d)

    expect(count('dance_songs')).toBe(0)
    expect(count('dance_song_prefs')).toBe(0)
    expect(count('dance_prefs')).toBe(0)
    expect(db.prepare('SELECT default_dance_id FROM song_prefs').get()).toEqual({
      default_dance_id: null
    })
  })

  test('check constraints reject invalid values', () => {
    const f = addFile(db)
    const d = addDance(db, { name: 'Hora' })
    expect(() =>
      db.prepare('INSERT INTO dance_prefs (dance_id, difficulty) VALUES (?, 6)').run(d)
    ).toThrow(/CHECK/)
    expect(() =>
      db.prepare('INSERT INTO dance_prefs (dance_id, canva_page_index) VALUES (?, 0)').run(d)
    ).toThrow(/CHECK/)
    const p = Number(db.prepare("INSERT INTO programs (name) VALUES ('x')").run().lastInsertRowid)
    expect(() =>
      db
        .prepare(
          "INSERT INTO program_items (program_id, position, kind, file_id) VALUES (?, 1, 'stop', ?)"
        )
        .run(p, f)
    ).toThrow(/CHECK/)
    expect(() =>
      db.prepare("INSERT INTO play_log (file_id, kind) VALUES (?, 'other')").run(f)
    ).toThrow(/CHECK/)
  })

  test('canva decks have unique view links, and slide images are keyed by deck and page ID', () => {
    const add = db.prepare('INSERT INTO canva_decks (view_url, design_id) VALUES (?, ?)')
    const deck = Number(add.run('https://www.canva.com/design/D1/T/view', 'D1').lastInsertRowid)
    expect(() => add.run('https://www.canva.com/design/D1/T/view', 'D1')).toThrow(/UNIQUE/)
    const shot = db.prepare(
      'INSERT INTO slide_cache (deck_id, page_id, image_path) VALUES (?, ?, ?)'
    )
    shot.run(deck, 'PBrWDbC9tVSzgzvW', '/cache/a.png')
    expect(() => shot.run(deck, 'PBrWDbC9tVSzgzvW', '/cache/b.png')).toThrow(/UNIQUE|PRIMARY/)
    db.prepare('DELETE FROM canva_decks WHERE id = ?').run(deck)
    expect(count('slide_cache')).toBe(0)
  })

  test('programs.updated_at is set automatically', () => {
    db.prepare("INSERT INTO programs (name) VALUES ('x')").run()
    const row = db.prepare('SELECT created_at, updated_at FROM programs').get() as {
      created_at: string
      updated_at: string
    }
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(row.updated_at).toBe(row.created_at)
  })
})

describe('library search (library_fts)', () => {
  test('finds a song by its title, artist, dance name, country, choreographer and teacher', () => {
    const s = addSong(db, addFile(db), { title: 'Pusteno Ludo', artist: 'Ensemble Trakia' })
    link(
      db,
      addDance(db, {
        name: 'Pravo Rhodopsko Oro',
        country: 'Bulgaria',
        choreographer: 'Yves Moreau'
      }),
      s,
      'Sonia Dion'
    )
    for (const q of ['pusteno', 'trakia', 'rhodopsko', 'bulgaria', 'moreau', 'sonia']) {
      expect(search(toFtsQuery(q)!), q).toEqual(['Pusteno Ludo'])
    }
  })

  test('finds a song through any of its dances', () => {
    const s = addSong(db, addFile(db), { title: 'Pusteno Ludo' })
    link(db, addDance(db, { name: 'Pravo Rhodopsko Oro', country: 'Bulgaria' }), s)
    link(db, addDance(db, { name: 'Lesnoto', country: 'Macedonia' }), s)
    expect(search(toFtsQuery('lesnoto')!)).toEqual(['Pusteno Ludo'])
    expect(search(toFtsQuery('macedonia')!)).toEqual(['Pusteno Ludo'])
  })

  test.each([
    ['kirmizi', 'Kırmızı Gül'],
    ['cicek dagi', 'Çiçek Dağı'],
    ['lodz', 'Łódź'],
    ['oland', 'Øland'],
    ['aevintyri', 'Ævintýri'],
    ['strassenpolka', 'Straßenpolka'],
    ['Kırmızı', 'Kırmızı Gül'],
    ['pasa', 'Ali Paşa']
  ])('search %j finds %j', (query, title) => {
    addSong(db, addFile(db), { title })
    expect(search(toFtsQuery(query)!)).toEqual([title])
  })

  // Migration 001 has its own frozen copy of the fold map; it must cover every FOLD_MAP entry.
  test.each(FOLD_MAP.map(([from, to]) => [from, to]))(
    'index folds %j like the query does (%j), in song titles and dance fields',
    (from, to) => {
      const s = addSong(db, addFile(db), { title: `x${from}y` })
      link(db, addDance(db, { name: `d${from}e`, country: `c${from}c` }), s)
      expect(search(toFtsQuery(`x${to}y`)!)).toEqual([`x${from}y`])
      expect(search(toFtsQuery(`d${to}e`)!)).toEqual([`x${from}y`])
      expect(search(toFtsQuery(`c${to}c`)!)).toEqual([`x${from}y`])
    }
  )

  // Review Focus (plan 1): punctuation typed into the search box must not break MATCH.
  test('finds values containing punctuation through toFtsQuery', () => {
    const s = addSong(db, addFile(db), { title: 'Ajde 4-Wall' })
    link(db, addDance(db, { name: 'Ajde', country: "Côte d'Ivoire" }), s)
    expect(search(toFtsQuery('4-Wall')!)).toEqual(['Ajde 4-Wall'])
    expect(search(toFtsQuery("d'Ivoire")!)).toEqual(['Ajde 4-Wall'])
  })

  test('raw search-box text is not safe to pass to MATCH', () => {
    expect(() => search('4-Wall')).toThrow()
  })

  describe('stays current when', () => {
    let songId: number
    let danceId: number
    let pairingId: number

    beforeEach(() => {
      songId = addSong(db, addFile(db), { title: 'Hora de la Munte' })
      danceId = addDance(db, { name: 'Hora Mare', country: 'Romania' })
      pairingId = link(db, danceId, songId, 'Old Teacher')
    })

    test('the song is renamed', () => {
      db.prepare("UPDATE songs SET title = 'Hora Veche' WHERE id = ?").run(songId)
      expect(search(toFtsQuery('munte')!)).toEqual([])
      expect(search(toFtsQuery('veche')!)).toEqual(['Hora Veche'])
    })

    test('the dance is edited', () => {
      db.prepare("UPDATE dances SET country = 'Moldova' WHERE id = ?").run(danceId)
      expect(search(toFtsQuery('romania')!)).toEqual([])
      expect(search(toFtsQuery('moldova')!)).toEqual(['Hora de la Munte'])
    })

    test('the teacher is changed, added or removed', () => {
      db.prepare("UPDATE dance_song_prefs SET teacher = 'New Teacher' WHERE dance_song_id = ?").run(
        pairingId
      )
      expect(search(toFtsQuery('old')!)).toEqual([])
      expect(search(toFtsQuery('new')!)).toEqual(['Hora de la Munte'])
      db.prepare('DELETE FROM dance_song_prefs WHERE dance_song_id = ?').run(pairingId)
      expect(search(toFtsQuery('new')!)).toEqual([])
    })

    test('a dance is linked or unlinked', () => {
      const other = addDance(db, { name: 'Sârba' })
      link(db, other, songId)
      expect(search(toFtsQuery('sarba')!)).toEqual(['Hora de la Munte'])
      db.prepare('DELETE FROM dance_songs WHERE dance_id = ?').run(other)
      expect(search(toFtsQuery('sarba')!)).toEqual([])
    })

    test('the dance is deleted', () => {
      db.prepare('DELETE FROM dances WHERE id = ?').run(danceId)
      expect(search(toFtsQuery('mare')!)).toEqual([])
      expect(search(toFtsQuery('munte')!)).toEqual(['Hora de la Munte'])
    })
  })
})
