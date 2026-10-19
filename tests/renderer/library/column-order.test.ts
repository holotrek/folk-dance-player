import { describe, expect, test } from 'vitest'
import {
  MOVABLE,
  moveColumn,
  nudgeColumn,
  resolveOrder
} from '../../../src/renderer/src/library/column-order'

const D = MOVABLE.program // country, choreographer, teacher, artist, time

describe('resolveOrder', () => {
  test('an empty saved order is the default order', () => {
    expect(resolveOrder([], D)).toEqual(D)
  })

  test('drops unknown and duplicate keys', () => {
    // Kept: time, country. Then each missing default key goes right after its predecessor.
    expect(resolveOrder(['time', 'x', 'time', 'country'], D)).toEqual([
      'time',
      'country',
      'choreographer',
      'teacher',
      'artist'
    ])
  })

  test('adds a column a later release introduced at its default place', () => {
    expect(resolveOrder(['time', 'artist', 'country', 'choreographer'], D)).toEqual([
      'time',
      'artist',
      'country',
      'choreographer',
      'teacher'
    ])
  })

  test('a missing first column goes to the start', () => {
    expect(resolveOrder(['artist', 'time'], D)).toEqual([
      'country',
      'choreographer',
      'teacher',
      'artist',
      'time'
    ])
  })

  test('a fixed key in the saved list is ignored', () => {
    expect(resolveOrder(['dance', 'menu', 'artist'], D)).toEqual([
      'country',
      'choreographer',
      'teacher',
      'artist',
      'time'
    ])
  })
})

describe('moveColumn', () => {
  test('moves a column before another', () => {
    expect(moveColumn(D, 'artist', 'country')).toEqual([
      'artist',
      'country',
      'choreographer',
      'teacher',
      'time'
    ])
  })

  test('null moves it to the end', () => {
    expect(moveColumn(D, 'country', null)).toEqual([
      'choreographer',
      'teacher',
      'artist',
      'time',
      'country'
    ])
  })

  test('onto itself, or an unknown column, changes nothing', () => {
    expect(moveColumn(D, 'artist', 'artist')).toEqual(D)
    expect(moveColumn(D, 'nope', 'country')).toEqual(D)
  })
})

describe('nudgeColumn', () => {
  test('moves one place, and stays put at either end', () => {
    expect(nudgeColumn(D, 'teacher', 1)).toEqual([
      'country',
      'choreographer',
      'artist',
      'teacher',
      'time'
    ])
    expect(nudgeColumn(D, 'teacher', -1)).toEqual([
      'country',
      'teacher',
      'choreographer',
      'artist',
      'time'
    ])
    expect(nudgeColumn(D, 'country', -1)).toEqual(D)
    expect(nudgeColumn(D, 'time', 1)).toEqual(D)
  })
})
