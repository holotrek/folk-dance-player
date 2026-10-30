import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { LibraryFilter } from '@shared/library'
import { getSongDetail, searchDances } from '../../../src/main/library/edit'
import { listLibrary } from '../../../src/main/library/list'
import {
  addToPlaylist,
  createPlaylist,
  listPlaylists,
  setFavorite
} from '../../../src/main/library/playlists'
import { getLibraryStats } from '../../../src/main/library/stats'
import { listPlayed, logPlay } from '../../../src/main/programs/history'
import { addTracks, createProgram, getProgram } from '../../../src/main/programs/programs'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong, link, removeSong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

// A removed song (files.removed_at, sync spec §6.4) is hidden wherever songs are listed, shown in
// history, and skipped in a program.
let db: DatabaseSync
beforeEach(() => (db = createTestDb()))

const titles = (filter: LibraryFilter, search = '') =>
  listLibrary(db, { search, filter, sort: { column: 'title', direction: 'asc' } }).map(
    (r) => r.title
  )

describe('removed songs', () => {
  test('are hidden from every list and from search', () => {
    const kolo = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } })
    addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    setFavorite(db, [kolo.fileId], true)
    const playlist = createPlaylist(db, 'Mine')
    addToPlaylist(db, playlist, [kolo.fileId])
    removeSong(db, kolo.fileId)

    expect(titles({ kind: 'all' })).toEqual(['Hora'])
    expect(titles({ kind: 'all' }, 'kolo')).toEqual([])
    expect(titles({ kind: 'favorites' })).toEqual([])
    expect(titles({ kind: 'playlist', playlistId: playlist })).toEqual([])
    expect(listPlaylists(db).find((p) => p.id === playlist)?.itemCount).toBe(0)
    expect(getLibraryStats(db).fileCount).toBe(1)
  })

  test('the review list shows gone songs that are not removed', () => {
    const kolo = addLibrarySong(db, { title: 'Kolo' })
    const hora = addLibrarySong(db, { title: 'Hora' })
    addLibrarySong(db, { title: 'Sârba' })
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(kolo.fileId)
    removeSong(db, hora.fileId)
    expect(titles({ kind: 'review' })).toEqual(['Kolo'])
  })

  test('same-dance suggestions skip dances only removed songs use', () => {
    const mine = addLibrarySong(db, { title: 'Lesnoto A', dance: { name: 'Lesnoto' } })
    const other = addLibrarySong(db, { title: 'Lesnoto B', dance: { name: 'Lesnoto' } })
    expect(getSongDetail(db, mine.songId)?.suggestions).toHaveLength(1)
    removeSong(db, other.fileId)
    expect(getSongDetail(db, mine.songId)?.suggestions).toEqual([])
  })

  // Final review, Minor 7.
  test('the dance picker still offers their dances, counting only songs in the library', () => {
    const mine = addLibrarySong(db, { title: 'Lesnoto A', dance: { name: 'Lesnoto' } })
    const other = addLibrarySong(db, { title: 'Lesnoto B' })
    link(db, mine.danceId!, other.songId)
    removeSong(db, other.fileId)
    expect(searchDances(db, 'lesnoto')).toMatchObject([{ name: 'Lesnoto', songCount: 1 }])
  })

  test('playlist numbers skip removed songs', () => {
    const songs = ['A', 'B', 'C'].map((title) => addLibrarySong(db, { title }))
    const playlist = createPlaylist(db, 'Mine')
    addToPlaylist(
      db,
      playlist,
      songs.map((s) => s.fileId)
    )
    removeSong(db, songs[1].fileId)
    const rows = listLibrary(db, {
      search: '',
      filter: { kind: 'playlist', playlistId: playlist },
      sort: { column: 'position', direction: 'asc' }
    })
    expect(rows.map((r) => [r.title, r.playlistNumber])).toEqual([
      ['A', 1],
      ['C', 2]
    ])
  })

  test('stay in a program, flagged removed', () => {
    const program = createProgram(db, 'Tonight')
    const kolo = addLibrarySong(db, { title: 'Kolo' })
    addTracks(db, program, [kolo.fileId])
    removeSong(db, kolo.fileId)
    const items = getProgram(db, program)!.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'track', isRemoved: true })
  })

  test('stay in Previously played, flagged removed', () => {
    const program = createProgram(db, 'Tonight')
    const kolo = addLibrarySong(db, { title: 'Kolo' })
    logPlay(db, { fileId: kolo.fileId, danceId: null, programId: program, kind: 'program' })
    removeSong(db, kolo.fileId)
    expect(listPlayed(db, program)[0].track).toMatchObject({ title: 'Kolo', isRemoved: true })
  })
})

describe('a program with a removed song', () => {
  let session: PlayerSession
  let program: number
  let a: number
  let b: number

  beforeEach(() => {
    vi.useFakeTimers()
    const settings = new SettingsStore(db)
    settings.set('countdown.seconds', 0)
    settings.set('autoContinue.seconds', 0)
    a = addLibrarySong(db, { title: 'A' }).fileId
    b = addLibrarySong(db, { title: 'B' }).fileId
    program = createProgram(db, 'Set')
    settings.set('currentProgramId', program)
    addTracks(db, program, [a, b])
    session = new PlayerSession(
      createSessionPorts(db, settings, () => true),
      { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
      () => undefined
    )
  })
  afterEach(() => vi.useRealTimers())

  const unplayed = () =>
    getProgram(db, program)!.items.map((i) => (i.kind === 'stop' ? 'STOP' : i.title))

  test('skips it, leaves it in the program, and warns', () => {
    removeSong(db, a)
    session.refresh()
    session.play()
    expect(session.getState().current?.track.title).toBe('B')
    expect(session.getState().warning).toBe('Skipped removed song: A')
    expect(unplayed()).toEqual(['A'])
  })

  test('still plays a song gone from Apple Music but not removed', () => {
    db.prepare("UPDATE files SET apple_sync = 'gone' WHERE id = ?").run(a)
    session.play()
    expect(session.getState().current?.track.title).toBe('A')
  })
})
