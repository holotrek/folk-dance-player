// What differs between the systems the app runs on (Windows release spec §3.1). Everything else
// asks here instead of testing `process.platform`.
export type Platform = 'mac' | 'windows' | 'linux'

export interface Capabilities {
  platform: Platform
  appleMusicSync: boolean // the Music helper and File → Sync with Apple Music
  mediaKeyTrust: boolean // macOS delivers media keys only to an app trusted for Accessibility
  fileManager: 'Finder' | 'File Explorer' | 'file manager'
  computer: 'Mac' | 'computer' // for copy like "files on this Mac"
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

export function capabilitiesFor(platform: Platform): Capabilities {
  const mac = platform === 'mac'
  return {
    platform,
    appleMusicSync: mac,
    mediaKeyTrust: mac,
    fileManager: mac ? 'Finder' : platform === 'windows' ? 'File Explorer' : 'file manager',
    computer: mac ? 'Mac' : 'computer'
  }
}
