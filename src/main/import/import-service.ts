import type { DatabaseSync } from 'node:sqlite'
import {
  emptySummary,
  type ApplePlaylistConflict,
  type ApplePreview,
  type ImportProgress,
  type ImportRequest,
  type ImportSummary
} from '@shared/import'
import type { SettingsStore } from '../settings/settings-store'
import type { ImportMapping } from './mapping'
import { saveImportedFile, type SaveOutcome } from './save-file'
import { findEditedApplePlaylists, saveApplePlaylists } from './save-playlists'
import type { ApplePlaylist } from './apple-library'
import type { ReadResult } from './read-file'
import type {
  KnownTrack,
  StartWorker,
  WorkerHandle,
  WorkerJob,
  WorkerMessage
} from './worker-protocol'

// The mapping saved in Settings (main spec §5.2): imports and every sync use it.
export function savedMapping(settings: SettingsStore): ImportMapping {
  return {
    artistTagTarget: settings.get('import.artistTagTarget'),
    albumArtistTagTarget: settings.get('import.albumArtistTagTarget'),
    genreIsCountry: settings.get('import.genreIsCountry')
  }
}

export class ImportBusyError extends Error {
  constructor(message = 'An import is already running.') {
    super(message)
    this.name = 'ImportBusyError'
  }
}

export interface ImportServiceDeps {
  db: DatabaseSync
  settings: SettingsStore
  startWorker: StartWorker
  onProgress: (progress: ImportProgress) => void
  // Sync with Apple Music (sync spec §5.7): Library.xml imports wait until it is off, and nothing
  // is imported while a sync runs.
  syncEnabled?: () => boolean
  isSyncing?: () => boolean
  now?: () => string
}

const SUMMARY_KEY: Record<
  SaveOutcome,
  'added' | 'updated' | 'relinked' | 'alreadyPresent' | 'restored' | 'appleSynced'
> = {
  added: 'added',
  updated: 'updated',
  relinked: 'relinked',
  unchanged: 'alreadyPresent',
  restored: 'restored',
  appleSynced: 'appleSynced'
}

const FAILURE_KEY = {
  not_found: 'notFound',
  unsupported: 'unsupported',
  unreadable: 'unreadable'
} as const

// Runs imports (spec §5): the worker scans and reads files; this class writes the results to the
// database as they arrive, reports progress, and builds the summary.
export class ImportService {
  private current: WorkerHandle | null = null
  private cancelRequested = false

  constructor(private readonly deps: ImportServiceDeps) {}

  async previewApple(xmlPath: string): Promise<ApplePreview> {
    const { preview } = await this.runWorker({ kind: 'preview-apple', xmlPath }, () => undefined)
    return preview as ApplePreview
  }

  checkPlaylistConflicts(persistentIds: string[]): ApplePlaylistConflict[] {
    return findEditedApplePlaylists(this.deps.db, persistentIds)
  }

  get busy(): boolean {
    return this.current !== null
  }

  // Reads files for Sync with Apple Music (sync spec §5.3) on the import worker, one job at a time
  // with imports (ImportBusyError while one runs). Each result is passed on as it arrives, so the
  // caller saves files one by one.
  async readTracks(
    tracks: KnownTrack[],
    onResult: (key: number, result: ReadResult) => void
  ): Promise<void> {
    if (tracks.length === 0) return
    await this.runWorker({ kind: 'read-known', tracks }, (message) => {
      if (message.type === 'file' && message.apple) onResult(message.apple.trackId, message.result)
    })
  }

  cancel(): void {
    if (!this.current) return
    this.cancelRequested = true
    this.current.cancel()
  }

  async run(request: ImportRequest): Promise<ImportSummary> {
    if (this.current) throw new ImportBusyError()
    if (this.deps.isSyncing?.()) {
      throw new ImportBusyError('A sync with Apple Music is running. Try again in a moment.')
    }
    if (request.kind === 'apple' && this.deps.syncEnabled?.()) {
      throw new Error('Turn off Sync with Apple Music to import a Library.xml.')
    }
    const { db, settings, onProgress } = this.deps
    const mapping = savedMapping(settings)
    const source = request.kind === 'apple' ? 'apple_xml' : 'files'
    const summary = emptySummary()
    const fileIdByTrackId = new Map<number, number>()
    let playlists: ApplePlaylist[] = []
    let total = 0
    let done = 0

    onProgress({ phase: 'scanning', done: 0, total: 0, currentPath: null })
    const job: WorkerJob =
      request.kind === 'apple'
        ? { kind: 'import-apple', xmlPath: request.xmlPath, selection: request.selection }
        : { kind: 'import-paths', paths: request.paths }

    const { cancelled } = await this.runWorker(job, (message) => {
      if (message.type === 'planned') {
        total = message.total
        playlists = message.playlists
        summary.unsupported.push(
          ...message.unsupported.map((path) => ({ path, detail: 'Format not supported' }))
        )
        onProgress({ phase: 'reading', done, total, currentPath: null })
      } else if (message.type === 'file') {
        const { result } = message
        if (result.ok) {
          const { outcome, fileId } = this.inTransaction(() =>
            saveImportedFile(db, result.facts, {
              source,
              applePersistentId: message.apple?.persistentId ?? null,
              mapping
            })
          )
          summary[SUMMARY_KEY[outcome]].push({ path: result.facts.path })
          if (message.apple) fileIdByTrackId.set(message.apple.trackId, fileId)
        } else {
          summary[FAILURE_KEY[result.reason]].push({ path: result.path, detail: result.detail })
        }
        done += 1
        onProgress({
          phase: 'reading',
          done,
          total,
          currentPath: result.ok ? result.facts.path : result.path
        })
      }
    })

    summary.cancelled = cancelled
    // A cancelled import has only some of each playlist's tracks, so playlists are left alone.
    if (request.kind === 'apple' && !cancelled) {
      summary.playlists = this.inTransaction(() =>
        saveApplePlaylists(db, playlists, fileIdByTrackId, request.decisions, this.now())
      )
    }
    onProgress({ phase: 'done', done, total, currentPath: null })
    return summary
  }

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  private inTransaction<T>(fn: () => T): T {
    const { db } = this.deps
    db.exec('BEGIN')
    try {
      const value = fn()
      db.exec('COMMIT')
      return value
    } catch (err) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw err
    }
  }

  // Starts a worker job and settles when it finishes, with the preview (for a preview job) and
  // whether the job was cancelled.
  private runWorker(
    job: WorkerJob,
    onMessage: (message: WorkerMessage) => void
  ): Promise<{ preview: ApplePreview | null; cancelled: boolean }> {
    if (this.current) return Promise.reject(new ImportBusyError())
    const worker = this.deps.startWorker()
    this.current = worker
    this.cancelRequested = false

    return new Promise((resolve, reject) => {
      const finish = (settle: () => void): void => {
        this.current = null
        worker.dispose()
        settle()
      }
      worker.onMessage((message) => {
        if (this.current !== worker) return
        if (message.type === 'preview')
          finish(() => resolve({ preview: message.preview, cancelled: false }))
        else if (message.type === 'done')
          finish(() => resolve({ preview: null, cancelled: this.cancelRequested }))
        else if (message.type === 'error') finish(() => reject(new Error(message.message)))
        else {
          try {
            onMessage(message)
          } catch (err) {
            worker.cancel()
            finish(() => reject(err))
          }
        }
      })
      worker.onExit(() => {
        if (this.current === worker)
          finish(() => reject(new Error('The import stopped unexpectedly.')))
      })
      worker.start(job)
    })
  }
}
