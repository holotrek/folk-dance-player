import { useState } from 'react'
import { Button } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import ConfirmDialog from '../components/ConfirmDialog'

// Restarts the app so the remote's media keys register with Accessibility allowed. Asks first
// while a song plays or counts down; the person is the only one who restarts it.
export default function RestartButton({
  api,
  size
}: {
  api: RendererApi
  size?: 'compact-xs'
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const restart = (): void => void api.invoke('remote:restart')
  const onClick = async (): Promise<void> => {
    const { status } = await api.invoke('player:getState')
    if (status === 'playing' || status === 'countdown') setAsking(true)
    else restart()
  }
  return (
    <>
      <Button size={size} variant={size ? 'filled' : 'default'} onClick={() => void onClick()}>
        Restart
      </Button>
      <ConfirmDialog
        opened={asking}
        title="Restart now?"
        message="Music is playing. Restart anyway?"
        confirmLabel="Restart anyway"
        cancelLabel="Keep playing"
        onConfirm={restart}
        onClose={() => setAsking(false)}
      />
    </>
  )
}
