import { BrowserWindow, net, WebContentsView, type WebContents } from 'electron'
import type { Rect } from '@shared/projector'
import type { LiveView } from '../projector/live-slide'
import { guardCanva } from '../navigation'
import type { Fetcher } from './canva-client'
import type { CanvaPage } from './slide-capturer'

// Canva's pages run in their own session, sandboxed, away from the app's windows.
const CANVA_PREFERENCES = { partition: 'persist:canva', sandbox: true }

export const canvaFetcher: Fetcher = (url, init) => net.fetch(url, init)

// A mouse pass across the page and out: Canva shows its controls, then fades them ~10 s later.
function nudge(contents: WebContents, width: number, height: number): void {
  const points = [
    [0.2, 0.3],
    [0.5, 0.5],
    [0.8, 0.75]
  ]
  points.forEach(([x, y], i) =>
    setTimeout(() => {
      if (contents.isDestroyed()) return
      contents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(x * width),
        y: Math.round(y * height)
      })
      if (i === points.length - 1) contents.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 })
    }, i * 150)
  )
}

// Within a loaded deck, loading another #slide only changes the slide in the page.
const load = async (contents: WebContents, url: string): Promise<void> => {
  await contents.loadURL(url)
}

// Spec §8.3: slides are captured at 1920×1080 in an off-screen window.
export function createCanvaPage(): CanvaPage {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: { ...CANVA_PREFERENCES, offscreen: true }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setFrameRate(10)
  guardCanva(win.webContents)
  return {
    load: (url) => load(win.webContents, url),
    nudge: () => nudge(win.webContents, 1920, 1080),
    capture: async () => {
      if (win.isDestroyed()) throw new Error('The capture window was closed')
      return (await win.webContents.capturePage()).toPNG()
    },
    destroy: () => {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}

// The live Canva page over the projector's slide area (spec §8.3).
export function createLiveView(window: BrowserWindow): LiveView {
  const view = new WebContentsView({ webPreferences: CANVA_PREFERENCES })
  const contents = view.webContents
  contents.setAudioMuted(true)
  view.setBackgroundColor('#000000')
  view.setVisible(false)
  guardCanva(contents)
  window.contentView.addChildView(view)
  let bounds: Rect = { x: 0, y: 0, width: 0, height: 0 }
  return {
    load: (url) => load(contents, url),
    nudge: () => nudge(contents, bounds.width, bounds.height),
    setVisible: (visible) => view.setVisible(visible),
    setBounds: (b) => {
      bounds = b
      view.setBounds(b)
    },
    destroy: () => {
      if (!window.isDestroyed()) window.contentView.removeChildView(view)
      if (!contents.isDestroyed()) contents.close()
    }
  }
}
