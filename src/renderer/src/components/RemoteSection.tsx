import { useEffect, useState } from 'react'
import { Button, Stack, Text, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'

const KEY_NAMES: Record<string, string> = {
  MediaPlayPause: 'play/pause',
  MediaNextTrack: 'next',
  MediaPreviousTrack: 'back',
  MediaStop: 'stop'
}

// Spec §7.4: a remote's play/pause, next and back buttons are media keys, which the app takes as
// global shortcuts. macOS delivers them only to an app trusted for Accessibility.
export default function RemoteSection({ api }: { api: RendererApi }): React.JSX.Element {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  useEffect(() => {
    void api.invoke('remote:status').then(setStatus)
  }, [api])
  if (!status) return <></>
  const missing = Object.keys(KEY_NAMES).filter((key) => !status.keys.includes(key))
  return (
    <Stack gap="xs">
      <Title order={4}>Remote control</Title>
      {!status.trusted ? (
        <>
          <Text size="sm">
            The remote needs Accessibility permission to reach Folk Dance Player. Allow it in System
            Settings → Privacy &amp; Security → Accessibility, then quit and reopen the app.
          </Text>
          <Button
            variant="default"
            w="fit-content"
            onClick={() => void api.invoke('remote:requestAccess').then(setStatus)}
          >
            Allow remote control…
          </Button>
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
          set the Mac&apos;s volume.
        </Text>
      )}
    </Stack>
  )
}
