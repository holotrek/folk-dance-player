import { describe, expect, test } from 'vitest'
import { capabilitiesFor, platformFrom, storeFrom } from '@shared/platform'

describe('platformFrom', () => {
  test('maps Node platform names', () => {
    expect(platformFrom('darwin', {}, true)).toBe('mac')
    expect(platformFrom('win32', {}, true)).toBe('windows')
    expect(platformFrom('freebsd', {}, true)).toBe('linux')
  })

  test('FDP_PLATFORM overrides an unpackaged run', () => {
    expect(platformFrom('darwin', { FDP_PLATFORM: 'windows' }, false)).toBe('windows')
  })

  test('FDP_PLATFORM is ignored by a packaged app', () => {
    expect(platformFrom('darwin', { FDP_PLATFORM: 'windows' }, true)).toBe('mac')
  })

  test('an unknown FDP_PLATFORM is ignored', () => {
    expect(platformFrom('darwin', { FDP_PLATFORM: 'beos' }, false)).toBe('mac')
  })
})

describe('capabilitiesFor', () => {
  test('windows', () => {
    expect(capabilitiesFor('windows')).toEqual({
      platform: 'windows',
      appleMusicSync: false,
      mediaKeyTrust: false,
      fileManager: 'File Explorer',
      computer: 'computer',
      store: false
    })
  })

  test('mac', () => {
    expect(capabilitiesFor('mac')).toEqual({
      platform: 'mac',
      appleMusicSync: true,
      mediaKeyTrust: true,
      fileManager: 'Finder',
      computer: 'Mac',
      store: false
    })
  })

  test('linux', () => {
    expect(capabilitiesFor('linux').fileManager).toBe('file manager')
    expect(capabilitiesFor('linux').appleMusicSync).toBe(false)
  })
})

describe('storeFrom', () => {
  test('is the Microsoft Store version only on Windows, where Electron says so', () => {
    expect(storeFrom('windows', true, {}, true)).toBe(true)
    expect(storeFrom('windows', false, {}, true)).toBe(false)
    expect(storeFrom('mac', true, {}, true)).toBe(false)
  })

  test('FDP_STORE=1 makes an unpackaged Windows run the Store version, a packaged one ignores it', () => {
    expect(storeFrom('windows', false, { FDP_STORE: '1' }, false)).toBe(true)
    expect(storeFrom('windows', false, { FDP_STORE: '1' }, true)).toBe(false)
    expect(storeFrom('mac', false, { FDP_STORE: '1' }, false)).toBe(false)
  })

  test('is a capability, and the Store updates the app itself', () => {
    expect(capabilitiesFor('windows', true).store).toBe(true)
    expect(capabilitiesFor('windows').store).toBe(false)
  })
})
