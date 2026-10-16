import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { AppleSyncStatus } from '@shared/apple-sync'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from './render-library'

// "Removed from Apple Music" (sync spec §5.5, §6.2).
const status = (reviewCount: number): AppleSyncStatus => ({
  available: true,
  state: 'idle',
  lastResult: null,
  reviewCount
})

const row = (songId: number, title: string, isMissing: boolean): LibraryRow => ({
  fileId: songId + 100,
  songId,
  title,
  artist: null,
  path: `/m/${title}.mp3`,
  durationMs: 183_000,
  isMissing,
  isFavorite: false,
  danceId: null,
  danceName: null,
  country: null,
  choreographer: null,
  teacher: null,
  danceType: null,
  difficulty: null,
  danceCount: 1,
  label: title,
  playlistItemId: null,
  playlistNumber: null
})
const gone = [row(1, 'Kolo', false), row(2, 'Hora', true)]

function setup(reviewCount = 2) {
  const fake = createFakeApi({
    'appleSync:status': status(reviewCount),
    'library:list': (query: LibraryQuery) => (query.filter.kind === 'review' ? gone : []),
    'library:stats': { fileCount: 2 },
    'library:song': null,
    'appleSync:resolve': undefined,
    'appleSync:resolveAll': undefined
  })
  renderWithLibrary(
    <>
      <Sidebar />
      <MusicPage />
    </>,
    fake.api
  )
  return { fake, user: userEvent.setup() }
}

const lastQuery = (fake: ReturnType<typeof createFakeApi>): LibraryQuery =>
  fake.callsTo('library:list').at(-1)![0] as LibraryQuery

describe('Removed from Apple Music', () => {
  test('appears only while songs wait for review, and filters the library', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByText('Removed from Apple Music (2)'))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'review' }))
  })

  test('is hidden when the list is empty', async () => {
    setup(0)
    await screen.findByText('♪ All Music')
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/Removed from Apple Music/)).not.toBeInTheDocument()
  })

  test('emptying the list returns to All Music', async () => {
    const { fake, user } = setup(1)
    await user.click(await screen.findByText('Removed from Apple Music (1)'))
    fake.emit('appleSync:state', status(0))
    await waitFor(() => expect(lastQuery(fake).filter).toEqual({ kind: 'all' }))
  })

  test('notes each file, and Keep / Remove act on the selection', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByText('Removed from Apple Music (2)'))
    expect(await screen.findByText('File still on disk')).toBeInTheDocument()
    expect(screen.getByText('File gone')).toBeInTheDocument()
    await user.click(screen.getByText('Kolo'))
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(fake.callsTo('appleSync:resolve')).toEqual([[[101], 'keep']])
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(fake.callsTo('appleSync:resolve').at(-1)).toEqual([[101], 'remove'])
  })

  test('Keep all acts at once; Remove all asks first', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByText('Removed from Apple Music (2)'))
    await user.click(await screen.findByRole('button', { name: 'Keep all' }))
    expect(fake.callsTo('appleSync:resolveAll')).toEqual([['keep']])
    await user.click(screen.getByRole('button', { name: 'Remove all' }))
    await user.click(await screen.findByRole('button', { name: 'Remove 2 songs' }))
    expect(fake.callsTo('appleSync:resolveAll').at(-1)).toEqual(['remove'])
  })

  test('Import from Apple Music… is hidden while sync is on', async () => {
    setup(0)
    await screen.findByRole('button', { name: 'Add Music…' })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Import from Apple Music…' })
      ).not.toBeInTheDocument()
    )
  })
})
