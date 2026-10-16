import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, workspace, writeAppleSnapshot } from './app'

// Apple Music sync spec §8 "End-to-end": turn sync on with an FDP_APPLE_LIBRARY snapshot, change
// the snapshot, focus the app, and check the toast, the review list and a mirror.
test('sync with Apple Music: turn on, change Music, then focus', async () => {
  const space = workspace([{ title: 'Kolo' }, { title: 'Hora' }])
  const library = join(space.userData, '..', 'music-library.json')
  const week = { id: 1, name: 'Week 3', folder: 'IFD2026', trackIds: [2, 1] }
  writeAppleSnapshot(
    library,
    space.music,
    [
      { id: 1, title: 'Kolo', genre: 'Serbia' },
      { id: 2, title: 'Hora' }
    ],
    [week]
  )
  const running = await launch(space.userData, { FDP_APPLE_LIBRARY: library })
  try {
    const { page } = running
    await page.getByRole('tab', { name: 'Music' }).click()
    await page.getByRole('switch', { name: /^Sync with Apple Music/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Start sync', exact: true }).click()
    await expect(page.getByText('Added (2)')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByText('IFD2026').click()
    await expect(page.getByText('Week 3')).toBeVisible()
    await expect(page.getByLabel('Apple Music playlist')).toBeVisible()

    // In Music: Kolo's genre changes, Hora is deleted, and Week 3 loses it.
    writeAppleSnapshot(
      library,
      space.music,
      [{ id: 1, title: 'Kolo', genre: 'Macedonia' }],
      [{ ...week, trackIds: [1] }]
    )
    // Focus syncs at most every 10 s (sync spec §3.3).
    await page.waitForTimeout(10_500)
    await running.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Folk Dance Player')
        ?.emit('focus')
    })
    await expect(
      page.getByText('Synced with Apple Music: 1 updated, 1 playlist changed · 1 to review')
    ).toBeVisible()
    await page.getByText('Removed from Apple Music (1)').click()
    const songs = page.getByRole('table', { name: 'Songs' })
    await expect(songs.getByText('Hora')).toBeVisible()
    await expect(songs.getByText('File still on disk')).toBeVisible()
  } finally {
    await running.app.close()
    space.cleanup()
  }
})
