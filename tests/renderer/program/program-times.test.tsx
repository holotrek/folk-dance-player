import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlayerState, ProgramItem } from '@shared/program'
import { formatClock } from '@shared/program-time'
import { useProgramStore } from '@renderer/program/ProgramProvider'
import ProgramTimes from '@renderer/program/ProgramTimes'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { item, playerState, playing, stop, track } from './fixtures'

// Three 3-minute songs; auto-continue is on with 5 seconds (the default).
const hora = track(101, 'Hora')
const kolo = track(102, 'Kolo')
const tfilati = track(103, 'Tfilati')
const START = new Date(2026, 9, 30, 20, 0, 0)

let store: ReturnType<typeof useProgramStore>
function Probe(): React.JSX.Element {
  store = useProgramStore()
  return <ProgramTimes />
}

afterEach(() => vi.useRealTimers())

async function setup(items: ProgramItem[], player: PlayerState) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(START)
  const fake = createFakeApi({
    'player:getState': player,
    'programs:get': { id: 5, name: 'Set', items },
    'programs:list': [],
    'programs:played': []
  })
  renderWithLibrary(<Probe />, fake.api)
  await settle()
}
// The fake API answers in microtasks; timers are faked, so wait for those without them.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })
const later = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })
const endingText = (afterMs: number) => `Ending on ${formatClock(START.getTime() + afterMs)}`

describe('program times on the Program page', () => {
  test('shows the total and the time the program will end', async () => {
    await setup([item(1, hora), item(2, kolo), item(3, tfilati)], playerState())
    // 3 × 3:00 and 2 gaps of 5 s
    expect(screen.getByText('Total play time: 9:10')).toBeInTheDocument()
    expect(screen.getByText(endingText(550_000))).toBeInTheDocument()
  })

  test('while paused the ending time moves later as the clock runs', async () => {
    await setup([item(2, kolo), item(3, tfilati)], playing(hora, { status: 'paused' }))
    act(() => store.getState().setPosition(60_000)) // 2:00 of Hora is left
    // 2:00 + Kolo and Tfilati (6:00) + 2 gaps of 5 s
    expect(screen.getByText(endingText(120_000 + 370_000))).toBeInTheDocument()
    await later(3 * 60_000)
    expect(screen.getByText(endingText(120_000 + 370_000 + 3 * 60_000))).toBeInTheDocument()
  })

  test('while playing it stays steady as the position advances', async () => {
    await setup([item(2, kolo), item(3, tfilati)], playing(hora))
    act(() => store.getState().setPosition(60_000))
    const before = screen.getByText(/^Ending on/).textContent
    await later(60_000)
    act(() => store.getState().setPosition(120_000))
    expect(screen.getByText(/^Ending on/).textContent).toBe(before)
  })

  test('says “if no pauses” when the program has a STOP', async () => {
    await setup([item(1, hora), stop(2), item(3, kolo)], playerState())
    expect(screen.getByText(/^Ending on .* if no pauses$/)).toBeInTheDocument()
  })

  test('has no “if no pauses” without a STOP', async () => {
    await setup([item(1, hora), item(2, kolo)], playerState())
    expect(screen.queryByText(/if no pauses/)).toBeNull()
  })

  test('shows nothing when nothing is left to play', async () => {
    await setup([], playerState())
    expect(screen.queryByText(/Total play time/)).toBeNull()
    expect(screen.queryByText(/Ending on/)).toBeNull()
  })

  test('shows nothing with no program loaded', async () => {
    await setup([], playerState({ programId: null }))
    expect(screen.queryByText(/Total play time|Ending on/)).toBeNull()
  })
})
