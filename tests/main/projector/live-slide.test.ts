import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  followProjectorWindow,
  LiveSlide,
  type LiveView
} from '../../../src/main/projector/live-slide'

const deckA = { deckId: 1, viewUrl: 'https://www.canva.com/design/A/x/view' }
const image = (pageId: string) => `fdp-media://slide/1/${pageId}`
const slide = (
  pageId: string,
  position: number,
  deck = deckA,
  imageUrl: string | null = image(pageId)
) => ({
  ...deck,
  pageId,
  position,
  imageUrl
})

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
      cover: (url) => log.push(`cover ${url ?? 'black'}`),
      reveal: () => log.push('reveal'),
      hide: () => log.push('hide'),
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

  test('loads under a cover of the saved image, nudges the mouse, and is revealed once the controls have faded', async () => {
    const { live, log, onChange, load } = setup()
    live.show(slide('P6', 6))
    expect(log).toEqual(['bounds 902x508', `cover ${image('P6')}`, `load ${deckA.viewUrl}#6`])
    load()
    await vi.advanceTimersByTimeAsync(0)
    expect(log.at(-1)).toBe('nudge')
    await vi.advanceTimersByTimeAsync(10_999)
    expect(live.isLive(slide('P6', 6))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(log.at(-1)).toBe('reveal')
    expect(live.isLive(slide('P6', 6))).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('another slide of the same deck changes in place, covered briefly', async () => {
    const { live, log, views, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    log.length = 0
    live.show(slide('P7', 7))
    expect(log).toEqual([`cover ${image('P7')}`, `load ${deckA.viewUrl}#7`])
    load()
    await vi.advanceTimersByTimeAsync(1_499)
    expect(live.isLive(slide('P7', 7))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(log).toEqual([`cover ${image('P7')}`, `load ${deckA.viewUrl}#7`, 'reveal'])
    expect(views).toHaveLength(1)
  })

  test('another slide of the same deck before the first has faded starts over, with a nudge', async () => {
    const { live, log, load } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(4_000) // loaded, but Canva's controls are still showing
    log.length = 0
    live.show(slide('P7', 7))
    load()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(log).toEqual([`cover ${image('P7')}`, `load ${deckA.viewUrl}#7`, 'nudge'])
    await vi.advanceTimersByTimeAsync(9_500)
    expect(log.at(-1)).toBe('reveal')
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
    expect(log).toEqual([`cover ${image('Q1')}`, `load ${deckB.viewUrl}#1`, 'nudge', 'reveal'])
  })

  test('switching away before the fade never shows the old slide', async () => {
    const { live, log, load, onChange } = setup()
    live.show(slide('P6', 6))
    load()
    await vi.advanceTimersByTimeAsync(5_000)
    live.show(null)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(log).not.toContain('reveal')
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
    expect(failing.log).not.toContain('reveal')
    expect(failing.live.isLive(slide('P6', 6))).toBe(false)
  })

  test('a slide with no saved image yet is covered in black; its image covers it once saved', async () => {
    const { live, log, load } = setup()
    live.show(slide('P6', 6, deckA, null))
    expect(log).toContain('cover black')
    log.length = 0
    live.show(slide('P6', 6)) // the capture finished while the page loads
    expect(log).toEqual([`cover ${image('P6')}`])
    load()
    await vi.advanceTimersByTimeAsync(11_000)
    expect(log).toEqual([`cover ${image('P6')}`, 'nudge', 'reveal'])
    log.length = 0
    live.show(slide('P6', 6, deckA, `${image('P6')}?v=2`)) // re-captured while live: nothing to do
    expect(log).toEqual([])
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

describe('following the projector window', () => {
  test('a replacement window (laptop → projector) keeps the live view; the old one closing later changes nothing', () => {
    let closes = 0
    const tracker = followProjectorWindow<string>({ close: () => void closes++ })
    tracker.opened('laptop')
    tracker.opened('projector') // opened before the old window's 'closed' arrives
    expect(closes).toBe(2) // the view leaves the old window
    tracker.closed('laptop')
    expect(tracker.current()).toBe('projector')
    expect(closes).toBe(2)
    tracker.closed('projector')
    expect(tracker.current()).toBeNull()
    expect(closes).toBe(3)
  })
})
