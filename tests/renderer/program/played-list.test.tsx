import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlayedEntry, PlayerState } from '@shared/program'
import PlayedList from '@renderer/program/PlayedList'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState, playing, track } from './fixtures'

const played: PlayedEntry[] = [
  { logId: 1, kind: 'program', playedAt: '2026-10-14T20:00:00Z', track: null },
  { logId: 2, kind: 'program', playedAt: '2026-10-14T20:05:00Z', track: track(101, 'Hora') },
  { logId: 3, kind: 'preview', playedAt: '2026-10-14T20:10:00Z', track: track(102, 'Kolo') }
]

function setup(
  options: { entries?: PlayedEntry[]; state?: PlayerState; playedCount?: number } = {}
) {
  const fake = createFakeApi({
    'player:getState': options.state ?? playerState(),
    'programs:played': options.entries ?? played,
    'programs:get': { id: 5, name: 'Set', items: [], playedCount: options.playedCount ?? 0 },
    'programs:clearPlayed': undefined,
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

  test('Clear calls programs:clearPlayed for the loaded program', async () => {
    const fake = setup()
    await screen.findByText('Kolo')
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(fake.callsTo('programs:clearPlayed')).toEqual([[5]])
  })

  test('Clear is shown but disabled when nothing is played, loaded or logged', async () => {
    setup({ entries: [] })
    await screen.findByText('Nothing played yet')
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  test('Clear is enabled for a song that is loaded, or for played items with an empty log', async () => {
    setup({ entries: [], state: playing(track(101, 'Hora')) })
    await screen.findByText('Nothing played yet')
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
  })

  test('Clear is enabled when items were played but the log is already cleared', async () => {
    setup({ entries: [], playedCount: 2 })
    await screen.findByText('Nothing played yet')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled())
  })
})
