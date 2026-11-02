import { describe, expect, test } from 'vitest'
import { capabilitiesFor, platformFrom } from '@shared/platform'

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
      computer: 'computer'
    })
  })

  test('mac', () => {
    expect(capabilitiesFor('mac')).toEqual({
      platform: 'mac',
      appleMusicSync: true,
      mediaKeyTrust: true,
      fileManager: 'Finder',
      computer: 'Mac'
    })
  })

  test('linux', () => {
    expect(capabilitiesFor('linux').fileManager).toBe('file manager')
    expect(capabilitiesFor('linux').appleMusicSync).toBe(false)
  })
})
