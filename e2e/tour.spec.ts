import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { BASIC_STEPS } from '../src/renderer/src/tour/basic-steps'
import { dropInHolding, dropInProgram, launch, workspace, type Running } from './app'

// The guided tour's practice library, entered and left in the real app (tour spec §4.2, §8).
const SONGS = [
  { title: 'Hora', genre: 'Romania' },
  { title: 'Kolo', genre: 'Serbia' }
]

const TOUR_ENV = { FDP_TOUR_OFFER: 'on' } // unlike the other specs, these want the launch offer
let space: ReturnType<typeof workspace>
let running: Running

test.beforeEach(async () => {
  space = workspace(SONGS)
  running = await launch(space.userData, TOUR_ENV)
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

const welcome = () => running.page.getByRole('dialog', { name: 'Welcome to Folk Dance Player' })
const relaunch = async (): Promise<void> => {
  await running.app.close()
  running = await launch(space.userData, TOUR_ENV)
}

test('the launch offer appears; Not now changes nothing, so it comes back next launch', async () => {
  await expect(welcome()).toBeVisible()
  await welcome().getByRole('button', { name: 'Not now' }).click()
  await expect(welcome()).toBeHidden()
  expect((await running.invoke<Record<string, unknown>>('settings:getAll'))['tour.basic']).toBe(
    'unseen'
  )
  await relaunch()
  await expect(welcome()).toBeVisible()
})

test('Don’t show this again stops the offer for good', async () => {
  await welcome().getByRole('button', { name: 'Don’t show this again' }).click()
  await expect(welcome()).toBeHidden()
  await relaunch()
  await running.page.getByRole('tab', { name: 'Program' }).waitFor()
  await expect(welcome()).toBeHidden()
  expect((await running.invoke<Record<string, unknown>>('settings:getAll'))['tour.basic']).toBe(
    'hidden'
  )
})

test('Start the tour enters the practice library with a banner, and Leave returns to Music', async () => {
  const { page } = running
  await welcome().getByRole('button', { name: 'Start the tour' }).click()
  await page.getByText('Practice library: your real music is safe').waitFor()
  await expect(page.getByTestId('tour-blocker')).toBeVisible()
  await expect(page.getByText(/Step 1 of \d+/)).toBeVisible()

  await page.keyboard.press('Escape')
  await page
    .getByRole('dialog', { name: 'Leave the tour?' })
    .getByRole('button', { name: 'Leave' })
    .click()
  await page.getByRole('tab', { name: 'Music', selected: true }).waitFor()
  await expect(page.getByText('Practice library: your real music is safe')).toBeHidden()
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])
  expect((await running.invoke<Record<string, unknown>>('settings:getAll'))['tour.basic']).toBe(
    'unseen'
  )
})

test('a tour shows the practice library, and leaving brings the real one back', async () => {
  const { invoke } = running
  await running.page.getByRole('button', { name: 'Not now' }).click() // the launch offer
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])

  await enter('basic')
  expect(await invoke('tour:state')).toEqual({ part: 'basic', landOn: null })
  const practice = await titles()
  expect(practice.length).toBeGreaterThanOrEqual(7)
  expect(practice).toContain('Hava Nagila')
  expect(practice).not.toContain('Hora')

  await leave()
  expect(await titles()).toEqual(['Hora', 'Kolo'])
  // The reloaded window consumed the one-shot instruction to land on the Music tab.
  await expect(running.page.getByRole('tab', { name: 'Music', selected: true })).toBeVisible()
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
  running = await launch(space.userData, TOUR_ENV)
  expect(await running.invoke('tour:state')).toEqual({ part: null, landOn: null })
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])
  expect(existsSync(stale)).toBe(false)
})

// --- the whole Basic tour, done step by step in the real UI ---------------------------------

const STEP_COUNT = BASIC_STEPS.length

test('the Basic tour can be completed by doing each step in the real UI', async () => {
  test.setTimeout(120_000)
  const { page } = running
  const songs = page.getByRole('table', { name: 'Songs' })
  const song = (title: string) => songs.getByRole('row').filter({ hasText: title })
  const next = () => page.getByRole('button', { name: 'Next step' }).click()
  // The step's title, inside the tour's own popover or card (a heading elsewhere can match too).
  const onStep = async (title: string): Promise<void> => {
    await expect(
      page
        .locator('.mantine-Popover-dropdown, .mantine-Modal-content')
        .getByText(title, { exact: true })
        .first()
    ).toBeVisible()
  }

  // A lost drop is a known quirk of driving HTML5 drag and drop with a synthetic mouse (AGENTS.md).
  // Like a person, drag again if the tour has not moved on.
  const dragUntil = async (drag: () => Promise<void>, nextTitle: string): Promise<void> => {
    await drag()
    try {
      await onStep(nextTitle)
    } catch {
      await drag()
      await onStep(nextTitle)
    }
  }

  await welcome().getByRole('button', { name: 'Start the tour' }).click()
  await page.getByText('Practice library: your real music is safe').waitFor()
  await expect(page.getByText(new RegExp(`Step 1 of ${STEP_COUNT}$`))).toBeVisible()

  await onStep('Getting your music in')
  await next()

  await onStep('Open a song’s details')
  await song('Hava Nagila').click()

  await onStep('One tune, more than one dance')
  await song('Misirlou').click()

  await onStep('A song is not a dance')
  await next()

  await onStep('One dance, more than one tune')
  await song('Makedonsko Devojče').click()

  await onStep('Edit a dance once')
  const danceType = page.getByRole('combobox', { name: 'Dance type' })
  await danceType.fill('Open Circle')
  await danceType.press('Tab') // leaving the field saves it

  await onStep('Now the other tune')
  await song('Pusti Me Mamo').click()

  await onStep('Who belongs to what')
  await next()
  await onStep('Notes for a dance')
  await next()
  await onStep('Slides for the projector')
  await next()

  // The Program page.
  await onStep('Find songs')
  await page.getByRole('searchbox', { name: 'Search music' }).fill('hora')
  await onStep('Clear the search')
  await page.getByRole('button', { name: 'Clear search' }).click()

  await onStep('Build your program')
  await dragUntil(() => dropInProgram(page, song('Hora Mare')), 'When a song has two dances')
  await dragUntil(() => dropInProgram(page, song('Misirlou')), 'Which dance?')
  const dialog = page.getByRole('dialog', { name: 'Which dance?' })
  await dialog.getByRole('radio').last().check()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await onStep('Take something out')
  await page.getByRole('button', { name: /^Remove Hora Mare/ }).click()

  await onStep('Holding')
  await dragUntil(() => dropInHolding(page, song('Ali Pasa')), 'From the shelf to the program')
  const held = page.getByRole('listbox', { name: 'Held songs' }).getByRole('option')
  await dragUntil(() => dropInProgram(page, held.filter({ hasText: 'Ali Pasa' })), 'Favorites')
  await page.getByRole('button', { name: 'Add Zemer Atik to favorites' }).click()

  await onStep('Play it')
  await page.getByRole('button', { name: 'Play', exact: true }).click()

  await onStep('Slower or faster')
  const speed = page.getByLabel('Speed', { exact: true }).getByRole('slider')
  await speed.focus()
  await speed.press('ArrowLeft')
  await onStep('Volume')
  const volume = page.getByLabel('Volume', { exact: true }).getByRole('slider')
  await volume.focus()
  await volume.press('ArrowLeft')

  await onStep('The wait between songs')
  await next()

  await onStep('That is the basics')
  await expect(page.getByText(new RegExp(`Step ${STEP_COUNT} of ${STEP_COUNT}$`))).toBeVisible()
  await page.getByRole('button', { name: 'Start now!' }).click()

  // Back in the real library, on the Music tab, with Basic done and Advanced still to come.
  await page.getByRole('tab', { name: 'Music', selected: true }).waitFor()
  await expect(page.getByText('Practice library: your real music is safe')).toBeHidden()
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])
  const settings = await running.invoke<Record<string, unknown>>('settings:getAll')
  expect(settings['tour.basic']).toBe('done')
  expect(settings['tour.advanced']).toBe('unseen')
})
