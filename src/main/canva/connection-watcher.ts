const POLL_MS = 15_000

// Notices the internet connection coming back (Electron's main process has no "online" event), so
// slides linked while offline get their images (spec §8.3). It polls `isOnline` every 15 s and calls
// `onReconnect` on each change from offline to online.
export class ConnectionWatcher {
  private online = true
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: { isOnline(): boolean; onReconnect(): void }) {}

  start(): void {
    this.online = this.deps.isOnline()
    this.timer = setInterval(() => {
      const online = this.deps.isOnline()
      if (online && !this.online) this.deps.onReconnect()
      this.online = online
    }, POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
