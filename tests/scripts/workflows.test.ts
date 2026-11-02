import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string): string => readFileSync(file, 'utf8')
const workflow = (name: string): string => read(`.github/workflows/${name}`)

describe('the workflows', () => {
  it('pin every action to a commit SHA, with its version in a comment', () => {
    for (const file of readdirSync('.github/workflows')) {
      const uses = workflow(file).match(/^\s*(?:- )?uses: .+$/gm) ?? []
      for (const line of uses) {
        expect(line, `${file}: ${line}`).toMatch(/@[0-9a-f]{40} # v\d/)
      }
    }
  })

  it('document every secret Create Release reads in CONTRIBUTING.md', () => {
    const names = new Set(
      [...workflow('create-release.yml').matchAll(/secrets\.([A-Z0-9_]+)/g)]
        .map((m) => m[1])
        .filter((name) => name !== 'GITHUB_TOKEN')
    )
    expect(names.size).toBeGreaterThan(0)
    const contributing = read('CONTRIBUTING.md')
    for (const name of names) expect(contributing, name).toContain(name)
  })
})

describe('the PR Gate', () => {
  const gate = workflow('pr-gate.yml')

  it('keeps the job names the main ruleset requires', () => {
    expect(gate).toContain('name: Typecheck, test and build')
    expect(gate).toContain('name: End-to-end (${{ matrix.os }})')
    expect(gate).toContain('name: CHANGELOG')
  })

  it('runs the unit tests and the end-to-end tests on Windows too', () => {
    expect(gate).toMatch(/name: Unit tests \(Windows\)\s+runs-on: windows-latest/)
    expect(gate).toMatch(/os: \[macos-latest, windows-latest\]/)
  })

  it('builds the Swift helper and walks the Windows-shaped tours on macOS only', () => {
    expect(gate).toMatch(
      /- run: npm run build:helper\n\s+if: runner\.os == 'macOS'|if: runner\.os == 'macOS'\n\s+run: npm run build:helper/
    )
    expect(gate).toMatch(/The tours as on Windows\n\s+if: runner\.os == 'macOS'/)
  })
})

describe('Create Release on Windows', () => {
  const release = workflow('create-release.yml')

  it('builds the Windows installer and its update feed, with no blockmap', () => {
    const entry = release.slice(release.indexOf('- os: windows-latest'))
    const installer = entry.slice(0, entry.indexOf('runs-on:'))
    expect(installer).toContain('dist/*.exe')
    expect(installer).toContain('dist/latest.yml')
    expect(installer).not.toContain('blockmap')
  })

  it('signs through SignPath, with the action pinned to a commit', () => {
    expect(release).toContain(
      'signpath/github-action-submit-signing-request@f6d04783b4569d051e0c80105fe66e82819d0092 # v3.0'
    )
    // The app is signed, then the installer made from the signed app, then the installer signed.
    const order = [
      '--win --dir',
      'unsigned-app',
      '--prepackaged dist/win-unpacked',
      'unsigned-installer',
      'refresh-feed'
    ].map((text) => release.indexOf(text))
    expect(order.every((at) => at > 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('refuses to publish an unsigned installer, but lets a dry run build one', () => {
    const step = release.slice(release.indexOf('name: A release is signed (Windows)'))
    const condition = step.slice(0, step.indexOf('run:')).match(/if: .+/)?.[0] ?? ''
    expect(condition).toContain("env.DRY_RUN != 'true'")
    expect(condition).toContain("steps.signing.outputs.enabled != 'true'")
    expect(release).toMatch(
      /name: Build \(Windows, unsigned\)\n\s+if: .*steps\.signing\.outputs\.enabled != 'true'/
    )
  })

  it('checks every update feed, on every system', () => {
    expect(release).toMatch(
      /name: The update feeds match the release\n\s+run: node scripts\/release\.mts check-feed dist/
    )
  })

  it('never writes a secret into a command line', () => {
    for (const line of release.split('\n')) {
      if (/secrets\./.test(line)) expect(line, line).not.toMatch(/\b(echo|printf)\b/)
    }
    // The only run steps that read the API token get it through env.
    expect(release).not.toMatch(/run:.*SIGNPATH_API_TOKEN/)
  })

  it('lets the SignPath action read the job', () => {
    expect(release).toMatch(/permissions:\n\s+actions: read[^\n]*\n\s+contents: read/)
  })
})
