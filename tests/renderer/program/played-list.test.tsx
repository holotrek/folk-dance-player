import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import type { PlayedEntry } from '@shared/program'
import PlayedList from '@renderer/program/PlayedList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, track } from './fixtures'

const played: PlayedEntry[] = [
  { logId: 1, kind: 'program', playedAt: '2026-10-14T20:00:00Z', track: null },
  { logId: 2, kind: 'program', playedAt: '2026-10-14T20:05:00Z', track: track(101, 'Hora') },
  { logId: 3, kind: 'preview', playedAt: '2026-10-14T20:10:00Z', track: track(102, 'Kolo') }
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

afterEach(() => {
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
})

describe('previously played', () => {
  test('the list starts scrolled to its end, where the newest play is', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 900 })
    setup()
    await screen.findByText('Kolo')
    expect(screen.getByRole('list', { name: 'Played songs' }).scrollTop).toBe(900)
  })

  test('lists the program’s plays oldest first, the newest last, marking previews', async () => {
    setup()
    await screen.findByText('Kolo')
    const rows = within(screen.getByRole('list', { name: 'Played songs' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Removed from the library'),
      expect.stringContaining('Hora'),
      expect.stringMatching(/Kolo.*Preview/)
    ])
  })

  test('double-click replays an entry', async () => {
    const fake = setup()
    await userEvent.dblClick(await screen.findByText('Hora'))
    await userEvent.dblClick(screen.getByText('Removed from the library'))
    expect(fake.callsTo('player:replay')).toEqual([[2]])
  })
})
