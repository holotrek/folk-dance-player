import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, test } from 'vitest'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))

describe('package.json', () => {
  // VS Code's terminal sets ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node.
  test.each(['dev', 'start'])('%s script unsets ELECTRON_RUN_AS_NODE', (name) => {
    expect(pkg.scripts[name]).toMatch(/^env -u ELECTRON_RUN_AS_NODE /)
  })

  // Electron 44 has no install script of its own; electron-vite needs the binary present.
  test('postinstall downloads the Electron binary', () => {
    expect(pkg.scripts.postinstall).toBe('install-electron')
  })

  test('all dependency versions are pinned exactly', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>
    const loose = Object.entries(all).filter(([, v]) => /^[\^~]/.test(v))
    expect(loose).toEqual([])
  })
})

// Spec §13: release notes, contributing guide and decision log are part of the repo.
describe('project documents', () => {
  const read = (f: string): string => readFileSync(resolve(__dirname, '..', f), 'utf8')

  test('CHANGELOG.md has an Unreleased section', () => {
    expect(read('CHANGELOG.md')).toMatch(/^## \[Unreleased\]$/m)
  })

  test('CHANGELOG.md versions are Keep a Changelog headings', () => {
    const headings = read('CHANGELOG.md').match(/^## .*$/gm) ?? []
    for (const h of headings)
      expect(h).toMatch(/^## \[(Unreleased|\d+\.\d+\.\d+)\]( - \d{4}-\d{2}-\d{2})?$/)
  })

  test('CLAUDE.md imports AGENTS.md', () => {
    expect(read('CLAUDE.md').trim()).toBe('@AGENTS.md')
  })

  test('README.md describes this app, not the Electron template', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/^# Folk Dance Player$/m)
    expect(readme).not.toMatch(/electron-vite|An Electron application with React/i)
  })

  test('AGENTS.md has a Decisions log and CONTRIBUTING.md exists', () => {
    expect(read('AGENTS.md')).toMatch(/^## Decisions$/m)
    expect(read('CONTRIBUTING.md')).toMatch(/^# Contributing/m)
  })
})

describe('the Music library helper (Apple Music sync spec §3.1)', () => {
  const read = (file: string): string => readFileSync(resolve(__dirname, '..', file), 'utf8')

  test('is bundled, and the app explains Music access', () => {
    const builder = read('electron-builder.yml')
    expect(builder).toMatch(/from: resources\/bin\/fdp-music-library/)
    expect(builder).toMatch(/NSAppleMusicUsageDescription:/)
    expect(builder).toMatch(/x64ArchFiles: Contents\/Resources\/fdp-music-library/)
    expect(pkg.scripts['build:helper']).toBe('sh scripts/build-helper.sh')
    expect(pkg.scripts.dist).toContain('npm run build:helper')
    expect(read('.gitignore')).toMatch(/^resources\/bin\/$/m)
  })
})
