import { describe, expect, test } from 'vitest'
import {
  MAX_PERCENT,
  nudgeWidth,
  percentFromPixels,
  resolveWidths,
  widthTrack
} from '@renderer/library/column-widths'

describe('resolveWidths', () => {
  test('keeps good widths of the list`s movable columns', () => {
    expect(resolveWidths({ country: 12, time: 5 }, 'music')).toEqual({ country: 12, time: 5 })
  })

  test('drops unknown, fixed and other-list keys and bad values', () => {
    const saved = {
      bogus: 10,
      dance: 30,
      menu: 5,
      difficulty: 8,
      country: -1,
      teacher: Number.NaN,
      artist: 12
    }
    expect(resolveWidths(saved, 'program')).toEqual({ artist: 12 })
  })

  test('caps a width at the maximum', () => {
    expect(resolveWidths({ country: 90 }, 'music')).toEqual({ country: MAX_PERCENT })
  })

  test('the empty map stays empty', () => {
    expect(resolveWidths({}, 'music')).toEqual({})
  })
})

describe('widthTrack', () => {
  test('is the percentage of the container, never under the minimum', () => {
    expect(widthTrack('country', 12.5)).toBe('max(60px, calc(100cqw * 12.5 / 100))')
  })
})

describe('percentFromPixels', () => {
  test('converts to a percentage of the table', () => {
    expect(percentFromPixels(200, 1000, 'country')).toBe(20)
  })

  test('is clamped between the minimum and the maximum', () => {
    expect(percentFromPixels(1, 1000, 'country')).toBe(6)
    expect(percentFromPixels(900, 1000, 'country')).toBe(MAX_PERCENT)
  })

  test('an unmeasurable table gives the maximum, never NaN', () => {
    expect(percentFromPixels(100, 0, 'country')).toBe(MAX_PERCENT)
  })
})

describe('nudgeWidth', () => {
  test('moves one point either way', () => {
    expect(nudgeWidth(10, 'country', 1000, 1)).toBe(11)
    expect(nudgeWidth(10, 'country', 1000, -1)).toBe(9)
  })

  test('stops at the minimum and the maximum', () => {
    expect(nudgeWidth(6, 'country', 1000, -1)).toBe(6)
    expect(nudgeWidth(40, 'country', 1000, 1)).toBe(40)
  })
})
