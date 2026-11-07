// Remembering the control window's size, position and maximized state (1.0.0 spec §3.4). Pure
// logic over plain data and injected ports, so it is tested without Electron.
import type { WindowState } from '../shared/settings'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export interface Size {
  width: number
  height: number
}
export interface DisplayArea {
  workArea: Rect
  primary: boolean
}

// How much of the window's title strip must be on a display for the saved place to count as
// reachable: enough to see and drag it.
const MIN_VISIBLE_WIDTH = 100
const TITLE_STRIP_HEIGHT = 50

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

const area = (a: Rect, b: Rect): number => {
  const o = overlap(a, b)
  return o.width * o.height
}

// The bounds to open the window at (null: no saved state, use the defaults), and whether to
// maximize it. A place that no longer fits the displays keeps its size but moves to the middle of
// the display it overlapped most, else the primary one. The size never goes below `minimum`.
export function restoreBounds(
  saved: WindowState | null,
  displays: DisplayArea[],
  minimum: Size
): { bounds: Rect | null; maximized: boolean } {
  if (!saved || displays.length === 0) return { bounds: null, maximized: saved?.maximized ?? false }

  const fit = (work: Rect): Size => ({
    width: Math.max(minimum.width, Math.min(saved.width, work.width)),
    height: Math.max(minimum.height, Math.min(saved.height, work.height))
  })

  const strip: Rect = {
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: TITLE_STRIP_HEIGHT
  }
  const reachable = displays.find((d) => {
    const o = overlap(strip, d.workArea)
    return o.width >= MIN_VISIBLE_WIDTH && o.height >= TITLE_STRIP_HEIGHT
  })
  if (reachable) {
    return {
      bounds: { x: saved.x, y: saved.y, ...fit(reachable.workArea) },
      maximized: saved.maximized
    }
  }

  let best = displays.find((d) => d.primary) ?? displays[0]
  let bestArea = 0
  for (const d of displays) {
    const a = area(saved, d.workArea)
    if (a > bestArea) {
      best = d
      bestArea = a
    }
  }
  const work = best.workArea
  const size = fit(work)
  return {
    bounds: {
      x: Math.floor(work.x + (work.width - size.width) / 2),
      y: Math.floor(work.y + (work.height - size.height) / 2),
      ...size
    },
    maximized: saved.maximized
  }
}

// The part of a BrowserWindow the saver uses.
export interface StateWindow {
  getNormalBounds(): Rect
  isMaximized(): boolean
  isFullScreen(): boolean
  isDestroyed(): boolean
  on(event: 'resized' | 'moved' | 'maximize' | 'unmaximize' | 'close', callback: () => void): void
}

export const SAVE_DEBOUNCE_MS = 500

// Saves the window's normal bounds and maximized flag shortly after it changes, and at once when
// it closes. Never throws: a failed save is passed to `onError` and the window keeps working.
// Nothing is saved in full screen (it is not restored; the last state stays).
export function createWindowStateSaver(options: {
  window: StateWindow
  save: (state: WindowState) => void
  onError?: (err: unknown) => void
  debounceMs?: number
}): void {
  const { window: win, save, onError, debounceMs = SAVE_DEBOUNCE_MS } = options
  let timer: ReturnType<typeof setTimeout> | null = null

  const saveNow = (): void => {
    timer = null
    if (win.isDestroyed() || win.isFullScreen()) return
    try {
      save({ ...win.getNormalBounds(), maximized: win.isMaximized() })
    } catch (err) {
      onError?.(err)
    }
  }
  const later = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(saveNow, debounceMs)
  }

  for (const event of ['resized', 'moved', 'maximize', 'unmaximize'] as const) win.on(event, later)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    saveNow()
  })
}
