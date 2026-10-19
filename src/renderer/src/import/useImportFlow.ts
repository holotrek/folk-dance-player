import { useCallback, useRef, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import type {
  AppleSelection,
  ApplePlaylistConflict,
  ApplePreview,
  ImportMapping,
  ImportProgress,
  ImportRequest,
  ImportSummary,
  PlaylistDecision
} from '@shared/import'
import { mappingFromSettings, mappingSettings } from '@shared/import'
import type { SettingKey } from '@shared/settings'
import { errorMessage } from '../ipc-error'

export type ImportFlowState =
  | { step: 'closed' }
  | { step: 'loading'; title: string; message: string }
  | { step: 'mapping'; paths: string[] }
  | { step: 'apple'; xmlPath: string; preview: ApplePreview }
  | {
      step: 'conflicts'
      xmlPath: string
      selection: AppleSelection
      conflicts: ApplePlaylistConflict[]
    }
  | { step: 'running'; title: string; progress: ImportProgress | null; cancelling: boolean }
  | { step: 'summary'; summary: ImportSummary }
  | { step: 'error'; title: string; message: string }

export const MUSIC_TITLE = 'Import music'
export const APPLE_TITLE = 'Import from Apple Music'

// The import dialog's steps (spec §5): mapping → (Apple options → playlist decisions) →
// progress → summary.
export function useImportFlow(api: RendererApi, onFinished: () => void) {
  const [state, setState] = useState<ImportFlowState>({ step: 'closed' })
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const busy = useRef(false)
  const session = useRef(0)

  // Runs one user action at a time, so a double-click can't start two imports. `live()` turns
  // false once the dialog is closed, so a late result (e.g. a slow preview) never reopens it.
  const action =
    <A extends unknown[]>(fn: (live: () => boolean, ...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      if (busy.current) return
      busy.current = true
      const id = session.current
      try {
        await fn(() => session.current === id, ...args)
      } finally {
        busy.current = false
      }
    }

  const loadMapping = useCallback(async () => {
    const s = await api.invoke('settings:getAll')
    setMapping(mappingFromSettings(s))
  }, [api])

  // The mapping is remembered for next time (spec §5.2).
  const saveMapping = async (): Promise<void> => {
    if (!mapping) return
    for (const [key, value] of Object.entries(mappingSettings(mapping))) {
      await api.invoke('settings:set', key as SettingKey, value)
    }
  }

  const openPaths = async (live: () => boolean, paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    await loadMapping()
    if (live()) setState({ step: 'mapping', paths })
  }

  const run = async (live: () => boolean, title: string, request: ImportRequest): Promise<void> => {
    setState({ step: 'running', title, progress: null, cancelling: false })
    const unsubscribe = api.on('import:progress', (progress) =>
      setState((s) => (s.step === 'running' ? { ...s, progress } : s))
    )
    try {
      const summary = await api.invoke('import:start', request)
      if (live()) setState({ step: 'summary', summary })
    } catch (err) {
      if (live()) setState({ step: 'error', title, message: errorMessage(err) })
    } finally {
      unsubscribe()
    }
  }

  return {
    state,
    mapping,
    setMapping,
    addMusic: action(async (live) => openPaths(live, await api.invoke('import:pickMusic'))),
    dropFiles: action(async (live, files: File[]) => openPaths(live, api.getPathsForFiles(files))),
    importFromApple: action(async (live) => {
      const xmlPath = await api.invoke('import:pickAppleLibrary')
      if (!xmlPath || !live()) return
      setState({
        step: 'loading',
        title: APPLE_TITLE,
        message: 'Reading your Apple Music library…'
      })
      try {
        const [preview] = await Promise.all([
          api.invoke('import:previewApple', xmlPath),
          loadMapping()
        ])
        if (live()) setState({ step: 'apple', xmlPath, preview })
      } catch (err) {
        if (live()) setState({ step: 'error', title: APPLE_TITLE, message: errorMessage(err) })
      }
    }),
    startPaths: action(async (live, paths: string[]) => {
      await saveMapping()
      if (live()) await run(live, MUSIC_TITLE, { kind: 'paths', paths })
    }),
    continueApple: action(
      async (live, xmlPath: string, preview: ApplePreview, selection: AppleSelection) => {
        await saveMapping()
        const ids =
          selection.mode === 'all'
            ? preview.playlists.map((p) => p.persistentId)
            : selection.persistentIds
        const conflicts = await api.invoke('import:checkPlaylistConflicts', ids)
        if (!live()) return
        if (conflicts.length > 0) setState({ step: 'conflicts', xmlPath, selection, conflicts })
        else await run(live, APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions: {} })
      }
    ),
    startApple: action(
      async (
        live,
        xmlPath: string,
        selection: AppleSelection,
        decisions: Record<string, PlaylistDecision>
      ) => run(live, APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions })
    ),
    cancel: async () => {
      setState((s) => (s.step === 'running' ? { ...s, cancelling: true } : s))
      await api.invoke('import:cancel')
    },
    close: () => {
      session.current += 1
      setState({ step: 'closed' })
      onFinished()
    }
  }
}

export type ImportFlow = ReturnType<typeof useImportFlow>
