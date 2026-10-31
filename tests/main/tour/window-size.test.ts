import { describe, expect, test } from 'vitest'
import { tourWindowBounds } from '../../../src/main/tour/window-size'

const area = (width: number, height: number, x = 0, y = 25) => ({ x, y, width, height })

describe('the window during a tour', () => {
  test('grows to 1200 high on a screen that has room, keeping its width', () => {
    const { bounds, minSize } = tourWindowBounds(
      { x: 100, y: 100, width: 1280, height: 800 },
      area(2560, 1415)
    )
    expect(bounds).toEqual({ x: 100, y: 100, width: 1280, height: 1200 })
    expect(minSize).toEqual({ width: 1280, height: 1200 }) // it cannot be made smaller meanwhile
  })

  test('is moved up if growing would push it off the bottom of the screen', () => {
    const { bounds } = tourWindowBounds(
      { x: 100, y: 500, width: 1280, height: 800 },
      area(2560, 1415)
    )
    expect(bounds.height).toBe(1200)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(25 + 1415)
    expect(bounds.y).toBeGreaterThanOrEqual(25)
  })

  test('takes the whole height of a shorter screen instead of running off it', () => {
    const { bounds, minSize } = tourWindowBounds(
      { x: 50, y: 60, width: 1280, height: 800 },
      area(1440, 875)
    )
    expect(bounds).toEqual({ x: 50, y: 25, width: 1280, height: 875 })
    expect(minSize.height).toBe(875)
  })

  test('is also no wider than the screen', () => {
    const { bounds } = tourWindowBounds({ x: 0, y: 25, width: 1280, height: 800 }, area(1100, 700))
    expect(bounds.width).toBe(1100)
    expect(bounds.x).toBe(0)
  })

  test('a window that is already bigger keeps its size', () => {
    const { bounds } = tourWindowBounds(
      { x: 0, y: 25, width: 1700, height: 1300 },
      area(2560, 1415)
    )
    expect(bounds.width).toBe(1700)
    expect(bounds.height).toBe(1300)
  })

  test('stays on the screen it is on, to the right of the origin too', () => {
    const { bounds } = tourWindowBounds(
      { x: 2000, y: 100, width: 1280, height: 800 },
      area(2560, 1415, 1440)
    )
    expect(bounds.x).toBeGreaterThanOrEqual(1440)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440 + 2560)
  })
})
