import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IDLE_PLAYER_STATE, type ProgramSummary } from '@shared/program'
import Sidebar from '@renderer/components/Sidebar'
import NewProgramPrompt from '@renderer/program/NewProgramPrompt'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'

const programs: ProgramSummary[] = [
  {
    id: 1,
    name: 'Tue Oct 14',
    updatedAt: '2026-10-14T20:00:00Z',
    unplayedCount: 12,
    unplayedDurationMs: 2_400_000,
    unplayedGaps: 11
  },
  {
    id: 2,
    name: 'Beginner night',
    updatedAt: '2026-10-07T20:00:00Z',
    unplayedCount: 1,
    unplayedDurationMs: 185_000,
    unplayedGaps: 0
  }
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

  test('under the song count, each program shows its total play time, with the auto-continue gaps', async () => {
    setup()
    expect(await within(group()).findByText('Total play time: 40:55')).toBeInTheDocument() // 40:00 + 11 × 5 s
    expect(within(group()).getByText('Total play time: 3:05')).toBeInTheDocument()
  })

  test('the total leaves the gaps out when auto-continue is off', async () => {
    setup({
      'player:getState': {
        ...IDLE_PLAYER_STATE,
        programId: 1,
        autoContinue: { enabled: false, seconds: 5 }
      }
    })
    expect(await within(group()).findByText('Total play time: 40:00')).toBeInTheDocument()
  })

  test('a program with nothing left to play shows no total', async () => {
    setup({
      'programs:list': [
        {
          id: 3,
          name: 'Done',
          updatedAt: '2026-10-14T20:00:00Z',
          unplayedCount: 0,
          unplayedDurationMs: 0,
          unplayedGaps: 0
        }
      ]
    })
    expect(await within(group()).findByText('Done')).toBeInTheDocument()
    expect(within(group()).queryByText(/Total play time/)).toBeNull()
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

  test('NewProgramPrompt, shared with the Program page, names, creates and loads a program', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    const onClose = vi.fn()
    const fake = createFakeApi({
      'programs:create': (name: string) => {
        if (name === 'Taken') throw new Error('That name is taken.')
        return 3
      },
      'programs:setCurrent': undefined,
      'player:getState': { ...IDLE_PLAYER_STATE, programId: null },
      'programs:list': []
    })
    renderWithLibrary(<NewProgramPrompt opened onClose={onClose} />, fake.api)
    const dialog = await screen.findByRole('dialog', { name: 'New program' })
    const name = within(dialog).getByRole('textbox')
    expect(name).toHaveValue('Wed Oct 14')
    await userEvent.clear(name)
    await userEvent.type(name, 'Taken')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText('That name is taken.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.clear(name)
    await userEvent.type(name, 'Beginner night')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(fake.callsTo('programs:setCurrent')).toEqual([[3]]))
    expect(fake.callsTo('programs:create').at(-1)).toEqual(['Beginner night'])
    expect(onClose).toHaveBeenCalled()
  })
})
