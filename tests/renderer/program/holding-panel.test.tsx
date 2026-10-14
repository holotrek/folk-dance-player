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

function setup() {
  let rows: LibraryRow[] = [held]
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
        [[202, 203], true],
        [[101], false]
      ])
    )
  })

  test('double-click previews a held song', async () => {
    const { fake } = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    expect(fake.callsTo('player:preview')).toEqual([[101]])
  })
})
