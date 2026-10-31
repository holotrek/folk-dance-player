import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { TourPart, TourState } from '@shared/tour'
import type { TourStep } from '@renderer/tour/steps'
import { useLibraryStore } from '@renderer/library/LibraryProvider'
import { TourProvider, useTour } from '@renderer/tour/TourProvider'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'

const base = { page: null, part: 'basic', body: 'Do the thing.' } as const
const STEPS: TourStep[] = [
  {
    ...base,
    id: 'a',
    kind: 'do',
    title: 'First',
    target: 'first',
    done: async (ctx) => (await ctx.api.invoke('programs:list', '')).length > 0
  },
  { ...base, id: 'b', kind: 'explain', title: 'Second', target: 'second', page: 'music' },
  {
    ...base,
    id: 'c',
    kind: 'choice',
    title: 'What now?',
    choices: [
      { id: 'learn-more', label: 'Learn more' },
      { id: 'start-now', label: 'Start now!' }
    ]
  }
]
const ADVANCED: TourStep[] = [
  { ...base, id: 'x', part: 'advanced', kind: 'intro', title: 'Advanced intro', body: 'More.' },
  {
    ...base,
    id: 'y',
    part: 'advanced',
    kind: 'choice',
    title: 'The end',
    choices: [{ id: 'done', label: 'Done' }]
  }
]

afterEach(() => document.body.querySelectorAll('[data-tour]').forEach((e) => e.remove()))

function Probe(): React.JSX.Element {
  const { touring } = useTour()
  return <output aria-label="touring">{touring ? 'yes' : 'no'}</output>
}

function setup(
  options: { state?: TourState; offer?: TourPart | null; extra?: Record<string, unknown> } = {}
) {
  let programs: unknown[] = []
  const setPage = vi.fn()
  const fake = createFakeApi({
    'tour:state': options.state ?? { part: null, landOn: null },
    'tour:offer': options.offer ?? null,
    'tour:start': undefined,
    'tour:finish': undefined,
    'tour:hide': undefined,
    'tour:leave': undefined,
    'programs:list': () => programs,
    ...options.extra
  })
  for (const id of ['first', 'second']) {
    const el = document.createElement('div')
    el.dataset.tour = id
    document.body.appendChild(el)
  }
  renderWithLibrary(
    <TourProvider
      page="program"
      setPage={setPage}
      stepsFor={() => ({ steps: STEPS, advanced: ADVANCED })}
    >
      <Probe />
    </TourProvider>,
    fake.api
  )
  return { fake, setPage, addProgram: () => (programs = [{ id: 1 }]) }
}

describe('the tour provider while touring', () => {
  test('shows the first step and says it is touring', async () => {
    setup({ state: { part: 'basic', landOn: null } })
    expect(await screen.findByText('First')).toBeInTheDocument()
    expect(screen.getByLabelText('touring')).toHaveTextContent('yes')
  })

  test('a do step moves on when the real result appears', async () => {
    const { fake, addProgram } = setup({ state: { part: 'basic', landOn: null } })
    await screen.findByText('First')
    addProgram()
    act(() => fake.emit('programs:changed', null))
    expect(await screen.findByText('Second')).toBeInTheDocument()
  })

  test('a step on another page switches to it', async () => {
    const { fake, setPage, addProgram } = setup({ state: { part: 'basic', landOn: null } })
    await screen.findByText('First')
    addProgram()
    act(() => fake.emit('programs:changed', null))
    await screen.findByText('Second')
    expect(setPage).toHaveBeenCalledWith('music')
  })

  test('Start now! finishes Basic and then leaves', async () => {
    const { fake, addProgram } = setup({ state: { part: 'basic', landOn: null } })
    await screen.findByText('First')
    addProgram()
    act(() => fake.emit('programs:changed', null))
    await userEvent.click(await screen.findByRole('button', { name: 'Next step' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Start now!' }))
    await waitFor(() => expect(fake.callsTo('tour:leave')).toEqual([[]]))
    expect(fake.callsTo('tour:finish')).toEqual([['basic']])
  })

  test('Learn more finishes Basic and continues into the Advanced intro, without leaving', async () => {
    const { fake, addProgram } = setup({ state: { part: 'basic', landOn: null } })
    await screen.findByText('First')
    addProgram()
    act(() => fake.emit('programs:changed', null))
    await userEvent.click(await screen.findByRole('button', { name: 'Next step' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Learn more' }))
    expect(await screen.findByText('Advanced intro')).toBeInTheDocument()
    expect(fake.callsTo('tour:finish')).toEqual([['basic']])
    expect(fake.callsTo('tour:leave')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Let’s go' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    await waitFor(() => expect(fake.callsTo('tour:leave')).toEqual([[]]))
    expect(fake.callsTo('tour:finish')).toEqual([['basic'], ['advanced']])
  })

  test('Leave the tour leaves without finishing anything', async () => {
    const { fake } = setup({ state: { part: 'basic', landOn: null } })
    await userEvent.click(await screen.findByRole('button', { name: 'Leave the tour' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Leave the tour?' })).getByRole('button', {
        name: 'Leave'
      })
    )
    await waitFor(() => expect(fake.callsTo('tour:leave')).toEqual([[]]))
    expect(fake.callsTo('tour:finish')).toEqual([])
  })

  test('an Advanced tour starts after its intro', async () => {
    setup({ state: { part: 'advanced', landOn: null } })
    expect(await screen.findByText('The end')).toBeInTheDocument()
    expect(screen.queryByText('Advanced intro')).toBeNull()
  })
})

describe('the tour provider and the stores', () => {
  test('a change that only shows up in a store re-checks the step (typing in the search box)', async () => {
    let store: ReturnType<typeof useLibraryStore> | null = null
    function Grab(): null {
      store = useLibraryStore()
      return null
    }
    const searchSteps: TourStep[] = [
      {
        ...base,
        id: 'q',
        kind: 'do',
        title: 'Type a search',
        target: 'first',
        done: (ctx) => ctx.library.getState().search !== ''
      },
      { ...base, id: 'r', kind: 'explain', title: 'Searched', target: 'first' }
    ]
    const fake = createFakeApi({
      'tour:state': { part: 'basic', landOn: null },
      'tour:offer': null,
      'library:list': []
    })
    const el = document.createElement('div')
    el.dataset.tour = 'first'
    document.body.appendChild(el)
    renderWithLibrary(
      <TourProvider
        page="program"
        setPage={() => undefined}
        stepsFor={() => ({ steps: searchSteps, advanced: [] })}
      >
        <Grab />
      </TourProvider>,
      fake.api
    )
    await screen.findByText('Type a search')
    await new Promise((resolve) => setTimeout(resolve, 200)) // the first check has come and gone
    await act(async () => {
      await store!.getState().setSearch('hora')
    })
    expect(await screen.findByText('Searched')).toBeInTheDocument()
  })
})

describe('the tour provider and the screen', () => {
  test('a step that waits for something to leave the screen is re-checked on its own', async () => {
    const gone: TourStep[] = [
      {
        ...base,
        id: 'g',
        kind: 'do',
        title: 'Close it',
        target: 'first',
        done: () => document.querySelector('[data-test-open]') === null
      },
      { ...base, id: 'h', kind: 'explain', title: 'Closed', target: 'first' }
    ]
    const fake = createFakeApi({
      'tour:state': { part: 'basic', landOn: null },
      'tour:offer': null
    })
    const el = document.createElement('div')
    el.dataset.tour = 'first'
    document.body.appendChild(el)
    const open = document.createElement('div')
    open.dataset.testOpen = ''
    document.body.appendChild(open)
    renderWithLibrary(
      <TourProvider
        page="program"
        setPage={() => undefined}
        stepsFor={() => ({ steps: gone, advanced: [] })}
      >
        <span />
      </TourProvider>,
      fake.api
    )
    await screen.findByText('Close it')
    await new Promise((resolve) => setTimeout(resolve, 200))
    open.remove() // no event, no store change: it just fades out
    expect(await screen.findByText('Closed', undefined, { timeout: 2000 })).toBeInTheDocument()
  })
})

describe('the tour provider when not touring', () => {
  test('says it is not touring, and shows nothing', async () => {
    setup()
    expect(await screen.findByLabelText('touring')).toHaveTextContent('no')
    expect(screen.queryByTestId('tour-blocker')).toBeNull()
  })

  test('after a tour it lands on the Music tab', async () => {
    const { setPage } = setup({ state: { part: null, landOn: 'music' } })
    await waitFor(() => expect(setPage).toHaveBeenCalledWith('music'))
  })

  test('the launch offer shows the Basic intro when one is due', async () => {
    setup({ offer: 'basic' })
    expect(
      await screen.findByRole('dialog', { name: 'Welcome to Folk Dance Player' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start the tour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Don’t show this again' })).toBeInTheDocument()
  })

  test('the offer is for Advanced when Basic is done', async () => {
    setup({ offer: 'advanced' })
    expect(
      await screen.findByRole('dialog', { name: 'Ready for the advanced features?' })
    ).toBeInTheDocument()
  })

  test('nothing is offered when nothing is due', async () => {
    setup({ offer: null })
    await screen.findByLabelText('touring')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Not now closes the offer and changes nothing', async () => {
    const { fake } = setup({ offer: 'basic' })
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fake.callsTo('tour:hide')).toEqual([])
    expect(fake.callsTo('tour:start')).toEqual([])
    expect(fake.callsTo('tour:finish')).toEqual([])
  })

  test('Don’t show this again hides that part', async () => {
    const { fake } = setup({ offer: 'basic' })
    await userEvent.click(await screen.findByRole('button', { name: 'Don’t show this again' }))
    await waitFor(() => expect(fake.callsTo('tour:hide')).toEqual([['basic']]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('Start the tour starts that part', async () => {
    const { fake } = setup({ offer: 'advanced' })
    await userEvent.click(await screen.findByRole('button', { name: 'Start the tour' }))
    await waitFor(() => expect(fake.callsTo('tour:start')).toEqual([['advanced']]))
  })

  test('Help shows the intro, with Start the tour and Not now but no Don’t show this again', async () => {
    const { fake } = setup()
    await screen.findByLabelText('touring')
    act(() => fake.emit('tour:intro', 'basic'))
    expect(
      await screen.findByRole('dialog', { name: 'Welcome to Folk Dance Player' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start the tour' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Don’t show this again' })).toBeNull()
  })

  test('a failing offer lookup does not break the app', async () => {
    setup({
      extra: {
        'tour:offer': () => {
          throw new Error('boom')
        }
      }
    })
    expect(await screen.findByLabelText('touring')).toHaveTextContent('no')
  })
})

// A page is just state in the real App; this keeps the hook honest about what it is given.
void useState
