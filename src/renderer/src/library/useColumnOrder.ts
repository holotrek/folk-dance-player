import { useCallback, useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { MOVABLE, resolveOrder, type ColumnList } from './column-order'

const SETTING = {
  music: 'library.columns.music',
  program: 'library.columns.program'
} as const

// The movable columns of one list in the organizer's order (0.3.0 spec §3.13). It shows the default
// order until the saved one arrives, applies a change at once and saves it afterwards; a failed
// save leaves the order as it is for this session.
export function useColumnOrder(
  api: RendererApi,
  list: ColumnList
): { order: string[]; save(order: string[]): void; reset(): void } {
  const [order, setOrder] = useState<string[]>(MOVABLE[list])

  useEffect(() => {
    let live = true
    void api.invoke('settings:getAll').then((settings) => {
      if (!live) return
      setOrder(resolveOrder(settings[SETTING[list]], MOVABLE[list]))
    })
    return () => {
      live = false
    }
  }, [api, list])

  const save = useCallback(
    (next: string[]) => {
      setOrder(next)
      void api.invoke('settings:set', SETTING[list], next).catch(() => undefined)
    },
    [api, list]
  )
  const reset = useCallback(() => {
    setOrder(MOVABLE[list])
    void api.invoke('settings:set', SETTING[list], []).catch(() => undefined)
  }, [api, list])
  return { order, save, reset }
}
