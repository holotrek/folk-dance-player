import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { capabilitiesFor } from '@shared/platform'
import { createFakeApi } from '../fake-api'
import { PlatformProvider, usePlatform } from '@renderer/platform'
import { ADVANCED_DEFS } from '@renderer/tour/advanced-steps'
import { BASIC_DEFS } from '@renderer/tour/basic-steps'
import { resolveSteps } from '@renderer/tour/resolve'
import type { TourStepDef } from '@renderer/tour/steps'

const windows = capabilitiesFor('windows')
const mac = capabilitiesFor('mac')

const def = (extra: Partial<TourStepDef>): TourStepDef => ({
  id: 'x',
  part: 'basic',
  page: null,
  kind: 'explain',
  title: 'T',
  body: 'B',
  ...extra
})

describe('resolveSteps', () => {
  test('drops a step whose when() is false', () => {
    const steps = resolveSteps(
      [def({ id: 'a' }), def({ id: 'b', when: (c) => c.appleMusicSync })],
      windows
    )
    expect(steps.map((s) => s.id)).toEqual(['a'])
  })

  test('calls a function body with the capabilities and leaves no when() behind', () => {
    const [step] = resolveSteps(
      [def({ body: (c) => `on ${c.computer}`, when: () => true })],
      windows
    )
    expect(step.body).toBe('on computer')
    expect('when' in step).toBe(false)
  })
})

describe('the tours on Windows', () => {
  const all = [...BASIC_DEFS, ...ADVANCED_DEFS]
  const resolved = resolveSteps(all, windows)

  test('mention no Apple, Mac, Finder or ⌘', () => {
    for (const s of resolved)
      expect(`${s.title} ${s.body}`, s.id).not.toMatch(/Apple|Mac\b|Finder|⌘/)
  })

  test('have no step about folders or synced playlists', () => {
    const text = JSON.stringify(resolved.map((s) => [s.id, s.target]))
    expect(text).not.toMatch(/sidebar\.folder|Balkan night|Festival 2026/)
    expect(resolved.some((s) => s.id === 'advanced.mirror')).toBe(false)
  })

  test('keep every other step, in order', () => {
    const macIds = resolveSteps(all, mac).map((s) => s.id)
    const winIds = resolved.map((s) => s.id)
    expect(macIds.filter((id) => !winIds.includes(id))).toEqual([
      'advanced.open-folder',
      'advanced.mirror'
    ])
  })
})

describe('PlatformProvider', () => {
  function Probe(): React.JSX.Element {
    return <p>{usePlatform().fileManager}</p>
  }

  test('renders nothing until main answers, then the platform it reports', async () => {
    const { api } = createFakeApi({
      'app:getInfo': { version: '0', dbPath: '', schemaVersion: 1, platform: 'windows' }
    })
    render(
      <PlatformProvider api={api}>
        <Probe />
      </PlatformProvider>
    )
    expect(screen.queryByText(/Finder|File Explorer/)).toBeNull()
    expect(await screen.findByText('File Explorer')).toBeTruthy()
  })

  test('without a provider, components get the Mac capabilities', () => {
    render(<Probe />)
    expect(screen.getByText('Finder')).toBeTruthy()
  })
})
