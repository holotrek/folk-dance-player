// Release helpers for the Prepare Release and Create Release workflows (spec §13.4). Run with
// Node 24, which runs TypeScript directly:
//   node scripts/release.mts prepare <major|minor|patch|x.y.z>   bump the version, date the notes
//   node scripts/release.mts check [notes-file]                  may this version be released?
//   node scripts/release.mts check-feed [dist-dir]               are the update feeds right?
//   node scripts/release.mts refresh-feed [dist-dir]             latest.yml after the installer is signed
// The pure functions below are unit-tested; the commands at the bottom wire them to the files.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

// The in-app updater reads latest-mac.yml from the release. A release whose feed is wrong would
// strand every installed copy, so Create Release checks it before publishing: the feed is for this
// version, names a file that is in the release, and carries that file's real checksum. electron-
// builder writes the first `files:` entry as the zip the updater downloads.
export type FeedCheck = { ok: true } | { ok: false; error: string }

export function checkUpdateFeed(input: {
  yml: string
  version: string
  files: Record<string, Buffer | string>
  feedName?: string // latest-mac.yml (the default) or latest.yml, for the messages
}): FeedCheck {
  const { yml, version, files, feedName = 'latest-mac.yml' } = input
  const feedVersion = /^version:\s*(\S+)\s*$/m.exec(yml)?.[1]
  if (!feedVersion) return { ok: false, error: `${feedName} has no version.` }
  if (feedVersion !== version) {
    return {
      ok: false,
      error: `${feedName} is for version ${feedVersion}, but this release is ${version}.`
    }
  }
  const entry = /^files:\s*\n\s*-\s*url:\s*(.+?)\s*\n\s*sha512:\s*(\S+)\s*$/m.exec(yml)
  if (!entry) return { ok: false, error: `${feedName} names no file to download.` }
  const [, url, sha512] = entry
  const bytes = files[url]
  if (bytes === undefined) {
    return { ok: false, error: `${feedName} names ${url}, which is not in the release.` }
  }
  const actual = createHash('sha512').update(bytes).digest('base64')
  if (actual !== sha512) {
    return {
      ok: false,
      error: `The sha512 checksum of ${url} in ${feedName} doesn’t match the file.`
    }
  }
  return { ok: true }
}

// Signing changes the installer's bytes after electron-builder wrote its feed, so the checksum and
// size must be written again: the feed entry for `file` and the top-level `sha512` (electron-updater
// verifies the download against it). Everything else in the feed is left as it was.
export function refreshFeedChecksum(input: { yml: string; file: string; bytes: Buffer }): string {
  const { yml, file, bytes } = input
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  // electron-builder writes a `size:` only for a file with a blockmap, so it is changed if there.
  const entry = new RegExp(
    `(-\\s*url:\\s*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*)sha512:[ \\t]*\\S+([ \\t]*\\n\\s*size:[ \\t]*)?(\\d+)?`
  )
  if (!entry.test(yml)) throw new Error(`The update feed does not name ${file}.`)
  return yml
    .replace(
      entry,
      (_, head, gap, size) =>
        `${head}sha512: ${sha512}${gap ?? ''}${size === undefined ? '' : bytes.length}`
    )
    .replace(/^sha512:[ \t]*\S+[ \t]*$/m, `sha512: ${sha512}`)
}

// The feeds the in-app updater reads: macOS and Windows.
const FEEDS = ['latest-mac.yml', 'latest.yml']

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
  } else if (command === 'check-feed') {
    const dir = arg ?? 'dist'
    const feeds = FEEDS.filter((name) => existsSync(join(dir, name)))
    if (feeds.length === 0) {
      console.error(
        `::error::${FEEDS.join(' and ')} are both missing from ${dir}: installed copies could not update.`
      )
      process.exit(1)
    }
    for (const feedName of feeds) {
      const yml = readFileSync(join(dir, feedName), 'utf8')
      const name = /^files:\s*\n\s*-\s*url:\s*(.+?)\s*$/m.exec(yml)?.[1]
      const files: Record<string, Buffer> = {}
      if (name && existsSync(join(dir, name))) files[name] = readFileSync(join(dir, name))
      const result = checkUpdateFeed({ yml, version: readVersion(), files, feedName })
      if (!result.ok) {
        console.error(`::error::${result.error}`)
        process.exit(1)
      }
      console.log(`${feedName} is good for ${readVersion()}`)
    }
  } else if (command === 'refresh-feed') {
    // After the installer is signed: write its new checksum and size into latest.yml.
    const dir = arg ?? 'dist'
    const ymlPath = join(dir, 'latest.yml')
    const yml = existsSync(ymlPath) ? readFileSync(ymlPath, 'utf8') : ''
    const file = /^path:\s*(.+?)\s*$/m.exec(yml)?.[1]
    if (!file || !existsSync(join(dir, file))) {
      console.error(`::error::${ymlPath} or the installer it names is missing from ${dir}.`)
      process.exit(1)
    }
    writeFileSync(ymlPath, refreshFeedChecksum({ yml, file, bytes: readFileSync(join(dir, file)) }))
    console.log(`latest.yml now carries the checksum of ${file}`)
  } else {
    console.error(
      'Usage: node scripts/release.mts prepare <major|minor|patch|x.y.z> | check [notes-file] | check-feed [dist-dir] | refresh-feed [dist-dir]'
    )
    process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
