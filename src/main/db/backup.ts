import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

const KEEP = 5
const NAME = /^folk-dance-player-\d{4}-\d{2}-\d{2}_\d{6}-\d{3}\.sqlite$/

const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`

// Spec §10.1: at startup, before migrations, the library is copied to `dir` (VACUUM INTO: a
// consistent copy, safe while the database is open), keeping the newest `KEEP` copies. Names sort
// by time, so the oldest go first; other files in `dir` are left alone. A brand-new library
// (schema 0) has nothing to protect. Returns the copy's path, or null when none was made.
export function backupDatabase(db: DatabaseSync, dir: string, now: Date): string | null {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (user_version === 0) return null
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `folk-dance-player-${stamp(now)}.sqlite`)
  db.prepare('VACUUM INTO ?').run(path)
  const backups = readdirSync(dir)
    .filter((f) => NAME.test(f))
    .sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(dir, old), { force: true })
  }
  return path
}
