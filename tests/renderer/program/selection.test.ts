import { describe, expect, test } from 'vitest'
import {
  EMPTY_SELECTION,
  pruneSelection,
  selectedInOrder,
  selectIn,
  type Selection
} from '@renderer/program/selection'

const order = [1, 2, 3, 4, 5]
const sel = (ids: number[], anchor: number | null): Selection => ({ ids, anchor })

describe('program selection', () => {
  test('a plain click selects only that item and anchors on it', () => {
    expect(selectIn(sel([1, 2], 1), order, 3, 'single')).toEqual({ ids: [3], anchor: 3 })
  })

  test('shift-click selects the range from the anchor, either direction, keeping the anchor', () => {
    expect(selectIn(sel([2], 2), order, 4, 'range')).toEqual({ ids: [2, 3, 4], anchor: 2 })
    expect(selectIn(sel([4], 4), order, 2, 'range')).toEqual({ ids: [2, 3, 4], anchor: 4 })
  })

  test('shift-click with no anchor, or one that left the list, selects just the clicked item', () => {
    expect(selectIn(EMPTY_SELECTION, order, 3, 'range')).toEqual({ ids: [3], anchor: 3 })
    expect(selectIn(sel([9], 9), order, 3, 'range')).toEqual({ ids: [3], anchor: 3 })
  })

  test('cmd/ctrl-click adds an item, or removes it when already selected, and moves the anchor', () => {
    expect(selectIn(sel([1], 1), order, 4, 'toggle')).toEqual({ ids: [1, 4], anchor: 4 })
    expect(selectIn(sel([1, 4], 4), order, 1, 'toggle')).toEqual({ ids: [4], anchor: 1 })
  })

  test('pruning drops items that left the list, and the anchor with them', () => {
    expect(pruneSelection(sel([1, 9, 3], 9), [1, 2, 3])).toEqual({ ids: [1, 3], anchor: null })
    const same = sel([1, 3], 3)
    expect(pruneSelection(same, [1, 2, 3])).toBe(same)
  })

  test('selectedInOrder returns the selected ids in program order', () => {
    expect(selectedInOrder(sel([4, 1], 1), order)).toEqual([1, 4])
  })
})
