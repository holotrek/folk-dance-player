import { EventEmitter } from 'events'
import { describe, expect, test } from 'vitest'
import { guardNavigation } from '../../../src/main/navigation'

function fakeContents() {
  const emitter = new EventEmitter()
  let openHandler: (() => { action: 'deny' }) | null = null
  return {
    emitter,
    contents: {
      on: (event: 'will-navigate', listener: (e: { preventDefault(): void }) => void) => {
        emitter.on(event, listener)
      },
      setWindowOpenHandler: (handler: () => { action: 'deny' }) => {
        openHandler = handler
      }
    },
    open: () => openHandler?.()
  }
}

describe('guardNavigation', () => {
  test('blocks the window from navigating away, e.g. to a dropped file', () => {
    const fake = fakeContents()
    guardNavigation(fake.contents)
    let prevented = false
    fake.emitter.emit('will-navigate', { preventDefault: () => (prevented = true) })
    expect(prevented).toBe(true)
  })

  test('refuses to open new windows', () => {
    const fake = fakeContents()
    guardNavigation(fake.contents)
    expect(fake.open()).toEqual({ action: 'deny' })
  })
})
