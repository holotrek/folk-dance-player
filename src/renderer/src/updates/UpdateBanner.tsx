import { useState } from 'react'
import { ActionIcon, Button, Group, Text } from '@mantine/core'
import ConfirmDialog from '../components/ConfirmDialog'
import { useLibraryApi } from '../library/LibraryProvider'
import { useProgram } from '../program/ProgramProvider'
import { useTour } from '../tour/TourProvider'
import classes from './UpdateBanner.module.css'
import { useUpdateState } from './use-update-state'

// A new version is downloaded and verified (updates spec §3.2): offered at the top of the window,
// with the music playing or not. Restart to Update installs it; it asks first while a song plays.
// ✕ hides it for that version until the app is opened again. Never shown during a tour.
export default function UpdateBanner(): React.JSX.Element | null {
  const api = useLibraryApi()
  const state = useUpdateState(api)
  const { touring } = useTour()
  const status = useProgram((s) => s.player.status)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  if (state.kind !== 'ready' || state.version === dismissed || touring) return null
  const install = (): void => void api.invoke('updates:install')
  const musicPlaying = status === 'playing' || status === 'countdown'

  return (
    <>
      <Group
        role="status"
        aria-label="Update"
        justify="center"
        gap="sm"
        wrap="nowrap"
        className={classes.banner}
      >
        <Text size="xs" fw={600}>
          Version {state.version} is ready.
        </Text>
        <Button size="compact-xs" onClick={() => (musicPlaying ? setAsking(true) : install())}>
          Restart to Update
        </Button>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Dismiss"
          onClick={() => setDismissed(state.version)}
        >
          ✕
        </ActionIcon>
      </Group>
      <ConfirmDialog
        opened={asking}
        title="Restart to update?"
        message="Music is playing. Restart anyway?"
        confirmLabel="Restart"
        cancelLabel="Keep playing"
        onConfirm={install}
        onClose={() => setAsking(false)}
      />
    </>
  )
}
