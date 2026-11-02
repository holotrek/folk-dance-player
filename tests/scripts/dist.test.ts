import { describe, expect, test } from 'vitest'
import { distSteps, packagedApp } from '../../scripts/dist.mts'
import { cleanEnv } from '../../scripts/run.mts'

describe('distSteps', () => {
  test('on a Mac: build, build the Music helper, then the Universal installer', () => {
    expect(distSteps('darwin')).toEqual([
      ['npm', 'run', 'build'],
      ['npm', 'run', 'build:helper'],
      ['npx', 'electron-builder', '--mac', '--publish', 'never']
    ])
  })

  test('on Windows: no Music helper, and the Windows installer', () => {
    expect(distSteps('win32')).toEqual([
      ['npm', 'run', 'build'],
      ['npx', 'electron-builder', '--win', '--publish', 'never']
    ])
  })

  test('elsewhere there is no installer to build', () => {
    expect(() => distSteps('linux')).toThrow('No installer for linux')
  })
})

describe('packagedApp', () => {
  test('is the unpacked app, with its spaces in one piece', () => {
    expect(packagedApp('darwin')).toBe('dist/mac-universal/Folk Dance Player.app')
    expect(packagedApp('win32')).toBe('dist/win-unpacked/Folk Dance Player.exe')
  })

  test('throws for a system with no installer', () => {
    expect(() => packagedApp('linux')).toThrow('No installer for linux')
  })
})

describe('cleanEnv', () => {
  test('removes ELECTRON_RUN_AS_NODE (VS Code’s terminal sets it) and keeps the rest', () => {
    const env = cleanEnv({ ELECTRON_RUN_AS_NODE: '1', PATH: '/bin', FDP_USER_DATA: '/x' })
    expect(env).toEqual({ PATH: '/bin', FDP_USER_DATA: '/x' })
    expect('ELECTRON_RUN_AS_NODE' in env).toBe(false)
  })
})
