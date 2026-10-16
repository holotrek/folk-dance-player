import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProjectorStatus } from '@shared/projector'
import { ActivityWatcher } from '../../../src/main/projector/activity'

let cursor = { x: 0, y: 0 }
let playing = true
let settings = { enabled: true, seconds: 10 }
let status: ProjectorStatus
let calls: string[]
let watcher: ActivityWatcher
let systemIdle = 0 // seconds since any input on the Mac

const closed: ProjectorStatus = {
  enabled: false,
  open: false,
  mode: null,
  display: null,
  notice: null
}

beforeEach(() => {
  vi.useFakeTimers()
  cursor = { x: 0, y: 0 }
  playing = true
  settings = { enabled: true, seconds: 10 }
  status = closed
  calls = []
  systemIdle = Infinity
  watcher = new ActivityWatcher({
    systemIdleSeconds: () => systemIdle,
    cursor: () => cursor,
    playing: () => playing,
    autoFullscreen: () => settings,
    projector: {
      status: () => status,
      showOnLaptop: () => {
        calls.push('show')
        status = { ...closed, open: true, mode: 'laptop' }
      },
      dismiss: () => {
        calls.push('dismiss')
        status = closed
      }
    }
  })
  watcher.start()
})

afterEach(() => {
  watcher.stop()
  vi.useRealTimers()
})

describe('laptop-mode auto-fullscreen (spec §7.3)', () => {
  test('after the idle time while music plays, the view covers the laptop', () => {
    vi.advanceTimersByTime(9_000)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1_500)
    expect(calls).toEqual(['show'])
  })

  test('any key or mouse movement restarts the idle time', () => {
    vi.advanceTimersByTime(8_000)
    watcher.keyInput('a')
    vi.advanceTimersByTime(8_000)
    cursor = { x: 5, y: 5 }
    vi.advanceTimersByTime(8_000)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(3_000)
    expect(calls).toEqual(['show'])
  })

  test('scrolling, clicking or typing elsewhere (no pointer movement) counts as input', () => {
    systemIdle = 2 // the Mac saw input 2 s ago, though the cursor didn't move
    vi.advanceTimersByTime(20_000)
    expect(calls).toEqual([])
    systemIdle = Infinity
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['show'])
  })

  test('not while nothing plays, when turned off, or when the projector is already showing', () => {
    playing = false
    vi.advanceTimersByTime(20_000)
    playing = true
    settings = { enabled: false, seconds: 10 }
    vi.advanceTimersByTime(20_000)
    settings = { enabled: true, seconds: 10 }
    status = { enabled: true, open: true, mode: 'projector', display: 'Epson', notice: null }
    vi.advanceTimersByTime(20_000)
    expect(calls).toEqual([])
  })

  test('mouse movement or Esc closes it, after a 1 s grace', () => {
    vi.advanceTimersByTime(10_500)
    expect(calls).toEqual(['show'])
    cursor = { x: 1, y: 1 } // the mouse jiggles right after it opens: ignored
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['show'])
    vi.advanceTimersByTime(1_000)
    cursor = { x: 2, y: 2 }
    vi.advanceTimersByTime(300)
    expect(calls).toEqual(['show', 'dismiss'])
    vi.advanceTimersByTime(11_000)
    expect(calls).toEqual(['show', 'dismiss', 'show'])
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    expect(calls).toEqual(['show', 'dismiss', 'show', 'dismiss'])
  })

  test('Esc closes laptop mode at once: the grace after opening is for the mouse only', () => {
    status = {
      enabled: true,
      open: true,
      mode: 'laptop',
      display: 'Built-in',
      notice: 'No separate display'
    }
    vi.advanceTimersByTime(300) // opened from the toggle a moment ago
    watcher.keyInput('Escape')
    expect(calls).toEqual(['dismiss'])
  })

  test('laptop mode from the toggle (one display) closes the same way; projector mode never does', () => {
    status = {
      enabled: true,
      open: true,
      mode: 'laptop',
      display: 'Built-in',
      notice: 'No separate display'
    }
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    expect(calls).toEqual(['dismiss'])
    status = { enabled: true, open: true, mode: 'projector', display: 'Epson', notice: null }
    vi.advanceTimersByTime(1_500)
    watcher.keyInput('Escape')
    cursor = { x: 9, y: 9 }
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['dismiss'])
  })
})
