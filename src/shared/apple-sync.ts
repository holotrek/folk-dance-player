// Types for Sync with Apple Music, shared by main and renderer. Sync spec §3.3, §6, §7.1.
import type { ApplePlaylistConflict, ApplePreview, ImportSummaryItem } from './import'

export type AppleSyncState = 'off' | 'idle' | 'syncing' | 'paused-denied' | 'paused-other-library'

// One sync's result (§7.1), kept in the appleSync.lastResult setting and shown by Details.
export interface SyncSummary {
  finishedAt: string
  added: ImportSummaryItem[]
  updated: ImportSummaryItem[]
  relinked: ImportSummaryItem[] // Music moved the file
  adopted: ImportSummaryItem[] // a local song that turned up in Music
  restored: ImportSummaryItem[] // a removed song whose file came back
  gone: ImportSummaryItem[] // sent to the review list by this sync
  missing: ImportSummaryItem[] // still in Music, but the file isn't on disk
  unsupported: ImportSummaryItem[]
  unreadable: ImportSummaryItem[]
  skipped: { reason: string; count: number }[] // cloud items, videos, booklets…
  playlists: { created: string[]; updated: string[]; deleted: string[] }
}

export interface AppleSyncStatus {
  available: boolean // macOS (or a FDP_APPLE_LIBRARY file); the feature is hidden otherwise
  state: AppleSyncState
  lastResult: SyncSummary | null
  reviewCount: number // songs in "Removed from Apple Music"
}

export const APPLE_SYNC_OFF: AppleSyncStatus = {
  available: false,
  state: 'off',
  lastResult: null,
  reviewCount: 0
}

// Shown once per occurrence (§6.5): a toast after a sync that changed something, or a notice.
export type AppleSyncNotice =
  | { kind: 'changed'; message: string }
  | { kind: 'denied' }
  | { kind: 'other-library' }
  | { kind: 'failed'; detail: string }

// A playlist edited locally since a Library.xml import, when sync is turned on (§5.8 step 4).
export type MirrorDecision = 'replace' | 'copy'

export type ReviewAction = 'keep' | 'remove'

// Reading the library before turning sync on: the mapping step's tag preview and the playlists
// that need a decision.
export type SyncPreview =
  | { ok: true; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }

// One of Music's playlist folders (§6.2).
export interface PlaylistFolder {
  id: number
  name: string
  parentId: number | null
  persistentId: string | null
}

export function emptySyncSummary(finishedAt: string): SyncSummary {
  return {
    finishedAt,
    added: [],
    updated: [],
    relinked: [],
    adopted: [],
    restored: [],
    gone: [],
    missing: [],
    unsupported: [],
    unreadable: [],
    skipped: [],
    playlists: { created: [], updated: [], deleted: [] }
  }
}

const updatedCount = (s: SyncSummary): number =>
  s.updated.length + s.relinked.length + s.adopted.length + s.restored.length

const playlistCount = (s: SyncSummary): number =>
  s.playlists.created.length + s.playlists.updated.length + s.playlists.deleted.length

// Whether the library changed: songs added, updated, sent to review, or playlists changed.
export function syncChanged(s: SyncSummary): boolean {
  return s.added.length + updatedCount(s) + s.gone.length + playlistCount(s) > 0
}

// "3 added", "2 updated", "1 playlist changed": the status line and the toast.
export function syncParts(s: SyncSummary): string[] {
  const playlists = playlistCount(s)
  return [
    s.added.length ? `${s.added.length} added` : null,
    updatedCount(s) ? `${updatedCount(s)} updated` : null,
    playlists ? `${playlists} ${playlists === 1 ? 'playlist' : 'playlists'} changed` : null
  ].filter((p): p is string => p !== null)
}

// The toast after a sync that changed something (§6.5).
export function syncMessage(s: SyncSummary, reviewCount: number): string {
  const parts = syncParts(s)
  const head = parts.length
    ? `Synced with Apple Music: ${parts.join(', ')}`
    : 'Synced with Apple Music'
  return reviewCount > 0 ? `${head} · ${reviewCount} to review` : head
}

const LISTS = [
  'added',
  'updated',
  'relinked',
  'adopted',
  'restored',
  'gone',
  'missing',
  'unsupported',
  'unreadable',
  'skipped'
] as const

// For the settings validator: a stored summary of the wrong shape falls back to null.
export function isSyncSummary(value: unknown): value is SyncSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const playlists = v.playlists as Record<string, unknown> | undefined
  return (
    typeof v.finishedAt === 'string' &&
    LISTS.every((key) => Array.isArray(v[key])) &&
    typeof playlists === 'object' &&
    playlists !== null &&
    ['created', 'updated', 'deleted'].every((key) => Array.isArray(playlists[key]))
  )
}
