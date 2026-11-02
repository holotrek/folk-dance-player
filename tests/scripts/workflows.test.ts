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

  it('builds the Windows installer and its update feed', () => {
    const entry = release.slice(release.indexOf('- os: windows-latest'))
    const installer = entry.slice(0, entry.indexOf('runs-on:'))
    expect(installer).toContain('dist/*.exe')
    expect(installer).toContain('dist/*.exe.blockmap')
    expect(installer).toContain('dist/latest.yml')
  })

  it('has no signing service: the installer is unsigned, and the Store version is the signed way in', () => {
    expect(release).not.toMatch(/signpath/i)
    expect(release).not.toContain('--prepackaged')
    expect(release).not.toContain('A release is signed')
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
  })
})

describe('Prepare Release', () => {
  const prepare = workflow('prepare-release.yml')

  it('puts both hardware checklists in the release PR, and asks for both installers', () => {
    expect(prepare).toContain('docs/manual-testing/pre-release-hardware.md')
    expect(prepare).toContain('docs/manual-testing/pre-release-hardware-windows.md')
    expect(prepare).toContain('## Pre-release hardware check (macOS)')
    expect(prepare).toContain('## Pre-release hardware check (Windows)')
    expect(prepare).toMatch(/\\?`\.dmg\\?`[^\n]*\\?`\.exe\\?`/) // escaped for the shell
  })
})
