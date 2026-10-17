import { stat } from 'fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { emptySyncSummary, type MirrorDecision, type SyncSummary } from '@shared/apple-sync'
import type { ImportMapping, ImportProgress } from '@shared/import'
import { inTransaction } from '../db/transaction'
import type { ImportService } from '../import/import-service'
import type { KnownTrack } from '../import/worker-protocol'
import { sortTracks, type EligibleTrack } from './eligible'
import { markGone } from './review'
import {
  findSyncRow,
  samePath,
  saveSyncedTrack,
  TAKEN_DETAIL,
  type SyncTrackInput
} from './save-synced'
import type { Snapshot } from './snapshot'
import { syncedFileIds, syncPlaylists } from './sync-playlists'

export interface FileStat {
  size: number
  mtimeMs: number
}

export async function statFile(path: string): Promise<FileStat | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? { size: info.size, mtimeMs: Math.round(info.mtimeMs) } : null
  } catch {
    return null
  }
}

export interface SyncEngineDeps {
  db: DatabaseSync
  mapping: ImportMapping
  readTracks: ImportService['readTracks']
  stat: (path: string) => Promise<FileStat | null>
  exists: (path: string) => boolean
  now: () => string
  onProgress?: (progress: ImportProgress) => void
}

const known = (key: number, t: EligibleTrack): KnownTrack => ({
  key,
  path: t.path,
  persistentId: t.persistentId,
  tags: t.tags,
  durationMs: t.durationMs,
  kind: t.kind
})

// One sync (sync spec §5): every eligible track is matched to its song. Unchanged files (same path,
// size and mtime) are compared from the snapshot alone; new, moved and changed files are read on the
// import worker. Each file is saved in its own transaction; then the gone step and the playlist step
// each run in one, so a crash mid-sync leaves nothing half-done that the next sync can't finish.
export async function runSync(
  deps: SyncEngineDeps,
  snapshot: Snapshot,
  decisions: Record<string, MirrorDecision> = {}
): Promise<SyncSummary> {
  const { db } = deps
  const summary = emptySyncSummary('')
  const { eligible, skipped, unsupported } = sortTracks(snapshot.tracks)
  summary.skipped = skipped
  summary.unsupported = unsupported
  const livePids = new Set(eligible.map((t) => t.persistentId))
  const claimed = new Set<number>()
  const ctx = { mapping: deps.mapping, livePids, claimed }
  const total = eligible.length
  let done = 0
  let missingChanged = false
  const report = (currentPath: string | null): void =>
    deps.onProgress?.({ phase: 'reading', done, total, currentPath })

  const save = (input: SyncTrackInput): void => {
    const saved = inTransaction(db, () => saveSyncedTrack(db, input, ctx))
    const { outcome } = saved
    if (saved.missingChanged) missingChanged = true
    const path = input.track.path
    if (outcome === 'taken') summary.unreadable.push({ path, detail: TAKEN_DETAIL })
    else if (outcome !== 'unchanged') summary[outcome].push({ path })
  }

  deps.onProgress?.({ phase: 'scanning', done: 0, total: 0, currentPath: null })
  const toRead: KnownTrack[] = []
  const rowFor = new Map<number, number | null>()
  for (const [key, track] of eligible.entries()) {
    const match = findSyncRow(db, track, livePids)
    if (match.kind === 'taken') {
      summary.unreadable.push({ path: track.path, detail: TAKEN_DETAIL })
      done += 1
      continue
    }
    const row = match.kind === 'row' ? match.row : null
    if (row && samePath(row.path, track.path)) {
      const info = await deps.stat(row.path)
      const unchanged = info && info.size === row.file_size && info.mtimeMs === row.mtime_ms
      if (!info || unchanged) {
        save({ track, facts: null, rowId: row.id, missing: !info })
        done += 1
        continue
      }
    }
    rowFor.set(key, row?.id ?? null)
    if (row) claimed.add(row.id)
    toRead.push(known(key, track))
  }
  report(null)

  await deps.readTracks(toRead, (key, result) => {
    const track = eligible[key]
    const rowId = rowFor.get(key) ?? null
    if (result.ok) save({ track, facts: result.facts, rowId, missing: false })
    else if (result.reason === 'not_found' && rowId !== null)
      save({ track, facts: null, rowId, missing: true })
    else if (result.reason === 'not_found') summary.missing.push({ path: track.path })
    else if (result.reason === 'unsupported')
      summary.unsupported.push({ path: result.path, detail: result.detail })
    else summary.unreadable.push({ path: result.path, detail: result.detail })
    done += 1
    report(track.path)
  })

  // Gone means no longer in the snapshot (§5.5): a track Music still has but that is skipped now
  // (cloud-only, converted to an unsupported format) keeps its song out of the review list.
  const inSnapshot = new Set(snapshot.tracks.map((t) => t.persistentId))
  const marked = inTransaction(db, () => markGone(db, inSnapshot, deps.exists))
  summary.gone = marked.gone
  summary.missingChanged = missingChanged || marked.missingChanged
  summary.playlists = inTransaction(db, () =>
    syncPlaylists(db, snapshot, syncedFileIds(db), decisions, deps.now())
  )
  summary.finishedAt = deps.now()
  deps.onProgress?.({ phase: 'done', done, total, currentPath: null })
  return summary
}
