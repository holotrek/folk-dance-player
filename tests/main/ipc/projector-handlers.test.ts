import { describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import type { ProjectorStatus } from '@shared/projector'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

function setup(withProjector = true) {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  const calls: unknown[][] = []
  let status: ProjectorStatus = {
    enabled: false,
    open: false,
    mode: null,
    display: null,
    notice: null
  }
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 3 }),
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
    player: testPlayer(db, settings),
    onLibraryChanged: () => undefined,
    onProgramsChanged: () => undefined,
    projector: withProjector
      ? {
          status: () => status,
          setEnabled: (on) => {
            calls.push(['setEnabled', on])
            status = { ...status, enabled: on, open: on, mode: on ? 'projector' : null }
          },
          displays: () => [{ id: 2, label: 'Epson', primary: false, internal: false }],
          displayChoiceChanged: () => void calls.push(['displayChoiceChanged']),
          snapshot: () => ({ hasProgram: true, middle: null, upcoming: [], played: [] }),
          progress: (p) => void calls.push(['progress', p])
        }
      : undefined
  }
  return { h: createHandlers(deps) as InvokeHandlers, calls, settings }
}

describe('projector handlers', () => {
  test('the toggle turns projector mode on and returns the new status', async () => {
    const { h, calls } = setup()
    expect(await h['projector:setEnabled'](true)).toMatchObject({
      enabled: true,
      mode: 'projector'
    })
    expect(calls).toEqual([['setEnabled', true]])
    expect(await h['projector:status']()).toMatchObject({ open: true })
  })

  test('choosing a display saves it and moves an open projector', async () => {
    const { h, calls, settings } = setup()
    expect(await h['projector:displays']()).toEqual([
      { id: 2, label: 'Epson', primary: false, internal: false }
    ])
    await h['projector:setDisplay'](2)
    expect(settings.get('projector.displayId')).toBe(2)
    expect(calls).toEqual([['displayChoiceChanged']])
  })

  test('the projector window gets the snapshot; the control window reports progress', async () => {
    const { h, calls } = setup()
    expect(await h['projector:getSnapshot']()).toMatchObject({ hasProgram: true })
    await h['projector:reportProgress'](4, 1500, 180_000)
    expect(calls).toEqual([['progress', { playId: 4, positionMs: 1500, durationMs: 180_000 }]])
  })

  test('without a projector (tests, or before startup), everything reports it off', async () => {
    const { h } = setup(false)
    expect(await h['projector:status']()).toEqual({
      enabled: false,
      open: false,
      mode: null,
      display: null,
      notice: null
    })
    expect(await h['projector:displays']()).toEqual([])
    expect(await h['projector:getSnapshot']()).toEqual({
      hasProgram: false,
      middle: null,
      upcoming: [],
      played: []
    })
  })
})
