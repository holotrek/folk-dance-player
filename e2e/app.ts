import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
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

// Starts the app on the library in `userData`, with any extra environment (FDP_APPLE_LIBRARY…).
export async function launch(
  userData: string,
  extraEnv: Record<string, string> = {}
): Promise<Running> {
  // The tour's launch offer would cover the app on a fresh library; only the tour specs want it.
  const env = {
    ...process.env,
    FDP_USER_DATA: userData,
    FDP_TOUR_OFFER: 'off',
    ...extraEnv
  } as Record<string, string>
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
  const to = await target.boundingBox()
  if (!to) throw new Error('drag: source or target is not visible')
  await dragToPoint(page, source, to.x + to.width / 2, to.y + to.height / 2)
}

async function dragToPoint(page: Page, source: Locator, x: number, y: number): Promise<void> {
  const from = await source.boundingBox()
  if (!from) throw new Error('drag: source or target is not visible')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up()
}

// Drops `source` on a panel near its bottom edge: below its list however many items it holds and
// however small the window is. The panel's center can land on an item, and a drop on an item goes
// before it (a small CI display did exactly that).
async function dropInPanel(
  page: Page,
  source: Locator,
  name: 'Program' | 'Holding'
): Promise<void> {
  const panel = await page.getByRole('region', { name }).boundingBox()
  if (!panel) throw new Error(`dropInPanel: the ${name} panel is not visible`)
  await dragToPoint(page, source, panel.x + panel.width / 2, panel.y + panel.height - 12)
}

export const dropInProgram = (page: Page, source: Locator): Promise<void> =>
  dropInPanel(page, source, 'Program')
export const dropInHolding = (page: Page, source: Locator): Promise<void> =>
  dropInPanel(page, source, 'Holding')

export interface FakeMusicTrack {
  id: number // becomes the persistent ID
  title: string // the workspace song's title (its file is <music>/<title>.mp3)
  genre?: string
}

// Writes a Music library snapshot (Apple Music sync spec §3.1) at `path`, for FDP_APPLE_LIBRARY.
// It is read fresh on every sync, so a test changes the "Music library" by writing it again.
export function writeAppleSnapshot(
  path: string,
  music: string,
  tracks: FakeMusicTrack[],
  playlists: { id: number; name: string; folder?: string; trackIds: number[] }[] = []
): void {
  const pid = (n: number): string => n.toString(16).toUpperCase().padStart(16, '0')
  const folders = [...new Set(playlists.flatMap((p) => (p.folder ? [p.folder] : [])))]
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      libraryId: 'AAAAAAAAAAAAAAA1',
      tracks: tracks.map((t) => ({
        persistentId: pid(t.id),
        location: pathToFileURL(join(music, `${t.title}.mp3`)).href,
        locationType: 'file',
        mediaKind: 'music',
        kind: 'MPEG audio file',
        title: t.title,
        artist: null,
        albumArtist: null,
        genre: t.genre ?? null,
        durationMs: 30000
      })),
      folders: folders.map((name, i) => ({ persistentId: pid(0xf000 + i), name, parentId: null })),
      playlists: playlists.map((p) => ({
        persistentId: pid(0xa000 + p.id),
        name: p.name,
        parentId: p.folder ? pid(0xf000 + folders.indexOf(p.folder)) : null,
        itemIds: p.trackIds.map(pid)
      }))
    })
  )
}
