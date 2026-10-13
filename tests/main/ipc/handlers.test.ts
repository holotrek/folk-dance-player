import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, test } from 'vitest'
import { INVOKE_CHANNELS } from '@shared/contract'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { registerHandlers } from '../../../src/main/ipc/register'
import { InvalidSettingError, SettingsStore } from '../../../src/main/settings/settings-store'
import { createTestDb } from '../helpers/test-db'

const appInfo = { version: '0.1.0', dbPath: '/tmp/test.sqlite', schemaVersion: 1 }

function makeHandlers() {
  return createHandlers({ settings: new SettingsStore(createTestDb()), appInfo: () => appInfo })
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
