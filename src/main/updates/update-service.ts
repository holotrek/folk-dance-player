import {
  UPDATE_CHECK_MS,
  UPDATE_FIRST_CHECK_MS,
  UPDATE_IDLE,
  type UpdateCheckResult,
  type UpdateState
} from '@shared/updates'
import type { Logger } from '../log/logger'
import type { Timers } from '../session/player-session'

// The library behind the service (updates spec §5): the one Electron adapter implements this, and
// tests fake it. Results of a check arrive through the listeners.
export interface Updater {
  isEnabled(): boolean // the app is installed, or a test feed is set
  check(): Promise<void>
  quitAndInstall(): void
  onAvailable(listener: (version: string) => void): void
  onNotAvailable(listener: () => void): void
  onDownloaded(listener: (version: string) => void): void
  onError(listener: (error: Error) => void): void
}

export interface UpdateServiceDeps {
  autoCheck(): boolean // the updates.check setting
  touring(): boolean
  timers: Timers
  log: Logger
  onState(state: UpdateState): void
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Finds, downloads and installs new versions (updates spec §2, §3). No Electron imports. A failed
// check is logged and silent; only a manual check reports it. Nothing here restarts the app unless
// install() is called, which the person does with the banner's button.
export class UpdateService {
  private state: UpdateState = UPDATE_IDLE
  private timer: unknown = null
  private started = false

  constructor(
    private readonly updater: Updater,
    private readonly deps: UpdateServiceDeps
  ) {
    updater.onAvailable((version) => this.set({ kind: 'downloading', version }))
    updater.onNotAvailable(() => {
      if (this.state.kind === 'checking') this.set(UPDATE_IDLE)
    })
    updater.onDownloaded((version) => this.set({ kind: 'ready', version }))
    updater.onError((error) => this.failed(error))
  }

  getState(): UpdateState {
    return this.state
  }

  // The first check shortly after the app starts, then one every few hours.
  start(): void {
    if (this.started) return
    this.started = true
    this.schedule(UPDATE_FIRST_CHECK_MS)
  }

  stop(): void {
    this.started = false
    if (this.timer !== null) this.deps.timers.clearTimeout(this.timer)
    this.timer = null
  }

  // A manual check ("Check for Updates…"): runs whatever the setting or a tour says.
  async checkNow(): Promise<UpdateCheckResult> {
    if (!this.updater.isEnabled()) return { kind: 'unsupported' }
    if (this.state.kind === 'downloading' || this.state.kind === 'ready') return this.state
    await this.runCheck()
    return this.state
  }

  // Restart to Update. Only a downloaded update can be installed.
  install(): void {
    if (this.state.kind !== 'ready') return
    try {
      this.updater.quitAndInstall()
    } catch (err) {
      this.deps.log.error('Installing the update failed', err)
    }
  }

  private schedule(ms: number): void {
    this.timer = this.deps.timers.setTimeout(() => {
      void this.automatic().finally(() => {
        if (this.started) this.schedule(UPDATE_CHECK_MS)
      })
    }, ms)
  }

  private async automatic(): Promise<void> {
    const { kind } = this.state
    const busy = kind === 'checking' || kind === 'downloading' || kind === 'ready'
    if (busy || !this.deps.autoCheck() || this.deps.touring() || !this.updater.isEnabled()) return
    await this.runCheck()
  }

  private async runCheck(): Promise<void> {
    this.set({ kind: 'checking' })
    try {
      await this.updater.check()
      // No word of an update: this copy is current.
      if (this.state.kind === 'checking') this.set(UPDATE_IDLE)
    } catch (err) {
      this.failed(err)
    }
  }

  private failed(err: unknown): void {
    this.deps.log.error('Checking for an update failed', err)
    if (this.state.kind !== 'ready') this.set({ kind: 'error', message: message(err) })
  }

  private set(next: UpdateState): void {
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    try {
      this.deps.onState(next)
    } catch (err) {
      this.deps.log.error('Announcing the update state failed', err)
    }
  }
}

// App menu → Check for Updates…: runs a check now and tells the person what it found. This is the
// one place an error is shown (the person asked).
export async function checkForUpdatesFromMenu(
  service: Pick<UpdateService, 'checkNow' | 'install'>,
  ui: {
    tell(message: string, detail?: string): void
    askRestart(version: string): Promise<boolean> // true: the person chose Restart
  },
  currentVersion: string
): Promise<void> {
  const result = await service.checkNow()
  switch (result.kind) {
    case 'unsupported':
      return ui.tell('Updates only work in the installed app.')
    case 'downloading':
      return ui.tell(
        `Version ${result.version} is downloading.`,
        'It will appear in the banner at the top when it is ready.'
      )
    case 'ready':
      if (await ui.askRestart(result.version)) service.install()
      return
    case 'error':
      return ui.tell(
        `Couldn’t check for updates: ${result.message}`,
        'If the app is not in your Applications folder, move it there to update it.'
      )
    default:
      return ui.tell(`You have the latest version (${currentVersion}).`)
  }
}
