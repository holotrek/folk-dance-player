import { join } from 'path'

// Where the app keeps its data when it isn't the default folder. FDP_USER_DATA wins (end-to-end
// tests, smoke runs). An unpackaged run (`npm run dev`, `npm start`) gets its own folder, because
// a development build can migrate the library past what the installed app understands, and the
// installed app then refuses it. The packaged app uses Electron's default.
export function userDataOverride(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  appData: string
): string | undefined {
  if (env['FDP_USER_DATA']) return env['FDP_USER_DATA']
  return isPackaged ? undefined : join(appData, 'Folk Dance Player (dev)')
}
