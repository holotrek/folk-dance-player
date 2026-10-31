import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, workspace, type Running } from './app'

// The guided tour's practice library, entered and left in the real app (tour spec §4.2, §8).
const SONGS = [
  { title: 'Hora', genre: 'Romania' },
  { title: 'Kolo', genre: 'Serbia' }
]

let space: ReturnType<typeof workspace>
let running: Running

test.beforeEach(async () => {
  space = workspace(SONGS)
  running = await launch(space.userData)
  await running.invoke('import:start', { kind: 'paths', paths: [space.music] })
})

test.afterEach(async () => {
  await running?.app.close()
  space.cleanup()
})

type Row = { title: string }
const titles = async (): Promise<string[]> =>
  (
    await running.invoke<Row[]>('library:list', {
      search: '',
      filter: { kind: 'all' },
      sort: { column: 'title', direction: 'asc' }
    })
  ).map((r) => r.title)

// The window reloads when a tour starts or ends; wait for the new page to be ready.
const reloaded = async (): Promise<void> => {
  await running.page.waitForLoadState('load')
  await running.page.getByRole('tab', { name: 'Program' }).waitFor()
}

// Entering or leaving a tour reloads the window, which ends the page's own call.
const enter = async (part: 'basic' | 'advanced'): Promise<void> => {
  await running.invoke('tour:start', part).catch(ignoreNavigation)
  await reloaded()
}
const leave = async (): Promise<void> => {
  await running.invoke('tour:leave').catch(ignoreNavigation)
  await reloaded()
}
const ignoreNavigation = (err: unknown): void => {
  if (!/context was destroyed|navigation/i.test(String(err))) throw err
}

const practiceFolders = (): string[] =>
  readdirSync(tmpdir()).filter((name) => name.startsWith('fdp-tour-'))

test('a tour shows the practice library, and leaving brings the real one back', async () => {
  const { invoke } = running
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])

  await enter('basic')
  expect(await invoke('tour:state')).toEqual({ part: 'basic', landOn: null })
  const practice = await titles()
  expect(practice.length).toBeGreaterThanOrEqual(7)
  expect(practice).toContain('Hava Nagila')
  expect(practice).not.toContain('Hora')

  await leave()
  expect(await titles()).toEqual(['Hora', 'Kolo'])
  // The window is told once to land on the Music tab; then nothing.
  expect(await invoke('tour:state')).toEqual({ part: null, landOn: 'music' })
  expect(await invoke('tour:state')).toEqual({ part: null, landOn: null })
})

test('the practice tune really plays', async () => {
  const { invoke } = running
  await enter('basic')
  await invoke('settings:set', 'countdown.seconds', 0)
  const [program] = await invoke<{ id: number }[]>('programs:list', '')
  await invoke('programs:setCurrent', program.id)
  await invoke('player:play')
  await expect
    .poll(async () => (await invoke<{ status: string }>('player:getState')).status)
    .toBe('playing')
  const state = await invoke<{ current: { track: { title: string; durationMs: number } } }>(
    'player:getState'
  )
  expect(state.current.track.title).toBe('Hava Nagila')
  expect(state.current.track.durationMs).toBeGreaterThan(20_000)
  // The audio element is really playing it (it advances).
  await expect
    .poll(() => running.page.evaluate(() => document.querySelector('audio')?.currentTime ?? 0))
    .toBeGreaterThan(0.3)
})

test('a tour leaves the real library and settings as they were, and the practice folder goes', async () => {
  await running.invoke('settings:set', 'autoContinue.seconds', 7) // settle the real writes first
  const before = practiceFolders().length

  await enter('basic')
  expect(practiceFolders().length).toBe(before + 1)
  await running.invoke('library:setFavorite', [1], true) // practice file id 1
  await running.invoke('settings:set', 'autoContinue.seconds', 99)
  await running.invoke('playlists:create', 'Practice only')
  await leave()

  expect(practiceFolders().length).toBe(before)
  const settings = await running.invoke<Record<string, unknown>>('settings:getAll')
  expect(settings['autoContinue.seconds']).toBe(7)
  expect(
    (await running.invoke<{ name: string }[]>('playlists:list')).map((p) => p.name)
  ).not.toContain('Practice only')
})

test('quitting during a tour leaves the real library showing next launch, and sweeps the practice folder', async () => {
  await enter('basic')
  const stale = join(tmpdir(), 'fdp-tour-stale-from-a-crash')
  mkdirSync(stale, { recursive: true })
  await running.app.close() // quitting mid-tour
  running = await launch(space.userData)
  expect(await running.invoke('tour:state')).toEqual({ part: null, landOn: null })
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])
  expect(existsSync(stale)).toBe(false)
})
