import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF } from '@shared/apple-sync'
import App from '@renderer/App'
import { createFakeApi } from './fake-api'
import { playing, track } from './program/fixtures'
import { testTheme } from './test-theme'

const hora = track(101, 'Hora')

afterEach(() => {
  delete (window as { api?: unknown }).api
})

function setup(extra: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'player:getState': playing(hora),
    'player:pause': undefined,
    'app:getInfo': { version: '0.1.0', dbPath: '/data/fdp.sqlite', schemaVersion: 2 },
    ...extra
  })
  ;(window as { api?: unknown }).api = fake.api
  render(
    <MantineProvider theme={testTheme}>
      <Notifications />
      <App />
    </MantineProvider>
  )
  return fake
}

describe('App', () => {
  test('the player is above the tabs and keeps playing on every page', async () => {
    const fake = setup()
    const audio = screen.getByTestId('player-audio')
    await waitFor(() => expect((audio as HTMLAudioElement).src).toBe('fdp-media://file/101'))
    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(audio)
    expect(banner).toContainElement(screen.getByRole('tab', { name: 'Music' }))

    for (const tab of ['Music', 'Settings', 'Program']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      // The same element, never remounted: the song isn't cut off by changing pages.
      expect(screen.getByTestId('player-audio')).toBe(audio)
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Music' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(fake.callsTo('player:pause')).toHaveLength(1)
  })

  test('Settings… in the app menu opens the Settings page', async () => {
    const fake = setup()
    await screen.findByRole('tab', { name: 'Settings' })
    act(() => fake.emit('app:showPage', { page: 'settings' }))
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })

  test('a menu item that opens a page can highlight its control there', async () => {
    const fake = setup({ 'appleSync:status': { ...APPLE_SYNC_OFF, available: true } })
    await screen.findByRole('tab', { name: 'Music' })
    act(() => fake.emit('app:showPage', { page: 'music', highlight: 'appleSync' }))
    expect(screen.getByRole('tab', { name: 'Music' })).toHaveAttribute('aria-selected', 'true')
    const control = await screen.findByRole('switch', { name: /^Sync with Apple Music/ })
    expect(control.closest('[data-highlight]')).toHaveAttribute('data-highlighted', 'true')
  })

  test('the logo sits beside the page tabs', async () => {
    setup()
    const logo = await screen.findByRole('img', { name: 'Folk Dance Player' })
    expect(logo.closest('header')).toBeInTheDocument()
  })
})
