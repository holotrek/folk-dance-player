import { describe, expect, test } from 'vitest'
import { moveBefore } from '@renderer/library/reorder'

describe('moveBefore', () => {
  test('moves items before a target, keeping their relative order', () => {
    expect(moveBefore([1, 2, 3, 4, 5], [4, 2], 1)).toEqual([2, 4, 1, 3, 5])
  })
  test('moves items to the end when there is no target', () => {
    expect(moveBefore([1, 2, 3], [1], null)).toEqual([2, 3, 1])
  })
  test('dropping an item onto itself changes nothing', () => {
    expect(moveBefore([1, 2, 3], [2], 2)).toEqual([1, 2, 3])
  })
})
