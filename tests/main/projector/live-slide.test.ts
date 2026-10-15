import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LiveSlide, type LiveView } from '../../../src/main/projector/live-slide'

const deckA = { deckId: 1, viewUrl: 'https://www.canva.com/design/A/x/view' }
const slide = (pageId: string, position: number, deck = deckA) => ({ ...deck, pageId, position })

function setup(online = true) {
  const log: string[] = []
  let finishLoad: (ok: boolean) => void = () => {}
  const views: LiveView[] = []
  const createView = (): LiveView => {
    const view: LiveView = {
      load: (url) => {
        log.push(`load ${url}`)
        return new Promise((resolve, reject) => {
          finishLoad = (ok) => (ok ? resolve() : reject(new Error('offline')))
        })
      },
      nudge: () => log.push('nudge'),
      setVisible: (v) => log.push(v ? 'show' : 'hide'),
      setBounds: (r) => log.push(`bounds ${r.width}x${r.height}`),
      destroy: () => log.push('destroy')
    }
    views.push(view)
    return view
  }
  const onChange = vi.fn()
  const live = new LiveSlide({
    createView,
    online: () => online,
    size: () => ({ width: 1920, height: 1080 }),
    onChange
  })
  return { live, log, onChange, views, load: (ok = true) => finishLoad(ok) }
}

describe('the live Canva view over the saved slide image', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('loads hidden, nudges the mouse, and shows once the controls have faded', async () => {
    const { live, log, onChange, load } = setup()
    live.show(slide('P6', 6))
    expect(log).toEqual(['bounds 902x508', 'hide', `load ${deckA.viewUrl}#6`])
    load()
    await vi.advanceTimersByTimeAsync(0)
    expect(log.at(-1)).toBe('nudge')
    await vi.advanceTimersByTimeAsync(10_999)
    expect(live.isLive(slide('P6', 6))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(log.at(-1)).toBe('show')
    expect(live.isLive(slide('P6', 6))).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('another slide of the same deck changes in place, hidden briefly', async () => {
    const { live, log, views, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    log.length = 0
    live.show(slide('P7', 7))
    expect(log).toEqual(['hide', `load ${deckA.viewUrl}#7`])
    load()
    await vi.advanceTimersByTimeAsync(1_499)
    expect(live.isLive(slide('P7', 7))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(log).toEqual(['hide', `load ${deckA.viewUrl}#7`, 'show'])
    expect(views).toHaveLength(1)
  })

  test('the same slide again changes nothing', async () => {
    const { live, log, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    log.length = 0
    live.show(slide('P6', 6))
    expect(log).toEqual([])
    expect(live.isLive(slide('P6', 6))).toBe(true)
  })

  test('a slide from another deck reloads with a fresh nudge', async () => {
    const { live, log, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    log.length = 0
    const deckB = { deckId: 2, viewUrl: 'https://www.canva.com/design/B/y/view' }
    live.show(slide('Q1', 1, deckB))
    load()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(live.isLive(slide('Q1', 1, deckB))).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(log).toEqual(['hide', `load ${deckB.viewUrl}#1`, 'nudge', 'show'])
  })

  test('switching away before the fade never shows the old slide', async () => {
    const { live, log, load, onChange } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(5_000)
    live.show(null)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(log).not.toContain('show')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('hiding a live slide reports the change', async () => {
    const { live, log, load, onChange } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    live.show(null)
    expect(log.at(-1)).toBe('hide')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  test('offline, or when the page fails to load, the saved image stays', async () => {
    const offline = setup(false)
    offline.live.show(slide('P6', 6))
    expect(offline.log).toEqual([])
    const failing = setup()
    failing.live.show(slide('P6', 6))
    failing.load(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(failing.log).not.toContain('show')
    expect(failing.live.isLive(slide('P6', 6))).toBe(false)
  })

  test('closing destroys the view; the next slide starts a new one', async () => {
    const { live, log, views, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    live.close()
    expect(log.at(-1)).toBe('destroy')
    expect(live.isLive(slide('P6', 6))).toBe(false)
    live.show(slide('P6', 6))
    expect(views).toHaveLength(2)
  })

  test('resizing moves the view to the new slide box', () => {
    const { live, log } = setup()
    live.show(slide('P6', 6))
    log.length = 0
    live.resize()
    expect(log).toEqual(['bounds 902x508'])
  })
})
