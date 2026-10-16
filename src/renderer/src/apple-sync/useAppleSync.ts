import { useEffect, useState } from 'react'
import type { AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'

// Sync's status from main, kept current by appleSync:state. Null until the first answer. The
// first answer is ignored if a broadcast already arrived (it would be older).
export function useAppleSync(api: RendererApi): AppleSyncStatus | null {
  const [status, setStatus] = useState<AppleSyncStatus | null>(null)
  useEffect(() => {
    let live = true
    let pushed = false
    const off = api.on('appleSync:state', (next) => {
      pushed = true
      setStatus(next)
    })
    void api.invoke('appleSync:status').then((first) => {
      if (live && !pushed) setStatus(first)
    })
    return () => {
      live = false
      off()
    }
  }, [api])
  return status
}
