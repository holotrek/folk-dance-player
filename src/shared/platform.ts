// What differs between the systems the app runs on (Windows release spec §3.1). Everything else
// asks here instead of testing `process.platform`.
export type Platform = 'mac' | 'windows' | 'linux'

export interface Capabilities {
  platform: Platform
  appleMusicSync: boolean // the Music helper and File → Sync with Apple Music
  mediaKeyTrust: boolean // macOS delivers media keys only to an app trusted for Accessibility
  fileManager: 'Finder' | 'File Explorer' | 'file manager'
  computer: 'Mac' | 'computer' // for copy like "files on this Mac"
  store: boolean // the Microsoft Store version, which the Store updates (no updater of ours)
}

const PLATFORMS: readonly string[] = ['mac', 'windows', 'linux']

// The platform of this run. FDP_PLATFORM (development and end-to-end tests: see the Windows UI
// from a Mac) is honored only by an unpackaged app, so an installed copy can't be switched.
export function platformFrom(
  nodePlatform: string,
  env: NodeJS.ProcessEnv,
  isPackaged: boolean
): Platform {
  const forced = env['FDP_PLATFORM']
  if (!isPackaged && forced && PLATFORMS.includes(forced)) return forced as Platform
  if (nodePlatform === 'darwin') return 'mac'
  if (nodePlatform === 'win32') return 'windows'
  return 'linux'
}

// Whether this run is the Microsoft Store version: Electron says so in a Store (appx) package, and
// FDP_STORE=1 shows it from an unpackaged Windows run (development and end-to-end tests).
export function storeFrom(
  platform: Platform,
  windowsStore: boolean,
  env: NodeJS.ProcessEnv,
  isPackaged: boolean
): boolean {
  if (platform !== 'windows') return false
  return windowsStore || (!isPackaged && env['FDP_STORE'] === '1')
}

export function capabilitiesFor(platform: Platform, store = false): Capabilities {
  const mac = platform === 'mac'
  return {
    platform,
    appleMusicSync: mac,
    mediaKeyTrust: mac,
    fileManager: mac ? 'Finder' : platform === 'windows' ? 'File Explorer' : 'file manager',
    computer: mac ? 'Mac' : 'computer',
    store
  }
}
