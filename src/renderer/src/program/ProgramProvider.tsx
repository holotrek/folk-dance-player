import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { RendererApi } from '@shared/contract'
import { createProgramStore, type ProgramState, type ProgramStore } from './program-store'

const ProgramContext = createContext<ProgramStore | null>(null)

// Provides the program store to the sidebar and the Program page.
export function ProgramProvider({
  api,
  children
}: {
  api: RendererApi
  children: React.ReactNode
}): React.JSX.Element {
  const [store] = useState(() => createProgramStore(api))
  useEffect(() => store.getState().watch(), [store])
  return <ProgramContext.Provider value={store}>{children}</ProgramContext.Provider>
}

export function useProgramStore(): ProgramStore {
  const store = useContext(ProgramContext)
  if (!store) throw new Error('useProgram must be used inside <ProgramProvider>')
  return store
}

// Selectors must return stable values (state fields, not new arrays/objects).
export function useProgram<T>(selector: (state: ProgramState) => T): T {
  return useStore(useProgramStore(), selector)
}
