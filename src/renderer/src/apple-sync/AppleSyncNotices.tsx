import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import type { AppleSyncNotice } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'

const PAUSED = 'Sync with Apple Music is paused'

export function noticeContent(notice: AppleSyncNotice): {
  title?: string
  message: string
  color: string
} {
  switch (notice.kind) {
    case 'changed':
      return { message: notice.message, color: 'blue' }
    case 'denied':
      return {
        title: PAUSED,
        message:
          "Folk Dance Player isn't allowed to read your Music library. Settings → Apple Music shows how to allow it.",
        color: 'yellow'
      }
    case 'other-library':
      return {
        title: PAUSED,
        message: 'Music has a different library open. Settings → Apple Music has the choices.',
        color: 'yellow'
      }
    case 'failed':
      return {
        title: "Couldn't sync with Apple Music",
        message: 'It will try again the next time. The details are in the log.',
        color: 'red'
      }
  }
}

// One toast per notice; main sends each once per occurrence (sync spec §6.5). A sync's summary
// closes by itself; a pause or failure stays until closed.
export default function AppleSyncNotices({ api }: { api: RendererApi }): null {
  useEffect(
    () =>
      api.on('appleSync:notice', (notice) =>
        notifications.show({
          ...noticeContent(notice),
          autoClose: notice.kind === 'changed' ? 6000 : false
        })
      ),
    [api]
  )
  return null
}
