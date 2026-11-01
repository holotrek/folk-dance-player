import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import {
  checkRelease,
  checkUpdateFeed,
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

// A feed as electron-builder writes it (latest-mac.yml), for a zip whose bytes are `zip`.
const ZIP_NAME = 'Folk-Dance-Player-0.3.0-universal.zip'
const zip = Buffer.from('not really a zip, but bytes')
const sha = (bytes: Buffer): string => createHash('sha512').update(bytes).digest('base64')
const feed = (
  extra: { version?: string; url?: string; sha512?: string } = {}
): string => `version: ${extra.version ?? '0.3.0'}
files:
  - url: ${extra.url ?? ZIP_NAME}
    sha512: ${extra.sha512 ?? sha(zip)}
    size: ${zip.length}
  - url: Folk-Dance-Player-0.3.0-universal.dmg
    sha512: ZGlmZmVyZW50
    size: 10
path: ${extra.url ?? ZIP_NAME}
sha512: ${extra.sha512 ?? sha(zip)}
releaseDate: '2026-11-01T02:20:52.295Z'
`

describe('checking the update feed', () => {
  const files = { [ZIP_NAME]: zip }

  test('a good feed passes', () => {
    expect(checkUpdateFeed({ yml: feed(), version: '0.3.0', files })).toEqual({ ok: true })
  })

  test('a feed for another version fails, naming both', () => {
    const result = checkUpdateFeed({ yml: feed({ version: '0.2.0' }), version: '0.3.0', files })
    expect(result).toMatchObject({ ok: false })
    expect((result as { error: string }).error).toContain('0.2.0')
    expect((result as { error: string }).error).toContain('0.3.0')
  })

  test('a feed naming a file that is not there fails, naming it', () => {
    const result = checkUpdateFeed({
      yml: feed({ url: 'Folk Dance Player-0.3.0-universal-mac.zip' }),
      version: '0.3.0',
      files
    })
    expect(result).toMatchObject({ ok: false })
    expect((result as { error: string }).error).toContain(
      'Folk Dance Player-0.3.0-universal-mac.zip'
    )
  })

  test('a checksum that does not match the file fails', () => {
    const result = checkUpdateFeed({
      yml: feed({ sha512: sha(Buffer.from('another file')) }),
      version: '0.3.0',
      files
    })
    expect(result).toMatchObject({ ok: false })
    expect((result as { error: string }).error).toMatch(/checksum|sha512/i)
  })

  test('a feed with no version fails', () => {
    const yml = feed().replace(/^version: .*\n/, '')
    expect(checkUpdateFeed({ yml, version: '0.3.0', files })).toMatchObject({ ok: false })
  })

  test('the real file electron-builder wrote parses and names a zip', () => {
    const real =
      "version: 0.2.0\nfiles:\n  - url: Folk-Dance-Player-0.2.0-universal.zip\n    sha512: mlu5DaXbkSQM/UWmNAhvnePtyvmUFapPYfP5aw2nf01Bwh7qNNosvLdRUrYlh4kbfr2quSZyOrDIHMO4yAuqxg==\n    size: 229016964\n  - url: Folk-Dance-Player-0.2.0-universal.dmg\n    sha512: lTULIHOp/2WJac0CwQat0Fbw63IOG4ukQIYB/CG8afSlJFw0SFH3Lt9oQ+NP6BBZVTI+b7RI0V0/LFfW7okmPQ==\n    size: 237029982\npath: Folk-Dance-Player-0.2.0-universal.zip\nsha512: mlu5DaXbkSQM/UWmNAhvnePtyvmUFapPYfP5aw2nf01Bwh7qNNosvLdRUrYlh4kbfr2quSZyOrDIHMO4yAuqxg==\nreleaseDate: '2026-11-01T02:24:20.432Z'\n"
    const result = checkUpdateFeed({ yml: real, version: '0.2.0', files: {} })
    // No files given: it must fail on the missing zip, not on parsing the version or the url.
    expect((result as { error: string }).error).toContain('Folk-Dance-Player-0.2.0-universal.zip')
  })
})

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
