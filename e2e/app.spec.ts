import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { drag, launch, workspace, type Running } from './app'

// Spec §10.2's end-to-end tests. The file dialog is native, so music is imported through the
// app's own import channel; everything after that goes through the windows.
const SONGS = [
  { title: 'Hora', genre: 'Romania' },
  { title: 'Kolo', genre: 'Serbia' },
  { title: 'Tfilati', genre: 'Israel' }
]

let space: ReturnType<typeof workspace>
let running: Running

test.beforeEach(async () => {
  space = workspace(SONGS)
  running = await launch(space.userData)
  await running.invoke('settings:set', 'countdown.seconds', 0)
  await running.invoke('import:start', { kind: 'paths', paths: [space.music] })
})

test.afterEach(async () => {
  await running?.app.close()
  space.cleanup()
})

const libraryRow = (title: string) =>
  running.page.getByRole('table', { name: 'Songs' }).getByRole('row').filter({ hasText: title })
const programItems = () =>
  running.page.getByRole('list', { name: 'Program items' }).getByRole('listitem')

test('import a folder, then search', async () => {
  const { page } = running
  await page.getByRole('tab', { name: 'Music' }).click()
  await expect(page.getByText('3 songs in your library')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search music' }).fill('kol')
  await expect(libraryRow('Kolo')).toBeVisible()
  await expect(libraryRow('Hora')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(libraryRow('Hora')).toBeVisible()
})

test('drag songs into a program, then reorder them', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await drag(running.page, libraryRow('Hora'), program)
  await expect(programItems()).toHaveCount(1)
  await drag(running.page, libraryRow('Kolo'), program)
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])
  await drag(
    running.page,
    programItems().filter({ hasText: 'Kolo' }),
    programItems().filter({ hasText: 'Hora' })
  )
  await expect(programItems()).toHaveText([/Kolo/, /Hora/])
})

test('Edit details on a program item opens its song in the Music page editor', async () => {
  const { page } = running
  await drag(running.page, libraryRow('Kolo'), page.getByRole('region', { name: 'Program' }))
  await programItems().filter({ hasText: 'Kolo' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await expect(page.getByRole('tab', { name: 'Music' })).toHaveAttribute('aria-selected', 'true')
  await expect(libraryRow('Kolo')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('complementary', { name: 'Song editor' })).toBeVisible()
})

test('play, and the projector’s snapshot follows', async () => {
  const { page, invoke } = running
  await drag(running.page, libraryRow('Tfilati'), page.getByRole('region', { name: 'Program' }))
  await expect(page.getByTestId('player-title')).toHaveText('Next up: Tfilati')
  type Snapshot = { middle: { kind: string; entry: { parts: { dance: string } } } | null }
  expect((await invoke<Snapshot>('projector:getSnapshot')).middle).toMatchObject({ kind: 'next' })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('player-title')).toHaveText('Tfilati')
  await expect
    .poll(async () => (await invoke<Snapshot>('projector:getSnapshot')).middle)
    .toMatchObject({ kind: 'now', entry: { parts: { dance: 'Tfilati' } } })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
})

test('a program is saved, and loads again, also after a restart', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await drag(running.page, libraryRow('Hora'), program)
  await drag(running.page, libraryRow('Kolo'), program)
  await page.getByRole('button', { name: 'Rename program' }).click()
  await page.getByRole('dialog', { name: 'Rename program' }).getByLabel('Name').fill('Tuesday')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Program: Tuesday')).toBeVisible()

  // Another program, then back to Tuesday from the sidebar.
  await page.getByRole('button', { name: 'New program' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Wednesday')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Program: Wednesday')).toBeVisible()
  await expect(programItems()).toHaveCount(0)
  await page.getByRole('group', { name: 'Programs' }).getByText('Tuesday').click()
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])

  // Restart: Tuesday is still the loaded program, with its songs.
  await running.app.close()
  running = await launch(space.userData)
  await expect(running.page.getByText('Program: Tuesday')).toBeVisible()
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])
})

test('Settings… in the app menu opens the Settings page', async () => {
  await running.app.evaluate(({ Menu }) => {
    const app = Menu.getApplicationMenu()!.items[0].submenu!
    app.items.find((i) => i.label === 'Settings…')!.click()
  })
  await expect(running.page.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

test('each start backs up the library first, and the log says so', async () => {
  await running.app.close()
  running = await launch(space.userData)
  const backups = readdirSync(join(space.userData, 'backups'))
  expect(backups).toEqual([expect.stringMatching(/^folk-dance-player-.*\.sqlite$/)])
  const log = readFileSync(join(space.userData, 'logs', 'main.log'), 'utf8')
  expect(log).toMatch(/\[info\] Folk Dance Player 0\.\d+\.\d+ starting/)
  expect(log).toContain(`Backed up the library to ${join(space.userData, 'backups', backups[0])}`)
})
