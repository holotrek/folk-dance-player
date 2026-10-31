import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { EventChannel } from '@shared/contract'
import { createPracticeContext } from '../../../src/main/tour/practice-context'
import { tunePath } from '../../../scripts/make-tour-tune.mjs'

let dir: string
let sent: [EventChannel, unknown][]
let context: ReturnType<typeof createPracticeContext>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fdp-tour-test-'))
  sent = []
  context = createPracticeContext({
    dir,
    tuneDir: dirname(tunePath('hava-nagila')),
    appVersion: '0.3.0',
    send: (channel, payload) => void sent.push([channel, payload])
  })
})
afterEach(() => {
  context.dispose()
  rmSync(dir, { recursive: true, force: true })
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('the practice context', () => {
  test('serves the demo library through the real handlers', async () => {
    const h = context.handlers
    const rows = await h['library:list']({
      search: '',
      filter: { kind: 'all' },
      sort: { column: 'title', direction: 'asc' }
    })
    expect(rows.length).toBeGreaterThanOrEqual(7)
    expect((await h['programs:list']('')).map((p) => p.name)).toEqual(['Friday warm-up'])
    expect((await h['playlists:list']()).some((p) => p.mirror)).toBe(true)
    expect((await h['app:getInfo']()).version).toBe('0.3.0')
  })

  test('services that need the real app answer with a clear message', async () => {
    const h = context.handlers
    const channels: (() => unknown)[] = [
      () => h['library:attachNotesPdf'](1),
      () => h['library:attachSlideImage'](1),
      () => h['canva:addDeck']('https://canva.com/x'),
      () => h['appleSync:enable']({}, false),
      () => h['appleSync:syncNow']()
    ]
    for (const call of channels) {
      await expect(Promise.resolve().then(call)).rejects.toThrow(
        'Not available in the practice library'
      )
    }
  })

  test('Add Music… pretends: a practice folder is "picked" and importing it adds nothing', async () => {
    const h = context.handlers
    const before = (
      await h['library:list']({
        search: '',
        filter: { kind: 'all' },
        sort: { column: 'title', direction: 'asc' }
      })
    ).length
    const paths = await h['import:pickMusic']()
    expect(paths).toHaveLength(1)
    sent.length = 0
    const summary = await h['import:start']({ kind: 'paths', paths })
    // The songs it "finds" are the ones already there, so the library is unchanged.
    expect(summary.added).toEqual([])
    expect(summary.alreadyPresent).toHaveLength(before)
    expect(summary.cancelled).toBe(false)
    expect(sent.some(([channel]) => channel === 'import:progress')).toBe(true)
    expect(
      (
        await h['library:list']({
          search: '',
          filter: { kind: 'all' },
          sort: { column: 'title', direction: 'asc' }
        })
      ).length
    ).toBe(before)
  })

  test('the projector and sync report off', async () => {
    const h = context.handlers
    expect((await h['projector:status']()).enabled).toBe(false)
    expect((await h['appleSync:status']()).state).toBe('off')
  })

  test('settings are its own', async () => {
    await context.handlers['settings:set']('autoContinue.seconds', 9)
    expect((await context.handlers['settings:getAll']())['autoContinue.seconds']).toBe(9)
  })

  test('changes are announced through send', async () => {
    const h = context.handlers
    const [row] = await h['library:list']({
      search: '',
      filter: { kind: 'all' },
      sort: { column: 'title', direction: 'asc' }
    })
    await h['library:setFavorite']([row.fileId], true)
    await tick()
    expect(sent.map(([channel]) => channel)).toContain('library:changed')
  })

  test('the practice tune plays: a program song starts, and the next follows its end', async () => {
    const h = context.handlers
    await h['settings:set']('countdown.seconds', 0)
    const [program] = await h['programs:list']('')
    await h['programs:setCurrent'](program.id)
    await h['player:play']()
    const playing = await h['player:getState']()
    expect(playing.status).toBe('playing')
    expect(playing.current?.track.title).toBe('Hava Nagila')
    expect(playing.current?.track.durationMs).toBeGreaterThan(20_000)
    await h['player:ended'](playing.current!.playId)
    expect((await h['player:getState']()).status).toBe('countdown')
    await h['player:stop']()
    expect(sent.some(([channel]) => channel === 'player:state')).toBe(true)
  })

  test('mediaPath resolves a demo file id to the tune’s copy', async () => {
    const [row] = await context.handlers['library:list']({
      search: '',
      filter: { kind: 'all' },
      sort: { column: 'title', direction: 'asc' }
    })
    const path = context.mediaPath(row.fileId)
    expect(path?.startsWith(dir)).toBe(true)
    expect(existsSync(path!)).toBe(true)
    expect(context.mediaPath(99_999)).toBeNull()
  })

  test('dispose deletes the practice folder', () => {
    expect(existsSync(join(dir, 'library.sqlite'))).toBe(true)
    context.dispose()
    expect(existsSync(dir)).toBe(false)
  })
})

describe('the real library is never touched', () => {
  test('a whole scripted session through the practice handlers leaves a real database file byte-identical', async () => {
    const { createHash } = await import('node:crypto')
    const { readFileSync } = await import('node:fs')
    const { openDatabase } = await import('../../../src/main/db/connection')
    const { migrate } = await import('../../../src/main/db/migrate')
    const { MIGRATIONS } = await import('../../../src/main/db/migrations')
    const realPath = join(dir, 'real.sqlite')
    const real = openDatabase(realPath)
    migrate(real, MIGRATIONS)
    real.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const hash = () => createHash('sha256').update(readFileSync(realPath)).digest('hex')
    const before = hash()

    const h = context.handlers
    const rows = await h['library:list']({
      search: '',
      filter: { kind: 'all' },
      sort: { column: 'title', direction: 'asc' }
    })
    await h['library:setFavorite']([rows[0].fileId], true)
    await h['playlists:create']('Mine')
    const id = await h['programs:create']('Practice')
    await h['programs:addTracks'](id, [rows[1].fileId], null)
    await h['settings:set']('autoContinue.seconds', 11)
    await h['library:holdSongs']([rows[2].fileId], null)
    await tick()

    real.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    expect(hash()).toBe(before)
    real.close()
  })
})
