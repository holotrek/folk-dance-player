import type { ProjectorController } from './projector-controller'

const POLL_MS = 250
const GRACE_MS = 1000 // laptop mode ignores input this soon after opening

export interface ActivityDeps {
  cursor(): { x: number; y: number } // the mouse position on screen
  // Seconds since any input on the Mac (scrolling and clicking don't move the cursor).
  systemIdleSeconds?(): number
  playing(): boolean // a song plays or a countdown runs
  autoFullscreen(): { enabled: boolean; seconds: number }
  projector: Pick<ProjectorController, 'status' | 'showOnLaptop' | 'dismiss'>
}

// Spec §7.3 and §8.1 laptop mode. The mouse is polled (it moves over the projector window too,
// which takes no input), and the control window passes on its key presses.
// - Mouse movement or Esc closes laptop mode, after a 1 s grace.
// - With projector mode off and music playing, no input for `autoFullscreen.seconds` shows the
//   view over the laptop.
export class ActivityWatcher {
  private last = Date.now()
  private openedAt: number | null = null
  private cursor = { x: 0, y: 0 }
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: ActivityDeps) {}

  start(): void {
    this.last = Date.now()
    this.cursor = this.deps.cursor()
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  // A key pressed in the control window.
  keyInput(key: string): void {
    this.last = Date.now()
    if (key === 'Escape') this.closeLaptop()
  }

  private tick(): void {
    const now = Date.now()
    const status = this.deps.projector.status()
    const laptop = status.open && status.mode === 'laptop'
    if (!laptop) this.openedAt = null
    else if (this.openedAt === null) this.openedAt = now

    const cursor = this.deps.cursor()
    if (cursor.x !== this.cursor.x || cursor.y !== this.cursor.y) {
      this.cursor = cursor
      this.last = now
      return this.closeLaptop()
    }

    const { enabled, seconds } = this.deps.autoFullscreen()
    const systemIdle = this.deps.systemIdleSeconds?.() ?? Infinity
    if (
      enabled &&
      !status.open &&
      this.deps.playing() &&
      now - this.last >= seconds * 1000 &&
      systemIdle >= seconds
    ) {
      this.deps.projector.showOnLaptop()
      this.openedAt = now
    }
  }

  private closeLaptop(): void {
    const status = this.deps.projector.status()
    if (!status.open || status.mode !== 'laptop') return
    if (this.openedAt !== null && Date.now() - this.openedAt < GRACE_MS) return
    this.deps.projector.dismiss()
    this.openedAt = null
  }
}
