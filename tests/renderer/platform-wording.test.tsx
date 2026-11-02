import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { Platform } from '@shared/platform'
import { PlatformProvider } from '@renderer/platform'
import RemoteSection from '@renderer/components/RemoteSection'
import AppleOptionsStep from '@renderer/import/AppleOptionsStep'
import { mappingFromSettings } from '@shared/import'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createFakeApi } from './fake-api'
import { renderWithMantine } from './render'

const READY = {
  trusted: true,
  keys: ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop']
}

function renderOn(
  platform: Platform,
  ui: (api: ReturnType<typeof createFakeApi>['api']) => React.ReactElement
) {
  const { api } = createFakeApi({
    'app:getInfo': { version: '0', dbPath: '', schemaVersion: 1, platform },
    'remote:status': READY
  })
  return renderWithMantine(<PlatformProvider api={api}>{ui(api)}</PlatformProvider>)
}

describe('the remote section', () => {
  test('says the computer’s volume on Windows, and never mentions Accessibility or the Mac', async () => {
    renderOn('windows', (api) => <RemoteSection api={api} />)
    expect(await screen.findByText(/set the computer's volume/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Accessibility|Mac\b|System Settings/)
  })

  test('says the Mac’s volume on a Mac', async () => {
    renderOn('mac', (api) => <RemoteSection api={api} />)
    expect(await screen.findByText(/set the Mac's volume/)).toBeInTheDocument()
  })
})

describe('the Apple Music import options', () => {
  const preview = { trackCount: 3, playlists: [], tagSample: [] }
  const options = () => (
    <AppleOptionsStep
      preview={preview}
      mapping={mappingFromSettings(DEFAULT_SETTINGS)}
      onMappingChange={() => undefined}
      onContinue={() => undefined}
      onCancel={() => undefined}
    />
  )

  test('counts files on this computer on Windows', async () => {
    renderOn('windows', options)
    expect(await screen.findByText('3 songs with files on this computer')).toBeInTheDocument()
  })

  test('counts files on this Mac on a Mac', async () => {
    renderOn('mac', options)
    expect(await screen.findByText('3 songs with files on this Mac')).toBeInTheDocument()
  })
})
