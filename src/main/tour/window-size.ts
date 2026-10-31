export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// How big the control window should be during a tour (tour spec §2.3): tall enough that every step's
// targets are on screen together (the Artist and Teacher fields, for one). The default window is
// 1280 × 800; the tour wants 1200 high.
export const TOUR_SIZE = { width: 1280, height: 1200 }

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high))

// The window's bounds for a tour on the screen area it is on: at least the tour size, never bigger
// than the screen, never smaller than it already is, and kept inside the screen. The minimum size
// is the same, so it can't be shrunk away while the tour runs.
export function tourWindowBounds(
  current: Rect,
  workArea: Rect
): { bounds: Rect; minSize: { width: number; height: number } } {
  const width = Math.min(workArea.width, Math.max(current.width, TOUR_SIZE.width))
  const height = Math.min(workArea.height, Math.max(current.height, TOUR_SIZE.height))
  return {
    bounds: {
      x: clamp(current.x, workArea.x, workArea.x + workArea.width - width),
      y: clamp(current.y, workArea.y, workArea.y + workArea.height - height),
      width,
      height
    },
    minSize: { width, height }
  }
}
