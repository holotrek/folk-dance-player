import {
  syncChanged,
  syncMessage,
  syncParts,
  type AppleSyncNotice,
  type AppleSyncState,
  type AppleSyncStatus,
  type MirrorDecision,
  type ReviewAction,
  type SyncPreview,
  type SyncSummary
} from '@shared/apple-sync'
import type { ApplePlaylistConflict, ImportProgress } from '@shared/import'
import { ImportBusyError } from '../import/import-service'
import type { SettingsStore } from '../settings/settings-store'
import { previewSnapshot } from './eligible'
import { PERMISSION_TIMEOUT_MS, type LibrarySource } from './library-source'
import type { Snapshot } from './snapshot'

export const FOCUS_INTERVAL_MS = 10_000

export interface AppleSyncDeps {
  available: boolean
  source: LibrarySource
  settings: SettingsStore
  run: (
    snapshot: Snapshot,
    decisions: Record<string, MirrorDecision>,
    onProgress?: (progress: ImportProgress) => void
  ) => Promise<SyncSummary>
  findConflicts: (snapshot: Snapshot) => ApplePlaylistConflict[]
  review: {
    count(): number
    resolve(fileIds: number[], action: ReviewAction): void
    resolveAll(action: ReviewAction): void
    disable(): void
  }
  onStatus: (status: AppleSyncStatus) => void
  onNotice: (notice: AppleSyncNotice) => void
  onLibraryChanged: () => void
  onProgress: (progress: ImportProgress) => void
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string, err?: unknown): void
  }
  clock?: () => number
  random?: () => number
}

const detailOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Sync with Apple Music's controller (sync spec §3.3): triggers (startup, focus at most every 10 s,
// Sync now), one sync at a time with at most one more queued, the paused states, and notices once
// per occurrence. Failures are logged and noticed, never thrown at the caller (main spec §10.1).
export class AppleSync {
  private enabled: boolean
  private state: AppleSyncState
  private running: Promise<void> | null = null
  private again = false
  private lastFocus = -Infinity
  private failing = false // the last sync failed: a repeat failure isn't noticed again
  private noticedPause: AppleSyncState | null = null
  private waitingForImport = false
  private previewed: Snapshot | null = null

  constructor(private readonly deps: AppleSyncDeps) {
    this.enabled = deps.available && deps.settings.get('appleSync.enabled')
    this.state = this.enabled ? 'idle' : 'off'
  }

  status(): AppleSyncStatus {
    return {
      available: this.deps.available,
      state: this.state,
      lastResult: this.deps.settings.get('appleSync.lastResult'),
      reviewCount: this.deps.review.count()
    }
  }

  get syncing(): boolean {
    return this.running !== null
  }

  started(): void {
    if (this.state === 'idle') void this.request()
  }

  focused(): void {
    if (this.state !== 'idle' && this.state !== 'syncing') return
    const now = this.clock()
    if (now - this.lastFocus < FOCUS_INTERVAL_MS) return
    this.lastFocus = now
    void this.request()
  }

  // Sync now (Settings, the File menu) also retries a paused sync, and always reports a failure.
  async syncNow(): Promise<void> {
    if (!this.enabled) return
    this.noticedPause = null
    this.failing = false
    if (this.state !== 'syncing') this.setState('idle')
    await this.request()
  }

  importFinished(): void {
    if (!this.waitingForImport) return
    this.waitingForImport = false
    void this.request()
  }

  async switchLibrary(): Promise<void> {
    if (this.state !== 'paused-other-library') return
    // The next sync records the open library's ID; the old library's songs go to review.
    this.deps.settings.set('appleSync.libraryId', null)
    await this.syncNow()
  }

  resolve(fileIds: number[], action: ReviewAction): void {
    this.deps.review.resolve(fileIds, action)
    this.deps.onLibraryChanged()
    this.emit()
  }

  resolveAll(action: ReviewAction): void {
    this.deps.review.resolveAll(action)
    this.deps.onLibraryChanged()
    this.emit()
  }

  // Turning on (§5.8): reading the library makes macOS ask for access, so this read waits as long as
  // the dialog may be up. The snapshot is kept for enable().
  async preview(): Promise<SyncPreview> {
    const read = await this.deps.source.read({ timeoutMs: PERMISSION_TIMEOUT_MS })
    if (!read.ok) return read
    this.previewed = read.snapshot
    return {
      ok: true,
      preview: previewSnapshot(read.snapshot, this.deps.random),
      conflicts: this.deps.findConflicts(read.snapshot)
    }
  }

  // The first sync, with progress. Returns null when Music has a different library open than the
  // last time sync was on (the status then offers Switch to this library).
  async enable(decisions: Record<string, MirrorDecision>): Promise<SyncSummary | null> {
    if (!this.deps.available) throw new Error('Sync with Apple Music is only available on macOS.')
    const snapshot = this.previewed ?? (await this.readForEnable())
    this.previewed = null
    this.deps.settings.set('appleSync.enabled', true)
    this.enabled = true
    if (this.otherLibrary(snapshot)) {
      this.pause('paused-other-library', { kind: 'other-library' })
      return null
    }
    const job = (async (): Promise<SyncSummary> => {
      this.setState('syncing')
      try {
        const summary = await this.deps.run(snapshot, decisions, this.deps.onProgress)
        this.finished(summary, snapshot.libraryId)
        return summary
      } catch (err) {
        this.setState('idle')
        throw err
      }
    })()
    // Triggers during the first sync find it running and add nothing: it is reading the library now.
    const running = job.then(
      () => undefined,
      () => undefined
    )
    this.running = running
    void running.then(() => {
      if (this.running === running) this.running = null
    })
    return await job
  }

  // Turning off (§5.9) waits for a running sync, so its writes finish before everything becomes
  // local; no further sync starts.
  async disable(): Promise<void> {
    this.enabled = false
    this.again = false
    this.previewed = null
    this.setState('off')
    if (this.running) await this.running
    this.deps.review.disable()
    this.deps.settings.set('appleSync.enabled', false)
    this.noticedPause = null
    this.failing = false
    this.deps.onLibraryChanged()
    this.emit()
  }

  private async readForEnable(): Promise<Snapshot> {
    const read = await this.deps.source.read({ timeoutMs: PERMISSION_TIMEOUT_MS })
    if (!read.ok) throw new Error(read.detail || 'The Music library could not be read.')
    return read.snapshot
  }

  private request(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    const running = this.loop().finally(() => {
      if (this.running === running) this.running = null
    })
    this.running = running
    return running
  }

  private async loop(): Promise<void> {
    do {
      this.again = false
      await this.syncOnce()
    } while (this.again && this.enabled && this.state === 'idle')
  }

  private async syncOnce(): Promise<void> {
    this.setState('syncing')
    const read = await this.deps.source.read()
    if (!this.enabled) return
    if (!read.ok) {
      if (read.reason === 'denied') return this.pause('paused-denied', { kind: 'denied' })
      return this.fail(read.detail)
    }
    if (this.otherLibrary(read.snapshot)) {
      return this.pause('paused-other-library', { kind: 'other-library' })
    }
    try {
      this.finished(await this.deps.run(read.snapshot, {}), read.snapshot.libraryId)
    } catch (err) {
      if (err instanceof ImportBusyError) {
        this.waitingForImport = true
        this.setState('idle')
        return
      }
      this.deps.log.error('Sync with Apple Music failed', err)
      this.fail(detailOf(err))
    }
  }

  private otherLibrary(snapshot: Snapshot): boolean {
    const known = this.deps.settings.get('appleSync.libraryId')
    return known !== null && known !== snapshot.libraryId
  }

  private finished(summary: SyncSummary, libraryId: string): void {
    const { settings, log } = this.deps
    settings.set('appleSync.libraryId', libraryId)
    settings.set('appleSync.lastResult', summary)
    this.failing = false
    this.noticedPause = null
    const parts = syncParts(summary)
    log.info(`Synced with Apple Music${parts.length ? `: ${parts.join(', ')}` : ''}`)
    if (syncChanged(summary)) {
      this.deps.onLibraryChanged()
      this.deps.onNotice({
        kind: 'changed',
        message: syncMessage(summary, this.deps.review.count())
      })
    }
    this.setState('idle')
  }

  private pause(state: AppleSyncState, notice: AppleSyncNotice): void {
    this.deps.log.warn(`Sync with Apple Music paused: ${state}`)
    if (this.noticedPause !== state) this.deps.onNotice(notice)
    this.noticedPause = state
    this.setState(state)
  }

  private fail(detail: string): void {
    this.deps.log.warn(`Sync with Apple Music failed: ${detail}`)
    if (!this.failing) this.deps.onNotice({ kind: 'failed', detail })
    this.failing = true
    this.setState('idle')
  }

  private setState(next: AppleSyncState): void {
    this.state = this.enabled ? next : 'off'
    this.emit()
  }

  private emit(): void {
    this.deps.onStatus(this.status())
  }

  private clock(): number {
    return this.deps.clock?.() ?? Date.now()
  }
}
