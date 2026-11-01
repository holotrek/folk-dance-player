import { beforeEach, describe, expect, test, vi } from 'vitest'
import { UPDATE_CHECK_MS, UPDATE_FIRST_CHECK_MS, type UpdateState } from '@shared/updates'
import type { Logger } from '../../../src/main/log/logger'
import {
  checkForUpdatesFromMenu,
  UpdateService,
  type Updater
} from '../../../src/main/updates/update-service'

// A fake updater: `check` runs what the test set up in `onCheck`, which may fire the events.
function fakeUpdater() {
  const listeners = {
    available: [] as ((v: string) => void)[],
    none: [] as (() => void)[],
    downloaded: [] as ((v: string) => void)[],
    error: [] as ((e: Error) => void)[]
  }
  const updater = {
    enabled: true,
    checks: 0,
    installs: 0,
    onCheck: (): Promise<void> | void => undefined,
    isEnabled: () => updater.enabled,
    check: async () => {
      updater.checks++
      await updater.onCheck()
    },
    quitAndInstall: () => void updater.installs++,
    onAvailable: (l: (v: string) => void) => void listeners.available.push(l),
    onNotAvailable: (l: () => void) => void listeners.none.push(l),
    onDownloaded: (l: (v: string) => void) => void listeners.downloaded.push(l),
    onError: (l: (e: Error) => void) => void listeners.error.push(l)
  }
  return {
    updater: updater as typeof updater & Updater,
    fire: {
      available: (v: string) => listeners.available.forEach((l) => l(v)),
      none: () => listeners.none.forEach((l) => l()),
      downloaded: (v: string) => listeners.downloaded.forEach((l) => l(v)),
      error: (e: Error) => listeners.error.forEach((l) => l(e))
    }
  }
}

function setup(options: { autoCheck?: boolean; touring?: boolean } = {}) {
  vi.useFakeTimers()
  const fake = fakeUpdater()
  const states: UpdateState[] = []
  const logged: string[] = []
  const flags = { autoCheck: options.autoCheck ?? true, touring: options.touring ?? false }
  const log: Logger = {
    dir: '',
    info: (m) => void logged.push(`info ${m}`),
    warn: (m) => void logged.push(`warn ${m}`),
    error: (m, err) => void logged.push(`error ${m} ${err instanceof Error ? err.message : ''}`)
  }
  const service = new UpdateService(fake.updater, {
    autoCheck: () => flags.autoCheck,
    touring: () => flags.touring,
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as never)
    },
    log,
    onState: (s) => void states.push(s)
  })
  return { ...fake, service, states, logged, flags }
}

beforeEach(() => vi.useRealTimers())

describe('UpdateService', () => {
  test('knows nothing at first', () => {
    const { service } = setup()
    expect(service.getState()).toEqual({ kind: 'idle' })
  })

  test('checks shortly after start, then every few hours', async () => {
    const { service, updater } = setup()
    service.start()
    expect(updater.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(updater.checks).toBe(1)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS)
    expect(updater.checks).toBe(2)
    service.stop()
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS * 2)
    expect(updater.checks).toBe(2)
  })

  test('an update goes from found, to downloading, to ready, announcing each change once', async () => {
    const { service, updater, fire, states } = setup()
    updater.onCheck = () => fire.available('0.3.1')
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(service.getState()).toEqual({ kind: 'downloading', version: '0.3.1' })
    fire.downloaded('0.3.1')
    expect(service.getState()).toEqual({ kind: 'ready', version: '0.3.1' })
    expect(states.map((s) => s.kind)).toEqual(['checking', 'downloading', 'ready'])
  })

  test('being up to date ends in idle', async () => {
    const { service, updater, fire } = setup()
    updater.onCheck = () => fire.none()
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(service.getState()).toEqual({ kind: 'idle' })
  })

  test('a failing automatic check is logged and throws nothing', async () => {
    const { service, updater, logged } = setup()
    updater.onCheck = () => Promise.reject(new Error('offline'))
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(logged.some((l) => l.startsWith('error') && l.includes('offline'))).toBe(true)
    // The next round still happens.
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS)
    expect(updater.checks).toBe(2)
  })

  test('an error event from the updater is logged', async () => {
    const { service, updater, fire, logged } = setup()
    updater.onCheck = () => fire.error(new Error('bad feed'))
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(logged.some((l) => l.includes('bad feed'))).toBe(true)
  })

  test.each([
    ['the setting is off', { autoCheck: false }],
    ['a tour is running', { touring: true }]
  ])('no automatic check when %s', async (_name, options) => {
    const { service, updater } = setup(options)
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS + UPDATE_CHECK_MS)
    expect(updater.checks).toBe(0)
  })

  test('no automatic check where the app cannot update itself', async () => {
    const { service, updater } = setup()
    updater.enabled = false
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    expect(updater.checks).toBe(0)
  })

  test('no automatic check while an update is already downloading or ready', async () => {
    const { service, updater, fire } = setup()
    updater.onCheck = () => fire.available('0.3.1')
    service.start()
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS)
    expect(updater.checks).toBe(1)
    fire.downloaded('0.3.1')
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS)
    expect(updater.checks).toBe(1)
  })

  test('a manual check ignores the setting and a tour, and answers up to date', async () => {
    const { service, updater, fire } = setup({ autoCheck: false, touring: true })
    updater.onCheck = () => fire.none()
    await expect(service.checkNow()).resolves.toEqual({ kind: 'idle' })
    expect(updater.checks).toBe(1)
  })

  test('a manual check answers downloading, ready, or the error', async () => {
    const { service, updater, fire } = setup()
    updater.onCheck = () => fire.available('0.3.1')
    await expect(service.checkNow()).resolves.toEqual({ kind: 'downloading', version: '0.3.1' })
    fire.downloaded('0.3.1')
    await expect(service.checkNow()).resolves.toEqual({ kind: 'ready', version: '0.3.1' })
    expect(updater.checks).toBe(1) // a ready update is not looked for again

    const other = setup()
    other.updater.onCheck = () => Promise.reject(new Error('offline'))
    await expect(other.service.checkNow()).resolves.toEqual({ kind: 'error', message: 'offline' })
  })

  test('a manual check says unsupported without checking where the app cannot update', async () => {
    const { service, updater } = setup()
    updater.enabled = false
    await expect(service.checkNow()).resolves.toEqual({ kind: 'unsupported' })
    expect(updater.checks).toBe(0)
  })

  test('install restarts only from ready', () => {
    const { service, updater, fire } = setup()
    service.install()
    expect(updater.installs).toBe(0)
    fire.available('0.3.1')
    service.install()
    expect(updater.installs).toBe(0)
    fire.downloaded('0.3.1')
    service.install()
    expect(updater.installs).toBe(1)
  })
})

describe('Check for Updates… from the menu', () => {
  const ui = () => ({
    told: [] as { message: string; detail?: string }[],
    asked: [] as string[],
    answer: true,
    tell(message: string, detail?: string) {
      this.told.push({ message, detail })
    },
    async askRestart(version: string) {
      this.asked.push(version)
      return this.answer
    }
  })
  const service = (result: Awaited<ReturnType<UpdateService['checkNow']>>) => ({
    checkNow: async () => result,
    install: vi.fn()
  })

  test('says a development run cannot update', async () => {
    const u = ui()
    await checkForUpdatesFromMenu(service({ kind: 'unsupported' }), u, '0.3.0')
    expect(u.told[0].message).toBe('Updates only work in the installed app.')
  })

  test('says the version is the latest', async () => {
    const u = ui()
    await checkForUpdatesFromMenu(service({ kind: 'idle' }), u, '0.3.0')
    expect(u.told[0].message).toBe('You have the latest version (0.3.0).')
  })

  test('says an update is downloading and will appear in the banner', async () => {
    const u = ui()
    await checkForUpdatesFromMenu(service({ kind: 'downloading', version: '0.3.1' }), u, '0.3.0')
    expect(u.told[0].message).toContain('0.3.1')
    expect(u.told[0].detail).toContain('banner')
  })

  test('a ready update asks, and installs only when the person says Restart', async () => {
    const yes = ui()
    const s1 = service({ kind: 'ready', version: '0.3.1' })
    await checkForUpdatesFromMenu(s1, yes, '0.3.0')
    expect(yes.asked).toEqual(['0.3.1'])
    expect(s1.install).toHaveBeenCalledTimes(1)

    const no = ui()
    no.answer = false
    const s2 = service({ kind: 'ready', version: '0.3.1' })
    await checkForUpdatesFromMenu(s2, no, '0.3.0')
    expect(s2.install).not.toHaveBeenCalled()
  })

  test('an error is shown with a hint about the Applications folder', async () => {
    const u = ui()
    await checkForUpdatesFromMenu(service({ kind: 'error', message: 'offline' }), u, '0.3.0')
    expect(u.told[0].message).toContain('offline')
    expect(u.told[0].detail).toContain('Applications')
  })
})
