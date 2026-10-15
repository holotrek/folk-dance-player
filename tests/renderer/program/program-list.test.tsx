import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { LibraryRow, SongDetail } from '@shared/library'
import type { ProgramDetail } from '@shared/program'
import { FILES_MIME, ITEMS_MIME } from '@renderer/library/drag'
import LibraryTable from '@renderer/library/LibraryTable'
import ProgramList from '@renderer/program/ProgramList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, stop, track } from './fixtures'

const hora = track(101, 'Hora', { country: 'Romania', durationMs: 185_000 })
const kolo = track(102, 'Kolo', { danceCount: 2, isMissing: true })
const program: ProgramDetail = {
  id: 5,
  name: 'Tue Oct 14',
  items: [item(1, hora), stop(2), item(3, kolo)]
}

const libraryRow = (fileId: number, title: string): LibraryRow => ({
  fileId,
  songId: fileId + 1000,
  title,
  artist: null,
  path: `/m/${title}.mp3`,
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
  danceCount: 1,
  label: title,
  playlistItemId: null,
  playlistNumber: null
})

afterEach(() => vi.useRealTimers())

function setup(options: { loaded?: boolean; withLibrary?: boolean } = {}) {
  const loaded = options.loaded ?? true
  const fake = createFakeApi({
    'player:getState': playerState({ programId: loaded ? 5 : null }),
    'programs:get': loaded ? program : null,
    'programs:addTracks': [9],
    'programs:addStop': 10,
    'programs:reorder': undefined,
    'programs:removeItems': undefined,
    'programs:setItemDance': undefined,
    'programs:rename': undefined,
    'programs:create': 6,
    'programs:setCurrent': undefined,
    'library:list': [libraryRow(201, 'Sârba'), libraryRow(202, 'Tropanka')],
    'library:song': {
      dances: [
        { danceId: 2102, label: 'Kolo' },
        { danceId: 77, label: 'Kolo | Užičko Kolo' }
      ]
    } as unknown as SongDetail
  })
  renderWithLibrary(
    options.withLibrary ? (
      <>
        <ProgramList />
        <LibraryTable />
      </>
    ) : (
      <ProgramList />
    ),
    fake.api
  )
  return fake
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Program items' })).getAllByRole('listitem')
const rowFor = (text: string) => screen.getByText(text).closest('[role=listitem]') as HTMLElement
const files = (ids: number[]) => ({
  dataTransfer: {
    types: [FILES_MIME],
    getData: (t: string) => (t === FILES_MIME ? JSON.stringify(ids) : '')
  }
})
const items = (ids: number[]) => ({
  dataTransfer: {
    types: [ITEMS_MIME],
    getData: (t: string) => (t === ITEMS_MIME ? JSON.stringify(ids) : '')
  }
})

describe('program list', () => {
  test('shows the loaded program’s unplayed items: songs, STOP markers and missing files', async () => {
    setup()
    expect(await screen.findByText('Program: Tue Oct 14')).toBeInTheDocument()
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hora'),
      expect.stringContaining('STOP / TEACHING'),
      expect.stringContaining('Kolo')
    ])
    expect(within(rowFor('Hora')).getByText('Romania')).toBeInTheDocument()
    expect(within(rowFor('Kolo')).getByLabelText('File missing')).toBeInTheDocument()
  })

  test('songs dropped on an item go before it; dropped below the list, at the end', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(rowFor('Kolo'), files([201, 202]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[5, [201, 202], 3]]))
    fireEvent.drop(rows().at(-1)!.nextElementSibling!, files([201]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks').at(-1)).toEqual([5, [201], null]))
  })

  test('songs dropped anywhere on the panel outside an item go to the end', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Program' }), files([202]))
    fireEvent.drop(screen.getByText('Program: Tue Oct 14'), files([201]))
    await waitFor(() =>
      expect(fake.callsTo('programs:addTracks')).toEqual([
        [5, [202], null],
        [5, [201], null]
      ])
    )
  })

  test('✕ removes an item at once', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Hora' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove STOP / TEACHING' }))
    expect(fake.callsTo('programs:removeItems')).toEqual([
      [5, [1]],
      [5, [2]]
    ])
  })

  test('a STOP marker is drawn with an icon, not an emoji', async () => {
    setup()
    const stopRow = (await screen.findByText('STOP / TEACHING')).closest('[role=listitem]')!
    expect(stopRow.querySelector('svg')).not.toBeNull()
    expect(stopRow.textContent).not.toContain('⏸')
  })

  test('dragging an item onto another moves it before that item', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(rowFor('Hora'), items([3]))
    await waitFor(() => expect(fake.callsTo('programs:reorder')).toEqual([[5, [3, 1, 2]]]))
  })

  test('“Add selected” adds the songs selected in the library to the end', async () => {
    const fake = setup({ withLibrary: true })
    fireEvent.click(await screen.findByText('Sârba'))
    fireEvent.click(screen.getByText('Tropanka'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: '➕ Add selected' }))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[5, [201, 202], null]]))
  })

  test('with no program loaded, adding songs starts one named for today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup({ loaded: false })
    expect(await screen.findByText(/No program loaded/)).toBeInTheDocument()
    fireEvent.drop(screen.getByText(/No program loaded/), files([201]))
    await waitFor(() => expect(fake.callsTo('programs:addTracks')).toEqual([[6, [201], null]]))
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    expect(fake.callsTo('programs:setCurrent')).toEqual([[6]])
  })

  test('an item’s menu chooses its dance, inserts a STOP before it, or removes it', async () => {
    const fake = setup()
    // Each item's menu is labelled by its "⋯" button; a closing menu lingers while it fades.
    const menu = (name: string) => screen.findByRole('menu', { name: `Options for ${name}` })
    await screen.findByText('Kolo')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      await within(await menu('Kolo')).findByRole('menuitem', { name: 'Kolo | Užičko Kolo' })
    )
    expect(fake.callsTo('library:song')).toEqual([[1102]])
    expect(fake.callsTo('programs:setItemDance')).toEqual([[3, 77]])

    await userEvent.click(screen.getByRole('button', { name: 'Options for Hora' }))
    await userEvent.click(
      within(await menu('Hora')).getByRole('menuitem', { name: 'Insert STOP before' })
    )
    expect(fake.callsTo('programs:addStop')).toEqual([[5, 1]])

    const stopRow = screen
      .getByRole('button', { name: 'Options for STOP / TEACHING' })
      .closest('[role=listitem]') as HTMLElement
    await userEvent.pointer({ keys: '[MouseRight]', target: stopRow })
    await userEvent.click(
      within(await menu('STOP / TEACHING')).getByRole('menuitem', { name: 'Remove' })
    )
    expect(fake.callsTo('programs:removeItems')).toEqual([[5, [2]]])
  })

  test('+ STOP adds a marker at the end; the program can be renamed', async () => {
    const fake = setup()
    await userEvent.click(await screen.findByRole('button', { name: '+ STOP' }))
    expect(fake.callsTo('programs:addStop')).toEqual([[5, null]])
    await userEvent.click(screen.getByRole('button', { name: 'Rename program' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename program' })
    await userEvent.clear(within(dialog).getByRole('textbox'))
    await userEvent.type(within(dialog).getByRole('textbox'), 'Festival')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('programs:rename')).toEqual([[5, 'Festival']])
  })

  test('double-clicking an item does nothing', async () => {
    const fake = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(
      fake.calls.filter(([c]) => String(c).startsWith('player:') && c !== 'player:getState')
    ).toEqual([])
  })
})
