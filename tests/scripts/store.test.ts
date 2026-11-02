import { describe, expect, it } from 'vitest'
import { shellArg, storeArgs, storeVersion, storeVersionWarning } from '../../scripts/store.mjs'

describe('the Store version number', () => {
  it('is the app version itself', () => {
    expect(storeVersion('1.0.0')).toBe('1.0.0')
    expect(storeVersion('1.2.3')).toBe('1.2.3')
    expect(storeVersion('2.10.0')).toBe('2.10.0')
  })

  it('warns that the Store rejects a version that starts with 0', () => {
    expect(storeVersionWarning('0.4.0')).toMatch(/starts with 0/)
    expect(storeVersionWarning('1.0.0')).toBeNull()
  })

  it('refuses a version that is not major.minor.patch', () => {
    expect(() => storeVersion('0.4')).toThrow('0.4')
    expect(() => storeVersion('0.4.0-beta')).toThrow('0.4.0-beta')
  })
})

describe('the Store package build', () => {
  const identity = {
    STORE_IDENTITY_NAME: 'EvanKaiser.FolkDancePlayer',
    STORE_PUBLISHER: 'CN=1234ABCD-0000-0000-0000-000000000000',
    STORE_PUBLISHER_DISPLAY_NAME: 'Evan Kaiser'
  }

  it('builds the appx target with the identity Partner Center gave, and the Store version', () => {
    expect(storeArgs('1.4.0', identity)).toEqual([
      'npx',
      'electron-builder',
      '--win',
      'appx',
      '--publish',
      'never',
      '-c.extraMetadata.version=1.4.0',
      '-c.appx.identityName=EvanKaiser.FolkDancePlayer',
      '-c.appx.publisher=CN=1234ABCD-0000-0000-0000-000000000000',
      '-c.appx.publisherDisplayName=Evan Kaiser'
    ])
  })

  it('names every missing identity variable, so a half-set up account is obvious', () => {
    expect(() => storeArgs('1.4.0', {})).toThrow(
      /STORE_IDENTITY_NAME.*STORE_PUBLISHER.*STORE_PUBLISHER_DISPLAY_NAME/s
    )
    expect(() => storeArgs('1.4.0', { STORE_IDENTITY_NAME: 'x' })).toThrow('STORE_PUBLISHER')
  })

  it('treats empty variables as missing (an unset repository variable reads as empty in CI)', () => {
    expect(() => storeArgs('1.4.0', { ...identity, STORE_PUBLISHER: '' })).toThrow(
      'STORE_PUBLISHER'
    )
  })

  it('--test builds with a placeholder identity, to check that a package can be made at all', () => {
    const args = storeArgs('1.4.0', {}, { test: true })
    expect(args).toContain('-c.appx.identityName=FolkDancePlayerTest')
    expect(args).toContain('-c.extraMetadata.version=1.4.0')
  })
})

describe('passing the identity through the Windows shell', () => {
  it('quotes an argument with a space, because the shell would split it', () => {
    expect(shellArg('-c.appx.publisherDisplayName=Evan Kaiser', 'win32')).toBe(
      '"-c.appx.publisherDisplayName=Evan Kaiser"'
    )
  })

  it('leaves other arguments, and every argument on other systems, alone', () => {
    expect(shellArg('--win', 'win32')).toBe('--win')
    expect(shellArg('-c.appx.publisherDisplayName=Evan Kaiser', 'darwin')).toBe(
      '-c.appx.publisherDisplayName=Evan Kaiser'
    )
  })
})
