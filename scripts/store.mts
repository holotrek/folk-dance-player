// Builds the Microsoft Store package (an appx) with the identity Partner Center gave the app:
//   node scripts/store.mts          the real identity, from STORE_IDENTITY_NAME, STORE_PUBLISHER and
//                                   STORE_PUBLISHER_DISPLAY_NAME (Partner Center → Product identity)
//   node scripts/store.mts --test   a placeholder identity, to check a package can be made at all
// The package is built on Windows (electron-builder's appx tools) and is not signed: the Store signs
// it. The pure parts are unit-tested.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { run } from './run.mts'

// The Store version is the app's (1.4.0 is 1.4.0.0): the fourth part is reserved for the Store, and
// electron-builder adds it as 0. The Store rejects a version that starts with 0, so the first release
// that can be submitted is 1.0.0.
export function storeVersion(version: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`The version "${version}" is not major.minor.patch.`)
  }
  return version
}

export function storeVersionWarning(version: string): string | null {
  return version.startsWith('0.')
    ? `The version ${version} starts with 0, which the Microsoft Store rejects: this package can't be submitted.`
    : null
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
  const warning = storeVersionWarning(version)
  if (warning) console.warn(`::warning::${warning}`)
  const status = run(['npm', 'run', 'build'])
  if (status !== 0) return status
  return run(args.map((arg) => shellArg(arg, process.platform)))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)))
}
