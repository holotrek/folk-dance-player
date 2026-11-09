import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createWindowStateSaver,
  restoreBounds,
  type DisplayArea,
  type StateWindow
} from '../../../src/main/window-state'

const MIN = { width: 1000, height: 640 }
const primary: DisplayArea = {
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
  primary: true
}
const right: DisplayArea = {
  workArea: { x: 1920, y: 0, width: 1600, height: 900 },
  primary: false
}
const saved = (x: number, y: number, width = 1200, height = 800, maximized = false) => ({
  x,
  y,
  width,
  height,
  maximized
})

describe('restoreBounds', () => {
  test('no saved state gives no bounds', () => {
    expect(restoreBounds(null, [primary], MIN)).toEqual({ bounds: null, maximized: false })
  })

  test('keeps bounds that fit a display', () => {
    const r = restoreBounds(saved(100, 100), [primary], MIN)
    expect(r.bounds).toEqual({ x: 100, y: 100, width: 1200, height: 800 })
  })

  test('keeps bounds with 100 x 50 of the title strip visible', () => {
    const r = restoreBounds(saved(-1100, 100), [primary], MIN)
    expect(r.bounds).toEqual({ x: -1100, y: 100, width: 1200, height: 800 })
  })

  test('recenters when only a sliver of the title strip is visible', () => {
    const r = restoreBounds(saved(-1150, 100), [primary], MIN)
    expect(r.bounds).toEqual({ x: 360, y: 152, width: 1200, height: 800 })
  })

  test('recenters when the title strip is below the display', () => {
    const r = restoreBounds(saved(100, 1060), [primary], MIN)
    expect(r.bounds!.y).toBe(152)
  })

  test('a display that no longer exists: centered on the primary', () => {
    const r = restoreBounds(saved(5000, 300), [primary], MIN)
    expect(r.bounds).toEqual({ x: 360, y: 152, width: 1200, height: 800 })
  })

  test('keeps bounds on a second display, including negative coordinates', () => {
    const left: DisplayArea = {
      workArea: { x: -1280, y: 0, width: 1280, height: 800 },
      primary: false
    }
    expect(restoreBounds(saved(-1200, 50, 1000, 700), [primary, left], MIN).bounds).toEqual({
      x: -1200,
      y: 50,
      width: 1000,
      height: 700
    })
  })

  test('clamps a window larger than the display', () => {
    const r = restoreBounds(saved(0, 25, 3000, 2000), [primary], MIN)
    expect(r.bounds).toEqual({ x: 0, y: 25, width: 1920, height: 1055 })
  })

  test('raises a window smaller than the minimum', () => {
    const r = restoreBounds(saved(100, 100, 400, 300), [primary], MIN)
    expect(r.bounds).toEqual({ x: 100, y: 100, width: 1000, height: 640 })
  })

  test('the minimum wins on a display smaller than it', () => {
    const small: DisplayArea = {
      workArea: { x: 0, y: 0, width: 800, height: 600 },
      primary: true
    }
    const r = restoreBounds(saved(5000, 5000), [small], MIN)
    expect(r.bounds).toEqual({ x: -100, y: -20, width: 1000, height: 640 })
  })

  test('straddling two displays is kept when the title strip is visible', () => {
    const r = restoreBounds(saved(1000, 100, 1200, 800), [primary, right], MIN)
    expect(r.bounds).toEqual({ x: 1000, y: 100, width: 1200, height: 800 })
  })

  test('an unfit window goes to the display with the most overlap', () => {
    // The title strip is above the right display, but most of the body overlaps it.
    const r = restoreBounds(saved(2000, -740, 1200, 800), [primary, right], MIN)
    expect(r.bounds!.x).toBeGreaterThanOrEqual(1920)
  })

  test('passes maximized through and still repairs bounds', () => {
    const r = restoreBounds(saved(9000, 9000, 1200, 800, true), [primary], MIN)
    expect(r.maximized).toBe(true)
    expect(r.bounds).toEqual({ x: 360, y: 152, width: 1200, height: 800 })
  })
})

function fakeWindow() {
  const handlers = new Map<string, () => void>()
  const win = {
    normal: { x: 10, y: 20, width: 1100, height: 700 },
    maximized: false,
    fullScreen: false,
    destroyed: false,
    getNormalBounds() {
      return { ...win.normal }
    },
    isMaximized: () => win.maximized,
    isFullScreen: () => win.fullScreen,
    isDestroyed: () => win.destroyed,
    on(event: string, cb: () => void) {
      handlers.set(event, cb)
    },
    emit: (event: string) => handlers.get(event)?.()
  }
  return win satisfies StateWindow & Record<string, unknown>
}

describe('createWindowStateSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('debounces a burst of resizes into one save of the latest bounds', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.emit('resized')
    vi.advanceTimersByTime(300)
    win.normal.width = 1300
    win.emit('resized')
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ x: 10, y: 20, width: 1300, height: 700, maximized: false })
  })

  test('a later move saves again', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.emit('resized')
    vi.advanceTimersByTime(500)
    win.normal.x = 50
    win.emit('moved')
    vi.advanceTimersByTime(500)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ x: 50 }))
  })

  test('maximize saves maximized with the normal bounds', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.maximized = true
    win.emit('maximize')
    vi.advanceTimersByTime(500)
    expect(save).toHaveBeenCalledWith({ x: 10, y: 20, width: 1100, height: 700, maximized: true })
    win.maximized = false
    win.emit('unmaximize')
    vi.advanceTimersByTime(500)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ maximized: false }))
  })

  test('close saves at once and cancels the pending save', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.emit('resized')
    win.emit('close')
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  test('saves nothing once the window is destroyed', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.emit('resized')
    win.destroyed = true
    vi.advanceTimersByTime(500)
    expect(save).not.toHaveBeenCalled()
  })

  test('saves nothing in full screen', () => {
    const win = fakeWindow()
    const save = vi.fn()
    createWindowStateSaver({ window: win, save })
    win.fullScreen = true
    win.emit('resized')
    vi.advanceTimersByTime(500)
    win.emit('close')
    expect(save).not.toHaveBeenCalled()
  })

  test('a throwing save is reported and does not escape', () => {
    const win = fakeWindow()
    const onError = vi.fn()
    createWindowStateSaver({
      window: win,
      save: () => {
        throw new Error('disk full')
      },
      onError
    })
    win.emit('close')
    expect(onError).toHaveBeenCalledOnce()
  })
})
