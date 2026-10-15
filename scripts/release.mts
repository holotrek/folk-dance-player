// Release helpers for the Prepare Release and Create Release workflows (spec §13.4). Run with
// Node 24, which runs TypeScript directly:
//   node scripts/release.mts prepare <major|minor|patch|x.y.z>   bump the version, date the notes
//   node scripts/release.mts check [notes-file]                  may this version be released?
// The pure functions below are unit-tested; the commands at the bottom wire them to the files.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/

function parse(version: string): number[] {
  const match = VERSION.exec(version)
  if (!match) throw new Error(`Not a version: ${version}`)
  return match.slice(1).map(Number)
}

export function compareVersions(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

export function nextVersion(current: string, bump: string): string {
  const [major, minor, patch] = parse(current)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  parse(bump)
  return bump
}

const UNRELEASED = '## [Unreleased]'

// Keep a Changelog: the notes under Unreleased become the new version's section, dated, and
// Unreleased starts again, empty.
export function prepareChangelog(changelog: string, version: string, date: string): string {
  const start = changelog.indexOf(UNRELEASED)
  if (start < 0) throw new Error('The CHANGELOG has no "## [Unreleased]" section')
  const bodyStart = start + UNRELEASED.length
  const next = changelog.indexOf('\n## ', bodyStart)
  const body = changelog.slice(bodyStart, next < 0 ? undefined : next)
  if (!body.trim()) throw new Error('The CHANGELOG has nothing under Unreleased to release')
  return `${changelog.slice(0, bodyStart)}\n\n## [${version}] - ${date}${changelog.slice(bodyStart)}`
}

// The notes of one released version: its section's body.
function section(changelog: string, version: string): string | null {
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\].*$`, 'm').exec(changelog)
  if (!heading) return null
  const bodyStart = heading.index + heading[0].length
  const next = changelog.indexOf('\n## ', bodyStart)
  return changelog.slice(bodyStart, next < 0 ? undefined : next).trim()
}

export type ReleaseCheck = { ok: true; notes: string } | { ok: false; error: string }

// Create Release refuses a version that isn't higher than every released one (tags vX.Y.Z), or
// that has no notes in the CHANGELOG.
export function checkRelease(input: {
  version: string
  tags: string[]
  changelog: string
}): ReleaseCheck {
  const { version, tags, changelog } = input
  parse(version)
  const released = tags
    .map((t) => t.replace(/^v/, ''))
    .filter((t) => VERSION.test(t))
    .sort(compareVersions)
  const latest = released.at(-1)
  if (latest && compareVersions(version, latest) <= 0) {
    return {
      ok: false,
      error: `Version ${version} isn’t higher than the latest release, v${latest}. Bump it first (Prepare Release).`
    }
  }
  const notes = section(changelog, version)
  if (notes === null) {
    return {
      ok: false,
      error: `The CHANGELOG has no "## [${version}]" section. Run Prepare Release first.`
    }
  }
  if (!notes) return { ok: false, error: `The CHANGELOG's ${version} section is empty.` }
  return { ok: true, notes }
}

// --- Commands ------------------------------------------------------------------------------

const readVersion = (): string =>
  (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

// Hands a value to the next workflow steps (and prints it for people).
function output(name: string, value: string): void {
  console.log(`${name}=${value}`)
  if (process.env['GITHUB_OUTPUT'])
    appendFileSync(process.env['GITHUB_OUTPUT'], `${name}=${value}\n`)
}

function main(args: string[]): void {
  const [command, arg] = args
  if (command === 'prepare') {
    const current = readVersion()
    const version = nextVersion(current, arg ?? '')
    // The current version is allowed too: the first release has nothing to bump.
    if (version !== current) {
      execFileSync('npm', ['version', version, '--no-git-tag-version'], { stdio: 'inherit' })
    }
    const today = new Date().toISOString().slice(0, 10)
    writeFileSync(
      'CHANGELOG.md',
      prepareChangelog(readFileSync('CHANGELOG.md', 'utf8'), version, today)
    )
    output('version', version)
  } else if (command === 'check') {
    const version = readVersion()
    const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n')
    const result = checkRelease({ version, tags, changelog: readFileSync('CHANGELOG.md', 'utf8') })
    if (!result.ok) {
      console.error(`::error::${result.error}`)
      process.exit(1)
    }
    if (arg) writeFileSync(arg, `${result.notes}\n`)
    output('version', version)
  } else {
    console.error(
      'Usage: node scripts/release.mts prepare <major|minor|patch|x.y.z> | check [notes-file]'
    )
    process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
