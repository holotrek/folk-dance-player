import { createStore, type StoreApi } from 'zustand/vanilla'
import type { RendererApi } from '@shared/contract'
import {
  IDLE_PLAYER_STATE,
  type PlayedEntry,
  type PlayerState,
  type ProgramDetail,
  type ProgramSummary
} from '@shared/program'
import { defaultProgramName } from './program-name'
import {
  EMPTY_SELECTION,
  pruneSelection,
  selectIn,
  type SelectMode,
  type Selection
} from './selection'

export interface ProgramState {
  programs: ProgramSummary[] // the sidebar list, filtered by `search`
  search: string
  program: ProgramDetail | null // the current (loaded) program, unplayed items only
  played: PlayedEntry[] // its play log, newest first
  player: PlayerState
  selection: Selection // selected program items; UI state, pruned on every refresh
  selectItem(id: number, mode: SelectMode): void
  clearSelection(): void
  refresh(): Promise<void>
  setSearch(search: string): Promise<void>
  load(programId: number | null): Promise<void>
  // The current program's id, creating and loading one named for today when none is loaded.
  ensureProgram(): Promise<number>
  // Follows main: refetches on program and library changes, and takes every player state.
  watch(): () => void
}

export type ProgramStore = StoreApi<ProgramState>

// The Program page's state (spec §6.1, §6.2). Main owns it; this store holds what's on screen.
export function createProgramStore(api: RendererApi): ProgramStore {
  let latest = 0
  const store = createStore<ProgramState>()((set, get) => ({
    programs: [],
    search: '',
    program: null,
    played: [],
    player: IDLE_PLAYER_STATE,
    selection: EMPTY_SELECTION,

    selectItem(id, mode) {
      const { program, selection } = get()
      if (program) {
        set({
          selection: selectIn(
            selection,
            program.items.map((i) => i.id),
            id,
            mode
          )
        })
      }
    },

    clearSelection: () => set({ selection: EMPTY_SELECTION }),

    async refresh() {
      const request = ++latest
      const programId = get().player.programId
      const [programs, program, played] = await Promise.all([
        api.invoke('programs:list', get().search),
        programId === null ? null : api.invoke('programs:get', programId),
        programId === null ? [] : api.invoke('programs:played', programId)
      ])
      if (request !== latest) return // a newer refresh already started
      set((s) => ({
        programs,
        program,
        played,
        selection: pruneSelection(s.selection, program?.items.map((i) => i.id) ?? [])
      }))
    },

    async setSearch(search) {
      set({ search })
      await get().refresh()
    },

    async load(programId) {
      await api.invoke('programs:setCurrent', programId)
    },

    async ensureProgram() {
      const current = get().player.programId
      if (current !== null) return current
      const id = await api.invoke('programs:create', defaultProgramName())
      await api.invoke('programs:setCurrent', id)
      set((s) => ({ player: { ...s.player, programId: id } }))
      return id
    },

    watch() {
      // A broadcast is always newer than the first answer, which may arrive after it.
      let heard = false
      const stops = [
        api.on('programs:changed', () => void get().refresh()),
        api.on('library:changed', () => void get().refresh()),
        api.on('player:state', (player) => {
          heard = true
          const loaded = player.programId !== get().player.programId
          set({ player })
          if (loaded) void get().refresh()
        })
      ]
      void api.invoke('player:getState').then((player) => {
        if (!heard) set({ player })
        void get().refresh()
      })
      return () => stops.forEach((stop) => stop())
    }
  }))
  return store
}
