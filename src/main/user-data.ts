import { isAbsolute, join } from 'path'
import type { Platform } from '@shared/platform'

// Where the app keeps its data when it isn't the default folder. FDP_USER_DATA wins (end-to-end
// tests, smoke runs). An unpackaged run (`npm run dev`, `npm start`) gets its own folder, because
// a development build can migrate the library past what the installed app understands, and the
// installed app then refuses it. The packaged Windows app uses %LOCALAPPDATA%: Electron's default
// is the roaming profile, which a school or community center may sync over a network, and the
// library (a SQLite database plus copies of images and PDFs) must not live there. Other packaged
// apps use Electron's default.
export function userDataOverride(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  appData: string,
  platform: Platform
): string | undefined {
  if (env['FDP_USER_DATA']) return env['FDP_USER_DATA']
  if (!isPackaged) return join(appData, 'Folk Dance Player (dev)')
  const local = env['LOCALAPPDATA']
  if (platform === 'windows' && local && isAbsolute(local)) return join(local, 'Folk Dance Player')
  return undefined
}
