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
})
