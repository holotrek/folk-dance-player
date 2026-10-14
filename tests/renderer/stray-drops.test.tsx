import { createEvent, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { preventStrayDrops } from '@renderer/stray-drops'

let stop: () => void = () => undefined
afterEach(() => stop())

describe('preventStrayDrops', () => {
  test.each(['dragOver', 'drop'] as const)(
    'stops the browser opening a file dropped outside the drop zone (%s)',
    (type) => {
      stop = preventStrayDrops()
      const event = createEvent[type](document.body)
      fireEvent(document.body, event)
      expect(event.defaultPrevented).toBe(true)
    }
  )

  test('can be removed', () => {
    preventStrayDrops()()
    const event = createEvent.drop(document.body)
    fireEvent(document.body, event)
    expect(event.defaultPrevented).toBe(false)
  })
})
