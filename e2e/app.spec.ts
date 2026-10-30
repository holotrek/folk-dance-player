import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  running.page.getByRole('listbox', { name: 'Program items' }).getByRole('option')

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

test('select two program items and drag them together', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  for (const title of ['Hora', 'Kolo', 'Tfilati']) {
    await drag(page, libraryRow(title), program)
    await expect(programItems()).toHaveCount(['Hora', 'Kolo', 'Tfilati'].indexOf(title) + 1)
  }
  const item = (title: string) => programItems().filter({ hasText: title })
  await item('Kolo').click()
  await item('Tfilati').click({ modifiers: ['Shift'] })
  await drag(page, item('Kolo'), item('Hora'))
  await expect(programItems()).toHaveText([/Kolo/, /Tfilati/, /Hora/])
  await expect(item('Kolo')).toHaveAttribute('aria-selected', 'true')
  await expect(item('Tfilati')).toHaveAttribute('aria-selected', 'true')
  await expect(item('Hora')).toHaveAttribute('aria-selected', 'false')
})

test('end a program, start a new one, and load the first again', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await drag(page, libraryRow('Hora'), program)
  await drag(page, libraryRow('Kolo'), program)
  await page.getByRole('button', { name: 'Rename program' }).click()
  await page.getByRole('dialog', { name: 'Rename program' }).getByLabel('Name').fill('Tuesday')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Program: Tuesday')).toBeVisible()

  await page.getByRole('button', { name: 'End Program' }).click()
  await expect(page.getByRole('button', { name: 'Start New Program' })).toBeVisible()
  await expect(programItems()).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End Program' })).toBeDisabled()

  await page.getByRole('button', { name: 'Start New Program' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Wednesday')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Program: Wednesday')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden() // its overlay would swallow the drag
  await drag(page, libraryRow('Tfilati'), program)
  await expect(programItems()).toHaveText([/Tfilati/])

  await page.getByRole('group', { name: 'Programs' }).getByText('Tuesday').click()
  await expect(programItems()).toHaveText([/Hora/, /Kolo/])
})

test('Previously played reads oldest to newest, and the projector snapshot agrees', async () => {
  const { page, invoke } = running
  const program = page.getByRole('region', { name: 'Program' })
  await drag(page, libraryRow('Hora'), program)
  await drag(page, libraryRow('Kolo'), program)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('player-title')).toHaveText('Hora')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByTestId('player-title')).toHaveText('Kolo')
  const played = page.getByRole('list', { name: 'Played songs' }).getByRole('listitem')
  await expect(played).toHaveText([/Hora/, /Kolo/])
  type Snapshot = { played: { parts: { dance: string } }[] }
  // The song playing now is the middle entry, so the snapshot lists only what came before it.
  await expect
    .poll(async () =>
      (await invoke<Snapshot>('projector:getSnapshot')).played.map((e) => e.parts.dance)
    )
    .toEqual(['Hora'])
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
})

test('the sidebar and the Program page show the program’s times', async () => {
  const { page } = running
  const program = page.getByRole('region', { name: 'Program' })
  await drag(page, libraryRow('Hora'), program)
  await drag(page, libraryRow('Kolo'), program)
  await expect(programItems()).toHaveCount(2)
  const sidebar = page.getByRole('group', { name: 'Programs' })
  await expect(sidebar.getByText(/Total play time: \d+:\d\d/)).toBeVisible()
  await expect(program.getByText(/Total play time: \d+:\d\d/)).toBeVisible()
  await expect(program.getByText(/^Ending about /)).toBeVisible()

  await page.getByRole('button', { name: 'End Program' }).click()
  await expect(program.getByText(/Ending about/)).toHaveCount(0)
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

test('a column dragged to a new place stays there after a restart', async () => {
  const header = (name: RegExp) =>
    running.page.getByRole('table', { name: 'Songs' }).getByRole('columnheader', { name })
  const headerNames = () =>
    running.page
      .getByRole('table', { name: 'Songs' })
      .getByRole('columnheader')
      .allTextContents()
      .then((names) => names.map((n) => n.replace(/ [▲▼]$/, '')).filter(Boolean))
  const DEFAULT = ['Dance / Song', 'Country', 'Choreographer', 'Teacher', 'Artist', 'Type']

  await running.page.getByRole('tab', { name: 'Music' }).click()
  await expect(running.page.getByText('3 songs in your library')).toBeVisible()
  expect((await headerNames()).slice(0, 6)).toEqual(DEFAULT)

  await drag(running.page, header(/^Artist/), header(/^Country/))
  await expect
    .poll(async () => (await headerNames()).slice(0, 3))
    .toEqual(['Dance / Song', 'Artist', 'Country'])

  // Restart: the Music page opens with the column where it was put.
  await running.app.close()
  running = await launch(space.userData)
  await running.page.getByRole('tab', { name: 'Music' }).click()
  await expect
    .poll(async () => (await headerNames()).slice(0, 3))
    .toEqual(['Dance / Song', 'Artist', 'Country'])
})

test('Alt+→ moves a column and the focus stays on its header', async () => {
  const table = running.page.getByRole('table', { name: 'Songs' })
  await running.page.getByRole('tab', { name: 'Music' }).click()
  const button = table.getByRole('columnheader', { name: /^Choreographer/ }).getByRole('button')
  await button.focus()
  await running.page.keyboard.press('Alt+ArrowRight')
  await expect(table.getByRole('columnheader')).toContainText(
    ['', 'Dance / Song', 'Country', 'Teacher', 'Choreographer', 'Artist'],
    { useInnerText: true }
  )
  await expect(button).toBeFocused()
  await running.page.keyboard.press('Alt+ArrowRight') // and it can be pressed again
  await expect(table.getByRole('columnheader').nth(4)).toContainText('Artist')
  await expect(table.getByRole('columnheader').nth(5)).toContainText('Choreographer')
})

test('renaming a song renames its same-named dance', async () => {
  const { page } = running
  await page.getByRole('tab', { name: 'Music' }).click()
  await libraryRow('Hora').click()
  const title = page.getByLabel('Title', { exact: true })
  await title.fill('Hora Nova')
  await title.blur()
  // One name, not "Hora ♪ Hora Nova": the dance followed the song.
  await expect(libraryRow('Hora Nova')).toBeVisible()
  await expect(libraryRow('Hora Nova')).not.toContainText('♪')
  const card = page.getByRole('group', { name: 'Hora Nova' })
  await expect(card.getByRole('checkbox', { name: 'Same as song' })).toBeChecked()
  await expect(card.getByLabel('Dance name')).toHaveValue('Hora Nova')
  await expect(card.getByLabel('Dance name')).toBeDisabled()
})

test('a PDF can be attached to a dance and removed from the editor', async () => {
  // The file dialog is native, so the app is told which file the dialog would return.
  const folder = mkdtempSync(join(tmpdir(), 'fdp-pdf-'))
  const pdf = join(folder, 'Hora notes.pdf')
  writeFileSync(pdf, '%PDF-1.4\n%%EOF\n')
  try {
    await running.app.close()
    running = await launch(space.userData, { FDP_PICK_ATTACHMENT: pdf })
    const { page } = running
    await page.getByRole('tab', { name: 'Music' }).click()
    await libraryRow('Hora').click()
    await page.getByRole('button', { name: 'Attach PDF…' }).click()
    await expect(page.getByText('Hora notes.pdf')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible()
    const stored = join(space.userData, 'dance-notes')
    expect(readdirSync(stored)).toHaveLength(1)
    rmSync(pdf) // the original is not needed any more
    await page.getByRole('button', { name: 'Remove PDF' }).click()
    await expect(page.getByRole('button', { name: 'Attach PDF…' })).toBeVisible()
    expect(existsSync(stored) ? readdirSync(stored) : []).toEqual([])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('a slide image is attached, and the projector snapshot carries it', async () => {
  // A tiny PNG (its signature is what the app checks); the file dialog is replaced by the variable.
  const folder = mkdtempSync(join(tmpdir(), 'fdp-image-'))
  const png = join(folder, 'Hora slide.png')
  writeFileSync(
    png,
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
  )
  type Snapshot = { middle: { slide?: { kind: string; imageUrl: string } } | null }
  try {
    await running.app.close()
    running = await launch(space.userData, { FDP_PICK_ATTACHMENT: png })
    const { page, invoke } = running
    await page.getByRole('tab', { name: 'Music' }).click()
    await libraryRow('Hora').click()
    await page.getByRole('button', { name: 'Upload image…' }).click()
    await expect(page.getByText('Hora slide.png')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Image for Hora' })).toBeVisible()
    expect(readdirSync(join(space.userData, 'slide-images'))).toHaveLength(1)
    // With one source there is nothing to choose.
    await expect(page.getByRole('radiogroup', { name: 'Show on the projector' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Program' }).click()
    await drag(page, libraryRow('Hora'), page.getByRole('region', { name: 'Program' }))
    await expect
      .poll(async () => (await invoke<Snapshot>('projector:getSnapshot')).middle?.slide)
      .toMatchObject({
        kind: 'image',
        imageUrl: expect.stringContaining('fdp-media://dance-image/')
      })

    await page.getByRole('tab', { name: 'Music' }).click()
    await libraryRow('Hora').click()
    await page.getByRole('button', { name: 'Remove image' }).click()
    await expect
      .poll(async () => (await invoke<Snapshot>('projector:getSnapshot')).middle?.slide)
      .toBeUndefined()
    expect(readdirSync(join(space.userData, 'slide-images'))).toEqual([])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
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
