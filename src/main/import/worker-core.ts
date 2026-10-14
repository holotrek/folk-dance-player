import { readFile } from 'fs/promises'
import {
  parseAppleLibrary,
  previewAppleLibrary,
  selectAppleImport,
  type AppleLibrary
} from './apple-library'
import { readAudioFile } from './read-file'
import { findAudioFiles } from './scan'
import type { WorkerJob, WorkerMessage } from './worker-protocol'

async function loadAppleLibrary(xmlPath: string): Promise<AppleLibrary> {
  return parseAppleLibrary(await readFile(xmlPath, 'utf8'))
}

// The import worker's job runner: no Electron APIs, so tests run it in-process.
export async function runWorkerJob(
  job: WorkerJob,
  post: (message: WorkerMessage) => void,
  isCancelled: () => boolean
): Promise<void> {
  try {
    if (job.kind === 'preview-apple') {
      post({ type: 'preview', preview: previewAppleLibrary(await loadAppleLibrary(job.xmlPath)) })
    } else if (job.kind === 'import-paths') {
      const { audio, unsupported } = await findAudioFiles(job.paths)
      post({ type: 'planned', total: audio.length, unsupported, playlists: [] })
      for (const path of audio) {
        if (isCancelled()) break
        post({ type: 'file', result: await readAudioFile(path), apple: null })
      }
    } else {
      const { tracks, playlists } = selectAppleImport(
        await loadAppleLibrary(job.xmlPath),
        job.selection
      )
      post({ type: 'planned', total: tracks.length, unsupported: [], playlists })
      for (const track of tracks) {
        if (isCancelled()) break
        const result = await readAudioFile(track.path as string, {
          tags: track.tags,
          durationMs: track.durationMs,
          kind: track.kind
        })
        post({
          type: 'file',
          result,
          apple: { trackId: track.trackId, persistentId: track.persistentId }
        })
      }
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
