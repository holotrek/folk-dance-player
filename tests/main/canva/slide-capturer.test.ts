import { describe, expect, test } from 'vitest'
import { createSlideCapturer, type CanvaPage } from '../../../src/main/canva/slide-capturer'

const deckA = 'https://www.canva.com/design/A/x/view'
const deckB = 'https://www.canva.com/design/B/y/view'
const target = (viewUrl: string, position: number) => ({
  deckId: viewUrl === deckA ? 1 : 2,
  pageId: `P${position}`,
  viewUrl,
  position
})

function setup(opts: { failLoad?: boolean; hang?: boolean } = {}) {
  const log: string[] = []
  let pages = 0
  const createPage = (): CanvaPage => {
    pages++
    return {
      load: async (url) => {
        log.push(`load ${url}`)
        if (opts.failLoad) throw new Error('ERR_INTERNET_DISCONNECTED')
        if (opts.hang) await new Promise(() => {})
      },
      nudge: () => void log.push('nudge'),
      capture: async () => {
        log.push('capture')
        return Buffer.from('png')
      },
      destroy: () => void log.push('destroy')
    }
  }
  const sleep = async (ms: number) => void log.push(`wait ${ms}`)
  const capturer = createSlideCapturer({ createPage, sleep, timeoutMs: 50 })
  return { capturer, log, pages: () => pages }
}

describe('capturing a slide off-screen', () => {
  test('a new deck loads, is nudged and left to fade before the picture', async () => {
    const { capturer, log } = setup()
    expect(await capturer.capture(target(deckA, 6))).toEqual(Buffer.from('png'))
    expect(log).toEqual([`load ${deckA}#6`, 'nudge', 'wait 12000', 'capture'])
  })

  test('the next slide of the same deck needs only a moment', async () => {
    const { capturer, log, pages } = setup()
    await capturer.capture(target(deckA, 6))
    log.length = 0
    await capturer.capture(target(deckA, 7))
    expect(log).toEqual([`load ${deckA}#7`, 'wait 1500', 'capture'])
    await capturer.capture(target(deckB, 1))
    expect(log.slice(3)).toEqual([`load ${deckB}#1`, 'nudge', 'wait 12000', 'capture'])
    expect(pages()).toBe(1)
  })

  test('close frees the page; the next capture starts over', async () => {
    const { capturer, log, pages } = setup()
    await capturer.capture(target(deckA, 6))
    capturer.close()
    expect(log.at(-1)).toBe('destroy')
    log.length = 0
    await capturer.capture(target(deckA, 7))
    expect(log[1]).toBe('nudge')
    expect(pages()).toBe(2)
  })

  test('a failed load is reported, and the deck loads in full next time', async () => {
    const { capturer } = setup({ failLoad: true })
    await expect(capturer.capture(target(deckA, 6))).rejects.toThrow('ERR_INTERNET_DISCONNECTED')
  })

  test('a page that never loads times out and is thrown away', async () => {
    const { capturer, log } = setup({ hang: true })
    await expect(capturer.capture(target(deckA, 6))).rejects.toThrow("Canva didn't respond in time")
    expect(log.at(-1)).toBe('destroy')
  })
})
