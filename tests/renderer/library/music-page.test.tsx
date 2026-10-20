import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import { FILES_MIME } from '@renderer/library/drag'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

const row = (songId: number, extra: Partial<LibraryRow> = {}): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title: `Song ${songId}`,
  artist: null,
  path: `/m/${songId}.mp3`,
  durationMs: 183_000,
  isMissing: false,
  isFavorite: false,
  danceId: songId + 500,
  danceName: `Dance ${songId}`,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  label: `Song ${songId} | Dance ${songId}`,
  playlistItemId: null,
  playlistNumber: null,
  ...extra
})

const rows = [
  row(1, {
    title: 'Pusteno Ludo',
    label: 'Pravo Rhodopsko Oro ♪ Pusteno Ludo',
    artist: 'Alma Quartet',
    country: 'Bulgaria',
    teacher: 'Sonia Dion',
    danceCount: 2
  }),
  row(2, { title: 'Hora Fetelor', label: 'Hora Fetelor', country: 'Romania', isFavorite: true }),
  row(3, { title: 'Gone', label: 'Gone', isMissing: true })
]

function setup(extra: Record<string, unknown> = {}, withSidebar = false) {
  const fake = createFakeApi({
    'library:list': rows,
    'library:stats': { fileCount: 3 },
    'library:setFavorite': undefined,
    'library:reapplyMapping': { songs: 2, skippedSharedDances: 1 },
    'library:song': null,
    ...extra
  })
  renderWithLibrary(
    withSidebar ? (
      <>
        <Sidebar />
        <MusicPage />
      </>
    ) : (
      <MusicPage />
    ),
    fake.api
  )
  return fake
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery
const rowFor = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement

describe('Music page library table', () => {
  test('shows each song’s label, country and teacher, flagging missing files and extra dances', async () => {
    setup()
    expect(await screen.findByText('Pravo Rhodopsko Oro ♪ Pusteno Ludo')).toBeInTheDocument()
    const pusteno = rowFor('Pravo Rhodopsko Oro ♪ Pusteno Ludo')
    expect(within(pusteno).getByText('Alma Quartet')).toBeInTheDocument()
    expect(within(pusteno).getByText('Bulgaria')).toBeInTheDocument()
    expect(within(pusteno).getByText('Sonia Dion')).toBeInTheDocument()
    expect(within(pusteno).getByText('+1')).toBeInTheDocument()
    expect(within(pusteno).getByText('3:03')).toBeInTheDocument()
    expect(within(rowFor('Gone')).getByLabelText('File missing')).toBeInTheDocument()
  })

  test('sorts by a column header, toggling the direction', async () => {
    const fake = setup()
    const header = await screen.findByRole('columnheader', { name: /Country/ })
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'asc' })
    )
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'country', direction: 'desc' })
    )
  })

  test('orders its columns Country, Choreographer, Teacher, Artist, with Time last, and Artist sorts', async () => {
    const fake = setup()
    const header = await screen.findByRole('columnheader', { name: /Artist/ })
    expect(
      screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/ [▲▼]$/, ''))
    ).toEqual([
      '',
      'Dance / Song',
      'Country',
      'Choreographer',
      'Teacher',
      'Artist',
      'Type',
      'Difficulty',
      'Time',
      ''
    ])
    await userEvent.click(within(header).getByRole('button'))
    await waitFor(() =>
      expect(lastQuery(fake).sort).toEqual({ column: 'artist', direction: 'asc' })
    )
  })

  test('searches as you type', async () => {
    const fake = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search music' }), 'hora')
    await waitFor(() => expect(lastQuery(fake).search).toBe('hora'))
  })

  test('✕ clears the search; it shows only while there is something to clear', async () => {
    const fake = setup()
    const box = await screen.findByRole('searchbox', { name: 'Search music' })
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    await userEvent.type(box, 'hora')
    await waitFor(() => expect(lastQuery(fake).search).toBe('hora'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    await waitFor(() => expect(lastQuery(fake).search).toBe(''))
  })

  test('selects with click, ⌘-click and shift-click', async () => {
    setup()
    await screen.findByText('Gone')
    await userEvent.click(rowFor('Pravo Rhodopsko Oro ♪ Pusteno Ludo'))
    fireEvent.click(rowFor('Gone'), { shiftKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2)
  })

  test('⌘A or Ctrl+A in the table selects every song; in the search box it doesn’t', async () => {
    setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Hora Fetelor'))
    const table = screen.getByRole('table', { name: 'Songs' })
    fireEvent.keyDown(table, { key: 'a', metaKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'))
    fireEvent.keyDown(table, { key: 'a', ctrlKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'))
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search music' }), {
      key: 'a',
      metaKey: true
    })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(1)
  })

  test('dragging rows carries the selected recordings', async () => {
    setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pravo Rhodopsko Oro ♪ Pusteno Ludo'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    const data: Record<string, string> = {}
    fireEvent.dragStart(rowFor('Hora Fetelor'), {
      dataTransfer: { setData: (t: string, v: string) => (data[t] = v), effectAllowed: '' }
    })
    expect(JSON.parse(data[FILES_MIME])).toEqual([101, 102])
  })

  test('opens the song editor beside the table when exactly one song is selected', async () => {
    const fake = setup({
      'library:song': {
        songId: 2,
        fileId: 102,
        title: 'Hora Fetelor',
        artist: null,
        path: '/m/2.mp3',
        durationMs: 1,
        isMissing: false,
        isFavorite: true,
        dances: [],
        suggestions: []
      }
    })
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Hora Fetelor'))
    expect(await screen.findByDisplayValue('Hora Fetelor')).toBeInTheDocument()
    expect(fake.callsTo('library:song')).toEqual([[2]])
    fireEvent.click(rowFor('Gone'), { metaKey: true })
    await waitFor(() => expect(screen.queryByDisplayValue('Hora Fetelor')).not.toBeInTheDocument())
  })

  test('the star in each row adds or removes that song from favorites, leaving the selection alone', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Pravo Rhodopsko Oro ♪ Pusteno Ludo to favorites' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Hora Fetelor from favorites' })
    )
    expect(fake.callsTo('library:setFavorite')).toEqual([
      [[101], true],
      [[102], false]
    ])
    expect(screen.queryByRole('row', { selected: true })).toBeNull()
  })

  test('says when the list is narrowed to favorites, with a way back to all music', async () => {
    const fake = setup({}, true)
    await screen.findByText('Gone')
    expect(screen.queryByText(/Showing/)).toBeNull()
    await userEvent.click(screen.getByText('★ Favorites'))
    expect(await screen.findByText('Showing Favorites')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all music' }))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'all' }))
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  test('marks the selection as favorites', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pravo Rhodopsko Oro ♪ Pusteno Ludo'))
    await userEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })

  test('re-applies the mapping chosen in the dialog, showing the songs’ tags', async () => {
    const fake = setup({
      'library:songTags': [
        {
          songId: 1,
          title: 'Pusteno Ludo',
          artist: 'Yves Moreau',
          albumArtist: null,
          genre: 'Bulgaria'
        },
        {
          songId: 2,
          title: 'Hora Fetelor',
          artist: 'Taraf',
          albumArtist: 'Sonia Dion',
          genre: null
        }
      ]
    })
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pravo Rhodopsko Oro ♪ Pusteno Ludo'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Re-apply mapping…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Re-apply mapping?' })
    expect(dialog).toHaveTextContent('2 songs')
    expect(fake.callsTo('library:songTags')).toEqual([[[1, 2]]])
    const tags = within(dialog).getByRole('table', { name: 'File tags' })
    expect(await within(tags).findByText('Yves Moreau')).toBeInTheDocument()
    expect(within(tags).getByText('Sonia Dion')).toBeInTheDocument()
    // Starts from the saved import mapping; changing it here applies to this run only.
    expect(within(dialog).getByRole('radio', { name: 'Artist from Artist tag' })).toBeChecked()
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Choreographer from Artist tag' })
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-apply' }))
    expect(fake.callsTo('library:reapplyMapping')).toEqual([
      [
        [1, 2],
        {
          artistFrom: 'artistTag',
          teacherFrom: 'ignore',
          choreographerFrom: 'artistTag',
          genreIsCountry: fake.settings['import.genreIsCountry']
        }
      ]
    ])
    expect(fake.callsTo('settings:set')).toEqual([])
    expect(await screen.findByText(/Updated 2 songs/)).toHaveTextContent(
      '1 dance used by other songs was left unchanged'
    )
  })
})

describe('Music page in a playlist', () => {
  const inPlaylist = [
    row(1, { label: 'A', playlistItemId: 11, playlistNumber: 1 }),
    row(2, { label: 'B', playlistItemId: 12, playlistNumber: 2 }),
    row(3, { label: 'C', playlistItemId: 13, playlistNumber: 3 })
  ]

  const playlist = [{ id: 7, name: 'Mine', source: 'local', itemCount: 3 }]

  async function openPlaylist(): Promise<void> {
    await userEvent.click(await screen.findByText('Mine'))
    await screen.findByText('A')
  }

  test('says which playlist the list shows, and numbers its songs', async () => {
    setup({ 'library:list': inPlaylist, 'playlists:list': playlist }, true)
    await openPlaylist()
    expect(screen.getByText('Showing playlist “Mine”')).toBeInTheDocument()
    expect(within(rowFor('A')).getByText('1')).toBeInTheDocument()
    expect(within(rowFor('C')).getByText('3')).toBeInTheDocument()
  })

  test('dropping songs below the last row moves them to the end', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:reorder': undefined },
      true
    )
    await openPlaylist()
    fireEvent.drop(screen.getByTestId('songs-end'), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([101]) }
    })
    await waitFor(() => expect(fake.callsTo('playlists:reorder')).toEqual([[7, [12, 13, 11]]]))
  })

  test('removes the selected songs from the playlist', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:remove': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('B'))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from playlist' }))
    expect(fake.callsTo('playlists:remove')).toEqual([[7, [12]]])
  })

  test('dropping songs onto a row moves them before it', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:reorder': undefined },
      true
    )
    await openPlaylist()
    fireEvent.click(rowFor('C'))
    fireEvent.drop(rowFor('A'), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([103]) }
    })
    await waitFor(() => expect(fake.callsTo('playlists:reorder')).toEqual([[7, [13, 11, 12]]]))
  })

  test('rows cannot be reordered while a search narrows the playlist', async () => {
    const fake = setup(
      { 'library:list': inPlaylist, 'playlists:list': playlist, 'playlists:reorder': undefined },
      true
    )
    await openPlaylist()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search music' }), 'c')
    await waitFor(() => expect(lastQuery(fake).search).toBe('c'))
    fireEvent.drop(rowFor('A'), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([103]) }
    })
    expect(fake.callsTo('playlists:reorder')).toEqual([])
  })
})
