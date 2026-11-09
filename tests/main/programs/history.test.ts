import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, test } from 'vitest'
import { getLoggedPlay, listPlayed, logPlay } from '../../../src/main/programs/history'
import { createProgram } from '../../../src/main/programs/programs'
import { addDance, addLibrarySong, link } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDb()
})

describe('play log', () => {
  test('lists a program’s plays oldest first, each as the dance it was played as', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const other = addDance(db, { name: 'Hora Mare' })
    link(db, other, hora.songId)
    const p = createProgram(db, 'Set')
    const elsewhere = createProgram(db, 'Other')
    logPlay(db, { fileId: hora.fileId, danceId: hora.danceId, programId: p, kind: 'program' })
    logPlay(db, { fileId: hora.fileId, danceId: other, programId: p, kind: 'preview' })
    logPlay(db, { fileId: hora.fileId, danceId: null, programId: elsewhere, kind: 'program' })
    expect(listPlayed(db, p).map((e) => [e.kind, e.track?.label])).toEqual([
      ['program', 'Hora'],
      ['preview', 'Hora Mare ♪ Hora']
    ])
  })

  test('plays with the same time keep the order they were logged in', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const sirba = addLibrarySong(db, { title: 'Sârba', dance: { name: 'Sârba' } })
    const p = createProgram(db, 'Set')
    for (const song of [hora, kolo, sirba]) {
      logPlay(db, { fileId: song.fileId, danceId: song.danceId, programId: p, kind: 'program' })
    }
    db.prepare("UPDATE play_log SET played_at = '2026-10-14T20:00:00.000Z'").run()
    expect(listPlayed(db, p).map((e) => e.track?.title)).toEqual(['Hora', 'Kolo', 'Sârba'])
  })

  test('a play whose file was removed is listed without a track', () => {
    const gone = addLibrarySong(db, { title: 'Gone', dance: { name: 'Gone' } })
    const p = createProgram(db, 'Set')
    logPlay(db, { fileId: gone.fileId, danceId: gone.danceId, programId: p, kind: 'program' })
    db.prepare('DELETE FROM files WHERE id = ?').run(gone.fileId)
    expect(listPlayed(db, p)).toMatchObject([{ kind: 'program', track: null }])
  })

  test('clearing hides earlier entries but deletes none, and later plays show again', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    const sirba = addLibrarySong(db, { title: 'Sârba', dance: { name: 'Sârba' } })
    const p = createProgram(db, 'Set')
    const other = createProgram(db, 'Other')
    const ids = [hora, kolo, sirba].map((song) =>
      logPlay(db, { fileId: song.fileId, danceId: song.danceId, programId: p, kind: 'program' })
    )
    logPlay(db, { fileId: hora.fileId, danceId: hora.danceId, programId: other, kind: 'program' })
    db.prepare("UPDATE play_log SET played_at = '2026-10-14T20:00:00.000Z' WHERE id <= ?").run(
      ids[1]
    )
    db.prepare("UPDATE play_log SET played_at = '2026-10-14T20:10:00.000Z' WHERE id = ?").run(
      ids[2]
    )
    db.prepare("UPDATE programs SET log_cleared_at = '2026-10-14T20:05:00.000Z' WHERE id = ?").run(
      p
    )
    expect(listPlayed(db, p).map((e) => e.track?.title)).toEqual(['Sârba'])
    expect(listPlayed(db, other)).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM play_log').get()).toEqual({ n: 4 })
    expect(getLoggedPlay(db, ids[0])).toEqual({ fileId: hora.fileId, danceId: hora.danceId })
  })

  test('a replay reads the file and dance that were logged', () => {
    const hora = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    const id = logPlay(db, {
      fileId: hora.fileId,
      danceId: hora.danceId,
      programId: null,
      kind: 'preview'
    })
    expect(getLoggedPlay(db, id)).toEqual({ fileId: hora.fileId, danceId: hora.danceId })
    expect(getLoggedPlay(db, 999)).toBeNull()
  })
})
