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

// The step's title, inside the tour's own popover or card (a heading elsewhere can match too).
const onStep = async (title: string): Promise<void> => {
  await expect(
    running.page
      .locator('.mantine-Popover-dropdown, .mantine-Modal-content')
      .getByText(title, { exact: true })
      .first()
  ).toBeVisible()
  // A step is only shown if its card is on screen: no popover cut off by the window's edge.
  const card = running.page
    .locator('.mantine-Popover-dropdown', {
      has: running.page.getByText(title, { exact: true })
    })
    .first()
  if (await card.count()) {
    await expect
      .poll(async () => {
        const box = await card.boundingBox()
        const view = await running.page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }))
        return (
          box !== null &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= view.width &&
          box.y + box.height <= view.height
        )
      })
      .toBe(true)
  }
}
// The tour switches pages itself, a moment after showing a step: wait for it before using the page.
const onPage = async (name: 'Music' | 'Program' | 'Settings'): Promise<void> => {
  await expect(running.page.getByRole('tab', { name, selected: true })).toBeVisible()
}
const next = (): Promise<void> => running.page.getByRole('button', { name: 'Next step' }).click()

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

// Starts the Basic tour from the launch offer and does every step, stopping at the closing choice.
async function doBasicTour(): Promise<void> {
  const { page } = running
  const songs = page.getByRole('table', { name: 'Songs' })
  const song = (title: string) => songs.getByRole('row').filter({ hasText: title })

  await welcome().getByRole('button', { name: 'Start the tour' }).click()
  await page.getByText('Practice library: your real music is safe').waitFor()
  await expect(page.getByText(new RegExp(`Step 1 of ${STEP_COUNT}$`))).toBeVisible()

  await onStep('Getting your music in')
  await onPage('Music')
  await next()

  await onStep('Try an import')
  await page.getByRole('button', { name: /Add Music/ }).click()
  await onStep('Which tag goes where')
  await expect(page.getByText('Populate Artist from', { exact: true })).toBeVisible()
  await next()
  await onStep('Import')
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click()
  await onStep('What happened')
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  await onStep('Open a song’s details')
  await song('Hava Nagila').click()

  await onStep('More than one dance for a song')
  await song('Legnala Dana').click()

  await onStep('Two dances, one song')
  await expect(page.getByRole('group', { name: /Lesnoto/ })).toBeVisible()
  await next()

  await onStep('One dance, more than one tune')
  await song('Makedonsko Devojče').click()

  await onStep('Edit a dance once')
  const danceType = page.getByRole('combobox', { name: 'Dance type' })
  await danceType.click()
  await page.getByRole('option', { name: 'Open Circle' }).click() // choosing a suggestion saves it at once

  await onStep('Now the other tune')
  await song('Legnala Dana').click()

  await onStep('The artist belongs to the song')
  await next()
  await onStep('The teacher belongs to the dance and tune together')
  await next()
  await onStep('Notes for a dance')
  await next()
  await onStep('Slides for the projector')
  await next()

  // The Program page.
  await onStep('Find songs')
  await onPage('Program')
  await page.getByRole('searchbox', { name: 'Search music' }).fill('hora')
  await onStep('Clear the search')
  await page.getByRole('button', { name: 'Clear search' }).click()

  await onStep('Build your program')
  await dragUntil(() => dropInProgram(page, song('Hava Nagila')), 'When a song has two dances')
  await dragUntil(() => dropInProgram(page, song('Legnala Dana')), 'Which dance?')
  const dialog = page.getByRole('dialog', { name: 'Which dance?' })
  await dialog.getByRole('radio').last().check()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await onStep('Take something out')
  await page.getByRole('button', { name: /^Remove .*Legnala Dana/ }).click()

  await onStep('Holding')
  await dragUntil(() => dropInHolding(page, song('Korobushka')), 'From the shelf to the program')
  const held = page.getByRole('listbox', { name: 'Held songs' }).getByRole('option')
  await dragUntil(() => dropInProgram(page, held.filter({ hasText: 'Korobushka' })), 'Favorites')
  await page.getByRole('button', { name: 'Add Zemer Atik to favorites' }).click()

  // Quick enough for a test: no countdown, and a one-second wait before the next song.
  await running.invoke('settings:set', 'countdown.seconds', 0)
  await running.invoke('settings:set', 'autoContinue.seconds', 1)
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

  // The first song repeats until this step, which jumps to its end; Korobushka then follows.
  await onStep('The wait between songs')
  await expect(running.page.getByTestId('player-title')).toContainText('Korobushka', {
    timeout: 30_000
  })
  await next()
  await onStep('That is the basics')
  await expect(page.getByText(new RegExp(`Step ${STEP_COUNT} of ${STEP_COUNT}$`))).toBeVisible()
}

// Does every Advanced step after its intro, ending on the closing choice's Done.
async function doAdvancedTour(): Promise<void> {
  const { page } = running
  await onStep('Showing dancers what is playing')
  await next()
  await onStep('With only one screen')
  await next()
  await onStep('Programs make themselves')
  await next()

  await onStep('Start another program')
  await page.getByRole('button', { name: 'New program', exact: true }).click()
  const naming = page.getByRole('dialog', { name: 'New program' })
  await naming.getByLabel('Name').fill('Saturday')
  await naming.getByRole('button', { name: 'Create' }).click()

  await onStep('Renaming and deleting')
  await next()

  await onStep('Load another program')
  await page.getByText('Friday warm-up').first().click()
  const confirm = page.getByRole('dialog', { name: 'Load another program?' })
  // A song may still be loaded from the Basic tour; then the app asks first.
  await confirm
    .getByRole('button', { name: 'Load' })
    .click({ timeout: 2000 })
    .catch(() => undefined)

  await onStep('Playlists')
  await page.getByText('Easy circle dances').first().click()
  await onStep('Folders from Music')
  await page.getByText('Festival 2026').first().click()
  await onStep('Changing a synced playlist')
  await page.getByRole('button', { name: 'Options for Balkan night' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate as my playlist' }).click()

  for (const title of [
    'Settings: Appearance',
    'Settings: Import',
    'Settings: Remote control',
    'Settings: About'
  ]) {
    await onStep(title)
    await next()
  }
  await onStep('That is everything')
  await page.getByRole('button', { name: 'Done' }).click()
}

const lands = async (): Promise<void> => {
  await running.page.getByRole('tab', { name: 'Music', selected: true }).waitFor()
  await expect(running.page.getByText('Practice library: your real music is safe')).toBeHidden()
  await expect.poll(titles).toEqual(['Hora', 'Kolo'])
}
const flags = async (): Promise<Record<string, unknown>> =>
  running.invoke<Record<string, unknown>>('settings:getAll')

test('the Basic tour can be completed by doing each step in the real UI', async () => {
  test.setTimeout(120_000)
  await doBasicTour()
  await running.page.getByRole('button', { name: 'Start now!' }).click()
  await lands()
  const settings = await flags()
  expect(settings['tour.basic']).toBe('done')
  expect(settings['tour.advanced']).toBe('unseen')
})

test('Learn more goes on into the Advanced tour, which can be completed the same way', async () => {
  test.setTimeout(180_000)
  await doBasicTour()
  await running.page.getByRole('button', { name: 'Learn more' }).click()
  // The Advanced intro, inside the tour: one button.
  await expect(
    running.page.getByRole('dialog', { name: 'Ready for the advanced features?' })
  ).toBeVisible()
  await running.page.getByRole('button', { name: 'Let’s go' }).click()
  await doAdvancedTour()
  await lands()
  const settings = await flags()
  expect(settings['tour.basic']).toBe('done')
  expect(settings['tour.advanced']).toBe('done')
})

test('an Advanced tour from the launch offer starts after its intro and can be completed', async () => {
  test.setTimeout(120_000)
  await running.invoke('settings:set', 'tour.basic', 'done')
  await relaunch()
  const intro = running.page.getByRole('dialog', { name: 'Ready for the advanced features?' })
  await expect(intro).toBeVisible()
  await intro.getByRole('button', { name: 'Start the tour' }).click()
  await running.page.getByText('Practice library: your real music is safe').waitFor()
  await doAdvancedTour()
  await lands()
  const settings = await flags()
  expect(settings['tour.basic']).toBe('done')
  expect(settings['tour.advanced']).toBe('done')
})
