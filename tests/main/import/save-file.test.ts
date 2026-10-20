import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'
import type { ImportMapping } from '../../../src/main/import/mapping'
import type { FileFacts } from '../../../src/main/import/read-file'
import { saveImportedFile, type SaveContext } from '../../../src/main/import/save-file'
import { tempDir, type TempDir } from '../helpers/audio-fixtures'
import { addDance, link, songView } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

const mapping: ImportMapping = {
  artistFrom: 'artistTag',
  teacherFrom: 'albumArtistTag',
  choreographerFrom: 'ignore',
  genreIsCountry: true
}
const fromFiles: SaveContext = { source: 'files', applePersistentId: null, mapping }

let db: DatabaseSync
let dir: TempDir

function facts(path: string, overrides: Partial<FileFacts> = {}): FileFacts {
  return {
    path,
    fileSize: 1000,
    mtimeMs: 1_700_000_000_000,
    durationMs: 180_000,
    contentHash: 'hash-1',
    tags: { title: 'Hora Mare', artist: 'Taraf', albumArtist: 'Sonia Dion', genre: 'Romania' },
    ...overrides
  }
}

const fileRow = (id: number) =>
  db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Record<string, unknown>
const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
const songId = (fileId: number): number =>
  (db.prepare('SELECT id FROM songs WHERE file_id = ?').get(fileId) as { id: number }).id
const defaultDanceId = (fileId: number): number =>
  (
    db
      .prepare('SELECT default_dance_id AS id FROM song_prefs WHERE song_id = ?')
      .get(songId(fileId)) as { id: number }
  ).id

beforeEach(() => {
  db = createTestDb()
  dir = tempDir()
})
afterEach(() => dir.cleanup())

describe('saveImportedFile', () => {
  test('adds a file, its song, an automatic dance of the same name, and the pairing', () => {
    const path = dir.file('hora.mp3', 'x')
    const { outcome, fileId } = saveImportedFile(db, facts(path), fromFiles)
    expect(outcome).toBe('added')
    expect(fileRow(fileId)).toMatchObject({
      path,
      file_size: 1000,
      duration_ms: 180_000,
      content_hash: 'hash-1',
      tag_title: 'Hora Mare',
      tag_album_artist: 'Sonia Dion',
      source: 'files',
      is_missing: 0
    })
    expect(songView(db, fileId)).toEqual({
      title: 'Hora Mare',
      artist: 'Taraf',
      dance: 'Hora Mare',
      country: 'Romania',
      choreographer: null,
      teacher: 'Sonia Dion'
    })
    expect(db.prepare('SELECT uuid FROM dances').get()).toEqual({
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/)
    })
  })

  test('never links a song to an existing dance by name', () => {
    const a = saveImportedFile(
      db,
      facts(dir.file('a/Svornato.mp3', 'x'), { contentHash: 'h-a' }),
      fromFiles
    )
    const b = saveImportedFile(
      db,
      facts(dir.file('b/Svornato.mp3', 'x'), { contentHash: 'h-b' }),
      fromFiles
    )
    expect(count('dances')).toBe(2)
    expect(defaultDanceId(a.fileId)).not.toBe(defaultDanceId(b.fileId))
  })

  test('reports an identical re-import as unchanged', () => {
    const path = dir.file('hora.mp3', 'x')
    const first = saveImportedFile(db, facts(path), fromFiles)
    expect(saveImportedFile(db, facts(path), fromFiles)).toEqual({
      outcome: 'unchanged',
      fileId: first.fileId
    })
  })

  test('refreshes raw tags but only fills song, dance and pairing fields that are empty', () => {
    const path = dir.file('hora.mp3', 'x')
    const bare = { title: 'Hora', artist: null, albumArtist: null, genre: null }
    const { fileId } = saveImportedFile(db, facts(path, { tags: bare }), fromFiles)
    db.prepare("UPDATE songs SET title = 'Hora (edited)' WHERE file_id = ?").run(fileId)

    const result = saveImportedFile(db, facts(path, { mtimeMs: 1_800_000_000_000 }), fromFiles)

    expect(result.outcome).toBe('updated')
    expect(fileRow(fileId)).toMatchObject({ tag_genre: 'Romania', mtime_ms: 1_800_000_000_000 })
    expect(songView(db, fileId)).toEqual({
      title: 'Hora (edited)',
      artist: 'Taraf',
      dance: 'Hora',
      country: 'Romania',
      choreographer: null,
      teacher: 'Sonia Dion'
    })
  })

  test('fills only the song’s default dance, leaving its other dances alone', () => {
    const path = dir.file('hora.mp3', 'x')
    const bare = { title: 'Hora', artist: null, albumArtist: null, genre: null }
    const { fileId } = saveImportedFile(db, facts(path, { tags: bare }), fromFiles)
    const other = addDance(db, { name: 'Sârba' })
    link(db, other, songId(fileId))

    saveImportedFile(db, facts(path), fromFiles)

    expect(songView(db, fileId).country).toBe('Romania')
    expect(db.prepare('SELECT country FROM dances WHERE id = ?').get(other)).toEqual({
      country: null
    })
  })

  describe('never writes one song’s tags into a dance shared with other songs', () => {
    let fileId: number
    let shared: number
    const bare = { title: 'Lesnoto Oro', artist: null, albumArtist: null, genre: null }

    beforeEach(() => {
      fileId = saveImportedFile(db, facts(dir.file('a.mp3', 'x'), { tags: bare }), fromFiles).fileId
      const other = saveImportedFile(
        db,
        facts(dir.file('b.mp3', 'x'), { tags: bare, contentHash: 'hash-b' }),
        fromFiles
      ).fileId
      shared = addDance(db, { name: 'Lesnoto' })
      link(db, shared, songId(fileId))
      link(db, shared, songId(other))
    })

    test('when the shared dance is the song’s default', () => {
      db.prepare('UPDATE song_prefs SET default_dance_id = ? WHERE song_id = ?').run(
        shared,
        songId(fileId)
      )
      saveImportedFile(db, facts(dir.file('a.mp3', 'x')), fromFiles)
      expect(
        db.prepare('SELECT country, choreographer FROM dances WHERE id = ?').get(shared)
      ).toEqual({
        country: null,
        choreographer: null
      })
    })

    test('when the song’s own dance was unlinked and only the shared dance remains', () => {
      db.prepare('DELETE FROM dance_songs WHERE song_id = ? AND dance_id <> ?').run(
        songId(fileId),
        shared
      )
      saveImportedFile(db, facts(dir.file('a.mp3', 'x')), fromFiles)
      expect(db.prepare('SELECT country FROM dances WHERE id = ?').get(shared)).toEqual({
        country: null
      })
    })
  })

  test('does not recreate a dance the user unlinked', () => {
    const path = dir.file('hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(path), fromFiles)
    db.prepare('DELETE FROM dance_songs').run()
    saveImportedFile(db, facts(path, { mtimeMs: 2 }), fromFiles)
    expect(count('dance_songs')).toBe(0)
    expect(songView(db, fileId).title).toBe('Hora Mare')
  })

  test('matches an Apple Music track by persistent ID even when its file moved', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const newPath = dir.file('new/hora.mp3', 'x')
    const apple: SaveContext = { source: 'apple_xml', applePersistentId: 'PID1', mapping }
    const first = saveImportedFile(db, facts(oldPath), apple)
    const second = saveImportedFile(db, facts(newPath, { contentHash: 'hash-2' }), apple)
    expect(second).toEqual({ outcome: 'updated', fileId: first.fileId })
    expect(fileRow(first.fileId).path).toBe(newPath)
  })

  test('relinks a moved file by its fingerprint when the old path is gone, keeping its dance', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(oldPath), fromFiles)
    db.prepare("UPDATE dances SET country = 'Moldova'").run()
    rmSync(oldPath)
    const newPath = dir.file('renamed/Hora Mare.mp3', 'x')

    expect(saveImportedFile(db, facts(newPath), fromFiles)).toEqual({ outcome: 'relinked', fileId })
    expect(fileRow(fileId)).toMatchObject({ path: newPath, is_missing: 0 })
    expect(songView(db, fileId).country).toBe('Moldova')
    expect(count('dances')).toBe(1)
  })

  test('adds a copy as a new file, song and dance when the original is still on disk', () => {
    const original = dir.file('a/hora.mp3', 'x')
    const copy = dir.file('b/hora.mp3', 'x')
    const first = saveImportedFile(db, facts(original), fromFiles)
    const second = saveImportedFile(db, facts(copy), fromFiles)
    expect(second.outcome).toBe('added')
    expect(second.fileId).not.toBe(first.fileId)
    expect(count('dances')).toBe(2)
  })

  test('clears the missing flag when a missing file is found at its path again', () => {
    const path = dir.file('hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(path), fromFiles)
    db.prepare(
      "UPDATE files SET is_missing = 1, missing_reason = 'File not found' WHERE id = ?"
    ).run(fileId)
    expect(saveImportedFile(db, facts(path), fromFiles).outcome).toBe('updated')
    expect(fileRow(fileId)).toMatchObject({ is_missing: 0, missing_reason: null })
  })

  test('relinks to a file marked missing even if a stale copy sits at the old path', () => {
    const oldPath = dir.file('old/hora.mp3', 'x')
    const { fileId } = saveImportedFile(db, facts(oldPath), fromFiles)
    db.prepare('UPDATE files SET is_missing = 1 WHERE id = ?').run(fileId)
    const newPath = join(dir.path, 'new.mp3')
    expect(saveImportedFile(db, facts(newPath), fromFiles)).toEqual({ outcome: 'relinked', fileId })
  })
})
