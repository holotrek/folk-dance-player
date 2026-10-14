import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

function setup() {
  const db = createTestDb()
  let changes = 0
  const deps: HandlerDeps = {
    db,
    settings: new SettingsStore(db),
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 2 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    onLibraryChanged: () => void changes++
  }
  return {
    db,
    h: createHandlers(deps) as InvokeHandlers,
    changes: () => changes,
    settings: deps.settings
  }
}

const query = {
  search: '',
  filter: { kind: 'all' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

describe('library handlers', () => {
  test('list and detail read the library', async () => {
    const { db, h } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora Mare' } })
    expect((await h['library:list'](query)).map((r) => r.label)).toEqual(['Hora | Hora Mare'])
    expect((await h['library:song'](s.songId))?.dances[0].name).toBe('Hora Mare')
  })

  test('every edit announces that the library changed', async () => {
    const { db, h, changes } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:updateSong'](s.songId, { artist: 'Taraf' })
    await h['library:updateDance'](s.danceId!, { country: 'Romania' })
    const created = await h['library:createDance'](s.songId, 'Sârba')
    await h['library:setDefaultDance'](s.songId, created)
    await h['library:unlinkDance'](s.songId, created)
    await h['library:setFavorite']([s.fileId], true)
    const p = await h['playlists:create']('Mine')
    await h['playlists:add'](p, [s.fileId])
    expect(changes()).toBe(8)
    expect((await h['playlists:list']()).map((x) => [x.name, x.itemCount])).toEqual([['Mine', 1]])
  })

  test('re-apply mapping uses the saved import mapping', async () => {
    const { db, h, settings } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    db.prepare("UPDATE files SET tag_artist = 'Yves Moreau' WHERE id = ?").run(s.fileId)
    settings.set('import.artistTagTarget', 'choreographer')
    expect(await h['library:reapplyMapping']([s.songId])).toEqual({
      songs: 1,
      skippedSharedDances: 0
    })
    expect((await h['library:song'](s.songId))?.dances[0].choreographer).toBe('Yves Moreau')
  })

  test('suggestions include the dance types from settings', async () => {
    const { h, settings } = setup()
    settings.set('danceTypeSuggestions', ['Line'])
    expect(await h['library:suggestions']()).toEqual({
      people: [],
      countries: [],
      danceTypes: ['Line']
    })
  })
})
