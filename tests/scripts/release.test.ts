import { describe, expect, test } from 'vitest'
import {
  checkRelease,
  compareVersions,
  nextVersion,
  prepareChangelog
} from '../../scripts/release.mjs'

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- Canva slides on the projector.

### Fixed

- A blank projector screen.

## [0.1.0] - 2026-10-01

### Added

- The first release.
`

describe('versions', () => {
  test('compare by number, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.3', '1.10.0')).toBeLessThan(0)
  })

  test('the next version from a bump, or one given outright', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1')
    expect(nextVersion('0.1.4', 'minor')).toBe('0.2.0')
    expect(nextVersion('0.9.2', 'major')).toBe('1.0.0')
    expect(nextVersion('0.9.2', '1.0.0')).toBe('1.0.0')
    expect(() => nextVersion('0.9.2', '1.0')).toThrow('Not a version: 1.0')
  })
})

describe('preparing a release', () => {
  test('the Unreleased notes move under the new version, dated; Unreleased starts empty', () => {
    const out = prepareChangelog(CHANGELOG, '0.2.0', '2026-10-15')
    expect(out).toContain(
      '## [Unreleased]\n\n## [0.2.0] - 2026-10-15\n\n### Added\n\n- Canva slides on the projector.'
    )
    expect(out).toContain('## [0.1.0] - 2026-10-01')
  })

  test('refuses when there is nothing unreleased to release', () => {
    const empty = CHANGELOG.replace(
      /## \[Unreleased\][\s\S]*?(?=## \[0\.1\.0\])/,
      '## [Unreleased]\n\n'
    )
    expect(() => prepareChangelog(empty, '0.2.0', '2026-10-15')).toThrow(
      'The CHANGELOG has nothing under Unreleased'
    )
  })
})

describe('checking a release', () => {
  const released = prepareChangelog(CHANGELOG, '0.2.0', '2026-10-15')

  test('a higher version with its CHANGELOG section passes, with those notes', () => {
    const result = checkRelease({
      version: '0.2.0',
      tags: ['v0.1.0', 'other'],
      changelog: released
    })
    expect(result).toEqual({
      ok: true,
      notes:
        '### Added\n\n- Canva slides on the projector.\n\n### Fixed\n\n- A blank projector screen.'
    })
  })

  test('the first release only needs its section', () => {
    expect(checkRelease({ version: '0.1.0', tags: [], changelog: CHANGELOG })).toMatchObject({
      ok: true
    })
  })

  test('a version that isn’t higher than the latest release is rejected', () => {
    expect(checkRelease({ version: '0.1.0', tags: ['v0.1.0'], changelog: CHANGELOG })).toEqual({
      ok: false,
      error:
        'Version 0.1.0 isn’t higher than the latest release, v0.1.0. Bump it first (Prepare Release).'
    })
    expect(
      checkRelease({ version: '0.1.5', tags: ['v0.1.0', 'v0.2.0'], changelog: released })
    ).toMatchObject({ ok: false })
  })

  test('a version with no CHANGELOG section is rejected', () => {
    expect(checkRelease({ version: '0.3.0', tags: ['v0.1.0'], changelog: released })).toEqual({
      ok: false,
      error: 'The CHANGELOG has no "## [0.3.0]" section. Run Prepare Release first.'
    })
  })
})
