import { describe, expect, test } from 'vitest'
import {
  chooseDisplay,
  ProjectorController,
  type DisplayInfo,
  type ProjectorWindow
} from '../../../src/main/projector/projector-controller'

const laptop: DisplayInfo = {
  id: 1,
  label: 'Built-in Retina Display',
  internal: true,
  bounds: { x: 0, y: 0, width: 1512, height: 982 }
}
const hdmi: DisplayInfo = {
  id: 2,
  label: 'Epson Projector',
  internal: false,
  bounds: { x: 1512, y: 0, width: 1920, height: 1080 }
}
const tv: DisplayInfo = {
  id: 3,
  label: 'TV',
  internal: false,
  bounds: { x: 3432, y: 0, width: 1280, height: 720 }
}

class FakeWindow implements ProjectorWindow {
  bounds: DisplayInfo['bounds']
  closed = false
  sent: [string, unknown][] = []
  private onClosed: () => void = () => undefined
  constructor(bounds: DisplayInfo['bounds']) {
    this.bounds = bounds
  }
  setBounds(bounds: DisplayInfo['bounds']) {
    this.bounds = bounds
  }
  close() {
    this.closed = true
    this.onClosed()
  }
  onceClosed(fn: () => void) {
    this.onClosed = fn
  }
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload])
  }
}

function setup(
  displays: DisplayInfo[],
  options: { control?: number; saved?: number | null; enabled?: boolean } = {}
) {
  const state = {
    displays,
    control: options.control ?? 1,
    settings: { enabled: options.enabled ?? false, displayId: options.saved ?? null },
    windows: [] as FakeWindow[],
    movedControlTo: [] as number[],
    statuses: [] as unknown[]
  }
  const controller = new ProjectorController({
    displays: () => state.displays,
    controlDisplayId: () => state.control,
    moveControlTo: (d) => {
      state.movedControlTo.push(d.id)
      state.control = d.id
    },
    createWindow: (bounds) => {
      const w = new FakeWindow(bounds)
      state.windows.push(w)
      return w
    },
    settings: {
      enabled: () => state.settings.enabled,
      setEnabled: (on) => void (state.settings.enabled = on),
      displayId: () => state.settings.displayId
    },
    onStatus: (s) => state.statuses.push(s)
  })
  const open = () => state.windows.filter((w) => !w.closed)
  return { controller, state, open }
}

describe('choosing the projector display', () => {
  test('the saved display when connected, else the first external one; none when alone', () => {
    expect(chooseDisplay([laptop, hdmi, tv], 3)?.id).toBe(3)
    expect(chooseDisplay([laptop, hdmi, tv], 99)?.id).toBe(2)
    expect(chooseDisplay([laptop, hdmi], null)?.id).toBe(2)
    expect(chooseDisplay([laptop], null)).toBeNull()
  })
})

describe('projector window', () => {
  test('turning projector mode on opens a borderless window over the other display', () => {
    const { controller, open, state } = setup([laptop, hdmi])
    controller.setEnabled(true)
    expect(state.settings.enabled).toBe(true)
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toEqual({
      enabled: true,
      open: true,
      mode: 'projector',
      display: 'Epson Projector',
      notice: null
    })
    controller.setEnabled(false)
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: false, open: false, mode: null })
  })

  test('the control window moves off the projector display (macOS may make it the main one)', () => {
    const { controller, state, open } = setup([laptop, hdmi], { control: 2 })
    controller.setEnabled(true)
    expect(state.movedControlTo).toEqual([1])
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('with only one display it shows on this screen, as laptop mode, and says so', () => {
    const { controller, open } = setup([laptop])
    controller.setEnabled(true)
    expect(open()[0].bounds).toEqual(laptop.bounds)
    expect(controller.status()).toMatchObject({
      mode: 'laptop',
      notice: 'No separate display — showing on this screen (move the mouse or press Esc to close)'
    })
    controller.dismiss() // mouse or Esc
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: false, open: false })
  })

  test('in projector mode, mouse and Esc never close it', () => {
    const { controller, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    controller.dismiss()
    expect(open()).toHaveLength(1)
  })

  test('unplugging the projector closes the window; plugging it back in reopens it', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    state.displays = [laptop]
    controller.displaysChanged()
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: true, open: false })
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('after a display change (sleep and wake), a control window on the projector’s display is moved off it', () => {
    const { controller, state } = setup([laptop, hdmi])
    controller.setEnabled(true)
    expect(state.movedControlTo).toEqual([])
    state.control = 2 // macOS put the control window on the projector's display
    controller.displaysChanged()
    expect(state.movedControlTo).toEqual([1])
  })

  test('displays renumbered on wake: the projector reopens on the display that is back', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    const hdmiAgain = { ...hdmi, id: 22 }
    state.displays = [laptop, hdmiAgain]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toMatchObject({ open: true, mode: 'projector' })
  })

  test('a display that changes size gets the window resized', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.setEnabled(true)
    const bigger = { ...hdmi, bounds: { ...hdmi.bounds, width: 3840, height: 2160 } }
    state.displays = [laptop, bigger]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(bigger.bounds)
  })

  test('laptop mode (shown on this screen) moves to the projector when one is plugged in', () => {
    const { controller, state, open } = setup([laptop])
    controller.setEnabled(true)
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    expect(controller.status()).toMatchObject({ mode: 'projector', notice: null })
  })

  test('projector mode left on, but no projector at startup: nothing covers the laptop until one is plugged in', () => {
    const { controller, state, open } = setup([laptop], { enabled: true })
    controller.start()
    expect(open()).toHaveLength(0)
    expect(controller.status()).toMatchObject({ enabled: true, open: false })
    state.displays = [laptop, hdmi]
    controller.displaysChanged()
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('choosing another display in Settings moves an open projector there', () => {
    const { controller, state, open } = setup([laptop, hdmi, tv], { enabled: true })
    controller.start()
    expect(open()[0].bounds).toEqual(hdmi.bounds)
    state.settings.displayId = 3
    controller.displayChoiceChanged()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(tv.bounds)
  })

  test('projector mode left on from last time opens at startup', () => {
    const { controller, open } = setup([laptop, tv, hdmi], { enabled: true, saved: 3 })
    controller.start()
    expect(open()[0].bounds).toEqual(tv.bounds)
  })

  test('the auto-fullscreen view covers the laptop only while projector mode is off', () => {
    const { controller, open } = setup([laptop, hdmi])
    controller.showOnLaptop()
    expect(open()[0].bounds).toEqual(laptop.bounds)
    expect(controller.status()).toMatchObject({ enabled: false, mode: 'laptop', notice: null })
    controller.dismiss()
    expect(open()).toHaveLength(0)
    controller.setEnabled(true)
    controller.showOnLaptop()
    expect(open()).toHaveLength(1)
    expect(open()[0].bounds).toEqual(hdmi.bounds)
  })

  test('sends only to an open window, and announces every status change', () => {
    const { controller, state, open } = setup([laptop, hdmi])
    controller.send('projector:snapshot', 1)
    controller.setEnabled(true)
    controller.send('projector:snapshot', 2)
    expect(open()[0].sent).toEqual([['projector:snapshot', 2]])
    expect(state.statuses.length).toBeGreaterThan(0)
  })
})
