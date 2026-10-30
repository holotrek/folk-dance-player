import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { SongDetail } from '@shared/library'
import type { HoldingItem } from '@shared/program'
import { FILES_MIME, HOLDING_MIME, ITEM_SONGS_MIME, ITEMS_MIME } from '@renderer/library/drag'
import HoldingPanel from '@renderer/program/HoldingPanel'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, track } from './fixtures'

const hora: HoldingItem = { id: 1, ...track(101, 'Hora', { country: 'Romania' }) }
const kolo: HoldingItem = {
  id: 2,
  ...track(102, 'Kolo', { country: 'Serbia', hasNotesPdf: true, danceCount: 2, isFavorite: true })
}
const sarba: HoldingItem = { id: 3, ...track(103, 'Sârba') }

const files = (ids: number[]) => ({
  dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify(ids) }
})
const heldRows = (ids: number[]) => ({
  dataTransfer: { types: [HOLDING_MIME], getData: () => JSON.stringify(ids) }
})
const programItems = (ids: number[], songs = true) => ({
  dataTransfer: {
    types: songs ? [ITEMS_MIME, ITEM_SONGS_MIME] : [ITEMS_MIME],
    getData: () => JSON.stringify(ids)
  }
})
const rows = () =>
  within(screen.getByRole('listbox', { name: 'Held songs' })).queryAllByRole('option')
const rowFor = (text: string) => screen.getByText(text).closest('[role=option]') as HTMLElement
const selected = () => rows().filter((r) => r.getAttribute('aria-selected') === 'true')

function setup(
  options: { rows?: HoldingItem[]; extra?: Record<string, unknown>; onShowMusic?: () => void } = {}
) {
  let current = options.rows ?? [hora, kolo]
  const fake = createFakeApi({
    'player:getState': playerState({ programId: 5 }),
    'library:holding': () => current,
    'library:holdSongs': [7],
    'library:moveHolding': undefined,
    'library:releaseHolding': undefined,
    'library:setHoldingDance': undefined,
    'programs:moveToHolding': undefined,
    'library:setFavorite': undefined,
    'library:openNotesPdf': undefined,
    'player:preview': undefined,
    'library:song': {
      dances: [
        { danceId: 12, label: 'Kolo' },
        { danceId: 77, label: 'Užičko Kolo ♪ Kolo' }
      ]
    } as unknown as SongDetail,
    ...options.extra
  })
  renderWithLibrary(<HoldingPanel />, fake.api, options.onShowMusic)
  return { fake, setRows: (r: HoldingItem[]) => (current = r) }
}

describe('holding panel', () => {
  test('lists held songs and refreshes when the library changes', async () => {
    const { fake, setRows } = setup()
    expect(await screen.findByText('Hora')).toBeInTheDocument()
    expect(screen.getByText('Romania')).toBeInTheDocument()
    setRows([])
    act(() => fake.emit('library:changed', null))
    expect(await screen.findByText('Drag songs here to keep them handy')).toBeInTheDocument()
  })

  test('shows the dance a song is held as, and the same song again under another dance', async () => {
    setup({
      rows: [
        { id: 1, ...track(101, 'Kolo', { label: 'Kolo' }) },
        { id: 2, ...track(101, 'Kolo', { label: 'Užičko Kolo ♪ Kolo', danceId: 77 }) }
      ]
    })
    expect(await screen.findByText('Užičko Kolo ♪ Kolo')).toBeInTheDocument()
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Kolo'),
      expect.stringContaining('Užičko Kolo ♪ Kolo')
    ])
  })

  test('a removed song is shown greyed with a badge', async () => {
    setup({ rows: [{ id: 1, ...track(101, 'Hora', { isRemoved: true }) }] })
    expect(await screen.findByText('removed')).toBeInTheDocument()
    expect(rowFor('Hora')).toHaveAttribute('data-removed', 'true')
  })

  test('songs dropped from the library are held before the row dropped on, or at the end', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    fireEvent.drop(rowFor('Kolo'), files([202]))
    fireEvent.drop(screen.getByRole('heading', { name: 'Holding' }), files([203]))
    await waitFor(() =>
      expect(fake.callsTo('library:holdSongs')).toEqual([
        [[202], 2],
        [[203], null]
      ])
    )
  })

  test('a song with several dances asks which one, and holds it as the answer', async () => {
    const { fake } = setup({
      extra: {
        'library:holdSongs': [7],
        'library:holding': [
          hora,
          kolo,
          { id: 7, ...track(104, 'Tune', { danceCount: 2, danceId: 12 }) }
        ]
      }
    })
    await screen.findByText('Kolo')
    fireEvent.drop(screen.getByRole('region', { name: 'Holding' }), files([104]))
    const dialog = await screen.findByRole('dialog', { name: 'Which dance?' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Užičko Kolo ♪ Kolo' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(fake.callsTo('library:setHoldingDance')).toEqual([[7, 77]]))
  })

  test('a dance that is already held is refused with a message', async () => {
    setup({
      extra: {
        'library:holding': [hora, { id: 7, ...track(104, 'Tune', { danceCount: 2, danceId: 12 }) }],
        'library:setHoldingDance': () => {
          throw new Error('That song is already held as that dance.')
        }
      }
    })
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Holding' }), files([104]))
    const dialog = await screen.findByRole('dialog', { name: 'Which dance?' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Užičko Kolo ♪ Kolo' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('That song is already held as that dance.')).toBeInTheDocument()
  })

  test('program items dropped on it move to Holding, before the row dropped on or at the end', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    fireEvent.drop(rowFor('Kolo'), programItems([31, 32]))
    fireEvent.drop(screen.getByRole('region', { name: 'Holding' }), programItems([33]))
    await waitFor(() =>
      expect(fake.callsTo('programs:moveToHolding')).toEqual([
        [5, [31, 32], 2],
        [5, [33], null]
      ])
    )
  })

  test('a drag of only STOP markers is not accepted', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    const region = screen.getByRole('region', { name: 'Holding' })
    expect(fireEvent.dragOver(region, programItems([31], false))).toBe(true) // not prevented
    expect(region.className).not.toMatch(/panelActive/)
    fireEvent.drop(region, programItems([31], false))
    expect(fake.callsTo('programs:moveToHolding')).toEqual([])
    expect(fireEvent.dragOver(region, programItems([31]))).toBe(false) // songs: accepted
  })

  test('dragging a held row onto another moves it; onto itself, nothing happens', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    fireEvent.drop(rowFor('Hora'), heldRows([2]))
    fireEvent.drop(rowFor('Kolo'), heldRows([2]))
    await waitFor(() => expect(fake.callsTo('library:moveHolding')).toEqual([[[2], 1]]))
  })

  test('while dragging, the panel is outlined, and a line shows where songs will land', async () => {
    setup()
    await screen.findByText('Kolo')
    const region = screen.getByRole('region', { name: 'Holding' })
    fireEvent.dragOver(region, files([202]))
    expect(region.className).toMatch(/panelActive/)
    fireEvent.dragOver(rowFor('Kolo'), files([202]))
    expect(rowFor('Kolo').className).toMatch(/dropBefore/)
    expect(region.className).not.toMatch(/panelActive/)
  })

  test('the star, on the left as in the library, adds a held song to favorites', async () => {
    const { fake } = setup()
    const star = await screen.findByRole('button', { name: 'Add Hora to favorites' })
    expect(rowFor('Hora').firstElementChild).toBe(star)
    await userEvent.click(star)
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101], true]])
  })

  test('double-click previews a held song', async () => {
    const { fake } = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(fake.callsTo('player:preview')).toEqual([[101]])
  })

  test('a held song’s menu (⋯ or right-click): Edit details, and favorites', async () => {
    const showMusic = vi.fn()
    const { fake } = setup({ onShowMusic: showMusic })
    await screen.findByText('Hora')
    await userEvent.pointer({ keys: '[MouseRight]', target: rowFor('Hora') })
    const menu = await screen.findByRole('menu', { name: 'Options for Hora' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Edit details' }))
    expect(showMusic).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      within(await screen.findByRole('menu', { name: 'Options for Kolo' })).getByRole('menuitem', {
        name: 'Remove from favorites'
      })
    )
    expect(fake.callsTo('library:setFavorite')).toEqual([[[102], false]])
  })

  test('a held song’s menu offers Open PDF only when its dance has one', async () => {
    const { fake } = setup()
    await screen.findByText('Hora')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Hora' }))
    expect(
      within(await screen.findByRole('menu', { name: 'Options for Hora' })).queryByRole(
        'menuitem',
        {
          name: 'Open PDF'
        }
      )
    ).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      within(await screen.findByRole('menu', { name: 'Options for Kolo' })).getByRole('menuitem', {
        name: 'Open PDF'
      })
    )
    expect(fake.callsTo('library:openNotesPdf')).toEqual([[2102]])
  })

  test('the menu changes the dance a song is held as', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    const menu = await screen.findByRole('menu', { name: 'Options for Kolo' })
    await userEvent.click(await within(menu).findByRole('menuitem', { name: 'Užičko Kolo ♪ Kolo' }))
    expect(fake.callsTo('library:setHoldingDance')).toEqual([[2, 77]])
  })

  test('✕ and the menu’s Release let the song go', async () => {
    const { fake } = setup()
    await screen.findByText('Hora')
    await userEvent.click(screen.getByRole('button', { name: 'Release Hora' }))
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    await userEvent.click(
      within(await screen.findByRole('menu', { name: 'Options for Kolo' })).getByRole('menuitem', {
        name: 'Release'
      })
    )
    expect(fake.callsTo('library:releaseHolding')).toEqual([[[1]], [[2]]])
  })
})

describe('holding panel selection', () => {
  const three = { rows: [hora, kolo, sarba] }
  const dragStart = (row: HTMLElement) => {
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(row, { dataTransfer })
    return dataTransfer
  }

  test('click selects, cmd-click toggles, shift-click selects a range, empty space clears', async () => {
    setup(three)
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    expect(selected()).toEqual([rowFor('Hora')])
    fireEvent.click(rowFor('Sârba'), { metaKey: true })
    expect(selected()).toEqual([rowFor('Hora'), rowFor('Sârba')])
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Sârba'), { shiftKey: true })
    expect(selected()).toHaveLength(3)
    fireEvent.click(screen.getByRole('listbox', { name: 'Held songs' }))
    expect(selected()).toEqual([])
  })

  test('the star, favorites, ✕ and Release act on every selected row; an unselected row acts alone', async () => {
    const { fake } = setup(three)
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Add Hora to favorites' }))
    await userEvent.click(screen.getByRole('button', { name: 'Release Hora' }))
    await userEvent.click(screen.getByRole('button', { name: 'Release Sârba' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101, 102], true]])
    expect(fake.callsTo('library:releaseHolding')).toEqual([[[1, 2]], [[3]]])
  })

  test('the menu offers both favorites choices for a mix; Edit details and the dance choice hide for several', async () => {
    const { fake } = setup(three)
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { metaKey: true })
    await userEvent.click(screen.getByRole('button', { name: 'Options for Kolo' }))
    const menu = await screen.findByRole('menu', { name: 'Options for Kolo' })
    expect(within(menu).getByRole('menuitem', { name: 'Add to favorites' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Edit details' })).toBeNull()
    expect(within(menu).queryByText('Dance')).toBeNull()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Remove from favorites' }))
    expect(fake.callsTo('library:setFavorite')).toEqual([[[101, 102], false]])
  })

  test('dragging a selected row carries the whole selection in panel order; an unselected one only itself', async () => {
    setup(three)
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Sârba'))
    fireEvent.click(rowFor('Hora'), { metaKey: true })
    const both = dragStart(rowFor('Sârba'))
    expect(both.setData).toHaveBeenCalledWith(HOLDING_MIME, '[1,3]')
    expect(both.setDragImage).toHaveBeenCalledTimes(1)
    const one = dragStart(rowFor('Kolo'))
    expect(one.setData).toHaveBeenCalledWith(HOLDING_MIME, '[2]')
    expect(selected()).toEqual([rowFor('Kolo')])
  })

  test('a row that leaves Holding leaves the selection', async () => {
    const { fake, setRows } = setup(three)
    await screen.findByText('Hora')
    fireEvent.click(rowFor('Hora'))
    fireEvent.click(rowFor('Kolo'), { metaKey: true })
    setRows([kolo, sarba])
    act(() => fake.emit('library:changed', null))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(selected()).toEqual([rowFor('Kolo')])
  })
})
