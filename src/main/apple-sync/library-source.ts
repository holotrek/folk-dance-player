import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { parseSnapshot, type Snapshot } from './snapshot'

// Where sync reads the Music library from (sync spec §3.2): the bundled helper, or, when
// FDP_APPLE_LIBRARY is set (development and end-to-end tests), a JSON file read fresh every time.

export type SnapshotResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string }

export interface LibrarySource {
  read(options?: { timeoutMs?: number }): Promise<SnapshotResult>
}

export const READ_TIMEOUT_MS = 30_000
// Turning sync on: the first read shows macOS's permission dialog, and waits while it is up.
export const PERMISSION_TIMEOUT_MS = 300_000
// A snapshot is about 330 bytes a track; execFile's default (1 MB) is too small for big libraries.
const MAX_OUTPUT = 256 * 1024 * 1024

export interface HelperRun {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error: string | null // the process couldn't be started
}

export type RunHelper = (
  path: string,
  options: { timeoutMs: number; maxBuffer: number }
) => Promise<HelperRun>

export const runHelper: RunHelper = (path, { timeoutMs, maxBuffer }) =>
  new Promise((resolve) => {
    execFile(
      path,
      [],
      { timeout: timeoutMs, maxBuffer, killSignal: 'SIGKILL', encoding: 'utf8' },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: unknown; killed?: boolean }) | null
        resolve({
          // A non-zero exit sets `code` to the exit code; a process that couldn't start has a
          // string code such as 'ENOENT'.
          code: e ? (typeof e.code === 'number' ? e.code : null) : 0,
          stdout,
          stderr,
          timedOut: e?.killed === true,
          error: e && typeof e.code === 'string' ? e.message : null
        })
      }
    )
  })

// Seen on hardware: with Media & Apple Music access off, or for an app that doesn't declare Music
// use (a development build), macOS doesn't report a TCC error: iTunesLibrary's service drops the
// connection (Cocoa error 4097 for com.apple.amp.library.framework). That is access denied.
const REFUSED = /com\.apple\.amp\.library/

function parse(text: string): SnapshotResult {
  try {
    return { ok: true, snapshot: parseSnapshot(JSON.parse(text)) }
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}

// Exit codes (§3.1): 0 success, 2 access denied, 3 the library couldn't be opened.
export function createHelperSource(helperPath: string, run: RunHelper = runHelper): LibrarySource {
  return {
    async read(options = {}) {
      const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS
      const result = await run(helperPath, { timeoutMs, maxBuffer: MAX_OUTPUT })
      const detail = result.stderr.trim()
      if (result.error) return { ok: false, reason: 'failed', detail: result.error }
      if (result.timedOut) {
        return {
          ok: false,
          reason: 'failed',
          detail: `The Music library reader did not finish within ${Math.round(timeoutMs / 1000)} s`
        }
      }
      if (result.code === 2) return { ok: false, reason: 'denied', detail }
      if (result.code === 3 && REFUSED.test(detail)) return { ok: false, reason: 'denied', detail }
      if (result.code === 3) return { ok: false, reason: 'unavailable', detail }
      if (result.code !== 0) {
        return {
          ok: false,
          reason: 'failed',
          detail: `The Music library reader stopped (exit ${result.code ?? 'signal'}): ${detail}`
        }
      }
      return parse(result.stdout)
    }
  }
}

export function createFileSource(path: string): LibrarySource {
  return {
    async read() {
      try {
        return parse(await readFile(path, 'utf8'))
      } catch (err) {
        return {
          ok: false,
          reason: 'failed',
          detail: err instanceof Error ? err.message : String(err)
        }
      }
    }
  }
}
