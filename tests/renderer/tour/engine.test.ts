import { describe, expect, test, vi } from 'vitest'
import { createTourEngine } from '@renderer/tour/engine'
import type { StepContext, TourStep } from '@renderer/tour/steps'

// A flag the "do" steps wait for, standing in for the real stores.
function fakeContext(
  flags: Record<string, boolean> = {}
): StepContext & { flags: Record<string, boolean> } {
  return { flags } as unknown as StepContext & { flags: Record<string, boolean> }
}
const flagged = (key: string) => (ctx: StepContext) =>
  (ctx as unknown as { flags: Record<string, boolean> }).flags[key] === true

const base = { page: null, title: 't', body: 'b' } as const
const BASIC: TourStep[] = [
  { ...base, id: 'b1', part: 'basic', kind: 'do', target: 'x', done: flagged('one') },
  { ...base, id: 'b2', part: 'basic', kind: 'explain', target: 'y' },
  { ...base, id: 'b3', part: 'basic', kind: 'do', target: 'z', done: flagged('three') },
  {
    ...base,
    id: 'b4',
    part: 'basic',
    kind: 'choice',
    choices: [
      { id: 'learn-more', label: 'Learn more' },
      { id: 'start-now', label: 'Start now!' }
    ]
  }
]
const ADVANCED: TourStep[] = [
  { ...base, id: 'a1', part: 'advanced', kind: 'intro' },
  { ...base, id: 'a2', part: 'advanced', kind: 'explain', target: 'p' },
  { ...base, id: 'a3', part: 'advanced', kind: 'choice', choices: [{ id: 'done', label: 'Done' }] }
]

function setup(steps = BASIC) {
  const finished: string[] = []
  const ended = vi.fn()
  const engine = createTourEngine(steps, {
    advanced: ADVANCED,
    onFinishPart: (part) => void finished.push(part),
    onEnd: ended
  })
  return { engine, finished, ended }
}

describe('the tour engine', () => {
  test('starts on the first step and counts them', () => {
    const { engine } = setup()
    expect(engine.state()).toMatchObject({ index: 0, total: 4, step: { id: 'b1' } })
  })

  test('a do step advances only when its condition is true', async () => {
    const { engine } = setup()
    const ctx = fakeContext()
    await engine.evaluate(ctx)
    expect(engine.state().step.id).toBe('b1')
    ctx.flags.one = true
    await engine.evaluate(ctx)
    expect(engine.state().step.id).toBe('b2')
  })

  test('a step that is already done completes at once, and so do the ones after it', async () => {
    const { engine } = setup()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    // b1 is done, b2 (explain) waits for Next.
    expect(engine.state().step.id).toBe('b2')
    engine.next()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    expect(engine.state().step.id).toBe('b4') // b3 was already done too
  })

  test('explain steps advance only with next(), and do steps ignore next()', async () => {
    const { engine } = setup()
    engine.next()
    expect(engine.state().step.id).toBe('b1')
    await engine.evaluate(fakeContext({ one: true }))
    engine.next()
    expect(engine.state().step.id).toBe('b3')
  })

  test('learn-more finishes Basic and continues into the Advanced intro', async () => {
    const { engine, finished, ended } = setup()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    engine.next()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    engine.choose('learn-more')
    expect(finished).toEqual(['basic'])
    expect(ended).not.toHaveBeenCalled()
    expect(engine.state().step).toMatchObject({ id: 'a1', kind: 'intro' })
    engine.next()
    expect(engine.state().step.id).toBe('a2')
    engine.next()
    engine.choose('done')
    expect(finished).toEqual(['basic', 'advanced'])
    expect(ended).toHaveBeenCalledTimes(1)
  })

  test('start-now finishes Basic and ends the tour', async () => {
    const { engine, finished, ended } = setup()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    engine.next()
    await engine.evaluate(fakeContext({ one: true, three: true }))
    engine.choose('start-now')
    expect(finished).toEqual(['basic'])
    expect(ended).toHaveBeenCalledTimes(1)
  })

  test('choose does nothing on a step without that choice', () => {
    const { engine, ended } = setup()
    engine.choose('start-now')
    expect(ended).not.toHaveBeenCalled()
    expect(engine.state().step.id).toBe('b1')
  })

  test('subscribers hear every change, and can stop listening', async () => {
    const { engine } = setup()
    const heard = vi.fn()
    const stop = engine.subscribe(heard)
    await engine.evaluate(fakeContext({ one: true }))
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    engine.next()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  test('an Advanced-only tour starts after the intro and finishes only Advanced', async () => {
    const { engine, finished, ended } = setup(ADVANCED.slice(1))
    expect(engine.state().step.id).toBe('a2')
    engine.next()
    engine.choose('done')
    expect(finished).toEqual(['advanced'])
    expect(ended).toHaveBeenCalledTimes(1)
  })

  test('a condition that throws counts as not done', async () => {
    const steps: TourStep[] = [
      {
        ...base,
        id: 's',
        part: 'basic',
        kind: 'do',
        target: 'x',
        done: () => {
          throw new Error('boom')
        }
      }
    ]
    const { engine } = setup(steps)
    await engine.evaluate(fakeContext())
    expect(engine.state().step.id).toBe('s')
  })
})
