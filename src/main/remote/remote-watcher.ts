import type { RemoteStatus } from '@shared/program'

export interface RemoteWatcherDeps {
  // A query only; it must never prompt (the prompt belongs to the Allow button).
  isTrusted(): boolean
  registeredKeys(): string[]
  // Whether the app was trusted when it registered its media keys at launch.
  trustedAtStart: boolean
  onChange(status: RemoteStatus): void
}

// Notices when macOS Accessibility trust changes while the app runs (1.0.0 spec §3.1). The keys
// were registered at launch; if that was before the permission was allowed they stay dead until a
// restart, so a grant after launch is `restartNeeded`. Checked when the window gains focus.
export class RemoteWatcher {
  private last: boolean

  constructor(private readonly deps: RemoteWatcherDeps) {
    this.last = deps.trustedAtStart
  }

  status(): RemoteStatus {
    return this.build(this.last)
  }

  // Reads the permission now; announces a change once. A failing check counts as no change.
  check(): RemoteStatus {
    let now = this.last
    try {
      now = this.deps.isTrusted()
    } catch {
      return this.status()
    }
    if (now !== this.last) {
      this.last = now
      this.deps.onChange(this.build(now))
    }
    return this.build(now)
  }

  private build(trusted: boolean): RemoteStatus {
    return {
      trusted,
      keys: this.deps.registeredKeys(),
      restartNeeded: trusted && !this.deps.trustedAtStart
    }
  }
}
