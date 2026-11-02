import { expect, test } from '@playwright/test'
import { launch, workspace, type Running } from './app'
import { assetName, FEED_NAME, serveFeed, type Feed } from './update-feed'

// The real updater against a local feed (updates spec §8, layer 3): the check, the download and its
// checksum, and the banner. It stops short of pressing Restart to Update: the swap needs a signed app
// (the maintainer's rehearsal, layer 4).
let space: ReturnType<typeof workspace>
let running: Running
let feed: Feed

test.beforeEach(() => {
  space = workspace([{ title: 'Hora', genre: 'Romania' }])
})

test.afterEach(async () => {
  await running?.app.close()
  await feed?.close()
  space.cleanup()
})

const start = async (options: Parameters<typeof serveFeed>[0]): Promise<void> => {
  feed = await serveFeed(options)
  running = await launch(space.userData, { FDP_UPDATE_URL: feed.url })
}

test('a newer version is found, downloaded and offered in the banner', async () => {
  await start({ version: '99.0.0' })
  await expect(running.page.getByText(/Version 99\.0\.0 is ready/)).toHaveCount(0)
  await running.invoke('updates:check')
  await expect(running.page.getByText('Version 99.0.0 is ready.')).toBeVisible()
  await expect(running.page.getByRole('button', { name: 'Restart to Update' })).toBeVisible()
  expect(await running.invoke('updates:getState')).toEqual({ kind: 'ready', version: '99.0.0' })
  // The feed first, then the file it names (the updater also looks for a blockmap, for a partial
  // download, and falls back to the whole file without one).
  expect(feed.requests[0]).toBe(`/${FEED_NAME}`)
  expect(feed.requests).toContain(`/${assetName('99.0.0')}`)
})

test('the banner can be dismissed', async () => {
  await start({ version: '99.0.0' })
  await running.invoke('updates:check')
  await running.page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(running.page.getByText(/Version 99\.0\.0 is ready/)).toHaveCount(0)
})

test('a feed at the current version offers nothing', async () => {
  const info = await (async () => {
    // Launch once to learn the version the app reports, then serve exactly that.
    const probe = await launch(space.userData)
    const { version } = await probe.invoke<{ version: string }>('app:getInfo')
    await probe.app.close()
    return version
  })()
  await start({ version: info })
  expect(await running.invoke('updates:check')).toEqual({ kind: 'idle' })
  await expect(running.page.getByRole('button', { name: 'Restart to Update' })).toHaveCount(0)
  expect(feed.requests).toEqual([`/${FEED_NAME}`])
})

test('a zip whose checksum does not match is never offered', async () => {
  await start({ version: '99.0.0', sha512: 'AAAA' })
  await running.invoke('updates:check')
  // The download runs in the background; its failed check ends in an error.
  await expect
    .poll(async () => (await running.invoke<{ kind: string }>('updates:getState')).kind)
    .toBe('error')
  await expect(running.page.getByRole('button', { name: 'Restart to Update' })).toHaveCount(0)
  expect(await running.invoke<{ kind: string }>('updates:getState')).not.toMatchObject({
    kind: 'ready'
  })
})
