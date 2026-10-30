import { describe, expect, it } from 'vitest'
import { userDataOverride } from '../../../src/main/user-data'

const appData = '/Users/me/Library/Application Support'

describe('userDataOverride', () => {
  it('uses FDP_USER_DATA when it is set', () => {
    expect(userDataOverride({ FDP_USER_DATA: '/tmp/x' }, true, appData)).toBe('/tmp/x')
    expect(userDataOverride({ FDP_USER_DATA: '/tmp/x' }, false, appData)).toBe('/tmp/x')
  })

  it('gives an unpackaged run its own folder, so a development build never migrates the real library', () => {
    expect(userDataOverride({}, false, appData)).toBe(
      '/Users/me/Library/Application Support/Folk Dance Player (dev)'
    )
  })

  it('leaves the packaged app on the default folder', () => {
    expect(userDataOverride({}, true, appData)).toBeUndefined()
  })

  it('treats an empty FDP_USER_DATA as unset', () => {
    expect(userDataOverride({ FDP_USER_DATA: '' }, true, appData)).toBeUndefined()
  })
})
