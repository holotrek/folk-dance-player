import { useCallback, useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import type { RemoteStatus } from '@shared/program'

// The remote's status from main: asked for on mount and whenever the window gains focus (the
// person comes back from System Settings; asking also makes main re-check the permission), and
// followed through `remote:changed`. A broadcast that arrives before an answer makes that answer
// older, so it is ignored.
export function useRemoteStatus(api: RendererApi): [RemoteStatus | null, () => void] {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const refresh = useCallback(() => {
    void api.invoke('remote:status').then(setStatus)
  }, [api])
  useEffect(() => {
    let heard = false
    const ask = (): void => {
      void api.invoke('remote:status').then((next) => {
        if (!heard) setStatus(next)
      })
    }
    const stop = api.on('remote:changed', (next) => {
      heard = true
      setStatus(next)
    })
    ask()
    const onFocus = (): void => {
      heard = false
      ask()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      stop()
      window.removeEventListener('focus', onFocus)
    }
  }, [api])
  return [status, refresh]
}
