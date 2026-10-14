import { describe, expect, test } from 'vitest'
import { checkProgramFiles } from '../../../src/main/programs/file-check'
import { addTracks, createProgram, markPlayed } from '../../../src/main/programs/programs'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

describe('program pre-check', () => {
  test('flags the program’s missing files and unflags ones that came back', () => {
    const db = createTestDb()
    const here = addLibrarySong(db, { title: 'Here', path: '/m/here.mp3' })
    const gone = addLibrarySong(db, { title: 'Gone', path: '/m/gone.mp3' })
    const played = addLibrarySong(db, { title: 'Played', path: '/m/played.mp3' })
    db.prepare("UPDATE files SET is_missing = 1, missing_reason = 'not_found' WHERE id = ?").run(
      here.fileId
    )
    const p = createProgram(db, 'Set')
    const [, , last] = addTracks(db, p, [here.fileId, gone.fileId, played.fileId])
    markPlayed(db, last)
    const exists = (path: string) => path === '/m/here.mp3'
    expect(checkProgramFiles(db, p, exists)).toEqual([gone.fileId])
    const flags = db.prepare('SELECT path, is_missing AS m FROM files ORDER BY id').all()
    expect(flags.map((f) => [f.path, f.m])).toEqual([
      ['/m/here.mp3', 0],
      ['/m/gone.mp3', 1],
      ['/m/played.mp3', 0] // already played: not checked
    ])
  })
})
