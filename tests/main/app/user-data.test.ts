import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { userDataOverride } from '../../../src/main/user-data'

const appData = '/Users/me/Library/Application Support'
const local = '/home/me/AppData/Local'

describe('userDataOverride', () => {
  it('uses FDP_USER_DATA when it is set', () => {
    expect(userDataOverride({ FDP_USER_DATA: '/tmp/x' }, true, appData, 'mac')).toBe('/tmp/x')
    expect(userDataOverride({ FDP_USER_DATA: '/tmp/x' }, false, appData, 'mac')).toBe('/tmp/x')
    expect(
      userDataOverride({ FDP_USER_DATA: '/tmp/x', LOCALAPPDATA: local }, true, appData, 'windows')
    ).toBe('/tmp/x')
  })

  it('gives an unpackaged run its own folder, so a development build never migrates the real library', () => {
    expect(userDataOverride({}, false, appData, 'mac')).toBe(
      '/Users/me/Library/Application Support/Folk Dance Player (dev)'
    )
    expect(userDataOverride({ LOCALAPPDATA: local }, false, appData, 'windows')).toBe(
      join(appData, 'Folk Dance Player (dev)')
    )
  })

  it('leaves the packaged app on the default folder on macOS and Linux', () => {
    expect(userDataOverride({}, true, appData, 'mac')).toBeUndefined()
    expect(userDataOverride({ LOCALAPPDATA: local }, true, appData, 'linux')).toBeUndefined()
  })

  it('treats an empty FDP_USER_DATA as unset', () => {
    expect(userDataOverride({ FDP_USER_DATA: '' }, true, appData, 'mac')).toBeUndefined()
  })

  it('keeps the packaged Windows app’s library in %LOCALAPPDATA%, off the roaming profile', () => {
    expect(userDataOverride({ LOCALAPPDATA: local }, true, appData, 'windows')).toBe(
      join(local, 'Folk Dance Player')
    )
  })

  it('falls back to the default folder when %LOCALAPPDATA% is missing, empty or relative', () => {
    expect(userDataOverride({}, true, appData, 'windows')).toBeUndefined()
    expect(userDataOverride({ LOCALAPPDATA: '' }, true, appData, 'windows')).toBeUndefined()
    expect(
      userDataOverride({ LOCALAPPDATA: 'AppData\\Local' }, true, appData, 'windows')
    ).toBeUndefined()
  })
})
