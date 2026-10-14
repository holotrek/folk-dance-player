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
  ...extra
})

const rows = [
  row(1, {
    title: 'Pusteno Ludo',
    label: 'Pusteno Ludo | Pravo Rhodopsko Oro',
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
    expect(await screen.findByText('Pusteno Ludo | Pravo Rhodopsko Oro')).toBeInTheDocument()
    const pusteno = rowFor('Pusteno Ludo | Pravo Rhodopsko Oro')
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

  test('searches as you type', async () => {
    const fake = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search music' }), 'hora')
    await waitFor(() => expect(lastQuery(fake).search).toBe('hora'))
  })

  test('selects with click, ⌘-click and shift-click', async () => {
    setup()
    await screen.findByText('Gone')
    await userEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Gone'), { shiftKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(3)
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(2)
  })

  test('dragging rows carries the selected recordings', async () => {
    setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
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

  test('marks the selection as favorites', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    await userEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })

  test('re-applies the mapping to the selection after confirming, and reports skipped dances', async () => {
    const fake = setup()
    await screen.findByText('Gone')
    fireEvent.click(rowFor('Pusteno Ludo | Pravo Rhodopsko Oro'))
    fireEvent.click(rowFor('Hora Fetelor'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Re-apply mapping…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Re-apply mapping?' })
    expect(dialog).toHaveTextContent('2 songs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Re-apply' }))
    expect(fake.callsTo('library:reapplyMapping')).toEqual([[[1, 2]]])
    expect(await screen.findByText(/Updated 2 songs/)).toHaveTextContent(
      '1 dance used by other songs was left unchanged'
    )
  })
})

describe('Music page in a playlist', () => {
  const inPlaylist = [
    row(1, { label: 'A', playlistItemId: 11 }),
    row(2, { label: 'B', playlistItemId: 12 }),
    row(3, { label: 'C', playlistItemId: 13 })
  ]

  const playlist = [{ id: 7, name: 'Mine', source: 'local', itemCount: 3 }]

  async function openPlaylist(): Promise<void> {
    await userEvent.click(await screen.findByText('Mine'))
    await screen.findByText('A')
  }

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
})
