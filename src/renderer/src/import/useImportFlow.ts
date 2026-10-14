import { useCallback, useState } from 'react'
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

  const loadMapping = useCallback(async () => {
    const s = await api.invoke('settings:getAll')
    setMapping({
      artistTagTarget: s['import.artistTagTarget'],
      albumArtistTagTarget: s['import.albumArtistTagTarget'],
      genreIsCountry: s['import.genreIsCountry']
    })
  }, [api])

  // The mapping is remembered for next time (spec §5.2).
  const saveMapping = async (): Promise<void> => {
    if (!mapping) return
    await api.invoke('settings:set', 'import.artistTagTarget', mapping.artistTagTarget)
    await api.invoke('settings:set', 'import.albumArtistTagTarget', mapping.albumArtistTagTarget)
    await api.invoke('settings:set', 'import.genreIsCountry', mapping.genreIsCountry)
  }

  const openPaths = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return
    await loadMapping()
    setState({ step: 'mapping', paths })
  }

  const run = async (title: string, request: ImportRequest): Promise<void> => {
    setState({ step: 'running', title, progress: null, cancelling: false })
    const unsubscribe = api.on('import:progress', (progress) =>
      setState((s) => (s.step === 'running' ? { ...s, progress } : s))
    )
    try {
      setState({ step: 'summary', summary: await api.invoke('import:start', request) })
    } catch (err) {
      setState({ step: 'error', title, message: errorMessage(err) })
    } finally {
      unsubscribe()
    }
  }

  return {
    state,
    mapping,
    setMapping,
    addMusic: async () => openPaths(await api.invoke('import:pickMusic')),
    dropFiles: (files: File[]) => openPaths(api.getPathsForFiles(files)),
    importFromApple: async () => {
      const xmlPath = await api.invoke('import:pickAppleLibrary')
      if (!xmlPath) return
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
        setState({ step: 'apple', xmlPath, preview })
      } catch (err) {
        setState({ step: 'error', title: APPLE_TITLE, message: errorMessage(err) })
      }
    },
    startPaths: async (paths: string[]) => {
      await saveMapping()
      await run(MUSIC_TITLE, { kind: 'paths', paths })
    },
    continueApple: async (xmlPath: string, preview: ApplePreview, selection: AppleSelection) => {
      await saveMapping()
      const ids =
        selection.mode === 'all'
          ? preview.playlists.map((p) => p.persistentId)
          : selection.persistentIds
      const conflicts = await api.invoke('import:checkPlaylistConflicts', ids)
      if (conflicts.length > 0) setState({ step: 'conflicts', xmlPath, selection, conflicts })
      else await run(APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions: {} })
    },
    startApple: (
      xmlPath: string,
      selection: AppleSelection,
      decisions: Record<string, PlaylistDecision>
    ) => run(APPLE_TITLE, { kind: 'apple', xmlPath, selection, decisions }),
    cancel: async () => {
      setState((s) => (s.step === 'running' ? { ...s, cancelling: true } : s))
      await api.invoke('import:cancel')
    },
    close: () => {
      setState({ step: 'closed' })
      onFinished()
    }
  }
}

export type ImportFlow = ReturnType<typeof useImportFlow>
