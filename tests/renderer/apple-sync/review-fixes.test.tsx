import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { APPLE_SYNC_OFF, emptySyncSummary, type AppleSyncStatus } from '@shared/apple-sync'
import type { InvokeChannel } from '@shared/contract'
import AppleSyncControls from './controls'
import AppleSyncNotices from '@renderer/apple-sync/AppleSyncNotices'
import { createFakeApi } from '../fake-api'
import { renderWithMantine } from '../render'

// The final review's minors, as the user chose to fix them.
const OFF: AppleSyncStatus = { ...APPLE_SYNC_OFF, available: true }
const preview = (otherLibrary: boolean) => ({
  ok: true,
  preview: { trackCount: 1, playlists: [], tagSample: [] },
  conflicts: [],
  otherLibrary
})

function setup(status: AppleSyncStatus, handlers: Record<string, unknown> = {}) {
  const fake = createFakeApi({
    'appleSync:status': status,
    'appleSync:preview': preview(false),
    'appleSync:enable': emptySyncSummary('2026-10-16T11:42:00.000Z'),
    'appleSync:syncAnyway': undefined,
    'appleSync:syncNow': undefined,
    ...handlers
  } as Partial<Record<InvokeChannel, unknown>>)
  renderWithMantine(
    <>
      <AppleSyncControls api={fake.api} />
      <AppleSyncNotices api={fake.api} />
    </>
  )
  return { fake, user: userEvent.setup() }
}

const turnOn = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('switch', { name: /^Sync with Apple Music/ }))
  await user.click(await screen.findByRole('button', { name: 'Continue' }))
}

describe('a different library, asked before the mapping step (Minor 4)', () => {
  test('Switch to this library continues to the mapping step and switches with the choices', async () => {
    const { fake, user } = setup(OFF, { 'appleSync:preview': preview(true) })
    await turnOn(user)
    expect(await screen.findByText('Music has a different library open')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to this library' }))
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    await screen.findByText('Done')
    expect(fake.callsTo('appleSync:enable')).toEqual([[{}, true]])
    expect(fake.callsTo('appleSync:switchLibrary')).toEqual([])
  })

  test('Keep waiting turns sync on, paused until the old library is back', async () => {
    const { fake, user } = setup(OFF, {
      'appleSync:preview': preview(true),
      'appleSync:enable': null
    })
    await turnOn(user)
    await user.click(await screen.findByRole('button', { name: 'Keep waiting' }))
    await waitFor(() => expect(fake.callsTo('appleSync:enable')).toEqual([[{}]]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('turning on waits (Minors 1 and 3)', () => {
  test('the dialog says what the first sync is waiting for', async () => {
    const { fake, user } = setup(OFF, { 'appleSync:enable': () => new Promise(() => undefined) })
    await turnOn(user)
    await user.click(await screen.findByRole('button', { name: 'Start sync' }))
    fake.emit('appleSync:state', { ...OFF, waiting: 'sync' })
    expect(await screen.findByText('Waiting for the last sync to finish…')).toBeInTheDocument()
    fake.emit('appleSync:state', { ...OFF, state: 'syncing', waiting: 'import' })
    expect(await screen.findByText('Waiting for the import to finish…')).toBeInTheDocument()
  })
})

describe("Music's library looks much smaller (Minor 9)", () => {
  test('the status says so and offers Sync anyway; a notice appears once', async () => {
    const { fake, user } = setup({
      ...OFF,
      state: 'paused-shrunk',
      shrink: { missing: 1950, total: 2000 }
    })
    expect(
      await screen.findByText(
        "Paused: Music's library looks much smaller than before (1,950 of 2,000 songs are missing)"
      )
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync anyway' }))
    expect(fake.callsTo('appleSync:syncAnyway')).toHaveLength(1)
    fake.emit('appleSync:notice', { kind: 'shrunk', missing: 1950, total: 2000 })
    expect(await screen.findByText(/1,950 of 2,000 songs are missing/)).toBeInTheDocument()
  })
})
