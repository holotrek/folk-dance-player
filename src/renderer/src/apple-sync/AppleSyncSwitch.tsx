import { useState } from 'react'
import { Switch } from '@mantine/core'
import type { AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import ConfirmDialog from '../components/ConfirmDialog'
import HighlightTarget from '../highlight'
import AppleSyncDialog from './AppleSyncDialog'
import { useAppleSyncFlow } from './useAppleSyncFlow'

// The Music page's Sync with Apple Music switch, beside the import buttons (sync spec §6.1): on
// opens the turn-on dialog (§5.8), off asks first (§5.9). File → Sync with Apple Music points at it
// while sync is off. macOS only: hidden where sync isn't available.
export default function AppleSyncSwitch(props: {
  api: RendererApi
  status: AppleSyncStatus | null
}): React.JSX.Element | null {
  const { api, status } = props
  const flow = useAppleSyncFlow(api)
  const [confirmOff, setConfirmOff] = useState(false)
  if (!status?.available) return null
  return (
    <>
      <HighlightTarget id="appleSync">
        <Switch
          label="Sync with Apple Music"
          title="Keeps your songs and Music's playlists in step with the Music app"
          checked={status.state !== 'off'}
          onChange={(e) => (e.currentTarget.checked ? flow.open() : setConfirmOff(true))}
        />
      </HighlightTarget>
      <AppleSyncDialog flow={flow} api={api} waiting={status.waiting} />
      <ConfirmDialog
        opened={confirmOff}
        title="Turn off Sync with Apple Music?"
        message="Songs and playlists stay; playlists become editable."
        confirmLabel="Turn off"
        onConfirm={() => void api.invoke('appleSync:disable')}
        onClose={() => setConfirmOff(false)}
      />
    </>
  )
}
