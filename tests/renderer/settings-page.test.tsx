import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { RendererApi } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import SettingsPage from '@renderer/pages/SettingsPage'
import { renderWithMantine } from './render'

function fakeApi(
  initial: Settings = DEFAULT_SETTINGS,
  remote: () => RemoteStatus = () => ({ trusted: true, keys: ALL_KEYS })
) {
  let current: Settings = { ...initial }
  const calls: unknown[][] = []
  const api: RendererApi = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      if (channel === 'settings:getAll') return current
      if (channel === 'remote:status' || channel === 'remote:requestAccess') return remote()
      if (channel === 'projector:displays')
        return [
          { id: 1, label: 'Built-in Retina Display', primary: true, internal: true },
          { id: 2, label: 'Epson Projector', primary: false, internal: false }
        ]
      if (channel === 'projector:setDisplay') {
        current = { ...current, 'projector.displayId': args[0] as number | null }
        return { enabled: false, open: false, mode: null, display: null, notice: null }
      }
      if (channel === 'app:getInfo')
        return { version: '0.1.0', dbPath: '/data/folk-dance-player.sqlite', schemaVersion: 1 }
      if (channel === 'settings:set') {
        const [key, value] = args as [keyof Settings, unknown]
        if (key === 'autoContinue.seconds' && (value as number) < 0) {
          throw new Error('Invalid value for autoContinue.seconds')
        }
        current = { ...current, [key]: value }
        return current
      }
      throw new Error(`unexpected channel ${channel}`)
    }) as RendererApi['invoke'],
    on: () => () => undefined,
    getPathsForFiles: () => []
  }
  return { api, calls }
}

const ALL_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop']

describe('SettingsPage', () => {
  test('shows the stored settings', async () => {
    const { api } = fakeApi({ ...DEFAULT_SETTINGS, 'autoContinue.seconds': 8 })
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByLabelText('Genre is Country')).toBeChecked()
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue('8')
    expect(await screen.findByText('/data/folk-dance-player.sqlite')).toBeInTheDocument()
  })

  test('Appearance switches between light, dark and the system setting at once, and saves it', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(calls).toContainEqual(['settings:set', 'appearance', 'dark'])
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'light')
  })

  test('saves a toggled setting', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    await userEvent.click(await screen.findByLabelText('Genre is Country'))
    expect(calls).toContainEqual(['settings:set', 'import.genreIsCountry', false])
    expect(screen.getByLabelText('Genre is Country')).not.toBeChecked()
  })

  test('saves a number setting on blur', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Countdown before first song (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '3')
    await userEvent.tab()
    expect(calls).toContainEqual(['settings:set', 'countdown.seconds', 3])
  })

  test('shows an error and restores the saved value when a save is rejected', async () => {
    const { api } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Auto-continue after (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '-4')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save setting")
    // The field re-mounts after a rejected save, so look it up again.
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue('5')
  })

  test('saves the import mapping defaults', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Album Artist → Teacher' }))
    expect(calls).toContainEqual(['settings:set', 'import.albumArtistTagTarget', 'teacher'])
  })

  test('edits the dance-type suggestions', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    // TagsInput labels both its visible and its hidden input, so find it by placeholder.
    const input = await screen.findByPlaceholderText('Add a dance type')
    await userEvent.type(input, 'Hora line{Enter}')
    expect(calls).toContainEqual([
      'settings:set',
      'danceTypeSuggestions',
      [...DEFAULT_SETTINGS.danceTypeSuggestions, 'Hora line']
    ])
  })

  test('shows errors without Electron’s technical prefix', async () => {
    const { api } = fakeApi()
    const original = api.invoke
    api.invoke = (async (channel: string, ...args: unknown[]) => {
      if (channel === 'settings:set') {
        throw new Error(
          "Error invoking remote method 'settings:set': InvalidSettingError: Invalid value for autoContinue.seconds: -4"
        )
      }
      return (original as (c: string, ...a: unknown[]) => unknown)(channel, ...args)
    }) as RendererApi['invoke']
    renderWithMantine(<SettingsPage api={api} />)
    const input = await screen.findByLabelText('Auto-continue after (seconds)')
    await userEvent.clear(input)
    await userEvent.type(input, '-4')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save setting: Invalid value for autoContinue.seconds: -4"
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('invoking remote method')
  })

  test('says the remote is ready when its media keys are active', async () => {
    const { api } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/The remote is ready/)).toBeInTheDocument()
  })

  test('without Accessibility permission, explains and asks macOS for it', async () => {
    let trusted = false
    const { api, calls } = fakeApi(DEFAULT_SETTINGS, () => ({ trusted, keys: ALL_KEYS }))
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/needs Accessibility permission/)).toBeInTheDocument()
    trusted = true
    await userEvent.click(screen.getByRole('button', { name: 'Allow remote control…' }))
    expect(calls).toContainEqual(['remote:requestAccess'])
    expect(await screen.findByText(/The remote is ready/)).toBeInTheDocument()
  })

  test('names media keys another app is holding', async () => {
    const { api } = fakeApi(DEFAULT_SETTINGS, () => ({ trusted: true, keys: ALL_KEYS.slice(1) }))
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByText(/Another app is using: play\/pause/)).toBeInTheDocument()
  })

  test('chooses the projector display, or automatic', async () => {
    const { api, calls } = fakeApi()
    renderWithMantine(<SettingsPage api={api} />)
    // Select labels a hidden input too (like TagsInput), so find it by the value it shows.
    const select = await screen.findByDisplayValue('Automatic (the first external display)')
    await userEvent.click(select)
    await userEvent.click(await screen.findByRole('option', { name: 'Epson Projector' }))
    expect(calls).toContainEqual(['projector:setDisplay', 2])
  })
})
