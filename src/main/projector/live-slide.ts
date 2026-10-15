import { slideBox, type Rect } from '@shared/projector'

// The Canva page shown over the projector's slide area: a WebContentsView in Electron.
export interface LiveView {
  load(url: string): Promise<void> // resolves once the page has loaded
  nudge(): void // a synthetic mouse pass, so Canva starts fading its controls
  setVisible(visible: boolean): void
  setBounds(bounds: Rect): void
  destroy(): void
}

export interface LiveTarget {
  deckId: number
  viewUrl: string
  pageId: string
  position: number
}

// Canva fades its controls about 10 s after the last mouse activity; a slide change within a
// loaded deck needs only a moment to draw.
const FADE_MS = 11_000
const HASH_FADE_MS = 1_500

// Spec §8.3, "saved image, then live": the projector page shows the saved image at once, and the
// live view stays hidden until its controls have faded, then covers the image exactly. Offline, or
// when the page fails to load, it never shows. `onChange` fires when the view appears or goes.
export class LiveSlide {
  private view: LiveView | null = null
  // The deck the view has loaded with its controls faded. Until the fade, a switch starts over:
  // another slide's load would skip the nudge, and the controls would stay up.
  private deckUrl: string | null = null
  private target: LiveTarget | null = null
  private live = false
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly deps: {
      createView: () => LiveView
      online: () => boolean
      size: () => { width: number; height: number } | null // the projector window's content
      onChange: () => void
    }
  ) {}

  show(target: LiveTarget | null): void {
    if (target && this.target && same(target, this.target)) return
    const wasLive = this.live
    this.cancel()
    this.target = target
    if (!target || !this.deps.online()) {
      this.view?.setVisible(false)
      if (wasLive) this.deps.onChange()
      return
    }
    const sameDeck = this.view !== null && this.deckUrl === target.viewUrl
    if (!this.view) {
      this.view = this.deps.createView()
      this.resize()
    }
    const view = this.view
    view.setVisible(false)
    if (wasLive) this.deps.onChange()
    if (!sameDeck) this.deckUrl = null
    const generation = this.generation
    view.load(`${target.viewUrl}#${target.position}`).then(
      () => {
        if (generation !== this.generation) return
        if (!sameDeck) view.nudge()
        this.timer = setTimeout(
          () => {
            this.timer = null
            this.deckUrl = target.viewUrl
            this.live = true
            view.setVisible(true)
            this.deps.onChange()
          },
          sameDeck ? HASH_FADE_MS : FADE_MS
        )
      },
      () => {
        if (generation === this.generation) this.deckUrl = null // try a full load next time
      }
    )
  }

  // Whether the live view is showing this slide.
  isLive(target: Pick<LiveTarget, 'deckId' | 'pageId'>): boolean {
    return this.live && this.target !== null && same(target, this.target)
  }

  resize(): void {
    const size = this.deps.size()
    if (size && this.view) this.view.setBounds(slideBox(size.width, size.height))
  }

  // The projector window closed.
  close(): void {
    this.cancel()
    this.view?.destroy()
    this.view = null
    this.deckUrl = null
    this.target = null
  }

  private cancel(): void {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.live = false
  }
}

const same = (a: Pick<LiveTarget, 'deckId' | 'pageId'>, b: Pick<LiveTarget, 'deckId' | 'pageId'>) =>
  a.deckId === b.deckId && a.pageId === b.pageId

// Which projector window the live view belongs to. The controller replaces the window (laptop mode
// → projector mode, another display) by closing the old one and opening the new one at once, and
// the old window's 'closed' arrives after the new one opened, so it must not end the new one.
export function followProjectorWindow<W>(live: Pick<LiveSlide, 'close'>): {
  current(): W | null
  opened(window: W): void
  closed(window: W): void
} {
  let current: W | null = null
  return {
    current: () => current,
    opened: (window) => {
      live.close() // the view leaves any old window
      current = window
    },
    closed: (window) => {
      if (current !== window) return
      live.close()
      current = null
    }
  }
}
