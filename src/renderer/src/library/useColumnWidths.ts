import { useCallback, useEffect, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { resolveWidths } from './column-widths'
import type { ColumnList } from './column-order'

const SETTING = {
  music: 'library.columnWidths.music',
  program: 'library.columnWidths.program'
} as const

// The widths the organizer gave one list's columns (1.0.0 spec §3.9): defaults until the saved map
// arrives, a change applies at once and saves afterwards; a failed save leaves the widths as they
// are until the page is left.
export function useColumnWidths(
  api: RendererApi,
  list: ColumnList
): { widths: Record<string, number>; save(widths: Record<string, number>): void; reset(): void } {
  const [widths, setWidths] = useState<Record<string, number>>({})

  useEffect(() => {
    let live = true
    void api.invoke('settings:getAll').then((settings) => {
      if (!live) return
      setWidths(resolveWidths(settings[SETTING[list]] ?? {}, list))
    })
    return () => {
      live = false
    }
  }, [api, list])

  const save = useCallback(
    (next: Record<string, number>) => {
      setWidths(next)
      void api.invoke('settings:set', SETTING[list], next).catch(() => undefined)
    },
    [api, list]
  )
  const reset = useCallback(() => {
    setWidths({})
    void api.invoke('settings:set', SETTING[list], {}).catch(() => undefined)
  }, [api, list])
  return { widths, save, reset }
}
