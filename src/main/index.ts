import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  net,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
  systemPreferences
} from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'path'
import type { DatabaseSync } from 'node:sqlite'
import type { EventChannel, EventContract } from '@shared/contract'
import { MEDIA_SCHEME, parseMediaUrl, parseSlideUrl } from '@shared/media'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CanvaService } from './canva/canva-service'
import { CaptureQueue } from './canva/capture-queue'
import { slideImagePath } from './canva/decks'
import { canvaFetcher, createCanvaPage, createLiveView } from './canva/electron-canva'
import { createSlideCapturer } from './canva/slide-capturer'
import { backupDatabase } from './db/backup'
import { openDatabase } from './db/connection'
import { getSchemaVersion, migrate, SchemaTooNewError } from './db/migrate'
import { MIGRATIONS } from './db/migrations'
import { importDialogs } from './import/dialogs'
import { ImportService } from './import/import-service'
import { startUtilityWorker } from './import/utility-worker'
import { createHandlers } from './ipc/handlers'
import { createLogger } from './log/logger'
import { mediaResponse } from './media/media-response'
import { menuTemplate } from './menu'
import { KeepAwake } from './power/keep-awake'
import { ActivityWatcher } from './projector/activity'
import {
  ProjectorController,
  type DisplayInfo,
  type ProjectorWindow,
  type Rect
} from './projector/projector-controller'
import { createProjectorFeed } from './projector/projector-feed'
import { followProjectorWindow, LiveSlide } from './projector/live-slide'
import { registerMediaKeys } from './remote/media-keys'
import { checkProgramFiles } from './programs/file-check'
import { getProgram } from './programs/programs'
import { trackPath } from './programs/tracks'
import { PlayerSession } from './session/player-session'
import { createSessionPorts } from './session/session-ports'
import { guardNavigation } from './navigation'
import { registerHandlers } from './ipc/register'
import { SettingsStore } from './settings/settings-store'

// A separate library for end-to-end tests and smoke runs, so they never touch the real one.
if (process.env['FDP_USER_DATA']) app.setPath('userData', process.env['FDP_USER_DATA'])

// The app log (spec §10.1): ~/Library/Logs/Folk Dance Player, or beside a test library.
app.setAppLogsPath(
  process.env['FDP_USER_DATA'] ? join(process.env['FDP_USER_DATA'], 'logs') : undefined
)
const log = createLogger({ dir: app.getPath('logs') })
// Logged rather than shown: a side failure must never stop the music (spec §10.1).
process.on('uncaughtException', (err) => log.error('Uncaught exception', err))
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason))

// One app at a time: a second copy would open the same library and fight over the projector.
if (!app.requestSingleInstanceLock()) app.exit(0)

// The remote's media keys go to PlayerSession (global shortcuts, spec §7.4). Chromium's own media
// key handling would pause or play the <audio> element behind the session's back.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService')

// Audio is served to the control window by file id (spec §9). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }
])

// Loads one of the renderer's pages: index.html (the control window) or projector.html.
function loadPage(win: BrowserWindow, page: 'index.html' | 'projector.html'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}`)
  } else {
    win.loadFile(join(__dirname, '../renderer', page))
  }
}

// Spec §8.1: borderless over a whole display, above everything, never taking focus, so the
// control window keeps the keyboard. Always-on-top is set before the bounds, or macOS keeps the
// window below the menu bar.
// `hooks` lets the live Canva view follow the window (spec §8.3).
function createProjectorWindow(
  bounds: Rect,
  hooks: {
    opened(win: BrowserWindow): void
    resized(): void
    closed(win: BrowserWindow): void
  }
): ProjectorWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    enableLargerThanScreen: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#000',
    title: 'Folk Dance Player — Projector',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/projector.js'),
      sandbox: true
    }
  })
  hooks.opened(win)
  // Read-only: the mouse passes through, so the operator's cursor never wakes Canva's controls.
  // (Laptop mode still closes on mouse movement: ActivityWatcher polls the cursor.)
  win.setIgnoreMouseEvents(true)
  win.on('resize', hooks.resized)
  win.once('closed', () => hooks.closed(win))
  win.setAlwaysOnTop(true, 'screen-saver')
  // skipTransformProcessType: without it, macOS briefly makes the whole app a background app on
  // every call, hiding the control window and the Dock icon, and after sleep it can stay that way.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setBounds(bounds)
  guardNavigation(win.webContents)
  win.once('ready-to-show', () => win.showInactive())
  loadPage(win, 'projector.html')
  return {
    setBounds: (b) => win.setBounds(b),
    close: () => {
      if (!win.isDestroyed()) win.close()
    },
    onceClosed: (callback) => win.once('closed', callback),
    send: (channel, payload) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

const toDisplay = (d: Electron.Display): DisplayInfo => ({
  id: d.id,
  label: d.label || `Display ${d.id}`,
  internal: d.internal,
  bounds: d.bounds
})

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Folk Dance Player',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  win.on('ready-to-show', () => win.show())
  guardNavigation(win.webContents)
  loadPage(win, 'index.html')
  return win
}

function broadcast<C extends EventChannel>(channel: C, payload: EventContract[C]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

// Runs `fn` once after the current task, however many times it was asked for in it.
function coalesced(fn: () => void): () => void {
  let pending = false
  return () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      fn()
    })
  }
}

// Opens the library, backs it up (before any migration changes it), then migrates it.
function openLibraryDatabase(dbPath: string, backupsDir: string): DatabaseSync {
  const db = openDatabase(dbPath)
  try {
    const copy = backupDatabase(db, backupsDir, new Date(), MIGRATIONS.at(-1)!.version)
    if (copy) log.info(`Backed up the library to ${copy}`)
  } catch (err) {
    log.error("Couldn't back up the library", err)
  }
  try {
    migrate(db, MIGRATIONS)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

function startupErrorMessage(err: unknown): string {
  if (err instanceof SchemaTooNewError) {
    return (
      'This music library was created by a newer version of Folk Dance Player ' +
      `(schema ${err.dbVersion}; this version supports up to ${err.appVersion}).\n\n` +
      'Please update the app. Your library has not been changed.'
    )
  }
  return `The music library could not be opened.\n\n${err instanceof Error ? err.message : String(err)}`
}

// Everything that starts the app once Electron is ready. Startup is synchronous, so anything that
// throws here is shown and ends the app: otherwise it would only be logged, leaving a copy with no
// window that holds the single-instance lock (spec §10.1's log-only rule is for runtime failures).
function startApp(): void {
  electronApp.setAppUserModelId('com.folkdanceplayer.app')
  // The packaged app gets its icon from the bundle (build/icon.icns); unpackaged, the Dock would
  // show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(icon)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  log.info(`Folk Dance Player ${app.getVersion()} starting (Electron ${process.versions.electron})`)
  app.on('web-contents-created', (_, contents) => {
    contents.on('console-message', (e) => {
      if (e.level === 'error') log.warn(`Renderer: ${e.message}`)
    })
    contents.on('render-process-gone', (_, details) =>
      log.error(`A window's renderer stopped: ${details.reason}`)
    )
  })
  app.on('child-process-gone', (_, details) =>
    log.error(`The ${details.name ?? details.type} process stopped: ${details.reason}`)
  )

  const dbPath = join(app.getPath('userData'), 'folk-dance-player.sqlite')
  const backupsDir = join(app.getPath('userData'), 'backups')
  let db: DatabaseSync
  try {
    db = openLibraryDatabase(dbPath, backupsDir)
  } catch (err) {
    log.error("Couldn't open the library", err)
    dialog.showErrorBox('Folk Dance Player', startupErrorMessage(err))
    app.exit(1)
    return
  }

  const settings = new SettingsStore(db)
  // The projector's snapshot is rebuilt after anything it shows may have changed (set up below).
  let updateProjector = (): void => undefined
  const programsChanged = coalesced(() => {
    broadcast('programs:changed', null)
    updateProjector()
  })
  const libraryChanged = coalesced(() => {
    broadcast('library:changed', null)
    updateProjector()
  })
  const importer = new ImportService({
    db,
    settings,
    startWorker: startUtilityWorker,
    onProgress: (progress) => {
      broadcast('import:progress', progress)
      if (progress.phase === 'done') {
        log.info(`Import finished: ${progress.done} of ${progress.total} files read`)
        libraryChanged()
      }
    }
  })
  // A program that was deleted outside the app's control is forgotten; the current one's files
  // are checked before the event (spec §10.1). Playback never resumes on its own after a restart.
  const current = settings.get('currentProgramId')
  if (current !== null && !getProgram(db, current)) settings.set('currentProgramId', null)
  else if (current !== null) checkProgramFiles(db, current)

  const player = new PlayerSession(
    createSessionPorts(db, settings, undefined, { programsChanged, libraryChanged }),
    { setTimeout, clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) },
    (state) => {
      broadcast('player:state', state)
      updateProjector()
    }
  )
  protocol.handle(MEDIA_SCHEME, (request) => {
    const fileId = parseMediaUrl(request.url)
    const slide = parseSlideUrl(request.url)
    const path =
      fileId !== null
        ? trackPath(db, fileId)
        : slide
          ? slideImagePath(db, slide.deckId, slide.pageId)
          : null
    return mediaResponse(path, request.headers.get('range'))
  })

  // Canva slides (spec §8.3): saved images under the app data folder, captured in the background.
  const slidesDir = join(app.getPath('userData'), 'slides')
  const captures = new CaptureQueue({
    db,
    capturer: createSlideCapturer({
      createPage: createCanvaPage,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    }),
    slidesDir,
    writeFile: async (path, data) => {
      await mkdir(slidesDir, { recursive: true })
      await writeFile(path, data)
    },
    onStatus: (status) => {
      broadcast('canva:captureStatus', status)
      if (!status.running && status.failed > 0)
        log.warn(`${status.failed} of ${status.total} slide images couldn't be saved`)
    },
    onCaptured: libraryChanged
  })
  const canva = new CanvaService({
    db,
    fetcher: canvaFetcher,
    queue: captures,
    onChange: libraryChanged
  })

  const mediaKeys = registerMediaKeys(globalShortcut, player)
  // macOS delivers media keys only to an app trusted for Accessibility; other platforms don't ask.
  const trusted = (prompt: boolean) =>
    process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(prompt)
  const remote = {
    status: () => ({ trusted: trusted(false), keys: mediaKeys }),
    requestAccess: () => ({ trusted: trusted(true), keys: mediaKeys })
  }

  // One control window; closing it quits, so the projector is never left on its own.
  const mainWindow = createMainWindow()
  mainWindow.on('closed', () => app.quit())
  app.setAboutPanelOptions({
    applicationName: 'Folk Dance Player',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 Evan Kaiser',
    credits: 'For folk dance organizers. Inspired by MITPlayer.'
  })
  const reveal = (dir: string) => () =>
    void mkdir(dir, { recursive: true }).then(() => shell.openPath(dir))
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate({
        appName: 'Folk Dance Player',
        dev: is.dev,
        showSettings: () => {
          mainWindow.show()
          mainWindow.webContents.send('app:showPage', 'settings')
        },
        revealLogs: reveal(log.dir),
        revealBackups: reveal(backupsDir)
      })
    )
  )
  app.on('second-instance', () => {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  // The live Canva view lives in the projector window, over the saved image.
  const live: LiveSlide = new LiveSlide({
    createView: () => createLiveView(projectorWindows.current()!),
    online: () => projectorWindows.current() !== null && net.isOnline(),
    size: () => projectorWindows.current()?.getContentBounds() ?? null,
    onChange: () => updateProjector()
  })
  const projectorWindows = followProjectorWindow<BrowserWindow>(live)

  const controller = new ProjectorController({
    displays: () => screen.getAllDisplays().map(toDisplay),
    controlDisplayId: () =>
      mainWindow.isDestroyed()
        ? screen.getPrimaryDisplay().id
        : screen.getDisplayMatching(mainWindow.getBounds()).id,
    moveControlTo: (display) => {
      const { width, height } = mainWindow.getBounds()
      const area =
        screen.getAllDisplays().find((d) => d.id === display.id)?.workArea ?? display.bounds
      mainWindow.setBounds({
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width: Math.min(width, area.width),
        height: Math.min(height, area.height)
      })
    },
    createWindow: (bounds) =>
      createProjectorWindow(bounds, {
        opened: projectorWindows.opened,
        resized: () => live.resize(),
        closed: projectorWindows.closed
      }),
    settings: {
      enabled: () => settings.get('projector.enabled'),
      setEnabled: (on) => settings.set('projector.enabled', on),
      displayId: () => settings.get('projector.displayId')
    },
    onStatus: (status) => {
      broadcast('projector:status', status)
      updateProjector()
    }
  })
  const feed = createProjectorFeed({ db, player, projector: controller, live })
  const keepAwake = new KeepAwake(powerSaveBlocker)
  updateProjector = coalesced(() => {
    feed.update()
    keepAwake.update(
      KeepAwake.needed({
        projectorOpen: controller.status().open,
        status: player.getState().status
      })
    )
  })
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(event as 'display-added', () => controller.displaysChanged())
  }

  mainWindow.on('moved', () => controller.keepControlReachable())

  const activity = new ActivityWatcher({
    cursor: () => screen.getCursorScreenPoint(),
    systemIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    playing: () => ['playing', 'countdown'].includes(player.getState().status),
    autoFullscreen: () => ({
      enabled: settings.get('autoFullscreen.enabled'),
      seconds: settings.get('autoFullscreen.seconds')
    }),
    projector: controller
  })
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown') activity.keyInput(input.key)
  })
  const primaryId = () => screen.getPrimaryDisplay().id

  registerHandlers(
    ipcMain,
    createHandlers({
      db,
      settings,
      appInfo: () => ({ version: app.getVersion(), dbPath, schemaVersion: getSchemaVersion(db) }),
      importer,
      dialogs: importDialogs,
      player,
      remote,
      projector: {
        status: () => controller.status(),
        setEnabled: (on) => controller.setEnabled(on),
        displays: () =>
          screen.getAllDisplays().map((d) => ({
            id: d.id,
            label: toDisplay(d).label,
            primary: d.id === primaryId(),
            internal: d.internal
          })),
        displayChoiceChanged: () => controller.displayChoiceChanged(),
        snapshot: () => feed.snapshot(),
        progress: (progress) => feed.progress(progress)
      },
      canva: { service: canva, captureStatus: () => captures.current() },
      onLibraryChanged: () => {
        player.refresh() // labels or missing flags of the next item may have changed
        libraryChanged()
      },
      onProgramsChanged: programsChanged
    })
  )

  // After sleep, displays come back renumbered and windows may have moved: re-check them, and make
  // sure the control window is showing.
  powerMonitor.on('resume', () => {
    controller.displaysChanged()
    if (process.platform === 'darwin') void app.dock?.show()
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  })

  controller.start()
  activity.start()
  // Re-read the decks and capture linked slides that have no image yet (spec §8.3).
  void canva.startup(net.isOnline())
  app.on('will-quit', () => {
    activity.stop()
    globalShortcut.unregisterAll()
    db.close()
  })
}

app.whenReady().then(() => {
  try {
    startApp()
  } catch (err) {
    log.error('Startup failed', err)
    dialog.showErrorBox(
      'Folk Dance Player',
      `Folk Dance Player couldn't start.\n\n${err instanceof Error ? err.message : String(err)}\n\n` +
        `The details are in the log: ${log.dir}`
    )
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
