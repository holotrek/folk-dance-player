import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, test } from 'vitest'
import { INVOKE_CHANNELS } from '@shared/contract'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { emptySummary, type ImportRequest } from '@shared/import'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { registerHandlers } from '../../../src/main/ipc/register'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

const appInfo = { version: '0.1.0', dbPath: '/tmp/test.sqlite', schemaVersion: 1 }

const summary = emptySummary()

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  return {
    db,
    settings,
    appInfo: () => appInfo,
    importer: {
      run: async () => summary,
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
    ...overrides
  }
}

function makeHandlers(overrides: Partial<HandlerDeps> = {}) {
  return createHandlers(makeDeps(overrides))
}

describe('createHandlers', () => {
  test('app:getInfo returns app info', async () => {
    expect(await makeHandlers()['app:getInfo']()).toEqual(appInfo)
  })

  test('settings:getAll returns defaults for a new database', async () => {
    expect(await makeHandlers()['settings:getAll']()).toEqual(DEFAULT_SETTINGS)
  })

  test('settings:set saves and returns the updated settings', async () => {
    const h = makeHandlers()
    const result = await h['settings:set']('autoContinue.seconds', 9)
    expect(result['autoContinue.seconds']).toBe(9)
    expect((await h['settings:getAll']())['autoContinue.seconds']).toBe(9)
  })

  test('settings:set rejects invalid values', async () => {
    const h = makeHandlers()
    expect(() => h['settings:set']('autoContinue.seconds', -3)).toThrow(InvalidSettingError)
  })
})

describe('import and library handlers', () => {
  test('import:pickMusic returns what the user picked', async () => {
    const h = makeHandlers({
      dialogs: {
        pickMusic: async () => ['/Music/Balkan'],
        pickAppleLibrary: async () => null,
        pickPdf: async () => null,
        pickImage: async () => null
      }
    })
    expect(await h['import:pickMusic']()).toEqual(['/Music/Balkan'])
  })

  test('import:pickAppleLibrary returns the chosen file or null', async () => {
    const h = makeHandlers({
      dialogs: {
        pickMusic: async () => [],
        pickAppleLibrary: async () => '/x/Library.xml',
        pickPdf: async () => null,
        pickImage: async () => null
      }
    })
    expect(await h['import:pickAppleLibrary']()).toBe('/x/Library.xml')
  })

  test('import:start runs the import and returns its summary', async () => {
    const requests: ImportRequest[] = []
    const deps = makeDeps()
    deps.importer.run = async (request) => {
      requests.push(request)
      return summary
    }
    const result = await createHandlers(deps)['import:start']({ kind: 'paths', paths: ['/a.mp3'] })
    expect(result).toBe(summary)
    expect(requests).toEqual([{ kind: 'paths', paths: ['/a.mp3'] }])
  })

  test('import:cancel, previewApple and checkPlaylistConflicts delegate to the importer', async () => {
    const calls: string[] = []
    const deps = makeDeps()
    deps.importer = {
      run: async () => summary,
      cancel: () => void calls.push('cancel'),
      previewApple: async (path) => {
        calls.push(`preview ${path}`)
        return { trackCount: 1, playlists: [], tagSample: [] }
      },
      checkPlaylistConflicts: (ids) => {
        calls.push(`conflicts ${ids.join(',')}`)
        return [{ persistentId: 'BAL', name: 'Balkan' }]
      }
    }
    const h = createHandlers(deps)
    await h['import:cancel']()
    expect(await h['import:previewApple']('/x/Library.xml')).toEqual({
      trackCount: 1,
      playlists: [],
      tagSample: []
    })
    expect(await h['import:checkPlaylistConflicts'](['BAL'])).toEqual([
      { persistentId: 'BAL', name: 'Balkan' }
    ])
    expect(calls).toEqual(['cancel', 'preview /x/Library.xml', 'conflicts BAL'])
  })

  test('library:stats counts the files that are not missing', async () => {
    const deps = makeDeps()
    const add = deps.db.prepare(
      "INSERT INTO files (path, file_size, mtime_ms, source, is_missing) VALUES (?, 1, 1, 'files', ?)"
    )
    add.run('/a.mp3', 0)
    add.run('/b.mp3', 0)
    add.run('/c.mp3', 1)
    expect(await createHandlers(deps)['library:stats']()).toEqual({ fileCount: 2 })
  })
})

describe('registerHandlers', () => {
  test('registers exactly the contract channels and forwards arguments', async () => {
    type Listener = Parameters<IpcMain['handle']>[1]
    const registered = new Map<string, Listener>()
    registerHandlers({ handle: (ch, fn) => void registered.set(ch, fn) }, makeHandlers())

    expect([...registered.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort())
    const settings = (await registered.get('settings:set')!(
      {} as IpcMainInvokeEvent,
      'countdown.seconds',
      3
    )) as {
      'countdown.seconds': number
    }
    expect(settings['countdown.seconds']).toBe(3)
  })
})
