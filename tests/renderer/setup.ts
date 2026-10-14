import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom lacks these browser APIs; Mantine uses them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView = vi.fn()
// Auto-growing textareas listen for font loading, which jsdom doesn't implement.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn(), ready: Promise.resolve() }
})

// jsdom lays nothing out, so every element measures 0×0. Popovers (menus) then treat their anchor
// as detached and hide, and virtualized lists (which read offsetWidth/offsetHeight) render no
// rows. Give elements a plausible size.
Element.prototype.getBoundingClientRect = function (): DOMRect {
  const rect = { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 600, right: 1000, bottom: 600 }
  return { ...rect, toJSON: () => rect } as DOMRect
}
for (const [prop, value] of [
  ['offsetWidth', 1000],
  ['offsetHeight', 600]
] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value })
}

// jsdom doesn't implement media playback. Playing resolves; tests drive the element's events.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
HTMLMediaElement.prototype.pause = vi.fn()
HTMLMediaElement.prototype.load = vi.fn()

afterEach(() => cleanup())
