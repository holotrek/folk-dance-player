import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { createTourMode } from '../../../src/main/tour/tour-mode'
import type { PracticeContext } from '../../../src/main/tour/practice-context'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'fdp-tour-mode-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

// Handlers tagged by who answers, so a test can tell the real set from the practice one.
const handlersOf = (who: string): InvokeHandlers =>
  ({
    'library:stats': () => who,
    'tour:offer': () => `${who}-offer`,
    'tour:state': () => ({ part: null, landOn: null }),
    'tour:start': () => undefined
  }) as unknown as InvokeHandlers

function setup() {
  const contexts: { dir: string; disposed: boolean }[] = []
  const calls = { stopped: 0, reloaded: [] as number[] }
  const mode = createTourMode({
    realHandlers: () => handlersOf('real'),
    tmpDir: tmp,
    makeContext: (dir) => {
      const entry = { dir, disposed: false }
      contexts.push(entry)
      mkdirSync(dir, { recursive: true })
      return {
        handlers: handlersOf('practice'),
        mediaPath: (id: number) => (id === 1 ? join(dir, 'a.wav') : null),
        dispose: () => {
          entry.disposed = true
          rmSync(dir, { recursive: true, force: true })
        }
      } as PracticeContext
    },
    sendToWindow: () => () => undefined,
    stopRealPlayer: () => void calls.stopped++,
    reload: (id) => void calls.reloaded.push(id)
  })
  return { mode, contexts, calls }
}

const stats = (mode: ReturnType<typeof createTourMode>, sender: number) =>
  mode.handlersFor(sender)['library:stats']()

describe('tour mode', () => {
  test('start stops the real player, builds a context and reloads the window', () => {
    const { mode, contexts, calls } = setup()
    mode.start(7, 'basic')
    expect(calls.stopped).toBe(1)
    expect(contexts).toHaveLength(1)
    expect(contexts[0].dir.startsWith(join(tmp, 'fdp-tour-'))).toBe(true)
    expect(calls.reloaded).toEqual([7])
    expect(mode.active()).toBe(true)
    expect(mode.touringWindowId()).toBe(7)
  })

  test('the touring window gets the practice handlers, every other window the real ones', async () => {
    const { mode } = setup()
    mode.start(7, 'basic')
    expect(await stats(mode, 7)).toBe('practice')
    expect(await stats(mode, 8)).toBe('real')
  })

  test('the tour channels are always the real ones', async () => {
    const { mode } = setup()
    mode.start(7, 'basic')
    expect(await mode.handlersFor(7)['tour:offer']()).toBe('real-offer')
  })

  test('state reports the part for the touring window only, and the landing once after leaving', async () => {
    const { mode } = setup()
    expect(await mode.handlersFor(7)['tour:state']()).toEqual({ part: null, landOn: null })
    mode.start(7, 'advanced')
    expect(await mode.handlersFor(7)['tour:state']()).toEqual({ part: 'advanced', landOn: null })
    expect(await mode.handlersFor(8)['tour:state']()).toEqual({ part: null, landOn: null })
    mode.leave()
    expect(await mode.handlersFor(8)['tour:state']()).toEqual({ part: null, landOn: null })
    expect(await mode.handlersFor(7)['tour:state']()).toEqual({ part: null, landOn: 'music' })
    expect(await mode.handlersFor(7)['tour:state']()).toEqual({ part: null, landOn: null })
  })

  test('leave disposes the context and reloads the window', () => {
    const { mode, contexts, calls } = setup()
    mode.start(7, 'basic')
    mode.leave()
    expect(contexts[0].disposed).toBe(true)
    expect(existsSync(contexts[0].dir)).toBe(false)
    expect(calls.reloaded).toEqual([7, 7])
    expect(mode.active()).toBe(false)
  })

  test('leaving when there is no tour does nothing', () => {
    const { mode, calls } = setup()
    mode.leave()
    expect(calls.reloaded).toEqual([])
  })

  test('starting a tour while one is active replaces it, and disposes the old context', () => {
    const { mode, contexts } = setup()
    mode.start(7, 'basic')
    mode.start(7, 'advanced')
    expect(contexts).toHaveLength(2)
    expect(contexts[0].disposed).toBe(true)
    expect(contexts[1].disposed).toBe(false)
  })

  test('media resolves in the practice context while a tour is active, and says nothing otherwise', () => {
    const { mode } = setup()
    expect(mode.mediaPath(1)).toBeUndefined()
    mode.start(7, 'basic')
    expect(mode.mediaPath(1)?.endsWith('a.wav')).toBe(true)
    expect(mode.mediaPath(2)).toBeNull()
    mode.leave()
    expect(mode.mediaPath(1)).toBeUndefined()
  })

  test('sweepStale removes old practice folders and leaves everything else', () => {
    const { mode } = setup()
    const stale = join(tmp, 'fdp-tour-old')
    const other = join(tmp, 'something-else')
    mkdirSync(stale)
    mkdirSync(other)
    utimesSync(stale, new Date(2020, 1, 1), new Date(2020, 1, 1))
    mode.sweepStale()
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(other)).toBe(true)
  })

  test('sweepStale never removes the folder of the tour that is running', () => {
    const { mode, contexts } = setup()
    mode.start(7, 'basic')
    mode.sweepStale()
    expect(existsSync(contexts[0].dir)).toBe(true)
  })
})

vi.useRealTimers()
