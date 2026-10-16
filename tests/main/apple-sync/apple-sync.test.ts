import { beforeEach, describe, expect, test } from 'vitest'
import {
  emptySyncSummary,
  type AppleSyncNotice,
  type AppleSyncStatus,
  type SyncSummary
} from '@shared/apple-sync'
import {
  AppleSync,
  FOCUS_INTERVAL_MS,
  type AppleSyncDeps
} from '../../../src/main/apple-sync/apple-sync'
import type { SnapshotResult } from '../../../src/main/apple-sync/library-source'
import type { Snapshot } from '../../../src/main/apple-sync/snapshot'
import { ImportBusyError } from '../../../src/main/import/import-service'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { LIBRARY_ID, snapTrack, snapshot } from './fixtures'

const OTHER_ID = 'BBBBBBBBBBBBBBB2'
let settings: SettingsStore
let reads: SnapshotResult[]
let readOptions: unknown[]
let runs: { snapshot: Snapshot; decisions: unknown }[]
let runResult: () => Promise<SyncSummary>
let notices: AppleSyncNotice[]
let statuses: AppleSyncStatus[]
let changes: number
let now: number
let review: number
let disabled: number

const ok = (s: Snapshot = snapshot()): SnapshotResult => ({ ok: true, snapshot: s })
const changed = (): SyncSummary => ({ ...emptySyncSummary('t'), added: [{ path: '/m/a.mp3' }] })
// Resolves when every pending promise callback has run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function make(over: Partial<AppleSyncDeps> = {}): AppleSync {
  return new AppleSync({
    available: true,
    source: {
      read: async (options) => {
        readOptions.push(options)
        return reads.shift() ?? ok()
      }
    },
    settings,
    run: (s, decisions) => {
      runs.push({ snapshot: s, decisions })
      return runResult()
    },
    findConflicts: () => [],
    review: {
      count: () => review,
      resolve: () => undefined,
      resolveAll: () => undefined,
      disable: () => void disabled++
    },
    onStatus: (s) => statuses.push(s),
    onNotice: (n) => notices.push(n),
    onLibraryChanged: () => void changes++,
    onProgress: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    clock: () => now,
    random: () => 0,
    ...over
  })
}

beforeEach(() => {
  settings = new SettingsStore(createTestDb())
  reads = []
  readOptions = []
  runs = []
  runResult = async () => emptySyncSummary('t')
  notices = []
  statuses = []
  changes = 0
  now = 100_000
  review = 0
  disabled = 0
})

const enabled = () => {
  settings.set('appleSync.enabled', true)
  settings.set('appleSync.libraryId', LIBRARY_ID)
}

describe('AppleSync', () => {
  test('is off until enabled, and does nothing on triggers', async () => {
    const sync = make()
    expect(sync.status()).toMatchObject({ available: true, state: 'off' })
    sync.started()
    sync.focused()
    await sync.syncNow()
    expect(runs).toEqual([])
  })

  test('is hidden where unavailable', () => {
    enabled()
    expect(make({ available: false }).status()).toMatchObject({ available: false, state: 'off' })
  })

  test('syncs at startup; a sync that changed something saves the result, toasts and refetches', async () => {
    enabled()
    review = 2
    runResult = async () => changed()
    const sync = make()
    sync.started()
    await flush()
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.lastResult')).toMatchObject({ added: [{ path: '/m/a.mp3' }] })
    expect(notices).toEqual([
      { kind: 'changed', message: 'Synced with Apple Music: 1 added · 2 to review' }
    ])
    expect(changes).toBe(1)
    expect(statuses.map((s) => s.state)).toEqual(['syncing', 'idle'])
  })

  test('a sync that changed nothing is quiet', async () => {
    enabled()
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([])
    expect(changes).toBe(0)
  })

  test('focus syncs at most once every 10 seconds', async () => {
    enabled()
    const sync = make()
    sync.focused()
    await flush()
    sync.focused()
    await flush()
    expect(runs).toHaveLength(1)
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(runs).toHaveLength(2)
  })

  test('triggers during a sync queue one more sync, never more', async () => {
    enabled()
    let release!: () => void
    runResult = () => new Promise((resolve) => (release = () => resolve(emptySyncSummary('t'))))
    const sync = make()
    const first = sync.syncNow()
    await flush()
    void sync.syncNow()
    void sync.syncNow()
    release()
    await flush()
    release()
    await first
    await flush()
    expect(runs).toHaveLength(2)
  })

  test('access denied pauses with one notice; focus does nothing; Sync now retries', async () => {
    enabled()
    reads = [
      { ok: false, reason: 'denied', detail: 'TCC' },
      { ok: false, reason: 'denied', detail: 'TCC' }
    ]
    const sync = make()
    await sync.syncNow()
    expect(sync.status().state).toBe('paused-denied')
    expect(notices).toEqual([{ kind: 'denied' }])
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(readOptions).toHaveLength(1)
    await sync.syncNow()
    expect(readOptions).toHaveLength(2)
    expect(sync.status().state).toBe('paused-denied')
  })

  test('a failed read notices once until a sync succeeds, and the next trigger retries', async () => {
    enabled()
    reads = [
      { ok: false, reason: 'failed', detail: 'crash' },
      { ok: false, reason: 'failed', detail: 'crash' }
    ]
    const sync = make()
    sync.focused()
    await flush()
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(readOptions).toHaveLength(2)
    expect(notices).toEqual([{ kind: 'failed', detail: 'crash' }])
    expect(sync.status().state).toBe('idle')
    expect(runs).toEqual([])
  })

  test('a failing engine is a failed sync, logged and noticed', async () => {
    enabled()
    runResult = async () => {
      throw new Error('disk full')
    }
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([{ kind: 'failed', detail: 'disk full' }])
    expect(sync.status().state).toBe('idle')
  })

  test('Music with a different library open pauses before changing anything', async () => {
    enabled()
    reads = [ok({ ...snapshot(), libraryId: OTHER_ID })]
    const sync = make()
    await sync.syncNow()
    expect(runs).toEqual([])
    expect(sync.status().state).toBe('paused-other-library')
    expect(notices).toEqual([{ kind: 'other-library' }])
  })

  test('Switch to this library adopts the new library and syncs it', async () => {
    enabled()
    reads = [ok({ ...snapshot(), libraryId: OTHER_ID }), ok({ ...snapshot(), libraryId: OTHER_ID })]
    const sync = make()
    await sync.syncNow()
    await sync.switchLibrary()
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.libraryId')).toBe(OTHER_ID)
    expect(sync.status().state).toBe('idle')
  })

  test('a sync blocked by an import runs when the import finishes', async () => {
    enabled()
    let busy = true
    runResult = async () => {
      if (busy) throw new ImportBusyError()
      return emptySyncSummary('t')
    }
    const sync = make()
    await sync.syncNow()
    expect(notices).toEqual([])
    busy = false
    sync.importFinished()
    await flush()
    expect(runs).toHaveLength(2)
  })
})

describe('turning sync on and off', () => {
  // Review Focus 1.
  test('the preview waits for the permission dialog, and the first sync reuses its snapshot', async () => {
    const s = snapshot({ tracks: [snapTrack(1, '/m/a.mp3', { title: 'Kolo' })] })
    reads = [ok(s)]
    const sync = make({ findConflicts: () => [{ persistentId: 'X', name: 'Week' }] })
    const preview = await sync.preview()
    expect(readOptions).toEqual([{ timeoutMs: 300_000 }])
    expect(preview).toMatchObject({
      ok: true,
      preview: { trackCount: 1, tagSample: [{ title: 'Kolo' }] },
      conflicts: [{ name: 'Week' }]
    })
    const summary = await sync.enable({ X: 'replace' })
    expect(readOptions).toHaveLength(1)
    expect(runs).toEqual([{ snapshot: s, decisions: { X: 'replace' } }])
    expect(summary).not.toBeNull()
    expect(settings.get('appleSync.enabled')).toBe(true)
    expect(settings.get('appleSync.libraryId')).toBe(LIBRARY_ID)
    expect(sync.status().state).toBe('idle')
  })

  test('a denied preview is reported, and sync stays off', async () => {
    reads = [{ ok: false, reason: 'denied', detail: 'TCC' }]
    const sync = make()
    expect(await sync.preview()).toEqual({ ok: false, reason: 'denied', detail: 'TCC' })
    expect(sync.status().state).toBe('off')
  })

  test('turning on with a different library than last time pauses', async () => {
    settings.set('appleSync.libraryId', OTHER_ID)
    const sync = make()
    expect(await sync.enable({})).toBeNull()
    expect(sync.status().state).toBe('paused-other-library')
    expect(runs).toEqual([])
  })

  // Review Focus 3.
  test('turning off waits for a running sync, then leaves sync off', async () => {
    enabled()
    let release!: () => void
    runResult = () => new Promise((resolve) => (release = () => resolve(emptySyncSummary('t'))))
    const sync = make()
    const running = sync.syncNow()
    await flush()
    void sync.syncNow() // queued
    const off = sync.disable()
    await flush()
    expect(disabled).toBe(0)
    release()
    await off
    await running
    expect(disabled).toBe(1)
    expect(runs).toHaveLength(1)
    expect(settings.get('appleSync.enabled')).toBe(false)
    expect(sync.status().state).toBe('off')
    sync.focused()
    await flush()
    expect(runs).toHaveLength(1)
  })
})
