import { afterEach, describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import { createLibraryStore, type LibraryStore } from '@renderer/library/library-store'
import { createFakeApi } from '../fake-api'

const row = (songId: number, extra: Partial<LibraryRow> = {}): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: null,
  isMissing: false,
  isFavorite: false,
  danceId: null,
  danceName: null,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 0,
  label: `Song ${songId}`,
  playlistItemId: null,
  playlistNumber: null,
  ...extra
})

let store: LibraryStore
let stopWatching: () => void = () => undefined
afterEach(() => stopWatching())

function setup(rows: LibraryRow[] = [row(1), row(2), row(3), row(4)]) {
  const fake = createFakeApi({
    'library:list': () => rows,
    'playlists:list': [{ id: 7, name: 'Balkan', source: 'local', itemCount: 2 }]
  })
  store = createLibraryStore(fake.api)
  return fake
}

describe('library store', () => {
  test('loads rows and playlists', async () => {
    setup()
    await store.getState().refresh()
    expect(store.getState().rows.map((r) => r.songId)).toEqual([1, 2, 3, 4])
    expect(store.getState().playlists.map((p) => p.name)).toEqual(['Balkan'])
  })

  test('refetches with the new filter, search and sort', async () => {
    const fake = setup()
    await store.getState().setFilter({ kind: 'playlist', playlistId: 7 })
    await store.getState().setSearch('hora')
    await store.getState().setSort({ column: 'country', direction: 'desc' })
    const last = fake.callsTo('library:list').at(-1)![0] as LibraryQuery
    expect(last).toEqual({
      search: 'hora',
      filter: { kind: 'playlist', playlistId: 7 },
      sort: { column: 'country', direction: 'desc' }
    })
  })

  test('a playlist is shown in its own order until another sort is chosen', async () => {
    const fake = setup()
    await store.getState().setFilter({ kind: 'playlist', playlistId: 7 })
    expect((fake.callsTo('library:list').at(-1)![0] as LibraryQuery).sort.column).toBe('position')
    await store.getState().setFilter({ kind: 'all' })
    expect((fake.callsTo('library:list').at(-1)![0] as LibraryQuery).sort.column).toBe('title')
  })

  test('selects with click, toggle (⌘) and range (shift)', async () => {
    setup()
    await store.getState().refresh()
    const { select } = store.getState()
    select(2, 'single')
    expect(store.getState().selected).toEqual([2])
    select(4, 'range')
    expect(store.getState().selected).toEqual([2, 3, 4])
    select(3, 'toggle')
    expect(store.getState().selected).toEqual([2, 4])
    select(1, 'toggle')
    expect(store.getState().selected).toEqual([2, 4, 1])
  })

  test('selects every row, in table order, keeping the anchor for shift-click', async () => {
    setup()
    await store.getState().refresh()
    store.getState().select(3, 'single')
    store.getState().selectAll()
    const ids = store.getState().rows.map((r) => r.songId)
    expect(store.getState().selected).toEqual(ids)
    expect(store.getState().anchor).toBe(3)
  })

  test('drops selected songs that disappear after a refresh', async () => {
    let rows = [row(1), row(2)]
    const fake = createFakeApi({ 'library:list': () => rows, 'playlists:list': [] })
    store = createLibraryStore(fake.api)
    await store.getState().refresh()
    store.getState().select(2, 'single')
    rows = [row(1)]
    await store.getState().refresh()
    expect(store.getState().selected).toEqual([])
  })

  test('refreshes when the library changes, until it stops watching', async () => {
    const fake = setup()
    stopWatching = store.getState().watch()
    await store.getState().refresh()
    const before = fake.callsTo('library:list').length
    fake.emit('library:changed', null)
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.callsTo('library:list').length).toBe(before + 1)
    stopWatching()
    fake.emit('library:changed', null)
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.callsTo('library:list').length).toBe(before + 1)
  })

  test('selected rows are the selected songs in table order', async () => {
    setup()
    await store.getState().refresh()
    store.getState().select(3, 'single')
    store.getState().select(1, 'toggle')
    expect(
      store
        .getState()
        .selectedRows()
        .map((r) => r.songId)
    ).toEqual([1, 3])
  })
})
