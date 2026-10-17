import { useRef, useState } from 'react'
import type { MirrorDecision, SyncSummary } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import type {
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress
} from '@shared/import'
import { errorMessage } from '../ipc-error'

export type AppleSyncFlowState =
  | { step: 'closed' }
  | { step: 'explain' }
  | { step: 'reading' }
  | { step: 'denied' }
  | { step: 'error'; message: string }
  | { step: 'mapping'; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
  | { step: 'otherLibrary'; preview: ApplePreview; conflicts: ApplePlaylistConflict[] }
  | { step: 'decisions'; conflicts: ApplePlaylistConflict[] }
  | { step: 'running'; progress: ImportProgress | null }
  | { step: 'summary'; summary: SyncSummary }
  | { step: 'paused' }

// Turning sync on (sync spec §5.8): explanation → reading the library (macOS asks for access) →
// the mapping step with Music's tags → decisions for playlists edited here → the first sync →
// its summary. A late answer after the dialog was closed is ignored.
export function useAppleSyncFlow(api: RendererApi) {
  const [state, setState] = useState<AppleSyncFlowState>({ step: 'closed' })
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const session = useRef(0)
  const switching = useRef(false) // the organizer chose Switch to this library

  const guarded =
    <A extends unknown[]>(fn: (live: () => boolean, ...args: A) => Promise<void>) =>
    (...args: A): Promise<void> => {
      const id = session.current
      return fn(() => session.current === id, ...args)
    }

  const start = guarded(async (live, decisions: Record<string, MirrorDecision>) => {
    setState({ step: 'running', progress: null })
    const off = api.on('import:progress', (progress) =>
      setState((s) => (s.step === 'running' ? { step: 'running', progress } : s))
    )
    try {
      const summary = switching.current
        ? await api.invoke('appleSync:enable', decisions, true)
        : await api.invoke('appleSync:enable', decisions)
      if (live()) setState(summary ? { step: 'summary', summary } : { step: 'paused' })
    } catch (err) {
      if (live()) setState({ step: 'error', message: errorMessage(err) })
    } finally {
      off()
    }
  })

  const close = (): void => {
    session.current += 1
    setState({ step: 'closed' })
  }

  return {
    state,
    mapping,
    setMapping,
    open: () => {
      switching.current = false
      setState({ step: 'explain' })
    },
    read: guarded(async (live) => {
      setState({ step: 'reading' })
      const [result, settings] = await Promise.all([
        api.invoke('appleSync:preview'),
        api.invoke('settings:getAll')
      ])
      if (!live()) return
      setMapping({
        artistTagTarget: settings['import.artistTagTarget'],
        albumArtistTagTarget: settings['import.albumArtistTagTarget'],
        genreIsCountry: settings['import.genreIsCountry']
      })
      if (result.ok && result.otherLibrary)
        setState({ step: 'otherLibrary', preview: result.preview, conflicts: result.conflicts })
      else if (result.ok)
        setState({ step: 'mapping', preview: result.preview, conflicts: result.conflicts })
      else if (result.reason === 'denied') setState({ step: 'denied' })
      else setState({ step: 'error', message: result.detail })
    }),
    // The mapping is saved for every sync and import (main spec §5.2).
    confirmMapping: guarded(async (live, conflicts: ApplePlaylistConflict[]) => {
      if (mapping) {
        await api.invoke('settings:set', 'import.artistTagTarget', mapping.artistTagTarget)
        await api.invoke(
          'settings:set',
          'import.albumArtistTagTarget',
          mapping.albumArtistTagTarget
        )
        await api.invoke('settings:set', 'import.genreIsCountry', mapping.genreIsCountry)
      }
      if (!live()) return
      if (conflicts.length > 0) setState({ step: 'decisions', conflicts })
      else await start({})
    }),
    start,
    // Music has a different library than last time (sync spec §5.1), asked before the mapping step.
    switchLibrary: () =>
      setState((s) => {
        if (s.step !== 'otherLibrary') return s
        switching.current = true
        return { step: 'mapping', preview: s.preview, conflicts: s.conflicts }
      }),
    // Keep waiting: sync is on, paused until Music has the old library open again.
    keepWaiting: guarded(async (live) => {
      await api.invoke('appleSync:enable', {})
      if (live()) close()
    }),
    close
  }
}

export type AppleSyncFlow = ReturnType<typeof useAppleSyncFlow>
