import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import TourOverlay from '@renderer/tour/TourOverlay'
import type { TourStep } from '@renderer/tour/steps'
import { testTheme } from '../test-theme'

const base = {
  page: null,
  part: 'basic',
  title: 'Pick a song',
  body: 'Click one of your songs.'
} as const
const doStep: TourStep = { ...base, id: 's1', kind: 'do', target: 'song', done: () => false }
const explain: TourStep = { ...base, id: 's2', kind: 'explain', target: 'song', title: 'Import' }
const dragStep: TourStep = {
  ...base,
  id: 's3',
  kind: 'do',
  target: ['song', 'drop'],
  done: () => false
}
const choice: TourStep = {
  ...base,
  id: 's4',
  kind: 'choice',
  title: 'What now?',
  body: 'Learn more or start?',
  choices: [
    { id: 'learn-more', label: 'Learn more' },
    { id: 'start-now', label: 'Start now!' }
  ]
}
const intro: TourStep = {
  ...base,
  id: 's5',
  kind: 'intro',
  part: 'advanced',
  title: 'Advanced',
  body: 'First.\n\nSecond.'
}

afterEach(() => document.body.querySelectorAll('[data-tour]').forEach((e) => e.remove()))

function target(id: string, rect = { left: 100, top: 80, width: 200, height: 40 }) {
  const el = document.createElement('div')
  el.dataset.tour = id
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top
    }) as DOMRect
  document.body.appendChild(el)
  return el
}

function setup(step: TourStep, extra: Partial<React.ComponentProps<typeof TourOverlay>> = {}) {
  const handlers = {
    onNext: vi.fn(),
    onChoose: vi.fn(),
    onLeave: vi.fn(),
    onGoThere: vi.fn()
  }
  render(
    <MantineProvider theme={testTheme}>
      <TourOverlay step={step} index={3} total={14} {...handlers} {...extra} />
    </MantineProvider>
  )
  return handlers
}

describe('the tour overlay', () => {
  test('shows the popover at the target, with the step count, and dims the rest around a hole', async () => {
    target('song')
    setup(doStep)
    expect(await screen.findByText('Pick a song')).toBeInTheDocument()
    expect(screen.getByText('Click one of your songs.')).toBeInTheDocument()
    expect(screen.getByText('Step 4 of 14')).toBeInTheDocument()
    const blocker = await screen.findByTestId('tour-blocker')
    expect(blocker.dataset.holes).toBe('94,74,212,52') // the target's box with a 6 px margin
  })

  test('a drag step lights up both ends', async () => {
    target('song')
    target('drop', { left: 400, top: 300, width: 100, height: 100 })
    setup(dragStep)
    const blocker = await screen.findByTestId('tour-blocker')
    expect(blocker.dataset.holes?.split(';')).toHaveLength(2)
  })

  test('a do step has no Next; an explain step does', async () => {
    target('song')
    const { onNext } = setup(explain)
    expect(screen.queryByRole('button', { name: 'Next' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalled()
  })

  test('a do step has no Next button', async () => {
    target('song')
    setup(doStep)
    await screen.findByText('Pick a song')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  test('the blocker eats clicks: nothing under it hears them', async () => {
    const under = vi.fn()
    target('song').addEventListener('click', under)
    setup(doStep)
    fireEvent.click(await screen.findByTestId('tour-blocker'))
    expect(under).not.toHaveBeenCalled()
  })

  test('Leave the tour asks first; Keep going cancels, Leave leaves', async () => {
    target('song')
    const { onLeave } = setup(doStep)
    await userEvent.click(await screen.findByRole('button', { name: 'Leave the tour' }))
    const ask = await screen.findByRole('dialog', { name: 'Leave the tour?' })
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep going' }))
    expect(onLeave).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Leave the tour' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Leave the tour?' })).getByRole('button', {
        name: 'Leave'
      })
    )
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  test('Escape asks to leave', async () => {
    target('song')
    setup(doStep)
    await screen.findByText('Pick a song')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(await screen.findByRole('dialog', { name: 'Leave the tour?' })).toBeInTheDocument()
  })

  test('a missing target offers Take me there', async () => {
    const { onGoThere } = setup(doStep)
    await userEvent.click(await screen.findByRole('button', { name: 'Take me there' }))
    expect(onGoThere).toHaveBeenCalled()
    expect(screen.getByTestId('tour-blocker').dataset.holes).toBe('')
  })

  test('a choice step shows its buttons', async () => {
    const { onChoose } = setup(choice)
    await userEvent.click(await screen.findByRole('button', { name: 'Start now!' }))
    expect(onChoose).toHaveBeenCalledWith('start-now')
    await userEvent.click(screen.getByRole('button', { name: 'Learn more' }))
    expect(onChoose).toHaveBeenCalledWith('learn-more')
  })

  test('an intro step is a card with one button, Let’s go', async () => {
    const { onNext } = setup(intro)
    expect(await screen.findByText('First.')).toBeInTheDocument()
    expect(screen.getByText('Second.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Let’s go' }))
    expect(onNext).toHaveBeenCalled()
  })
})
