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
  hasNotesPdf: false,
  label: title,
  playlistItemId: null,
  playlistNumber: null
})

afterEach(() => vi.useRealTimers())

function setup(
  options: {
    loaded?: boolean
    withLibrary?: boolean
    programs?: ProgramDetail
    programsGet?: () => ProgramDetail
    addTracks?: () => number[]
    onShowMusic?: () => void
  } = {}
) {
  const loaded = options.loaded ?? true
  const fake = createFakeApi({
    'player:getState': playerState({ programId: loaded ? 5 : null }),
    'programs:get': options.programsGet ?? (loaded ? (options.programs ?? program) : null),
    'programs:addTracks': options.addTracks ?? [9],
    'library:setFavorite': undefined,
    'library:openNotesPdf': undefined,
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
        { danceId: 77, label: 'Užičko Kolo ♪ Kolo' }
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
    fake.api,
    options.onShowMusic
  )
  return fake
}

const rows = () =>
  within(screen.getByRole('listbox', { name: 'Program items' })).getAllByRole('option')
const rowFor = (text: string) => screen.getByText(text).closest('[role=option]') as HTMLElement
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
    const stopRow = (await screen.findByText('STOP / TEACHING')).closest('[role=option]')!
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
      await within(await menu('Kolo')).findByRole('menuitem', { name: 'Užičko Kolo ♪ Kolo' })
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
      .closest('[role=option]') as HTMLElement
    await userEvent.pointer({ keys: '[MouseRight]', target: stopRow })
    await userEvent.click(
      within(await menu('STOP / TEACHING')).getByRole('menuitem', { name: 'Remove' })
    )
    expect(fake.callsTo('programs:removeItems')).toEqual([[5, [2]]])
  })

  test('an item’s menu offers Open PDF only for a dance with a PDF', async () => {
    const withPdf = track(103, 'Lesnoto', { danceId: 2103, hasNotesPdf: true })
    const fake = setup({
      programs: { ...program, items: [item(1, hora), item(4, withPdf)] }
    })
    const menu = (name: string) => screen.findByRole('menu', { name: `Options for ${name}` })
    await screen.findByText('Lesnoto')
    await userEvent.pointer({ keys: '[MouseRight]', target: rowFor('Hora') })
    expect(
      within(await menu('Hora')).queryByRole('menuitem', { name: 'Open PDF' })
    ).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.pointer({ keys: '[MouseRight]', target: rowFor('Lesnoto') })
    await userEvent.click(within(await menu('Lesnoto')).getByRole('menuitem', { name: 'Open PDF' }))
    expect(fake.callsTo('library:openNotesPdf')).toEqual([[2103]])
  })

  test('an item’s menu opens its song on the Music page (Edit details); a STOP has none', async () => {
    const showMusic = vi.fn()
    const fake = setup({ onShowMusic: showMusic })
    const menu = (name: string) => screen.findByRole('menu', { name: `Options for ${name}` })
    await screen.findByText('Kolo')
    await userEvent.pointer({ keys: '[MouseRight]', target: rowFor('Hora') })
    await userEvent.click(
      within(await menu('Hora')).getByRole('menuitem', { name: 'Edit details' })
    )
    expect(showMusic).toHaveBeenCalledTimes(1)
    // Hora isn't in the library list shown, so the list goes back to All Music to show it.
    await waitFor(() =>
      expect(fake.callsTo('library:list').at(-1)?.[0]).toMatchObject({ filter: { kind: 'all' } })
    )
  })

  test('an item’s menu adds its song to favorites, or removes it', async () => {
    const fake = setup({
      programs: { ...program, items: [item(1, hora), item(3, { ...kolo, isFavorite: true })] }
    })
    const menu = (name: string) => screen.findByRole('menu', { name: `Options for ${name}` })
    await screen.findByText('Kolo')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Hora' }))
    await userEvent.click(
      within(await menu('Hora')).getByRole('menuitem', { name: 'Add to favorites' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      within(await menu('Kolo')).getByRole('menuitem', { name: 'Remove from favorites' })
    )
    expect(fake.callsTo('library:setFavorite')).toEqual([
      [[101], true],
      [[102], false]
    ])
  })

  test('each song item has a favorite star on its left', async () => {
    const fake = setup()
    await screen.findByText('Kolo')
    const star = screen.getByRole('button', { name: 'Add Hora to favorites' })
    expect(rowFor('Hora').firstElementChild).toBe(star)
    await userEvent.click(star)
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
    expect(
      within(rowFor('STOP / TEACHING')).queryByRole('button', { name: /favorites/ })
    ).toBeNull()
  })

  test('a song added with several dances asks which one; one dance doesn’t ask', async () => {
    const added = item(9, track(201, 'Kolo', { songId: 1102, danceId: 2102, danceCount: 2 }))
    let items = program.items
    const fake = setup({
      programsGet: () => ({ ...program, items }),
      addTracks: () => {
        items = [...program.items, added]
        return [9]
      }
    })
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Program' }), files([201]))
    const dialog = within(await screen.findByRole('dialog', { name: 'Which dance?' }))
    expect(dialog.getByRole('radio', { name: 'Kolo' })).toBeChecked() // the default
    await userEvent.click(dialog.getByRole('radio', { name: 'Užičko Kolo ♪ Kolo' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(fake.callsTo('programs:setItemDance')).toEqual([[9, 77]])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('keeping the default dance changes nothing', async () => {
    const added = item(9, track(201, 'Kolo', { songId: 1102, danceId: 2102, danceCount: 2 }))
    const fake = setup({ programsGet: () => ({ ...program, items: [...program.items, added] }) })
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Program' }), files([201]))
    const dialog = within(await screen.findByRole('dialog', { name: 'Which dance?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }))
    expect(fake.callsTo('programs:setItemDance')).toEqual([])
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

describe('program list selection', () => {
  const selected = () => rows().filter((r) => r.getAttribute('aria-selected') === 'true')
  const names = () => selected().map((r) => r.textContent)
  const dragStart = (row: HTMLElement) => {
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(row, { dataTransfer })
    return dataTransfer
  }

  test('clicking an item selects it; clicking another replaces the selection', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    expect(selected()).toEqual([rowFor('Hora')])
    fireEvent.click(rowFor('Kolo'))
    expect(selected()).toEqual([rowFor('Kolo')])
  })

  test('cmd-click adds and removes; shift-click selects the range', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { metaKey: true })
    expect(selected()).toEqual([rowFor('Hora'), rowFor('Kolo')])
    fireEvent.click(rowFor('Hora'), { metaKey: true })
    expect(selected()).toEqual([rowFor('Kolo')])
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { shiftKey: true })
    expect(selected()).toHaveLength(3)
  })

  test('clicking a row’s ⋯ button does not change the selection', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    expect(selected()).toEqual([rowFor('Hora')])
  })

  test('choosing an item in a row’s menu does not clear the selection', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add to favorites' }))
    expect(selected()).toEqual([rowFor('Hora')])
  })

  test('clicking empty space in the list clears the selection', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(screen.getByRole('listbox', { name: 'Program items' }))
    expect(names()).toEqual([])
  })

  test('double-clicking an item does nothing', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.doubleClick(rowFor('Hora'))
    expect(fake.calls.filter((c) => String(c[0]).startsWith('player:'))).toEqual(
      fake.calls.filter((c) => c[0] === 'player:getState')
    )
  })

  test('dragging a selected item carries the whole selection in program order', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Kolo'))
    fireEvent.click(rowFor('Hora'), { metaKey: true })
    const transfer = dragStart(rowFor('Kolo'))
    expect(transfer.setData).toHaveBeenCalledWith(ITEMS_MIME, '[1,3]')
    expect(transfer.setDragImage).toHaveBeenCalledTimes(1)
  })

  test('dragging an unselected item selects only it and carries only it', async () => {
    setup()
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    const transfer = dragStart(rowFor('Kolo'))
    expect(transfer.setData).toHaveBeenCalledWith(ITEMS_MIME, '[3]')
    expect(transfer.setDragImage).not.toHaveBeenCalled()
    expect(selected()).toEqual([rowFor('Kolo')])
  })

  test('dropping a selection moves its items together in their original order', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByText('STOP / TEACHING'), items([3, 1]))
    await waitFor(() => expect(fake.callsTo('programs:reorder')).toEqual([[5, [1, 3, 2]]]))
  })

  test('dropping a selection onto one of its own items changes nothing', async () => {
    const fake = setup()
    await screen.findByText('Hora')
    fireEvent.drop(rowFor('Kolo'), items([1, 3]))
    expect(fake.callsTo('programs:reorder')).toEqual([])
  })

  test('the selection survives a reorder', async () => {
    let order = [1, 2, 3]
    const fake = setup({
      programsGet: () => ({
        ...program,
        items: order.map((id) => program.items.find((i) => i.id === id)!)
      })
    })
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { metaKey: true })
    order = [2, 1, 3]
    fake.emit('programs:changed', null)
    await waitFor(() => expect(rows()[0].textContent).toContain('STOP'))
    expect(selected().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hora'),
      expect.stringContaining('Kolo')
    ])
  })
})
