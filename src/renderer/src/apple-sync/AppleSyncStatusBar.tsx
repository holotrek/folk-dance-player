import { useState } from 'react'
import { Button, Group, Modal, Text } from '@mantine/core'
import { syncParts, type AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import { NOT_ALLOWED } from './AppleSyncDialog'
import { shrinkText } from './AppleSyncNotices'
import SyncSummaryView from './SyncSummaryView'

const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Below the Music page's toolbar while sync is on (sync spec §6.1): the last sync (with Details),
// or a paused state with its fix, and Sync now.
export default function AppleSyncStatusBar(props: {
  api: RendererApi
  status: AppleSyncStatus | null
}): React.JSX.Element | null {
  const { api, status } = props
  const [details, setDetails] = useState(false)
  if (!status?.available || status.state === 'off') return null
  return (
    <Group gap="sm">
      <StatusLine status={status} api={api} onDetails={() => setDetails(true)} />
      <Button
        size="xs"
        variant="default"
        loading={status.state === 'syncing'}
        onClick={() => void api.invoke('appleSync:syncNow')}
      >
        Sync now
      </Button>
      <Modal opened={details} onClose={() => setDetails(false)} title="Last sync" size="lg">
        {status.lastResult && <SyncSummaryView summary={status.lastResult} />}
      </Modal>
    </Group>
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
    // Keep waiting needs no button: sync resumes by itself once Music reports the library again.
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
      <Text size="sm" c="dimmed">
        {`Last synced ${time(status.lastResult.finishedAt)} — ${parts.length ? parts.join(', ') : 'no changes'}`}
      </Text>
      <Button size="xs" variant="subtle" onClick={props.onDetails}>
        Details
      </Button>
    </Group>
  )
}
