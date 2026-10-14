import type { ProjectorStatus } from '@shared/projector'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  label: string
  internal: boolean // the laptop's own screen
  bounds: Rect
}

// The borderless projector window (created by main/index.ts with the spec §8.1 settings).
export interface ProjectorWindow {
  setBounds(bounds: Rect): void
  close(): void
  onceClosed(callback: () => void): void
  send(channel: string, payload: unknown): void
}

export interface ProjectorDeps {
  displays(): DisplayInfo[]
  controlDisplayId(): number // the display the control window is on
  moveControlTo(display: DisplayInfo): void
  createWindow(bounds: Rect): ProjectorWindow
  settings: { enabled(): boolean; setEnabled(on: boolean): void; displayId(): number | null }
  onStatus(status: ProjectorStatus): void
}

const NO_SEPARATE_DISPLAY =
  'No separate display — showing on this screen (move the mouse or press Esc to close)'

// The projector's display (spec §8.1): the one chosen in Settings when it's connected, else the
// first external one. None when there's only one display.
export function chooseDisplay(displays: DisplayInfo[], savedId: number | null): DisplayInfo | null {
  if (displays.length < 2) return null
  return (
    displays.find((d) => d.id === savedId) ??
    displays.find((d) => !d.internal) ??
    displays.find((d) => d.id !== displays[0].id) ??
    null
  )
}

// Spec §8.1: one projector window.
// - Projector mode (the toggle is on and there is a separate display): it covers that display, and
//   only the toggle closes it. The control window is kept off that display.
// - Laptop mode (it covers the control window's own display): the toggle with only one display, or
//   the idle auto-fullscreen view (§7.3). Mouse movement or Esc closes it (`dismiss`).
// - Display changes: unplugging the projector closes the window (the music goes on); plugging one
//   in reopens it; a resized display gets the window resized.
export class ProjectorController {
  private window: ProjectorWindow | null = null
  private mode: 'projector' | 'laptop' | null = null
  private display: DisplayInfo | null = null
  private notice: string | null = null

  constructor(private readonly deps: ProjectorDeps) {}

  status(): ProjectorStatus {
    return {
      enabled: this.deps.settings.enabled(),
      open: this.window !== null,
      mode: this.mode,
      display: this.display?.label ?? null,
      notice: this.notice
    }
  }

  // At startup: projector mode left on from last time opens again on a projector (spec §8.1).
  // Without one, nothing covers the laptop; plugging one in opens it.
  start(): void {
    const projector = chooseDisplay(this.deps.displays(), this.deps.settings.displayId())
    if (this.deps.settings.enabled() && projector) this.openProjector()
    this.announce()
  }

  // The player bar's projector toggle.
  setEnabled(on: boolean): void {
    this.deps.settings.setEnabled(on)
    if (on) this.openProjector()
    else this.close()
    this.announce()
  }

  // The idle auto-fullscreen view (spec §7.3): only while projector mode is off.
  showOnLaptop(): void {
    if (this.deps.settings.enabled() || this.window) return
    this.open(this.controlDisplay(), 'laptop', null)
    this.announce()
  }

  // Mouse movement or Esc: closes laptop mode only. Laptop mode from the toggle (one display) turns
  // projector mode off too.
  dismiss(): void {
    if (this.mode !== 'laptop') return
    if (this.deps.settings.enabled()) this.deps.settings.setEnabled(false)
    this.close()
    this.announce()
  }

  // A display was added, removed or changed.
  displaysChanged(): void {
    const displays = this.deps.displays()
    if (this.window && this.mode === 'projector') {
      const now = displays.find((d) => d.id === this.display?.id)
      if (!now) this.close()
      else {
        this.display = now
        this.window.setBounds(now.bounds)
      }
    }
    if (this.deps.settings.enabled() && this.mode !== 'projector') {
      // A separate display appeared: projector mode (from laptop mode, or after an unplug). Without
      // one, an unplugged projector's view stays closed rather than covering the laptop mid-event.
      if (chooseDisplay(displays, this.deps.settings.displayId())) {
        this.close()
        this.openProjector()
      }
    }
    if (this.window && this.mode === 'projector' && this.display) {
      this.keepControlOff(this.display)
      // No other display to put the control window on (clamshell, mirroring): never cover the
      // operator's only screen with projector mode. The switch stays on; a second display reopens it.
      if (this.display.id === this.deps.controlDisplayId()) this.close()
    }
    if (this.window && this.mode === 'laptop') {
      const own = this.controlDisplay()
      this.display = own
      this.window.setBounds(own.bounds)
    }
    this.announce()
  }

  // The control window moved (dragged, or "Move to…"): never leave it under the projector window.
  keepControlReachable(): void {
    if (this.mode === 'projector' && this.display) this.keepControlOff(this.display)
  }

  // Settings chose another display: an open projector moves there.
  displayChoiceChanged(): void {
    if (this.mode === 'projector') {
      this.close()
      this.openProjector()
    }
    this.announce()
  }

  send(channel: string, payload: unknown): void {
    this.window?.send(channel, payload)
  }

  private openProjector(): void {
    if (this.window) return
    const displays = this.deps.displays()
    const target = chooseDisplay(displays, this.deps.settings.displayId())
    if (!target) return this.open(this.controlDisplay(), 'laptop', NO_SEPARATE_DISPLAY)
    this.keepControlOff(target)
    this.open(target, 'projector', null)
  }

  // The control window never stays under the projector window (spec §8.1): macOS may put it on
  // the projector's display (it can become the main display, or windows move on sleep and wake).
  private keepControlOff(projector: DisplayInfo): void {
    if (this.deps.controlDisplayId() !== projector.id) return
    const displays = this.deps.displays()
    const other =
      displays.find((d) => d.id !== projector.id && d.internal) ??
      displays.find((d) => d.id !== projector.id)
    if (other) this.deps.moveControlTo(other)
  }

  private open(display: DisplayInfo, mode: 'projector' | 'laptop', notice: string | null): void {
    const window = this.deps.createWindow(display.bounds)
    this.window = window
    this.mode = mode
    this.display = display
    this.notice = notice
    window.onceClosed(() => {
      if (this.window !== window) return
      this.window = null
      this.mode = null
      this.display = null
      this.notice = null
      this.announce()
    })
  }

  private close(): void {
    const window = this.window
    this.window = null
    this.mode = null
    this.display = null
    this.notice = null
    window?.close()
  }

  private controlDisplay(): DisplayInfo {
    const displays = this.deps.displays()
    return displays.find((d) => d.id === this.deps.controlDisplayId()) ?? displays[0]
  }

  private announce(): void {
    this.deps.onStatus(this.status())
  }
}
