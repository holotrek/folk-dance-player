import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { RendererApi } from '@shared/contract'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import SettingsPage from '@renderer/pages/SettingsPage'
import { renderWithMantine } from './render'

function fakeApi(initial: Settings = DEFAULT_SETTINGS) {
  let current: Settings = { ...initial }
  const calls: unknown[][] = []
  const api: RendererApi = {
    invoke: (async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      if (channel === 'settings:getAll') return current
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

describe('SettingsPage', () => {
  test('shows the stored settings', async () => {
    const { api } = fakeApi({ ...DEFAULT_SETTINGS, 'autoContinue.seconds': 8 })
    renderWithMantine(<SettingsPage api={api} />)
    expect(await screen.findByLabelText('Genre is Country')).toBeChecked()
    expect(screen.getByLabelText('Auto-continue after (seconds)')).toHaveValue('8')
    expect(await screen.findByText('/data/folk-dance-player.sqlite')).toBeInTheDocument()
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
})
