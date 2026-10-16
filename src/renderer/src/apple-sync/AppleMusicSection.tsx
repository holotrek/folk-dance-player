import { useState } from 'react'
import { Button, Group, Modal, Stack, Switch, Text, Title } from '@mantine/core'
import { syncParts, type AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import ConfirmDialog from '../components/ConfirmDialog'
import AppleSyncDialog, { NOT_ALLOWED } from './AppleSyncDialog'
import { shrinkText } from './AppleSyncNotices'
import SyncSummaryView from './SyncSummaryView'
import { useAppleSync } from './useAppleSync'
import { useAppleSyncFlow } from './useAppleSyncFlow'

const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Settings → Apple Music (sync spec §6.1). macOS only: hidden where sync isn't available.
export default function AppleMusicSection({ api }: { api: RendererApi }): React.JSX.Element | null {
  const status = useAppleSync(api)
  const flow = useAppleSyncFlow(api)
  const [confirmOff, setConfirmOff] = useState(false)
  const [details, setDetails] = useState(false)
  if (!status?.available) return null
  const on = status.state !== 'off'

  return (
    <Stack gap="xs">
      <Title order={4}>Apple Music</Title>
      <Switch
        label="Sync with Apple Music"
        description="Keeps your songs and Music's playlists in step with the Music app."
        checked={on}
        onChange={(e) => (e.currentTarget.checked ? flow.open() : setConfirmOff(true))}
      />
      {on && <StatusLine status={status} api={api} onDetails={() => setDetails(true)} />}
      {on && (
        <Group>
          <Button
            variant="default"
            loading={status.state === 'syncing'}
            onClick={() => void api.invoke('appleSync:syncNow')}
          >
            Sync now
          </Button>
        </Group>
      )}
      <AppleSyncDialog flow={flow} api={api} waiting={status.waiting} />
      <ConfirmDialog
        opened={confirmOff}
        title="Turn off Sync with Apple Music?"
        message="Songs and playlists stay; playlists become editable."
        confirmLabel="Turn off"
        onConfirm={() => void api.invoke('appleSync:disable')}
        onClose={() => setConfirmOff(false)}
      />
      <Modal opened={details} onClose={() => setDetails(false)} title="Last sync" size="lg">
        {status.lastResult && <SyncSummaryView summary={status.lastResult} />}
      </Modal>
    </Stack>
  )
}

function StatusLine(props: {
  status: AppleSyncStatus
  api: RendererApi
  onDetails: () => void
}): React.JSX.Element {
  const { status, api } = props
  if (status.state === 'syncing') return <Text size="sm">Syncing…</Text>
  if (status.state === 'paused-other-library') {
    return (
      <Group gap="sm">
        <Text size="sm">Paused: Music has a different library open</Text>
        <Button
          size="xs"
          variant="default"
          onClick={() => void api.invoke('appleSync:switchLibrary')}
        >
          Switch to this library
        </Button>
      </Group>
    )
  }
  if (status.state === 'paused-shrunk' && status.shrink) {
    // Keep waiting is doing nothing: sync resumes by itself once Music reports the library again.
    return (
      <Group gap="sm">
        <Text size="sm">{`Paused: ${shrinkText(status.shrink)}`}</Text>
        <Button size="xs" variant="default" onClick={() => void api.invoke('appleSync:syncAnyway')}>
          Sync anyway
        </Button>
      </Group>
    )
  }
  if (status.state === 'paused-denied') {
    return (
      <Group gap="sm">
        <Text size="sm">{NOT_ALLOWED}</Text>
        <Button
          size="xs"
          variant="default"
          onClick={() => void api.invoke('appleSync:openPrivacySettings')}
        >
          Open Privacy Settings
        </Button>
      </Group>
    )
  }
  if (!status.lastResult) return <Text size="sm">Not synced yet</Text>
  const parts = [
    ...syncParts(status.lastResult),
    ...(status.reviewCount > 0 ? [`${status.reviewCount} to review`] : [])
  ]
  return (
    <Group gap="sm">
      <Text size="sm">
        {`Last synced ${time(status.lastResult.finishedAt)} — ${parts.length ? parts.join(', ') : 'no changes'}`}
      </Text>
      <Button size="xs" variant="subtle" onClick={props.onDetails}>
        Details
      </Button>
    </Group>
  )
}
