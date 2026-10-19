import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlaylistSummary } from '@shared/library'
import type { Settings } from '@shared/settings'
import Sidebar from '@renderer/components/Sidebar'
import MusicPage from '@renderer/pages/MusicPage'
import ProgramPage from '@renderer/pages/ProgramPage'
import { createFakeApi } from '../fake-api'
import { playerState } from '../program/fixtures'
import { renderWithLibrary } from './render-library'

const playlists: PlaylistSummary[] = [
  { id: 2, name: 'Couple dances', source: 'local', itemCount: 3, mirror: false, folderId: null }
]

// The page rendered with some column orders already saved. `settings` is what main would hold.
function setup(page: 'music' | 'program', settings: Partial<Settings> = {}) {
  const fake = createFakeApi({
    'library:list': [],
    'library:stats': { fileCount: 0 },
    'library:song': null,
    'playlists:list': playlists,
    'player:getState': playerState({ programId: null })
  })
  fake.settings = { ...fake.settings, ...settings }
  renderWithLibrary(
    page === 'music' ? (
      <>
        <Sidebar />
        <MusicPage />
      </>
    ) : (
      <ProgramPage />
    ),
    fake.api
  )
  return fake
}

// The headers of the library table, without their sort arrows.
const headers = (): string[] =>
  within(screen.getByRole('table', { name: 'Songs' }))
    .getAllByRole('columnheader')
    .map((h) => (h.textContent ?? '').replace(/ [▲▼]$/, ''))

// Every movable column of the Music page, with Time and Artist first (what a save writes).
const TIME_ARTIST_FIRST = [
  'time',
  'artist',
  'country',
  'choreographer',
  'teacher',
  'danceType',
  'difficulty'
]

const MUSIC_DEFAULT = [
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
]

describe('saved column orders', () => {
  test('the Music page applies its saved column order', async () => {
    setup('music', { 'library.columns.music': TIME_ARTIST_FIRST })
    await waitFor(() =>
      expect(headers()).toEqual([
        '',
        'Dance / Song',
        'Time',
        'Artist',
        'Country',
        'Choreographer',
        'Teacher',
        'Type',
        'Difficulty',
        ''
      ])
    )
  })

  test('the Program page uses its own order', async () => {
    setup('program', {
      'library.columns.music': ['time'],
      'library.columns.program': ['time', 'country']
    })
    await waitFor(() =>
      expect(headers()).toEqual([
        '',
        'Dance / Song',
        'Time',
        'Country',
        'Choreographer',
        'Teacher',
        'Artist',
        ''
      ])
    )
  })

  test('the Program page keeps its default order when only the Music page is changed', async () => {
    setup('program', { 'library.columns.music': ['time'] })
    await waitFor(() =>
      expect(headers()).toEqual([
        '',
        'Dance / Song',
        'Country',
        'Choreographer',
        'Teacher',
        'Artist',
        'Time',
        ''
      ])
    )
  })

  test('an unknown saved key is ignored', async () => {
    setup('music', { 'library.columns.music': ['bogus', ...TIME_ARTIST_FIRST.slice(1)] })
    await waitFor(() =>
      expect(headers()).toEqual([
        '',
        'Dance / Song',
        'Artist',
        'Country',
        'Choreographer',
        'Teacher',
        'Type',
        'Difficulty',
        'Time',
        ''
      ])
    )
  })

  test('shows the default order until nothing is saved', async () => {
    setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
  })

  test('in a playlist the # column stays first', async () => {
    setup('music', { 'library.columns.music': TIME_ARTIST_FIRST })
    await userEvent.click(await screen.findByText('Couple dances'))
    await waitFor(() => expect(headers().slice(0, 3)).toEqual(['#', '', 'Dance / Song']))
    expect(headers().slice(3, 5)).toEqual(['Time', 'Artist'])
  })
})
