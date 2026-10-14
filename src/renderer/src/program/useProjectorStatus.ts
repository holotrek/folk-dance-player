import { useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { PROJECTOR_OFF, type ProjectorStatus } from '@shared/projector'

// The projector window's state (spec §8.1), kept current by main's 'projector:status' events.
export function useProjectorStatus(api: RendererApi): ProjectorStatus {
  const [status, setStatus] = useState<ProjectorStatus>(PROJECTOR_OFF)
  useEffect(() => {
    let heard = false
    const stop = api.on('projector:status', (s) => {
      heard = true
      setStatus(s)
    })
    void api.invoke('projector:status').then((s) => {
      if (!heard) setStatus(s)
    })
    return stop
  }, [api])
  return status
}
