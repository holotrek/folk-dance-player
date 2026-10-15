import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { mp3Bytes, type Id3Tags } from '../tests/main/helpers/audio-fixtures'

export interface Running {
  app: ElectronApplication
  page: Page // the control window
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
}

// A throwaway library folder and a music folder of silent MP3s (30 s each), removed afterwards.
export function workspace(songs: Id3Tags[]) {
  const root = mkdtempSync(join(tmpdir(), 'fdp-e2e-'))
  const music = join(root, 'music')
  mkdirSync(music)
  songs.forEach((tags, i) => writeFileSync(join(music, `${tags.title}.mp3`), mp3Bytes(tags, 30, i)))
  return {
    userData: join(root, 'library'),
    music,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  }
}

// The packaged app, when FDP_APP names its .app (npm run test:e2e:dist); otherwise the build in
// out/, started as `electron .` so it reports its own version.
const PACKAGED = process.env['FDP_APP']
  ? join(process.env['FDP_APP'], 'Contents', 'MacOS', basename(process.env['FDP_APP'], '.app'))
  : null

// Starts the app on the library in `userData`.
export async function launch(userData: string): Promise<Running> {
  const env = { ...process.env, FDP_USER_DATA: userData } as Record<string, string>
  delete env['ELECTRON_RUN_AS_NODE'] // set by VS Code's terminal; Electron would run as Node
  const app = await electron.launch(
    PACKAGED ? { executablePath: PACKAGED, args: [], env } : { args: ['.'], env }
  )
  const page = await app.firstWindow()
  await page.getByRole('tab', { name: 'Program' }).waitFor()
  return {
    app,
    page,
    invoke: (channel, ...args) =>
      page.evaluate(
        ([c, a]) => (window as unknown as { api: { invoke: Function } }).api.invoke(c, ...a),
        [channel, args] as const
      )
  }
}

// Drags `source` onto `target` the way a person does: press, then move over in small steps.
// Locator.dragTo sends only one or two dragover events; if one lands while the window is still
// re-rendering (just after an import or a drop), the drop target never accepts the drag and the
// drop is lost. Ten steps give it the dragover it needs.
export async function drag(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('drag: source or target is not visible')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
}
