import { describe, expect, test, vi } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import type { TourState } from '@shared/tour'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { PlayerSession } from '../../../src/main/session/player-session'
import { createSessionPorts } from '../../../src/main/session/session-ports'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

function setup(tour?: HandlerDeps['tour']) {
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
    tour
  }
  return { settings, h: createHandlers(deps) as InvokeHandlers }
}

describe('tour handlers', () => {
  test('the offer follows the real flags', async () => {
    const { h, settings } = setup()
    expect(await h['tour:offer']()).toBe('basic')
    settings.set('tour.basic', 'done')
    expect(await h['tour:offer']()).toBe('advanced')
    settings.set('tour.advanced', 'done')
    expect(await h['tour:offer']()).toBeNull()
  })

  test('the launch offer can be switched off (end-to-end tests turn it off)', async () => {
    const { h } = setup({
      start: vi.fn(),
      leave: vi.fn(),
      state: () => ({ part: null, landOn: null }),
      offerEnabled: false
    })
    expect(await h['tour:offer']()).toBeNull()
  })

  test('tour:finish and tour:hide set the real flags', async () => {
    const { h, settings } = setup()
    await h['tour:finish']('basic')
    expect(settings.get('tour.basic')).toBe('done')
    await h['tour:hide']('advanced')
    expect(settings.get('tour.advanced')).toBe('hidden')
    expect(settings.get('tour.basic')).toBe('done')
  })

  test('the flags default to unseen and reject anything else', () => {
    const { settings } = setup()
    expect(settings.get('tour.basic')).toBe('unseen')
    expect(settings.get('tour.advanced')).toBe('unseen')
    expect(() => settings.set('tour.basic', 'maybe')).toThrow()
  })

  test('start, leave and state are the tour mode’s, when there is one', async () => {
    const start = vi.fn()
    const leave = vi.fn()
    const state = vi.fn((): TourState => ({ part: 'advanced', landOn: null }))
    const { h } = setup({ start, leave, state })
    await h['tour:start']('basic')
    await h['tour:leave']()
    expect(start).toHaveBeenCalledWith('basic')
    expect(leave).toHaveBeenCalledTimes(1)
    expect(await h['tour:state']()).toEqual({ part: 'advanced', landOn: null })
  })

  test('without a tour mode, state reports none and start and leave do nothing', async () => {
    const { h } = setup()
    expect(await h['tour:state']()).toEqual({ part: null, landOn: null })
    expect(await h['tour:start']('basic')).toBeUndefined()
    expect(await h['tour:leave']()).toBeUndefined()
  })
})
