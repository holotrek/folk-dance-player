import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ConnectionWatcher } from '../../../src/main/canva/connection-watcher'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('calls back once each time the connection comes back, never while it stays up or down', () => {
  let online = false
  const reconnected = vi.fn()
  const watcher = new ConnectionWatcher({ isOnline: () => online, onReconnect: reconnected })
  watcher.start()
  vi.advanceTimersByTime(60_000)
  expect(reconnected).not.toHaveBeenCalled()
  online = true
  vi.advanceTimersByTime(15_000)
  expect(reconnected).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(60_000)
  expect(reconnected).toHaveBeenCalledTimes(1)
  online = false
  vi.advanceTimersByTime(15_000)
  online = true
  vi.advanceTimersByTime(15_000)
  expect(reconnected).toHaveBeenCalledTimes(2)
  watcher.stop()
  online = false
  vi.advanceTimersByTime(15_000)
  online = true
  vi.advanceTimersByTime(15_000)
  expect(reconnected).toHaveBeenCalledTimes(2)
})

test('online from the start is not a reconnection', () => {
  const reconnected = vi.fn()
  const watcher = new ConnectionWatcher({ isOnline: () => true, onReconnect: reconnected })
  watcher.start()
  vi.advanceTimersByTime(60_000)
  expect(reconnected).not.toHaveBeenCalled()
  watcher.stop()
})
