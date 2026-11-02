// Builds the Microsoft Store package (an appx) with the identity Partner Center gave the app:
//   node scripts/store.mts          the real identity, from STORE_IDENTITY_NAME, STORE_PUBLISHER and
//                                   STORE_PUBLISHER_DISPLAY_NAME (Partner Center → Product identity)
//   node scripts/store.mts --test   a placeholder identity, to check a package can be made at all
// The package is built on Windows (electron-builder's appx tools) and is not signed: the Store signs
// it. The pure parts are unit-tested.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { run } from './run.mts'

// The Store rejects a package version that starts with 0, and the app is 0.x. So the Store version is
// (major + 1).minor.patch: 0.4.0 is 1.4.0, and 1.0.0 will be 2.0.0, so it keeps rising. The fourth
// part is reserved for the Store; electron-builder adds it as 0.
export function storeVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`The version "${version}" is not major.minor.patch.`)
  return `${Number(match[1]) + 1}.${match[2]}.${match[3]}`
}

const IDENTITY = ['STORE_IDENTITY_NAME', 'STORE_PUBLISHER', 'STORE_PUBLISHER_DISPLAY_NAME'] as const

const PLACEHOLDER: Record<(typeof IDENTITY)[number], string> = {
  STORE_IDENTITY_NAME: 'FolkDancePlayerTest',
  STORE_PUBLISHER: 'CN=00000000-0000-0000-0000-000000000000',
  STORE_PUBLISHER_DISPLAY_NAME: 'Test Publisher'
}

export function storeArgs(
  version: string,
  env: Record<string, string | undefined>,
  options: { test?: boolean } = {}
): string[] {
  const value = (name: (typeof IDENTITY)[number]): string =>
    options.test ? PLACEHOLDER[name] : (env[name] ?? '')
  const missing = IDENTITY.filter((name) => value(name) === '')
  if (missing.length > 0) {
    throw new Error(
      `Set ${missing.join(', ')} (Partner Center → the app → Product identity) to build the Store package.`
    )
  }
  return [
    'npx',
    'electron-builder',
    '--win',
    'appx',
    '--publish',
    'never',
    `-c.extraMetadata.version=${storeVersion(version)}`,
    `-c.appx.identityName=${value('STORE_IDENTITY_NAME')}`,
    `-c.appx.publisher=${value('STORE_PUBLISHER')}`,
    `-c.appx.publisherDisplayName=${value('STORE_PUBLISHER_DISPLAY_NAME')}`
  ]
}

// run() goes through a shell on Windows, which splits an argument at its spaces.
export function shellArg(arg: string, platform: NodeJS.Platform): string {
  return platform === 'win32' && arg.includes(' ') ? `"${arg}"` : arg
}

function main(flags: string[]): number {
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
  let args: string[]
  try {
    args = storeArgs(version, process.env, { test: flags.includes('--test') })
  } catch (err) {
    console.error(`::error::${(err as Error).message}`)
    return 1
  }
  const status = run(['npm', 'run', 'build'])
  if (status !== 0) return status
  return run(args.map((arg) => shellArg(arg, process.platform)))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)))
}
