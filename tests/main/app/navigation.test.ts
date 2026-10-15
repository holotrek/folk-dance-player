import { EventEmitter } from 'events'
import { describe, expect, test } from 'vitest'
import { guardCanva, guardNavigation, isCanvaUrl } from '../../../src/main/navigation'

function fakeContents() {
  const emitter = new EventEmitter()
  let openHandler: (() => { action: 'deny' }) | null = null
  return {
    emitter,
    contents: {
      on: (
        event: 'will-navigate' | 'will-redirect',
        listener: (e: { preventDefault(): void; url: string }) => void
      ) => {
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

describe('the Canva views', () => {
  test('stay on canva.com over https', () => {
    expect(isCanvaUrl('https://www.canva.com/design/DAH/TOK/view#6')).toBe(true)
    expect(isCanvaUrl('https://canva.com/design/DAH/TOK/view')).toBe(true)
    expect(isCanvaUrl('https://static.canva.com/x.js')).toBe(true)
    expect(isCanvaUrl('http://www.canva.com/design/DAH/TOK/view')).toBe(false)
    expect(isCanvaUrl('https://canva.com.evil.example/')).toBe(false)
    expect(isCanvaUrl('https://evilcanva.com/')).toBe(false)
    expect(isCanvaUrl('not a url')).toBe(false)
  })

  test('may navigate within Canva only, and never open windows', () => {
    const fake = fakeContents()
    guardCanva(fake.contents)
    const navigate = (url: string) => {
      let prevented = false
      fake.emitter.emit('will-navigate', { url, preventDefault: () => (prevented = true) })
      return !prevented
    }
    expect(navigate('https://www.canva.com/design/DAH/TOK/view#7')).toBe(true)
    expect(navigate('https://example.com/')).toBe(false)
    expect(fake.open()).toEqual({ action: 'deny' })
  })

  test('a server redirect off Canva is stopped too (a Wi-Fi login page)', () => {
    const fake = fakeContents()
    guardCanva(fake.contents)
    let prevented = false
    fake.emitter.emit('will-redirect', {
      url: 'http://captive.portal/login',
      preventDefault: () => (prevented = true)
    })
    expect(prevented).toBe(true)
  })
})
