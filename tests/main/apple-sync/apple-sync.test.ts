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
let warnings: string[]

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
    goneEstimate: () => ({ gone: 0, synced: 0 }),
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
    log: { info: () => undefined, warn: (m) => void warnings.push(m), error: () => undefined },
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
  warnings = []
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

  test('a denied preview is reported and logged, and sync stays off', async () => {
    reads = [{ ok: false, reason: 'denied', detail: 'TCC' }]
    const sync = make()
    expect(await sync.preview()).toEqual({ ok: false, reason: 'denied', detail: 'TCC' })
    expect(sync.status().state).toBe('off')
    expect(warnings).toEqual(["Couldn't read the Music library to turn sync on (denied): TCC"])
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

// Fixes from the final review's minors, chosen by the user.
describe('after the final review', () => {
  // Minor 1.
  test('turning on while turning off still waits for a sync waits for it, then runs', async () => {
    enabled()
    let release!: () => void
    runResult = () => new Promise((resolve) => (release = () => resolve(emptySyncSummary('t'))))
    const sync = make()
    void sync.syncNow()
    await flush()
    const off = sync.disable()
    await flush()
    const on = sync.enable({ X: 'replace' })
    await flush()
    expect(statuses.at(-1)?.waiting).toBe('sync')
    expect(runs).toHaveLength(1)
    runResult = async () => emptySyncSummary('t')
    release()
    await off
    expect(await on).not.toBeNull()
    expect(disabled).toBe(1)
    expect(runs.map((r) => r.decisions)).toEqual([{}, { X: 'replace' }])
    expect(settings.get('appleSync.enabled')).toBe(true)
    expect(sync.status()).toMatchObject({ state: 'idle', waiting: null })
  })

  // Minor 2.
  test('after turning off, a sync that was waiting for an import never runs', async () => {
    enabled()
    runResult = async () => {
      throw new ImportBusyError()
    }
    const sync = make()
    await sync.syncNow()
    await sync.disable()
    const before = readOptions.length
    sync.importFinished()
    await flush()
    expect(readOptions).toHaveLength(before)
    expect(sync.syncing).toBe(false)
  })

  // Minor 3.
  test('the first sync waits for a running import, keeping the choices', async () => {
    let busy = true
    runResult = async () => {
      if (busy) throw new ImportBusyError()
      return emptySyncSummary('t')
    }
    const sync = make()
    const on = sync.enable({ X: 'replace' })
    await flush()
    expect(sync.status().waiting).toBe('import')
    busy = false
    sync.importFinished()
    expect(await on).not.toBeNull()
    expect(runs.map((r) => r.decisions)).toEqual([{ X: 'replace' }, { X: 'replace' }])
    expect(sync.status()).toMatchObject({ state: 'idle', waiting: null })
  })

  // Minor 4.
  test('the preview says when Music has a different library; switching runs with the choices', async () => {
    settings.set('appleSync.libraryId', OTHER_ID)
    const sync = make()
    expect(await sync.preview()).toMatchObject({ ok: true, otherLibrary: true })
    await sync.enable({ X: 'replace' }, true)
    expect(runs.map((r) => r.decisions)).toEqual([{ X: 'replace' }])
    expect(settings.get('appleSync.libraryId')).toBe(LIBRARY_ID)
    expect(sync.status().state).toBe('idle')
  })

  // Minor 8: an import can take songs out of the review list, so the count is sent again.
  test('a finished import re-sends the status (the review count may have changed)', () => {
    enabled()
    const sync = make()
    review = 3
    sync.importFinished()
    expect(statuses.at(-1)?.reviewCount).toBe(3)
  })

  // Minor 5.
  test('a sync that only changed missing files refreshes the lists, quietly', async () => {
    enabled()
    runResult = async () => ({ ...emptySyncSummary('t'), missingChanged: true })
    const sync = make()
    await sync.syncNow()
    expect(changes).toBe(1)
    expect(notices).toEqual([])
  })

  // Minor 9.
  test('a sync that would send most songs to review pauses; Sync anyway runs it', async () => {
    enabled()
    const sync = make({ goneEstimate: () => ({ gone: 30, synced: 40 }) })
    await sync.syncNow()
    expect(runs).toEqual([])
    expect(sync.status()).toMatchObject({
      state: 'paused-shrunk',
      shrink: { missing: 30, total: 40 }
    })
    expect(notices).toEqual([{ kind: 'shrunk', missing: 30, total: 40 }])
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(notices).toHaveLength(1)
    expect(runs).toEqual([])
    await sync.syncAnyway()
    expect(runs).toHaveLength(1)
    expect(sync.status()).toMatchObject({ state: 'idle', shrink: null })
  })

  test('a paused shrink resumes by itself once Music reports the library again', async () => {
    enabled()
    let estimate = { gone: 30, synced: 40 }
    const sync = make({ goneEstimate: () => estimate })
    await sync.syncNow()
    estimate = { gone: 0, synced: 40 }
    now += FOCUS_INTERVAL_MS
    sync.focused()
    await flush()
    expect(runs).toHaveLength(1)
    expect(sync.status().state).toBe('idle')
  })

  test('fewer than 20 songs, or under half, sync as usual', async () => {
    enabled()
    const few = make({ goneEstimate: () => ({ gone: 19, synced: 20 }) })
    await few.syncNow()
    const half = make({ goneEstimate: () => ({ gone: 20, synced: 40 }) })
    await half.syncNow()
    expect(runs).toHaveLength(2)
  })
})
