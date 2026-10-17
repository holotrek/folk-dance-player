import { existsSync } from 'fs'
import { describe, expect, test } from 'vitest'
import { createHelperSource } from '../../../src/main/apple-sync/library-source'

// Reads the real Music library through the built helper (sync spec §8). It needs Music access,
// which macOS grants only to an app that declares it, so it runs only when asked:
//   npm run build:helper && FDP_TEST_REAL_MUSIC=1 npx vitest run tests/main/apple-sync/helper-real.test.ts
// From a terminal that macOS lets read Music (Terminal.app after granting it access).
const helper = 'resources/bin/fdp-music-library'

describe.runIf(process.env['FDP_TEST_REAL_MUSIC'] === '1')('the real Music library', () => {
  test('the helper prints a valid snapshot', async () => {
    expect(existsSync(helper)).toBe(true)
    const result = await createHelperSource(helper).read({ timeoutMs: 120_000 })
    if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
    expect(result.snapshot.tracks.length).toBeGreaterThan(0)
  })
})
