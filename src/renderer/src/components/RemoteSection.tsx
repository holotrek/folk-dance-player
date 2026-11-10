import { Button, Stack, Text, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import RestartButton from '../remote/RestartButton'
import { useRemoteStatus } from '../remote/use-remote-status'
import { usePlatform } from '../platform'

const KEY_NAMES: Record<string, string> = {
  MediaPlayPause: 'play/pause',
  MediaNextTrack: 'next',
  MediaPreviousTrack: 'back',
  MediaStop: 'stop'
}

// Spec §7.4: a remote's play/pause, next and back buttons are media keys, which the app takes as
// global shortcuts. macOS delivers them only to an app trusted for Accessibility.
export default function RemoteSection({ api }: { api: RendererApi }): React.JSX.Element {
  const [status, refresh] = useRemoteStatus(api)
  const { computer } = usePlatform()
  if (!status) return <></>
  const missing = Object.keys(KEY_NAMES).filter((key) => !status.keys.includes(key))
  return (
    <Stack gap="xs">
      <Title order={4}>Remote control</Title>
      {status.restartNeeded ? (
        <>
          <Text size="sm">Remote control is allowed. Restart Folk Dance Player to turn it on.</Text>
          <RestartButton api={api} />
        </>
      ) : !status.trusted ? (
        <>
          <Text size="sm">
            The remote needs Accessibility permission to reach Folk Dance Player. Allow it in System
            Settings → Privacy &amp; Security → Accessibility, then come back to this window.
          </Text>
          <Button
            variant="default"
            w="fit-content"
            onClick={() => void api.invoke('remote:requestAccess').then(refresh)}
          >
            Allow remote control…
          </Button>
          <Text size="xs" c="dimmed">
            Already allowed but still not working? An entry left by an older copy of the app can
            show as on while it doesn&apos;t count. Remove Folk Dance Player from the list with the
            − button, then add it again.
          </Text>
        </>
      ) : missing.length ? (
        <Text size="sm">
          {`The remote only partly works. Another app is using: ${missing
            .map((key) => KEY_NAMES[key])
            .join(', ')}.`}
        </Text>
      ) : (
        <Text size="sm">
          The remote is ready: play/pause, next, and back (restarts the song). Its volume buttons
          set the {computer}&apos;s volume.
        </Text>
      )}
    </Stack>
  )
}
