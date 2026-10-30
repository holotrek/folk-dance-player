import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import PlayedList from '@renderer/program/PlayedList'
import ProgramList from '@renderer/program/ProgramList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, track } from './fixtures'

// Removed songs (sync spec §6.4) in the program and in Previously played: greyed, "removed".
describe('removed songs in program history', () => {
  test('a removed program item is greyed and labeled removed', async () => {
    const fake = createFakeApi({
      'player:getState': playerState({ programId: 5 }),
      'programs:get': {
        id: 5,
        name: 'Tonight',
        items: [item(1, track(101, 'Hora')), item(2, track(103, 'Sârba', { isRemoved: true }))]
      }
    })
    renderWithLibrary(<ProgramList />, fake.api)
    await screen.findByText('Sârba')
    const rows = within(screen.getByRole('listbox', { name: 'Program items' })).getAllByRole(
      'option'
    )
    expect(rows[1]).toHaveAttribute('data-removed', 'true')
    expect(within(rows[1]).getByText('removed')).toBeInTheDocument()
    expect(rows[0]).not.toHaveAttribute('data-removed')
  })

  test('a removed played song is labeled removed and cannot be replayed', async () => {
    const fake = createFakeApi({
      'player:getState': playerState(),
      'programs:played': [
        {
          logId: 4,
          kind: 'program',
          playedAt: '2026-10-14T20:15:00Z',
          track: track(103, 'Sârba', { isRemoved: true })
        }
      ],
      'player:replay': undefined
    })
    renderWithLibrary(<PlayedList />, fake.api)
    await userEvent.dblClick(await screen.findByText('Sârba'))
    expect(fake.callsTo('player:replay')).toEqual([])
    const row = screen.getAllByRole('listitem')[0]
    expect(row).toHaveAttribute('data-removed', 'true')
    expect(within(row).getByText('removed')).toBeInTheDocument()
  })
})
