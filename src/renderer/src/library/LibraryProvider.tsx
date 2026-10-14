import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { RendererApi } from '@shared/contract'
import { createLibraryStore, type LibraryState, type LibraryStore } from './library-store'

const LibraryContext = createContext<{ store: LibraryStore; api: RendererApi } | null>(null)

// Provides the library store (and the API it uses) to the sidebar, table and editor.
export function LibraryProvider({
  api,
  children
}: {
  api: RendererApi
  children: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => createLibraryStore(api))
  useEffect(() => {
    const stop = store.getState().watch()
    void store.getState().refresh()
    return stop
  }, [store])
  return <LibraryContext.Provider value={{ store, api }}>{children}</LibraryContext.Provider>
}

function useLibraryContext() {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return context
}

// Selectors must return stable values (state fields, not new arrays/objects).
export function useLibrary<T>(selector: (state: LibraryState) => T): T {
  return useStore(useLibraryContext().store, selector)
}

export const useLibraryApi = (): RendererApi => useLibraryContext().api
export const useLibraryStore = (): LibraryStore => useLibraryContext().store
