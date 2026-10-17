import { describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary } from '@shared/apple-sync'
import {
  appleSyncHandlers,
  type AppleSyncHandlerDeps
} from '../../../src/main/ipc/apple-sync-handlers'
import { emptySummary } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

function setup() {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 4 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: { pickMusic: async () => [], pickAppleLibrary: async () => null },
    player: testPlayer(db, settings),
    onLibraryChanged: () => undefined,
    onProgramsChanged: () => undefined
  }
  return { db, deps }
}

describe('Apple Music sync handlers', () => {
  test('without sync (another platform) the status is off and actions fail', async () => {
    const h = appleSyncHandlers({})
    expect(await h['appleSync:status']()).toEqual(APPLE_SYNC_OFF)
    expect(() => h['appleSync:syncNow']()).toThrow('only available on macOS')
  })

  test('each channel reaches AppleSync', async () => {
    const calls: unknown[][] = []
    const record =
      <R>(name: string, result: R) =>
      (...args: unknown[]): R => {
        calls.push([name, ...args])
        return result
      }
    const sync: AppleSyncHandlerDeps = {
      status: record('status', { ...APPLE_SYNC_OFF, available: true }),
      preview: record('preview', Promise.resolve({ ok: false, reason: 'denied', detail: '' })),
      enable: record('enable', Promise.resolve(emptySyncSummary('t'))),
      disable: record('disable', Promise.resolve()),
      syncNow: record('syncNow', Promise.resolve()),
      switchLibrary: record('switchLibrary', Promise.resolve()),
      syncAnyway: record('syncAnyway', Promise.resolve()),
      resolve: record('resolve', undefined),
      resolveAll: record('resolveAll', undefined),
      openPrivacySettings: record('openPrivacySettings', undefined)
    }
    const h = appleSyncHandlers({ appleSync: sync })
    await h['appleSync:enable']({ X: 'copy' }, true)
    await h['appleSync:syncAnyway']()
    await h['appleSync:resolve']([1, 2], 'remove')
    await h['appleSync:resolveAll']('keep')
    await h['appleSync:openPrivacySettings']()
    expect(calls).toEqual([
      ['enable', { X: 'copy' }, true],
      ['syncAnyway'],
      ['resolve', [1, 2], 'remove'],
      ['resolveAll', 'keep'],
      ['openPrivacySettings']
    ])
  })

  test('playlists:folders lists Music folders, and a mirror rejects edits', async () => {
    const { db, deps } = setup()
    const h = createHandlers(deps)
    db.prepare(
      "INSERT INTO playlist_folders (name, apple_persistent_id, position) VALUES ('IFD', 'FFFFFFFFFFFFFFF1', 1)"
    ).run()
    expect((await h['playlists:folders']()).map((f) => f.name)).toEqual(['IFD'])
    const id = Number(
      db
        .prepare(
          "INSERT INTO playlists (name, source, apple_persistent_id, apple_sync) VALUES ('M', 'apple_xml', 'AAAAAAAAAAAAAAA9', 1)"
        )
        .run().lastInsertRowid
    )
    expect(() => h['playlists:rename'](id, 'X')).toThrow('Edit this playlist in Music.')
  })
})
