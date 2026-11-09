import { useState } from 'react'
import { ActionIcon, Group, Text } from '@mantine/core'
import { useLibraryApi } from '../library/LibraryProvider'
import { useTour } from '../tour/TourProvider'
import classes from './RemoteNotice.module.css'
import RestartButton from './RestartButton'
import { useRemoteStatus } from './use-remote-status'

// Accessibility was allowed after launch (1.0.0 spec §3.1): the remote's keys were registered
// without it and start working after a restart. ✕ hides it until the app is opened again. Never
// shown during a tour.
export default function RemoteNotice(): React.JSX.Element | null {
  const api = useLibraryApi()
  const [status] = useRemoteStatus(api)
  const { touring } = useTour()
  const [dismissed, setDismissed] = useState(false)

  if (!status?.restartNeeded || dismissed || touring) return null
  return (
    <Group
      role="status"
      aria-label="Remote control"
      justify="center"
      gap="sm"
      wrap="nowrap"
      className={classes.notice}
    >
      <Text size="xs" fw={600}>
        Remote control is allowed. Restart Folk Dance Player to turn it on.
      </Text>
      <RestartButton api={api} size="compact-xs" />
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ✕
      </ActionIcon>
    </Group>
  )
}
