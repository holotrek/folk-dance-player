import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'

// A database at version 4 holding these old mapping settings (null: the key was never stored).
function oldDatabase(artist: string | null, album: string | null) {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS.slice(0, 4))
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  if (artist !== null) put.run('import.artistTagTarget', JSON.stringify(artist))
  if (album !== null) put.run('import.albumArtistTagTarget', JSON.stringify(album))
  return { db, put }
}

const mapping = (db: ReturnType<typeof openDatabase>): Record<string, unknown> =>
  Object.fromEntries(
    (
      db
        .prepare("SELECT key, value FROM settings WHERE key LIKE 'import.%From' ORDER BY key")
        .all() as { key: string; value: string }[]
    ).map((r) => [r.key, JSON.parse(r.value)])
  )

describe('migration 005: import mapping per destination', () => {
  test('applies as version 5', () => {
    const { db } = oldDatabase('artist', 'ignore')
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 4, to: 5 })
    expect(getSchemaVersion(db)).toBe(5)
  })

  test.each([
    ['artist', 'ignore', 'artistTag', 'ignore', 'ignore'],
    ['artist', 'teacher', 'artistTag', 'albumArtistTag', 'ignore'],
    ['choreographer', 'ignore', 'ignore', 'ignore', 'artistTag'],
    ['teacher', 'artist', 'albumArtistTag', 'artistTag', 'ignore'],
    ['artist', 'artist', 'artistTag', 'ignore', 'ignore'], // both tags to one field: Artist wins
    ['teacher', 'teacher', 'ignore', 'artistTag', 'ignore'],
    ['ignore', 'ignore', 'ignore', 'ignore', 'ignore'],
    [null, 'teacher', 'artistTag', 'albumArtistTag', 'ignore'], // the artist key defaults to artist
    ['choreographer', null, 'ignore', 'ignore', 'artistTag'], // the album key defaults to ignore
    ['composer', 'teacher', 'artistTag', 'albumArtistTag', 'ignore'] // invalid: the default
  ])(
    'artist→%s, album artist→%s becomes artist from %s, teacher from %s, choreographer from %s',
    (artist, album, artistFrom, teacherFrom, choreographerFrom) => {
      const { db } = oldDatabase(artist, album)
      migrate(db, MIGRATIONS)
      expect(mapping(db)).toEqual({
        'import.artistFrom': artistFrom,
        'import.choreographerFrom': choreographerFrom,
        'import.teacherFrom': teacherFrom
      })
    }
  )

  test.each([
    ['not JSON at all', 'composer'],
    ['a JSON number', '5'],
    ['a JSON object', '{"x":1}'],
    ['JSON null', 'null']
  ])('an old value that is %s counts as the default', (_name, raw) => {
    const { db, put } = oldDatabase(null, 'teacher')
    put.run('import.artistTagTarget', raw)
    migrate(db, MIGRATIONS)
    expect(mapping(db)).toEqual({
      'import.artistFrom': 'artistTag',
      'import.choreographerFrom': 'ignore',
      'import.teacherFrom': 'albumArtistTag'
    })
  })

  test('removes the two old keys and leaves genreIsCountry alone', () => {
    const { db, put } = oldDatabase('artist', 'teacher')
    put.run('import.genreIsCountry', 'false')
    migrate(db, MIGRATIONS)
    const keys = (
      db.prepare('SELECT key FROM settings ORDER BY key').all() as { key: string }[]
    ).map((r) => r.key)
    expect(keys).not.toContain('import.artistTagTarget')
    expect(keys).not.toContain('import.albumArtistTagTarget')
    expect(
      db.prepare("SELECT value FROM settings WHERE key = 'import.genreIsCountry'").get()
    ).toEqual({
      value: 'false'
    })
  })

  test('writes nothing for a database that never changed the mapping', () => {
    const { db } = oldDatabase(null, null)
    migrate(db, MIGRATIONS)
    expect(mapping(db)).toEqual({})
  })

  test('a database already at version 5 is not converted again', () => {
    const { db } = oldDatabase('teacher', 'artist')
    migrate(db, MIGRATIONS)
    const first = mapping(db)
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 5, to: 5 })
    expect(mapping(db)).toEqual(first)
  })

  // The old mapping filled a field from the Album Artist tag when both tags targeted it and the Artist
  // tag was empty, and a sync stored that in the baseline. The new mapping gives such a field
  // nothing, so the baseline moves to match, or the next sync would read it as a change in Music
  // and clear the field.
  describe('synced songs whose old mapping sent both tags to one field', () => {
    const synced = (artist: string, album: string) => {
      const { db } = oldDatabase(artist, album)
      const insert = db.prepare(
        `INSERT INTO files (path, file_size, mtime_ms, source, tag_artist, tag_album_artist, sync_baseline)
         VALUES (?, 1, 1, 'files', ?, ?, ?)`
      )
      const baseline = JSON.stringify({
        title: 'Kolo',
        artist: 'Sonia',
        danceName: 'Kolo',
        country: null,
        choreographer: 'Sonia',
        teacher: 'Sonia'
      })
      insert.run('/m/a.mp3', null, 'Sonia', baseline) // Artist tag empty: used the Album Artist tag
      insert.run('/m/b.mp3', 'Taraf', 'Sonia', baseline.replace(/Sonia/g, 'Taraf')) // Artist tag set
      insert.run('/m/c.mp3', null, 'Sonia', null) // never synced
      migrate(db, MIGRATIONS)
      const read = (path: string) =>
        db.prepare('SELECT sync_baseline AS b FROM files WHERE path = ?').get(path) as {
          b: string | null
        }
      return { a: read('/m/a.mp3').b, b: read('/m/b.mp3').b, c: read('/m/c.mp3').b }
    }

    test('the conflicted field in the baseline becomes what the new mapping gives', () => {
      const { a, b, c } = synced('artist', 'artist')
      expect(JSON.parse(a!)).toMatchObject({
        artist: null,
        teacher: 'Sonia',
        choreographer: 'Sonia'
      })
      expect(JSON.parse(b!)).toMatchObject({ artist: 'Taraf' }) // the Artist tag still feeds it
      expect(c).toBeNull()
    })

    test('the same for Teacher and Choreographer', () => {
      expect(JSON.parse(synced('teacher', 'teacher').a!)).toMatchObject({
        teacher: null,
        artist: 'Sonia'
      })
      expect(JSON.parse(synced('choreographer', 'choreographer').a!)).toMatchObject({
        choreographer: null,
        artist: 'Sonia'
      })
    })

    test('a mapping with no conflict leaves baselines alone', () => {
      expect(JSON.parse(synced('artist', 'teacher').a!)).toMatchObject({
        artist: 'Sonia',
        teacher: 'Sonia'
      })
    })
  })
})
