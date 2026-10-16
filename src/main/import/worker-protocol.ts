import type { AppleSelection, ApplePreview } from '@shared/import'
import type { ApplePlaylist } from './apple-library'
import type { RawTags } from './mapping'
import type { ReadResult } from './read-file'

// Messages between ImportService (main process) and the import worker (utility process).

// A file Sync with Apple Music needs read (new, moved or changed), with Music's tags (sync spec §5.3).
export interface KnownTrack {
  key: number // the caller's reference, echoed as the result's apple.trackId
  path: string
  persistentId: string
  tags: RawTags
  durationMs: number | null
  kind: string | null
}

export type WorkerJob =
  | { kind: 'preview-apple'; xmlPath: string }
  | { kind: 'read-known'; tracks: KnownTrack[] }
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
