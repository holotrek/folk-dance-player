import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createLogger } from '../../../src/main/log/logger'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdp-log-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const now = () => new Date('2026-10-14T20:30:05.123Z')

describe('the app log (spec §10.1)', () => {
  test('appends timestamped lines; an error carries its stack', () => {
    const dir = tempDir()
    const log = createLogger({ dir, now })
    log.info('Started 0.1.0')
    log.warn('Canva unreachable')
    log.error('Import failed', new Error('disk full'))
    const lines = readFileSync(join(dir, 'main.log'), 'utf8').split('\n')
    expect(lines[0]).toBe('2026-10-14T20:30:05.123Z [info] Started 0.1.0')
    expect(lines[1]).toBe('2026-10-14T20:30:05.123Z [warn] Canva unreachable')
    expect(lines[2]).toBe('2026-10-14T20:30:05.123Z [error] Import failed: Error: disk full')
    expect(lines[3]).toMatch(/^\s+at /) // the stack
    expect(log.dir).toBe(dir)
  })

  test('rolls over to main.1.log when the file is full, keeping a few old files', () => {
    const dir = tempDir()
    const log = createLogger({ dir, now, maxBytes: 200, keep: 2 })
    for (let i = 0; i < 20; i++) log.info(`line ${i} ${'x'.repeat(30)}`)
    expect(readdirSync(dir).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log'])
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toContain('line 19')
    expect(readFileSync(join(dir, 'main.log'), 'utf8').length).toBeLessThanOrEqual(200)
  })

  test('never throws, even when the log can’t be written', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'blocked'), '')
    const log = createLogger({ dir: join(dir, 'blocked'), now })
    expect(() => log.error('still fine', 'not an Error')).not.toThrow()
  })
})
