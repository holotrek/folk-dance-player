import type { SlideCapturer } from './capture-queue'
import type { CaptureTarget } from './decks'

// An off-screen Canva page (main/index.ts: an off-screen BrowserWindow in the Canva session).
export interface CanvaPage {
  load(url: string): Promise<void> // resolves once the page has loaded
  nudge(): void // a synthetic mouse pass, so Canva starts fading its controls
  capture(): Promise<Buffer> // a PNG of the page as it looks now
  destroy(): void
}

// Canva fades its controls about 10 s after the last mouse activity. Within a loaded deck a slide
// change happens in the page and the controls stay hidden; it needs only a moment to draw.
const FADE_MS = 12_000
const SLIDE_CHANGE_MS = 1_500
const TIMEOUT_MS = 45_000

// Spec §8.3: one page, reused while slides of the same deck are captured in turn.
export function createSlideCapturer(deps: {
  createPage: () => CanvaPage
  sleep: (ms: number) => Promise<void>
  timeoutMs?: number
}): SlideCapturer {
  let page: CanvaPage | null = null
  let deckUrl: string | null = null
  const close = (): void => {
    page?.destroy()
    page = null
    deckUrl = null
  }
  const capture = async (target: CaptureTarget): Promise<Buffer> => {
    const sameDeck = page !== null && deckUrl === target.viewUrl
    page ??= deps.createPage()
    const current = page
    deckUrl = null // until this load succeeds
    await current.load(`${target.viewUrl}#${target.position}`)
    deckUrl = target.viewUrl
    if (!sameDeck) current.nudge()
    await deps.sleep(sameDeck ? SLIDE_CHANGE_MS : FADE_MS)
    return current.capture()
  }
  return {
    capture: (target) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          close() // a page stuck loading is thrown away
          reject(new Error("Canva didn't respond in time"))
        }, deps.timeoutMs ?? TIMEOUT_MS)
      })
      return Promise.race([capture(target), timeout]).finally(() => clearTimeout(timer))
    },
    close
  }
}
