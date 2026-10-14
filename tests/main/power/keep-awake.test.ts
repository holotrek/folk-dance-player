import { describe, expect, test } from 'vitest'
import { KeepAwake } from '../../../src/main/power/keep-awake'

function setup() {
  const started = new Set<number>()
  let next = 1
  const calls: string[] = []
  const blocker = {
    start: (type: string) => {
      calls.push(`start ${type}`)
      started.add(next)
      return next++
    },
    stop: (id: number) => {
      calls.push(`stop ${id}`)
      started.delete(id)
    }
  }
  return { keep: new KeepAwake(blocker), calls, started }
}

describe('keeping the Mac awake during an event', () => {
  test('blocks display sleep while needed, once, and releases it after', () => {
    const { keep, calls, started } = setup()
    keep.update(true)
    keep.update(true)
    expect(calls).toEqual(['start prevent-display-sleep'])
    expect(started.size).toBe(1)
    keep.update(false)
    keep.update(false)
    expect(calls).toEqual(['start prevent-display-sleep', 'stop 1'])
    expect(started.size).toBe(0)
  })

  test('is needed while the projector shows, or music plays or counts down', () => {
    expect(KeepAwake.needed({ projectorOpen: true, status: 'idle' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'playing' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'countdown' })).toBe(true)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'paused' })).toBe(false)
    expect(KeepAwake.needed({ projectorOpen: false, status: 'idle' })).toBe(false)
  })
})
