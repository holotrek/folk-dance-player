import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlaylistSummary } from '@shared/library'
import type { Settings } from '@shared/settings'
import { COLUMN_MIME, FILES_MIME } from '@renderer/library/drag'
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

// A DataTransfer that remembers what a drag put in it.
function dataTransfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get types() {
      return [...data.keys()]
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'uninitialized'
  }
}

const header = (name: string): HTMLElement =>
  within(screen.getByRole('table', { name: 'Songs' })).getByRole('columnheader', {
    name: new RegExp(`^${name}`)
  })

// Drags the column under `from`'s header onto `to`'s header.
function dragColumn(from: string, to: string): void {
  const dt = dataTransfer()
  fireEvent.dragStart(header(from), { dataTransfer: dt })
  fireEvent.dragOver(header(to), { dataTransfer: dt })
  fireEvent.drop(header(to), { dataTransfer: dt })
}

const savedOrder = (fake: ReturnType<typeof setup>, key: string): unknown[] | undefined =>
  fake.callsTo('settings:set').find((c) => c[0] === key)?.[1] as unknown[] | undefined

describe('dragging a column header', () => {
  test('Artist onto Country moves it before Country, and saves the order', async () => {
    const fake = setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    dragColumn('Artist', 'Country')
    await waitFor(() =>
      expect(headers().slice(1, 5)).toEqual(['Dance / Song', 'Artist', 'Country', 'Choreographer'])
    )
    expect(savedOrder(fake, 'library.columns.music')).toEqual([
      'artist',
      'country',
      'choreographer',
      'teacher',
      'danceType',
      'difficulty',
      'time'
    ])
  })

  test('onto Dance / Song makes it the first data column', async () => {
    setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    dragColumn('Time', 'Dance / Song')
    await waitFor(() => expect(headers()[2]).toBe('Time'))
  })

  test('onto the ⋯ header moves it to the end', async () => {
    setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    const dt = dataTransfer()
    fireEvent.dragStart(header('Country'), { dataTransfer: dt })
    const menu = within(screen.getByRole('table', { name: 'Songs' }))
      .getAllByRole('columnheader')
      .at(-1)!
    fireEvent.dragOver(menu, { dataTransfer: dt })
    fireEvent.drop(menu, { dataTransfer: dt })
    await waitFor(() => expect(headers().slice(-3)).toEqual(['Time', 'Country', '']))
  })

  test('onto itself changes and saves nothing', async () => {
    const fake = setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    dragColumn('Teacher', 'Teacher')
    expect(headers()).toEqual(MUSIC_DEFAULT)
    expect(fake.callsTo('settings:set')).toEqual([])
  })

  test('the Program page saves its own list', async () => {
    const fake = setup('program')
    await waitFor(() => expect(headers()).toContain('Artist'))
    dragColumn('Time', 'Country')
    await waitFor(() => expect(headers()[2]).toBe('Time'))
    expect(savedOrder(fake, 'library.columns.program')).toEqual([
      'time',
      'country',
      'choreographer',
      'teacher',
      'artist'
    ])
    expect(savedOrder(fake, 'library.columns.music')).toBeUndefined()
  })

  test('Dance / Song and the ⋯ header are not draggable', async () => {
    setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    expect(header('Dance / Song')).not.toHaveAttribute('draggable', 'true')
    const last = within(screen.getByRole('table', { name: 'Songs' }))
      .getAllByRole('columnheader')
      .at(-1)!
    expect(last).not.toHaveAttribute('draggable', 'true')
    expect(header('Artist')).toHaveAttribute('draggable', 'true')
  })

  test('a song dragged over a header is not accepted', async () => {
    setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    const notPrevented = fireEvent.dragOver(header('Country'), {
      dataTransfer: dataTransfer({ [FILES_MIME]: '[1]' })
    })
    expect(notPrevented).toBe(true) // fireEvent returns false when preventDefault was called
    const prevented = fireEvent.dragOver(header('Country'), {
      dataTransfer: dataTransfer({ [COLUMN_MIME]: 'artist' })
    })
    expect(prevented).toBe(false)
  })

  test('a click still sorts', async () => {
    const fake = setup('music')
    await waitFor(() => expect(headers()).toEqual(MUSIC_DEFAULT))
    await userEvent.click(within(header('Artist')).getByRole('button'))
    await waitFor(() =>
      expect(fake.callsTo('library:list').at(-1)![0]).toMatchObject({
        sort: { column: 'artist', direction: 'asc' }
      })
    )
  })
})
