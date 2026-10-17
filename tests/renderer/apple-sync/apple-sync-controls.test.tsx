import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary, type AppleSyncStatus } from '@shared/apple-sync'
import type { InvokeChannel } from '@shared/contract'
import AppleSyncControls from './controls'
import { createFakeApi } from '../fake-api'
import { renderWithMantine } from '../render'

const OFF: AppleSyncStatus = { ...APPLE_SYNC_OFF, available: true }
const preview = {
  ok: true,
  preview: {
    trackCount: 2,
    playlists: [{ persistentId: 'P', name: 'Week 3', trackCount: 2 }],
    tagSample: [{ title: 'Kolo', artist: 'Taraf', albumArtist: null, genre: 'Serbia' }]
  },
  conflicts: []
}
const summary = {
  ...emptySyncSummary('2026-10-16T11:42:00.000Z'),
  added: [{ path: '/m/Kolo.mp3' }]
}

function setup(status: AppleSyncStatus = OFF, handlers: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'appleSync:status': status,
    'appleSync:preview': preview,
    'appleSync:enable': summary,
    'appleSync:syncNow': undefined,
    'appleSync:disable': undefined,
    'appleSync:switchLibrary': undefined,
    'appleSync:openPrivacySettings': undefined,
    ...handlers
  } as Partial<Record<InvokeChannel, unknown>>)
  renderWithMantine(<AppleSyncControls api={fake.api} />)
  return { fake, user: userEvent.setup() }
}

const turnOn = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('switch', { name: /^Sync with Apple Music/ }))
  await user.click(await screen.findByRole('button', { name: 'Continue' }))
}

describe("the Music page's Apple Music controls (sync spec §6.1)", () => {
  test('is hidden where sync is unavailable', async () => {
    const fake = createFakeApi()
    renderWithMantine(<AppleSyncControls api={fake.api} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Apple Music')).not.toBeInTheDocument()
  })

  test('turning on: explanation, mapping with Music tags, first sync, summary', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('switch', { name: /^Sync with Apple Music/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/macOS will ask/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await within(dialog).findByText('Kolo')).toBeInTheDocument() // the tag preview
    expect(within(dialog).getByText(/2 songs and 1 playlist/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Start sync' }))
    expect(await within(dialog).findByText('Added (1)')).toBeInTheDocument()
    expect(fake.callsTo('appleSync:enable')).toEqual([[{}]])
    expect(fake.callsTo('settings:set').map((c) => c[0])).toContain('import.artistTagTarget')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('playlists edited here are asked about, keeping edits as a copy by default', async () => {
    const { fake, user } = setup(OFF, {
      'appleSync:preview': {
        ...preview,
        conflicts: [
          { persistentId: 'P', name: 'Week 3' },
          { persistentId: 'Q', name: 'Week 4' }
        ]
      }
    })
    await turnOn(user)
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    const week4 = await screen.findByRole('radiogroup', { name: 'Week 4' })
    await user.click(within(week4).getByLabelText('Replace with Apple version'))
    const week3 = screen.getByRole('radiogroup', { name: 'Week 3' })
    expect(within(week3).getByLabelText('Keep my edits as a copy')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Start sync' }))
    await screen.findByText('Added (1)')
    expect(fake.callsTo('appleSync:enable')).toEqual([[{ P: 'copy', Q: 'replace' }]])
  })

  test('access denied shows how to allow it', async () => {
    const { fake, user } = setup(OFF, {
      'appleSync:preview': { ok: false, reason: 'denied', detail: 'TCC' }
    })
    await turnOn(user)
    expect(await screen.findByText(/isn't allowed to read your Music library/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Privacy Settings' }))
    expect(fake.callsTo('appleSync:openPrivacySettings')).toHaveLength(1)
    expect(fake.callsTo('appleSync:enable')).toEqual([])
  })

  test('a different library than last time: Keep waiting or Switch to this library', async () => {
    const { fake, user } = setup(OFF, { 'appleSync:enable': null })
    await turnOn(user)
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    expect(await screen.findByText('Music has a different library open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to this library' }))
    expect(fake.callsTo('appleSync:switchLibrary')).toHaveLength(1)
  })

  test('turning off asks first', async () => {
    const { fake, user } = setup({ ...OFF, state: 'idle' })
    await user.click(await screen.findByRole('switch', { name: /^Sync with Apple Music/ }))
    expect(
      await screen.findByText('Songs and playlists stay; playlists become editable.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(fake.callsTo('appleSync:disable')).toHaveLength(1)
  })

  test('the status line: last sync with Details, and Sync now', async () => {
    const last = {
      ...emptySyncSummary('2026-10-16T11:42:00.000Z'),
      added: [1, 2, 3].map((n) => ({ path: `/m/${n}.mp3` })),
      updated: [{ path: '/m/4.mp3' }]
    }
    const { fake, user } = setup({ ...OFF, state: 'idle', lastResult: last, reviewCount: 2 })
    expect(
      await screen.findByText(/^Last synced .+ — 3 added, 1 updated, 2 to review$/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText('Added (3)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(fake.callsTo('appleSync:syncNow')).toHaveLength(1)
  })

  test.each([
    [
      'paused-other-library',
      'Paused: Music has a different library open',
      'Switch to this library',
      'appleSync:switchLibrary'
    ],
    [
      'paused-denied',
      "Folk Dance Player isn't allowed to read your Music library",
      'Open Privacy Settings',
      'appleSync:openPrivacySettings'
    ]
  ] as const)('the %s status offers its fix', async (state, text, button, channel) => {
    const { fake, user } = setup({ ...OFF, state })
    expect(await screen.findByText(text)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: button }))
    expect(fake.callsTo(channel)).toHaveLength(1)
  })

  test('the status follows appleSync:state', async () => {
    const { fake } = setup()
    await screen.findByRole('switch', { name: /^Sync with Apple Music/ })
    fake.emit('appleSync:state', { ...OFF, state: 'syncing' })
    expect(await screen.findByText('Syncing…')).toBeInTheDocument()
  })
})
