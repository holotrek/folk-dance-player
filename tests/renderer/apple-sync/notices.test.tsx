import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AppleSyncNotices from '@renderer/apple-sync/AppleSyncNotices'
import { createFakeApi } from '../fake-api'
import { renderWithMantine } from '../render'

describe('sync notices (sync spec §6.5)', () => {
  test('a sync that changed something shows a toast', async () => {
    const fake = createFakeApi()
    renderWithMantine(<AppleSyncNotices api={fake.api} />)
    fake.emit('appleSync:notice', {
      kind: 'changed',
      message: 'Synced with Apple Music: 3 added, 1 updated · 2 to review'
    })
    expect(
      await screen.findByText('Synced with Apple Music: 3 added, 1 updated · 2 to review')
    ).toBeInTheDocument()
  })

  test.each([
    [{ kind: 'denied' as const }, "Folk Dance Player isn't allowed to read your Music library"],
    [{ kind: 'other-library' as const }, 'Music has a different library open'],
    [{ kind: 'failed' as const, detail: 'crash' }, "Couldn't sync with Apple Music"]
  ])('%o is noticed', async (notice, text) => {
    const fake = createFakeApi()
    renderWithMantine(<AppleSyncNotices api={fake.api} />)
    fake.emit('appleSync:notice', notice)
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument()
  })
})
