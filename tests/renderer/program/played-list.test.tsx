import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { PlayedEntry } from '@shared/program'
import PlayedList from '@renderer/program/PlayedList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, track } from './fixtures'

const played: PlayedEntry[] = [
  { logId: 3, kind: 'preview', playedAt: '2026-10-14T20:10:00Z', track: track(102, 'Kolo') },
  { logId: 2, kind: 'program', playedAt: '2026-10-14T20:05:00Z', track: track(101, 'Hora') },
  { logId: 1, kind: 'program', playedAt: '2026-10-14T20:00:00Z', track: null }
]

function setup() {
  const fake = createFakeApi({
    'player:getState': playerState(),
    'programs:played': played,
    'player:replay': undefined
  })
  renderWithLibrary(<PlayedList />, fake.api)
  return fake
}

describe('previously played', () => {
  test('lists the program’s plays newest first, marking previews', async () => {
    setup()
    await screen.findByText('Kolo')
    const rows = within(screen.getByRole('list', { name: 'Played songs' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Kolo.*Preview/),
      expect.stringContaining('Hora'),
      expect.stringContaining('Removed from the library')
    ])
  })

  test('double-click replays an entry', async () => {
    const fake = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    await userEvent.dblClick(screen.getByText('Removed from the library'))
    expect(fake.callsTo('player:replay')).toEqual([[2]])
  })
})
