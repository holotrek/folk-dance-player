import { describe, expect, test, vi } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import type { UpdateState } from '@shared/updates'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

function setup(updates?: HandlerDeps['updates']) {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  const player = new PlayerSession(
    createSessionPorts(db, settings),
    { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as never) },
    () => undefined
  )
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 7 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: {
      pickMusic: async () => [],
      pickAppleLibrary: async () => null,
      pickPdf: async () => null,
      pickImage: async () => null
    },
    player,
    onLibraryChanged: () => undefined,
    onProgramsChanged: () => undefined,
    updates
  }
  return { h: createHandlers(deps) as InvokeHandlers }
}

describe('the updates channels', () => {
  test('forward to the updater', async () => {
    const ready: UpdateState = { kind: 'ready', version: '0.3.1' }
    const install = vi.fn()
    const { h } = setup({
      getState: () => ready,
      checkNow: async () => ({ kind: 'downloading', version: '0.3.1' }),
      install
    })
    expect(await h['updates:getState']()).toEqual(ready)
    expect(await h['updates:check']()).toEqual({ kind: 'downloading', version: '0.3.1' })
    await h['updates:install']()
    expect(install).toHaveBeenCalledTimes(1)
  })

  test('without an updater (the practice library) the state is idle, a check is unsupported, install does nothing', async () => {
    const { h } = setup(undefined)
    expect(await h['updates:getState']()).toEqual({ kind: 'idle' })
    expect(await h['updates:check']()).toEqual({ kind: 'unsupported' })
    expect(await h['updates:install']()).toBeUndefined()
  })
})
