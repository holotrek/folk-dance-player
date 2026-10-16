import { chmodSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createFileSource,
  createHelperSource,
  runHelper
} from '../../../src/main/apple-sync/library-source'
import { tempDir, type TempDir } from '../helpers/audio-fixtures'
import { snapTrack, snapshot } from './fixtures'

let dir: TempDir
beforeEach(() => (dir = tempDir()))
afterEach(() => dir.cleanup())

// A stub helper: a shell script with the given body.
function stub(body: string): string {
  const path = join(dir.path, 'fdp-music-library')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

const good = JSON.stringify(snapshot({ tracks: [snapTrack(1, '/m/a.mp3')] }))

describe('createHelperSource', () => {
  test('exit 0 with a valid snapshot', async () => {
    const json = dir.file('out.json', good)
    const result = await createHelperSource(stub(`cat '${json}'`)).read()
    expect(result).toMatchObject({
      ok: true,
      snapshot: { tracks: [{ persistentId: '0000000000000001' }] }
    })
  })

  test('exit 2 is access denied', async () => {
    const result = await createHelperSource(stub('echo "TCC not granted" >&2; exit 2')).read()
    expect(result).toEqual({ ok: false, reason: 'denied', detail: 'TCC not granted' })
  })

  test('exit 3 is an unavailable library', async () => {
    const result = await createHelperSource(stub('echo nope >&2; exit 3')).read()
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  test('another exit code, invalid JSON, or a wrong shape is a failed read', async () => {
    expect(await createHelperSource(stub('exit 1')).read()).toMatchObject({ reason: 'failed' })
    expect(await createHelperSource(stub('echo "{not json"')).read()).toMatchObject({
      reason: 'failed'
    })
    expect(await createHelperSource(stub(`echo '{"version":2}'`)).read()).toMatchObject({
      reason: 'failed',
      detail: expect.stringContaining('unknown version')
    })
  })

  test('a missing helper is a failed read', async () => {
    expect(await createHelperSource(join(dir.path, 'nothing')).read()).toMatchObject({
      reason: 'failed'
    })
  })

  test('a helper that hangs times out', async () => {
    const source = createHelperSource(stub('sleep 5'))
    expect(await source.read({ timeoutMs: 200 })).toMatchObject({
      ok: false,
      reason: 'failed',
      detail: expect.stringContaining('did not finish')
    })
  })

  // Review Focus 1: the permission dialog can be up for a while.
  test('a read given a longer timeout waits past the default', async () => {
    const json = dir.file('out.json', good)
    const calls: number[] = []
    const source = createHelperSource(stub(`cat '${json}'`), (path, options) => {
      calls.push(options.timeoutMs)
      return runHelper(path, options)
    })
    await source.read()
    await source.read({ timeoutMs: 300_000 })
    expect(calls).toEqual([30_000, 300_000])
  })

  // Review Focus 2: a large library prints more than execFile's default 1 MB.
  test('a snapshot larger than 1 MB is read', async () => {
    const tracks = Array.from({ length: 12_000 }, (_, i) =>
      snapTrack(i + 1, `/Users/someone/Music/Media/Music/Artist ${i}/Album/${i} Song.mp3`)
    )
    const json = dir.file('big.json', JSON.stringify(snapshot({ tracks })))
    const result = await createHelperSource(stub(`cat '${json}'`)).read()
    expect(result.ok && result.snapshot.tracks.length).toBe(12_000)
  })
})

describe('createFileSource', () => {
  test('reads the file fresh on every read', async () => {
    const path = dir.file('library.json', good)
    const source = createFileSource(path)
    expect((await source.read()).ok).toBe(true)
    writeFileSync(path, JSON.stringify(snapshot()))
    const again = await source.read()
    expect(again.ok && again.snapshot.tracks).toEqual([])
  })

  test('a missing or invalid file is a failed read', async () => {
    expect(await createFileSource(join(dir.path, 'none.json')).read()).toMatchObject({
      reason: 'failed'
    })
    expect(await createFileSource(dir.file('bad.json', '{')).read()).toMatchObject({
      reason: 'failed'
    })
  })
})
