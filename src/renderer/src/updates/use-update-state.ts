import { useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { UPDATE_IDLE, type UpdateState } from '@shared/updates'

// The updater's state from main: asked for once, then followed. If a broadcast arrives before the
// answer to the first question, the answer is older and is ignored.
export function useUpdateState(api: RendererApi): UpdateState {
  const [state, setState] = useState<UpdateState>(UPDATE_IDLE)
  useEffect(() => {
    let heard = false
    const stop = api.on('updates:state', (next) => {
      heard = true
      setState(next)
    })
    void api.invoke('updates:getState').then((first) => {
      if (!heard) setState(first)
    })
    return stop
  }, [api])
  return state
}
