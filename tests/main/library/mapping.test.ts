import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import { getSongDetail } from '../../../src/main/library/edit'
import { getSongTags, getSuggestions, reapplyMapping } from '../../../src/main/library/mapping'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

const tag = (fileId: number, tags: { artist?: string; albumArtist?: string; genre?: string }) =>
  db
    .prepare('UPDATE files SET tag_artist = ?, tag_album_artist = ?, tag_genre = ? WHERE id = ?')
    .run(tags.artist ?? null, tags.albumArtist ?? null, tags.genre ?? null, fileId)

const mapping: ImportMapping = {
  artistFrom: 'artistTag',
  teacherFrom: 'albumArtistTag',
  choreographerFrom: 'ignore',
  genreIsCountry: true
}

beforeEach(() => {
  db = createTestDb()
})

describe('getSongTags', () => {
  test('returns each song’s raw file tags, in the order asked', () => {
    const a = addLibrarySong(db, { title: 'Hora' })
    const b = addLibrarySong(db, { title: 'Arap' })
    tag(a.fileId, { artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' })
    expect(getSongTags(db, [b.songId, a.songId])).toEqual([
      { songId: b.songId, title: 'Arap', artist: null, albumArtist: null, genre: null },
      {
        songId: a.songId,
        title: 'Hora',
        artist: 'Taraf',
        albumArtist: 'Sonia Dion',
        genre: 'Romania'
      }
    ])
  })
})

describe('reapplyMapping', () => {
  test('overwrites the mapped fields from the raw tags', () => {
    const s = addLibrarySong(db, {
      title: 'Hora',
      artist: 'old',
      dance: { name: 'Hora', country: 'old', teacher: 'old' }
    })
    tag(s.fileId, { artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' })
    expect(reapplyMapping(db, [s.songId], mapping)).toEqual({ songs: 1, skippedSharedDances: 0 })
    const d = getSongDetail(db, s.songId)!
    expect(d.artist).toBe('Taraf')
    expect(d.dances[0]).toMatchObject({ country: 'Romania', teacher: 'Sonia Dion' })
  })

  test('leaves fields the mapping does not target alone', () => {
    const s = addLibrarySong(db, {
      title: 'Hora',
      dance: { name: 'Hora', country: 'Moldova', choreographer: 'Kept' }
    })
    tag(s.fileId, { artist: 'Taraf', genre: 'Romania' })
    reapplyMapping(db, [s.songId], { ...mapping, genreIsCountry: false })
    expect(getSongDetail(db, s.songId)!.dances[0]).toMatchObject({
      country: 'Moldova',
      choreographer: 'Kept'
    })
  })

  test('skips a default dance shared with other songs, but still updates the song and its teacher', () => {
    const s = addLibrarySong(db, { title: 'Lesnoto Oro', dance: { name: 'Lesnoto' } })
    const other = addLibrarySong(db, { title: 'Other' })
    link(db, s.danceId!, other.songId)
    tag(s.fileId, { artist: 'Band', albumArtist: 'T', genre: 'Macedonia' })
    expect(reapplyMapping(db, [s.songId], mapping)).toEqual({ songs: 1, skippedSharedDances: 1 })
    const d = getSongDetail(db, s.songId)!
    expect(d.artist).toBe('Band')
    expect(d.dances[0]).toMatchObject({ country: null, teacher: 'T' })
  })

  test('routes tags to the choreographer when configured', () => {
    const s = addLibrarySong(db, { title: 'Pravo', dance: { name: 'Pravo' } })
    tag(s.fileId, { artist: 'Yves Moreau' })
    reapplyMapping(db, [s.songId], {
      ...mapping,
      artistFrom: 'ignore',
      choreographerFrom: 'artistTag'
    })
    expect(getSongDetail(db, s.songId)!.dances[0].choreographer).toBe('Yves Moreau')
  })
})

describe('getSuggestions', () => {
  test('one list for teachers and choreographers, countries, and dance types (settings + used)', () => {
    addLibrarySong(db, {
      title: 'A',
      dance: { name: 'A', country: 'Serbia', choreographer: 'Yves Moreau', teacher: 'Sonia Dion' }
    })
    const b = addLibrarySong(db, {
      title: 'B',
      dance: { name: 'B', country: 'bulgaria', teacher: 'Yves Moreau' }
    })
    db.prepare("UPDATE dances SET dance_type = 'Hora line' WHERE id = ?").run(b.danceId)
    addDance(db, { name: 'Unused', country: ' ' })
    expect(getSuggestions(db, ['Line', 'Couple'])).toEqual({
      people: ['Sonia Dion', 'Yves Moreau'],
      countries: ['bulgaria', 'Serbia'],
      danceTypes: ['Couple', 'Hora line', 'Line']
    })
  })
})

describe('reapplyMapping: sources', () => {
  test('overwrites only destinations that have a source', () => {
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora', teacher: 'Old Teacher' } })
    tag(s.fileId, { artist: 'Band', albumArtist: 'New Teacher' })
    reapplyMapping(db, [s.songId], { ...mapping, teacherFrom: 'ignore' })
    expect(getSongDetail(db, s.songId)!.dances[0].teacher).toBe('Old Teacher')
    reapplyMapping(db, [s.songId], { ...mapping, teacherFrom: 'albumArtistTag' })
    expect(getSongDetail(db, s.songId)!.dances[0].teacher).toBe('New Teacher')
  })
})
