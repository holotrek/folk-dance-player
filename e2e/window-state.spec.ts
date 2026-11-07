import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, workspace, type Running } from './app'

// The control window reopens where it was left (1.0.0 spec §3.4). An unplugged display can't be
// staged here; a saved place on no display stands in for it.
let space: ReturnType<typeof workspace>
let running: Running | undefined

test.beforeEach(() => {
  space = workspace([{ title: 'Hora', genre: 'Romania' }])
})

test.afterEach(async () => {
  await running?.app.close()
  running = undefined
  space.cleanup()
})

const bounds = (r: Running) =>
  r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())

test('reopens at the size it was left', async () => {
  running = await launch(space.userData)
  await running.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 60, width: 1111, height: 703 })
  })
  await running.app.close() // closing the window saves at once
  running = await launch(space.userData)
  const b = await bounds(running)
  expect(b.width).toBe(1111)
  expect(b.height).toBe(703)
})

test('a saved place on no display opens fully on a display', async () => {
  running = await launch(space.userData)
  await running.app.close() // creates the library; closing also saves the window, so write after
  const db = new DatabaseSync(join(space.userData, 'folk-dance-player.sqlite'))
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('window.control', ?)").run(
    JSON.stringify({ x: 90000, y: 90000, width: 1200, height: 800, maximized: false })
  )
  db.close()
  running = await launch(space.userData)
  const visible = await running.app.evaluate(({ BrowserWindow, screen }) => {
    const b = BrowserWindow.getAllWindows()[0].getBounds()
    return screen.getAllDisplays().some((d) => {
      const w = d.workArea
      return b.x >= w.x && b.y >= w.y && b.x + 100 <= w.x + w.width && b.y + 50 <= w.y + w.height
    })
  })
  expect(visible).toBe(true)
})
