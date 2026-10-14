import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import { FILES_MIME } from '@renderer/library/drag'
import HoldingPanel from '@renderer/program/HoldingPanel'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState } from './fixtures'

const held = { fileId: 101, songId: 1, label: 'Hora', country: 'Romania' } as LibraryRow
const kolo = { fileId: 102, songId: 2, label: 'Kolo', country: 'Serbia' } as LibraryRow

const files = (ids: number[]) => ({
  dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify(ids) }
})
const rowFor = (text: string) => screen.getByText(text).closest('[role=listitem]') as HTMLElement

function setup() {
  let rows: LibraryRow[] = [held, kolo]
  const fake = createFakeApi({
    'player:getState': playerState(),
    'library:list': (query: LibraryQuery) => (query.filter.kind === 'holding' ? rows : []),
    'library:setHolding': undefined,
    'player:preview': undefined
  })
  renderWithLibrary(<HoldingPanel />, fake.api)
  return { fake, setRows: (r: LibraryRow[]) => (rows = r) }
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

  test('songs dropped on it are held; ✕ releases one', async () => {
    const { fake } = setup()
    await screen.findByText('Hora')
    fireEvent.drop(screen.getByRole('region', { name: 'Holding' }), {
      dataTransfer: { types: [FILES_MIME], getData: () => JSON.stringify([202, 203]) }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Release Hora' }))
    await waitFor(() =>
      expect(fake.callsTo('library:setHolding')).toEqual([
        [[202, 203], true, null],
        [[101], false]
      ])
    )
  })

  test('songs dropped on a held song go before it; anywhere else in the panel, at the end', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    fireEvent.drop(rowFor('Kolo'), files([202]))
    fireEvent.drop(screen.getByRole('heading', { name: 'Holding' }), files([203]))
    await waitFor(() =>
      expect(fake.callsTo('library:setHolding')).toEqual([
        [[202], true, 102],
        [[203], true, null]
      ])
    )
  })

  test('dragging a held song onto another moves it; onto itself, nothing happens', async () => {
    const { fake } = setup()
    await screen.findByText('Kolo')
    fireEvent.drop(rowFor('Hora'), files([102]))
    fireEvent.drop(rowFor('Kolo'), files([102]))
    await waitFor(() => expect(fake.callsTo('library:setHolding')).toEqual([[[102], true, 101]]))
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

  test('double-click previews a held song', async () => {
    const { fake } = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(fake.callsTo('player:preview')).toEqual([[101]])
  })
})
