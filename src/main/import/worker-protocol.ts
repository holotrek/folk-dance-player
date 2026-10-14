import type { AppleSelection, ApplePreview } from '@shared/import'
import type { ApplePlaylist } from './apple-library'
import type { ReadResult } from './read-file'

// Messages between ImportService (main process) and the import worker (utility process).

export type WorkerJob =
  | { kind: 'preview-apple'; xmlPath: string }
  | { kind: 'import-paths'; paths: string[] }
  | { kind: 'import-apple'; xmlPath: string; selection: AppleSelection }

export type ParentMessage = { type: 'job'; job: WorkerJob } | { type: 'cancel' }

export type WorkerMessage =
  | { type: 'preview'; preview: ApplePreview }
  | { type: 'planned'; total: number; unsupported: string[]; playlists: ApplePlaylist[] }
  | {
      type: 'file'
      result: ReadResult
      apple: { trackId: number; persistentId: string | null } | null
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

// How ImportService talks to a worker; implemented over a utility process in the app and
// in-process in tests.
export interface WorkerHandle {
  start(job: WorkerJob): void
  cancel(): void
  onMessage(listener: (message: WorkerMessage) => void): void
  onExit(listener: () => void): void
  dispose(): void
}

export type StartWorker = () => WorkerHandle
