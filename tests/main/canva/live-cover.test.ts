import { expect, test } from 'vitest'
import { createCover } from '../../../src/main/canva/live-cover'

// The cover page loads asynchronously; each load waits for `finish(url)`.
function setup() {
  const log: string[] = []
  const pending = new Map<string, { resolve: () => void; reject: () => void }>()
  const cover = createCover({
    loadCover: (imageUrl) => {
      log.push(`load ${imageUrl ?? 'black'}`)
      return new Promise<void>((resolve, reject) =>
        pending.set(imageUrl ?? 'black', { resolve, reject })
      )
    },
    setCoverVisible: (v) => log.push(`cover ${v ? 'on' : 'off'}`),
    setPageVisible: (v) => log.push(`page ${v ? 'on' : 'off'}`)
  })
  const finish = async (url: string, ok = true) => {
    const p = pending.get(url)!
    if (ok) p.resolve()
    else p.reject()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { cover, log, finish }
}

test('a new image: nothing shows until the cover has loaded it, then the cover over the page', async () => {
  const { cover, log, finish } = setup()
  cover.cover('A')
  expect(log).toEqual(['cover off', 'page off', 'load A'])
  log.length = 0
  await finish('A')
  expect(log).toEqual(['cover on', 'page on'])
})

test('the image the cover already holds shows at once, never a previous slide', async () => {
  const { cover, log, finish } = setup()
  cover.cover('A')
  await finish('A')
  cover.reveal()
  log.length = 0
  cover.cover('B') // the cover still holds A: it stays hidden until B has loaded
  expect(log).toEqual(['cover off', 'page off', 'load B'])
  await finish('B')
  cover.reveal()
  log.length = 0
  cover.cover('B')
  expect(log).toEqual(['cover on', 'page on'])
})

test('revealed, hidden or replaced before it loads, a cover never shows', async () => {
  const { cover, log, finish } = setup()
  cover.cover('A')
  cover.cover('B')
  await finish('A')
  expect(log).not.toContain('cover on')
  await finish('B')
  expect(log.slice(-2)).toEqual(['cover on', 'page on'])

  const second = setup()
  second.cover.cover('C')
  second.cover.hide()
  await second.finish('C')
  expect(second.log).not.toContain('cover on')

  const third = setup()
  third.cover.cover('D')
  third.cover.reveal()
  await third.finish('D')
  expect(third.log.filter((l) => l === 'cover on')).toEqual([])
})

test('a cover that fails to load stays hidden, and loads again next time', async () => {
  const { cover, log, finish } = setup()
  cover.cover('A')
  await finish('A', false)
  expect(log).not.toContain('cover on')
  log.length = 0
  cover.cover('A')
  expect(log).toContain('load A')
})
