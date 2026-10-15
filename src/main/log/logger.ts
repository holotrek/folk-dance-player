import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Logger {
  readonly dir: string
  info(message: string): void
  warn(message: string): void
  error(message: string, err?: unknown): void
}

const describe = (err: unknown): string =>
  err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)

// Spec §10.1: the app log, in `dir` (~/Library/Logs/Folk Dance Player). main.log rolls over to
// main.1.log … main.<keep>.log when it would pass `maxBytes`. Logging never throws: a log that
// can't be written must not stop the music.
export function createLogger(options: {
  dir: string
  now?: () => Date
  maxBytes?: number
  keep?: number
}): Logger {
  const { dir, now = () => new Date(), maxBytes = 1_000_000, keep = 3 } = options
  const file = (n: number) => join(dir, n === 0 ? 'main.log' : `main.${n}.log`)

  const rollOver = () => {
    rmSync(file(keep), { force: true })
    for (let n = keep - 1; n >= 0; n--) if (existsSync(file(n))) renameSync(file(n), file(n + 1))
  }

  const write = (level: 'info' | 'warn' | 'error', message: string) => {
    const line = `${now().toISOString()} [${level}] ${message}\n`
    try {
      mkdirSync(dir, { recursive: true })
      const size = existsSync(file(0)) ? statSync(file(0)).size : 0
      if (size > 0 && size + Buffer.byteLength(line) > maxBytes) rollOver()
      appendFileSync(file(0), line)
    } catch {
      // Nowhere left to report it.
    }
  }

  return {
    dir,
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message, err) =>
      write('error', err === undefined ? message : `${message}: ${describe(err)}`)
  }
}
