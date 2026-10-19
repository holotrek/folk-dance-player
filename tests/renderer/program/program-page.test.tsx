import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { LibraryQuery, LibraryRow } from '@shared/library'
import ProgramPage from '@renderer/pages/ProgramPage'
import MusicPage from '@renderer/pages/MusicPage'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { playerState } from './fixtures'

const row = {
  fileId: 201,
  songId: 1201,
  title: 'Sârba',
  label: 'Sârba',
  country: 'Romania',
  teacher: 'Sonia Dion',
  danceCount: 1,
  durationMs: 120_000
} as LibraryRow

function setup(page: 'program' | 'music') {
  const fake = createFakeApi({
    'player:getState': playerState({ programId: null }),
    // The library list has the song; holding is empty.
    'library:list': (query: LibraryQuery) => (query.filter.kind === 'holding' ? [] : [row]),
    'library:stats': { fileCount: 1 },
    'player:preview': undefined,
    'library:song': null // the Music page opens the song editor for the selected song
  })
  renderWithLibrary(page === 'program' ? <ProgramPage /> : <MusicPage />, fake.api)
  return fake
}

describe('Program page', () => {
  test('has previously played, the program, holding and the library (the player is in App)', async () => {
    setup('program')
    expect(await screen.findByRole('region', { name: 'Program' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    for (const name of ['Previously played', 'Program', 'Holding', 'Library']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  test('its library list shows the song with its dance, country and teacher', async () => {
    setup('program')
    const library = screen.getByRole('region', { name: 'Library' })
    expect(await within(library).findByText('Sârba')).toBeInTheDocument()
    expect(
      within(library)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['', 'Dance / Song ▲', 'Country', 'Teacher', 'Time', '']) // the last: each row's ⋯ menu
    expect(within(library).getByText('Sonia Dion')).toBeInTheDocument()
  })

  test('double-clicking a library song previews it', async () => {
    const fake = setup('program')
    const library = screen.getByRole('region', { name: 'Library' })
    await userEvent.dblClick(await within(library).findByText('Sârba'))
    expect(fake.callsTo('player:preview')).toEqual([[201]])
  })

  test('double-click previews on the Music page too', async () => {
    const fake = setup('music')
    await userEvent.dblClick(await screen.findByText('Sârba'))
    expect(fake.callsTo('player:preview')).toEqual([[201]])
  })
})
