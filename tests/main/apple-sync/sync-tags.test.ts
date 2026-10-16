import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import { applyMusicTags } from '../../../src/main/apple-sync/sync-tags'
import { updateDance, updateSong } from '../../../src/main/library/edit'
import { addLibrarySong, link, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

const mapping: ImportMapping = {
  artistTagTarget: 'artist',
  albumArtistTagTarget: 'choreographer',
  genreIsCountry: true
}
type Tags = Record<'title' | 'artist' | 'albumArtist' | 'genre', string | null>
const tags = (over: Partial<Tags>): Tags => ({
  title: 'Kolo',
  artist: 'Taraf',
  albumArtist: null,
  genre: 'Serbia',
  ...over
})

let db: DatabaseSync
let kolo: { fileId: number; songId: number; danceId: number | null }

// A song as an import of those tags makes it: raw tags stored, mapped values written.
beforeEach(() => {
  db = createTestDb()
  kolo = addLibrarySong(db, {
    title: 'Kolo',
    path: '/m/Kolo.mp3',
    artist: 'Taraf',
    dance: { name: 'Kolo', country: 'Serbia' }
  })
  db.prepare(
    "UPDATE files SET tag_title = 'Kolo', tag_artist = 'Taraf', tag_genre = 'Serbia' WHERE id = ?"
  ).run(kolo.fileId)
})

const baseline = () =>
  JSON.parse(
    (
      db.prepare('SELECT sync_baseline FROM files WHERE id = ?').get(kolo.fileId) as {
        sync_baseline: string
      }
    ).sync_baseline
  )

describe('applyMusicTags (sync spec §5.4)', () => {
  test('unchanged tags change nothing but record the baseline', () => {
    expect(applyMusicTags(db, kolo.fileId, tags({}), mapping)).toBe(false)
    expect(baseline()).toEqual({
      title: 'Kolo',
      artist: 'Taraf',
      danceName: 'Kolo',
      country: 'Serbia',
      choreographer: null,
      teacher: null
    })
  })

  test('a tag changed in Music updates a field nobody edited here', () => {
    expect(
      applyMusicTags(db, kolo.fileId, tags({ genre: 'Macedonia', albumArtist: 'Atanas' }), mapping)
    ).toBe(true)
    expect(songView(db, kolo.fileId)).toMatchObject({
      country: 'Macedonia',
      choreographer: 'Atanas'
    })
    expect(baseline()).toMatchObject({ country: 'Macedonia', choreographer: 'Atanas' })
  })

  test('a field edited in the app keeps its value, now and after a later Music edit', () => {
    updateSong(db, kolo.songId, { artist: 'Taraf de Haïdouks' })
    expect(applyMusicTags(db, kolo.fileId, tags({ artist: 'Taraf!' }), mapping)).toBe(false)
    expect(songView(db, kolo.fileId).artist).toBe('Taraf de Haïdouks')
    expect(baseline().artist).toBe('Taraf!')
    applyMusicTags(db, kolo.fileId, tags({ artist: 'Taraf again' }), mapping)
    expect(songView(db, kolo.fileId).artist).toBe('Taraf de Haïdouks')
  })

  test('a title change in Music renames the song and its own dance', () => {
    applyMusicTags(db, kolo.fileId, tags({ title: 'Kolo (Serbia)' }), mapping)
    expect(songView(db, kolo.fileId)).toMatchObject({
      title: 'Kolo (Serbia)',
      dance: 'Kolo (Serbia)'
    })
  })

  test('a dance shared with other songs is never changed by one song', () => {
    const other = addLibrarySong(db, { title: 'Kolo 2' })
    link(db, kolo.danceId!, other.songId)
    applyMusicTags(db, kolo.fileId, tags({ genre: 'Croatia', title: 'Kolo B' }), mapping)
    expect(songView(db, kolo.fileId)).toMatchObject({
      title: 'Kolo B',
      dance: 'Kolo',
      country: 'Serbia'
    })
  })

  test('the teacher on the pairing follows its tag', () => {
    const teach: ImportMapping = { ...mapping, albumArtistTagTarget: 'teacher' }
    applyMusicTags(db, kolo.fileId, tags({}), teach)
    applyMusicTags(db, kolo.fileId, tags({ albumArtist: 'Yves' }), teach)
    expect(songView(db, kolo.fileId).teacher).toBe('Yves')
  })

  test('a song with no baseline gets one from its stored raw tags first', () => {
    // The file's raw tags say Serbia; the dance was edited to Bosnia; Music now says Croatia.
    updateDance(db, kolo.danceId!, { country: 'Bosnia' })
    applyMusicTags(db, kolo.fileId, tags({ genre: 'Croatia' }), mapping)
    expect(songView(db, kolo.fileId).country).toBe('Bosnia')
  })

  test('the raw tag columns are refreshed from Music', () => {
    applyMusicTags(db, kolo.fileId, tags({ albumArtist: 'Atanas' }), mapping)
    expect(
      db.prepare('SELECT tag_album_artist AS a FROM files WHERE id = ?').get(kolo.fileId)
    ).toEqual({ a: 'Atanas' })
  })

  test('a song whose default dance was unlinked only follows song fields', () => {
    const solo = addLibrarySong(db, { title: 'Solo', path: '/m/Solo.mp3' })
    db.prepare("UPDATE files SET tag_title = 'Solo' WHERE id = ?").run(solo.fileId)
    const music = { title: 'Solo 2', artist: null, albumArtist: null, genre: 'X' }
    expect(applyMusicTags(db, solo.fileId, music, mapping)).toBe(true)
    expect(songView(db, solo.fileId)).toMatchObject({ title: 'Solo 2', dance: null })
  })
})
