// Builds the installer for the system it runs on, or runs the end-to-end tests on it:
//   node scripts/dist.mts        build, then electron-builder for this system (npm run dist)
//   node scripts/dist.mts e2e    the end-to-end tests on the unpacked app (npm run test:e2e:dist)
// An installer is built on its own system: the Music helper is Swift, and the Windows installer
// needs Windows tools. The pure parts are unit-tested.
import { pathToFileURL } from 'node:url'
import { cleanEnv, run } from './run.mts'

export function distSteps(platform: NodeJS.Platform): string[][] {
  const build = ['npm', 'run', 'build']
  const builder = (target: string) => ['npx', 'electron-builder', target, '--publish', 'never']
  if (platform === 'darwin') return [build, ['npm', 'run', 'build:helper'], builder('--mac')]
  if (platform === 'win32') return [build, builder('--win')]
  throw new Error(`No installer for ${platform}`)
}

// The unpacked app that electron-builder leaves in dist/.
export function packagedApp(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'dist/mac-universal/Folk Dance Player.app'
  if (platform === 'win32') return 'dist/win-unpacked/Folk Dance Player.exe'
  throw new Error(`No installer for ${platform}`)
}

function main(command: string | undefined): number {
  if (command === 'e2e') {
    const env = { ...cleanEnv(process.env), FDP_APP: packagedApp(process.platform) }
    return run(['npx', 'playwright', 'test'], env)
  }
  for (const step of distSteps(process.platform)) {
    const status = run(step)
    if (status !== 0) return status
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv[2]))
}
