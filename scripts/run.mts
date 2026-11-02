// Runs a command with ELECTRON_RUN_AS_NODE removed (VS Code's terminal sets it, and Electron would
// then run as plain Node): `node scripts/run.mts electron-vite dev`. Replaces the Unix-only
// `env -u ELECTRON_RUN_AS_NODE` in package.json, so the same scripts work on Windows.
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _removed, ...rest } = env
  return rest
}

// Windows resolves npm and the .bin shims (npx, playwright…) only through a shell.
export function run(argv: string[], env: NodeJS.ProcessEnv = cleanEnv(process.env)): number {
  const [command, ...args] = argv
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  })
  return result.status ?? 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(run(process.argv.slice(2)))
}
