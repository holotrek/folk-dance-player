import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IDLE_PLAYER_STATE, type ProgramSummary } from '@shared/program'
import Sidebar from '@renderer/components/Sidebar'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'

const programs: ProgramSummary[] = [
  { id: 1, name: 'Tue Oct 14', updatedAt: '2026-10-14T20:00:00Z', unplayedCount: 12 },
  { id: 2, name: 'Beginner night', updatedAt: '2026-10-07T20:00:00Z', unplayedCount: 1 }
]

afterEach(() => vi.useRealTimers())

function setup(extra = {}) {
  const fake = createFakeApi({
    'programs:list': (search: string) =>
      programs.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    'player:getState': { ...IDLE_PLAYER_STATE, programId: 1 },
    'programs:setCurrent': undefined,
    'programs:create': 3,
    'programs:rename': undefined,
    'programs:duplicate': 4,
    'programs:delete': undefined,
    ...extra
  })
  renderWithLibrary(<Sidebar />, fake.api)
  return fake
}

const group = () => screen.getByRole('group', { name: 'Programs' })

describe('Programs in the sidebar', () => {
  test('lists programs with what is left to play, marking the loaded one', async () => {
    setup()
    expect(await within(group()).findByText('Beginner night')).toBeInTheDocument()
    expect(within(group()).getByText('12 songs to play')).toBeInTheDocument()
    expect(within(group()).getByText('1 song to play')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(group()).getByText('Tue Oct 14').closest('[aria-current]')).toHaveAttribute(
        'aria-current',
        'page'
      )
    )
    expect(within(group()).getByText('Beginner night').closest('[aria-current]')).toBeNull()
  })

  test('clicking a program loads it', async () => {
    const fake = setup()
    await userEvent.click(await within(group()).findByText('Beginner night'))
    expect(fake.callsTo('programs:setCurrent')).toEqual([[2]])
  })

  test('while a song plays, loading another program asks first', async () => {
    const fake = setup({
      'player:getState': { ...IDLE_PLAYER_STATE, programId: 1, status: 'playing' }
    })
    await userEvent.click(await within(group()).findByText('Beginner night'))
    const confirm = await screen.findByRole('dialog', { name: 'Load another program?' })
    expect(confirm).toHaveTextContent('the next song will come from “Beginner night”')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(fake.callsTo('programs:setCurrent')).toEqual([])
    await userEvent.click(within(group()).getByText('Beginner night'))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Load another program?' })).getByRole(
        'button',
        { name: 'Load' }
      )
    )
    expect(fake.callsTo('programs:setCurrent')).toEqual([[2]])
  })

  test('the search box filters the list by name', async () => {
    setup()
    await within(group()).findByText('Beginner night')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search programs' }), 'begin')
    await waitFor(() => expect(within(group()).queryByText('Tue Oct 14')).toBeNull())
    expect(within(group()).getByText('Beginner night')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await within(group()).findByText('Tue Oct 14')).toBeInTheDocument()
  })

  test('+ asks for a name prefilled with today’s date, creates the program and loads it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const fake = setup()
    await userEvent.click(screen.getByRole('button', { name: 'New program' }))
    const dialog = await screen.findByRole('dialog', { name: 'New program' })
    expect(within(dialog).getByRole('textbox')).toHaveValue('Wed Oct 14')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(fake.callsTo('programs:create')).toEqual([['Wed Oct 14']])
    await waitFor(() => expect(fake.callsTo('programs:setCurrent')).toEqual([[3]]))
  })

  test('right-click offers rename, duplicate and delete', async () => {
    const fake = setup()
    const entry = await within(group()).findByText('Beginner night')
    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(fake.callsTo('programs:duplicate')).toEqual([[2]])

    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const rename = await screen.findByRole('dialog', { name: 'Rename program' })
    await userEvent.clear(within(rename).getByRole('textbox'))
    await userEvent.type(within(rename).getByRole('textbox'), 'Beginners')
    await userEvent.click(within(rename).getByRole('button', { name: 'Save' }))
    expect(fake.callsTo('programs:rename')).toEqual([[2, 'Beginners']])

    await userEvent.pointer({ keys: '[MouseRight]', target: entry })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete program?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(fake.callsTo('programs:delete')).toEqual([[2]])
  })
})
