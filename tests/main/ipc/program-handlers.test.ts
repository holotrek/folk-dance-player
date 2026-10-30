import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

function setup() {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  settings.set('countdown.seconds', 0)
  settings.set('autoContinue.seconds', 0)
  const missing = new Set<string>()
  const counts = { library: 0, programs: 0 }
  const player = new PlayerSession(
    createSessionPorts(db, settings, (path) => !missing.has(path)),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    () => undefined
  )
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 2 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: {
      pickMusic: async () => [],
      pickAppleLibrary: async () => null,
      pickPdf: async () => null,
      pickImage: async () => null
    },
    player,
    fileExists: (path) => !missing.has(path),
    onLibraryChanged: () => void counts.library++,
    onProgramsChanged: () => void counts.programs++
  }
  const songs = {
    hora: addLibrarySong(db, { title: 'Hora', path: '/m/hora.mp3', dance: { name: 'Hora' } }),
    kolo: addLibrarySong(db, { title: 'Kolo', path: '/m/kolo.mp3', dance: { name: 'Kolo' } })
  }
  return { db, settings, missing, counts, songs, h: createHandlers(deps) as InvokeHandlers }
}

describe('program handlers', () => {
  test('create, fill, reorder and load a program; every edit is announced', async () => {
    const { h, counts, songs } = setup()
    const p = await h['programs:create']('Tue Oct 14')
    const [a, b] = await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    const stop = await h['programs:addStop'](p, b)
    await h['programs:reorder'](p, [b, stop, a])
    expect((await h['programs:get'](p))?.items.map((i) => i.id)).toEqual([b, stop, a])
    expect((await h['programs:list'](''))[0]).toMatchObject({
      name: 'Tue Oct 14',
      unplayedCount: 2
    })
    expect(counts.programs).toBe(4)
  })

  test('loading a program makes it current for the player and checks its files', async () => {
    const { h, db, missing, counts, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    missing.add('/m/kolo.mp3')
    await h['programs:setCurrent'](p)
    expect((await h['player:getState']()).nextUp).toMatchObject({ title: 'Hora' })
    expect(counts.library).toBe(1)
    const flagged = db.prepare('SELECT path FROM files WHERE is_missing = 1').all()
    expect(flagged.map((f) => f.path)).toEqual(['/m/kolo.mp3'])
  })

  test('unloading a program leaves it, its items and its log saved, and loads again as it was', async () => {
    const { h, settings, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    await h['programs:setCurrent'](p)
    await h['player:play']() // Hora starts, so it is played and logged
    await h['player:stop']()

    await h['programs:setCurrent'](null)
    expect(settings.get('currentProgramId')).toBeNull()
    const unloaded = await h['player:getState']()
    expect(unloaded.programId).toBeNull()
    expect(unloaded.nextUp).toBeNull()
    expect((await h['programs:get'](p))?.items.map((i) => i.kind === 'track' && i.title)).toEqual([
      'Kolo'
    ])
    expect((await h['programs:played'](p)).map((e) => e.track?.title)).toEqual(['Hora'])

    await h['programs:setCurrent'](p)
    expect((await h['player:getState']()).nextUp).toMatchObject({ title: 'Kolo' })
  })

  test('unloading while a song plays lets it play on, and nothing follows it', async () => {
    const { h, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    await h['programs:setCurrent'](p)
    await h['player:play']()
    const playing = (await h['player:getState']()).current!
    await h['programs:setCurrent'](null)
    expect(await h['player:getState']()).toMatchObject({
      status: 'playing',
      current: { playId: playing.playId, track: { title: 'Hora' } }
    })
    await h['player:ended'](playing.playId)
    expect(await h['player:getState']()).toMatchObject({ status: 'idle', current: null })
  })

  test('deleting the current program unloads it', async () => {
    const { h, settings } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:setCurrent'](p)
    await h['programs:delete'](p)
    expect(settings.get('currentProgramId')).toBeNull()
    expect((await h['player:getState']()).programId).toBeNull()
  })

  test('the player plays the program, and "Previously played" lists it', async () => {
    const { h, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId, songs.kolo.fileId], null)
    await h['programs:setCurrent'](p)
    await h['player:play']()
    const state = await h['player:getState']()
    expect(state).toMatchObject({ status: 'playing', current: { track: { title: 'Hora' } } })
    await h['player:ended'](state.current!.playId)
    expect((await h['player:getState']()).current?.track.title).toBe('Kolo')
    expect((await h['programs:played'](p)).map((e) => e.track?.title)).toEqual(['Hora', 'Kolo'])
  })

  test('◀◀ restarts the current song through the player', async () => {
    const { h, songs } = setup()
    const p = await h['programs:create']('Set')
    await h['programs:addTracks'](p, [songs.hora.fileId], null)
    await h['programs:setCurrent'](p)
    await h['player:play']()
    await h['player:restart']()
    expect((await h['player:getState']()).current?.restarts).toBe(1)
  })

  test('remote status comes from the app; without one, the remote is reported off', async () => {
    const { h } = setup()
    expect(await h['remote:status']()).toEqual({ trusted: false, keys: [] })
    expect(await h['remote:requestAccess']()).toEqual({ trusted: false, keys: [] })
  })

  test('auto-continue is changed from the player bar', async () => {
    const { h, settings } = setup()
    await h['player:setAutoContinue']({ enabled: false })
    await h['player:setAutoContinue']({ seconds: 8 })
    expect(settings.get('autoContinue.enabled')).toBe(false)
    expect((await h['player:getState']()).autoContinue).toEqual({ enabled: false, seconds: 8 })
  })

  test('holding is set per file and announced as a library change', async () => {
    const { h, counts, songs } = setup()
    await h['library:setHolding']([songs.kolo.fileId], true)
    const held = await h['library:list']({
      search: '',
      filter: { kind: 'holding' },
      sort: { column: 'title', direction: 'asc' }
    })
    expect(held.map((r) => r.title)).toEqual(['Kolo'])
    expect(counts.library).toBe(1)
    await h['library:setHolding']([songs.hora.fileId], true, songs.kolo.fileId)
    const ordered = await h['library:list']({
      search: '',
      filter: { kind: 'holding' },
      sort: { column: 'title', direction: 'desc' }
    })
    expect(ordered.map((r) => r.title)).toEqual(['Hora', 'Kolo'])
  })
})
