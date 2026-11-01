import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { Logger } from '../log/logger'
import type { Updater } from './update-service'

// The only file that imports electron-updater (updates spec §5). It reads the newest GitHub
// release's latest-mac.yml, downloads the zip and checks its checksum; on restart Squirrel.Mac
// replaces the app, which needs the Developer ID signature the releases have. `feedUrl`
// (FDP_UPDATE_URL) points it at a directory of files instead, for tests and the signed rehearsal.
export function createElectronUpdater(options: { log: Logger; feedUrl?: string }): Updater {
  const { log, feedUrl } = options
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true // an update waiting when the person quits lands at quit
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m?: unknown) => log.info(String(m)),
    warn: (m?: unknown) => log.warn(String(m)),
    error: (m?: unknown) => log.error(String(m)),
    debug: () => undefined
  }
  if (feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    autoUpdater.forceDevUpdateConfig = true // also in a development run
  }
  return {
    isEnabled: () => app.isPackaged || feedUrl !== undefined,
    check: async () => {
      await autoUpdater.checkForUpdates()
    },
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    onAvailable: (listener) =>
      void autoUpdater.on('update-available', (info) => listener(info.version)),
    onNotAvailable: (listener) => void autoUpdater.on('update-not-available', () => listener()),
    onDownloaded: (listener) =>
      void autoUpdater.on('update-downloaded', (info) => listener(info.version)),
    onError: (listener) => void autoUpdater.on('error', (error) => listener(error))
  }
}
