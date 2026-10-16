import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary, type AppleSyncStatus } from '@shared/apple-sync'
import HighlightTarget, { HIGHLIGHT_MS, HighlightProvider } from '@renderer/highlight'
import MusicPage from '@renderer/pages/MusicPage'
import SettingsPage from '@renderer/pages/SettingsPage'
import { createFakeApi } from '../fake-api'
import { renderWithLibrary } from '../library/render-library'
import { renderWithMantine } from '../render'
import { testTheme } from '../test-theme'

const status = (over: Partial<AppleSyncStatus>): AppleSyncStatus => ({
  ...APPLE_SYNC_OFF,
  available: true,
  ...over
})

describe('where the Apple Music controls are', () => {
  test('the switch sits beside the import buttons on the Music page', async () => {
    const fake = createFakeApi({
      'appleSync:status': status({}),
      'library:stats': { fileCount: 0 }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    const add = await screen.findByRole('button', { name: 'Add Music…' })
    const toolbar = add.parentElement as HTMLElement
    expect(
      await within(toolbar).findByRole('switch', { name: /^Sync with Apple Music/ })
    ).toBeInTheDocument()
  })

  test('while sync is on, the Music page shows the last sync and Sync now', async () => {
    const last = { ...emptySyncSummary('2026-10-16T11:42:00.000Z'), added: [{ path: '/m/a.mp3' }] }
    const fake = createFakeApi({
      'appleSync:status': status({ state: 'idle', lastResult: last }),
      'library:stats': { fileCount: 1 }
    })
    renderWithLibrary(<MusicPage />, fake.api)
    expect(await screen.findByText(/^Last synced .+ — 1 added$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument()
  })

  test('Settings no longer has an Apple Music section', async () => {
    const fake = createFakeApi({
      'appleSync:status': status({ state: 'idle' }),
      'app:getInfo': { version: '0.2.0', dbPath: '/data/fdp.sqlite', schemaVersion: 4 }
    })
    renderWithMantine(<SettingsPage api={fake.api} />)
    await screen.findByText('Settings')
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Apple Music')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /Sync with Apple Music/ })).not.toBeInTheDocument()
  })
})

describe('HighlightTarget', () => {
  afterEach(() => vi.useRealTimers())

  test('pulses a border around its control for a short time, then stops', () => {
    vi.useFakeTimers()
    let show!: (id: string) => void
    render(
      <MantineProvider theme={testTheme}>
        <HighlightProvider expose={(fn) => (show = fn)}>
          <HighlightTarget id="appleSync">
            <button>Sync</button>
          </HighlightTarget>
        </HighlightProvider>
      </MantineProvider>
    )
    const target = screen.getByRole('button', { name: 'Sync' }).closest('[data-highlight]')!
    expect(target).not.toHaveAttribute('data-highlighted')
    act(() => show('appleSync'))
    expect(target).toHaveAttribute('data-highlighted', 'true')
    act(() => vi.advanceTimersByTime(HIGHLIGHT_MS))
    expect(target).not.toHaveAttribute('data-highlighted')
  })

  test('another id is not highlighted', async () => {
    let show!: (id: string) => void
    render(
      <MantineProvider theme={testTheme}>
        <HighlightProvider expose={(fn) => (show = fn)}>
          <HighlightTarget id="other">
            <button>Other</button>
          </HighlightTarget>
        </HighlightProvider>
      </MantineProvider>
    )
    act(() => show('appleSync'))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Other' }).closest('[data-highlight]')
      ).not.toHaveAttribute('data-highlighted')
    )
  })
})
