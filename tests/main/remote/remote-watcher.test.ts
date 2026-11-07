import { describe, expect, test } from 'vitest'
import type { RemoteStatus } from '../../../src/shared/program'
import { RemoteWatcher } from '../../../src/main/remote/remote-watcher'

const KEYS = ['MediaPlayPause', 'MediaNextTrack']

function setup(trustedAtStart: boolean) {
  const state = { trusted: trustedAtStart, throws: false }
  const changes: RemoteStatus[] = []
  const watcher = new RemoteWatcher({
    isTrusted: () => {
      if (state.throws) throw new Error('boom')
      return state.trusted
    },
    registeredKeys: () => KEYS,
    trustedAtStart,
    onChange: (status) => changes.push(status)
  })
  return { state, changes, watcher }
}

describe('RemoteWatcher', () => {
  test('reports the current trust and the registered keys', () => {
    const { watcher } = setup(false)
    expect(watcher.status()).toEqual({ trusted: false, keys: KEYS, restartNeeded: false })
  })

  test('says nothing while trust is unchanged', () => {
    const { watcher, changes } = setup(false)
    watcher.check()
    watcher.check()
    expect(changes).toEqual([])
  })

  test('a grant after launch needs a restart, and is announced once', () => {
    const { watcher, changes, state } = setup(false)
    state.trusted = true
    expect(watcher.check()).toEqual({ trusted: true, keys: KEYS, restartNeeded: true })
    watcher.check()
    watcher.check()
    expect(changes).toEqual([{ trusted: true, keys: KEYS, restartNeeded: true }])
  })

  test('trusted from launch never needs a restart', () => {
    const { watcher, changes, state } = setup(true)
    expect(watcher.check().restartNeeded).toBe(false)
    state.trusted = false
    expect(watcher.check()).toEqual({ trusted: false, keys: KEYS, restartNeeded: false })
    expect(changes).toHaveLength(1)
  })

  test('taking the permission away again clears the restart', () => {
    const { watcher, state } = setup(false)
    state.trusted = true
    watcher.check()
    state.trusted = false
    expect(watcher.check().restartNeeded).toBe(false)
  })

  test('a permission granted again is announced again', () => {
    const { watcher, changes, state } = setup(false)
    state.trusted = true
    watcher.check()
    state.trusted = false
    watcher.check()
    state.trusted = true
    watcher.check()
    expect(changes.filter((c) => c.restartNeeded)).toHaveLength(2)
  })

  test('a failing check is treated as unchanged and never throws', () => {
    const { watcher, changes, state } = setup(false)
    state.throws = true
    expect(() => watcher.check()).not.toThrow()
    expect(watcher.status().trusted).toBe(false)
    expect(changes).toEqual([])
  })
})
