import { createStore, type StoreApi } from 'zustand/vanilla'
import type { PlaylistFolder } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import type { LibraryFilter, LibraryRow, LibrarySort, PlaylistSummary } from '@shared/library'

export type SelectMode = 'single' | 'toggle' | 'range'

export interface LibraryState {
  filter: LibraryFilter
  search: string
  sort: LibrarySort
  rows: LibraryRow[]
  playlists: PlaylistSummary[]
  folders: PlaylistFolder[] // Music's playlist folders (sync spec §6.2)
  selected: number[] // song ids, in the order they were selected
  anchor: number | null // last clicked song, for shift-click ranges
  scrollTo: number | null // a song the table should scroll into view (then calls `scrolled`)
  refresh(): Promise<void>
  setFilter(filter: LibraryFilter): Promise<void>
  setSearch(search: string): Promise<void>
  setSort(sort: LibrarySort): Promise<void>
  select(songId: number, mode: SelectMode): void
  clearSelection(): void
  selectAll(): void
  selectedRows(): LibraryRow[]
  // "Edit details": selects the song alone and scrolls to it, showing All Music without the search
  // when they hide it.
  reveal(songId: number): Promise<void>
  scrolled(): void
  // Refetches whenever main reports a library change; returns the unsubscribe function.
  watch(): () => void
}

export type LibraryStore = StoreApi<LibraryState>

const TITLE_SORT: LibrarySort = { column: 'title', direction: 'asc' }
const PLAYLIST_SORT: LibrarySort = { column: 'position', direction: 'asc' }

// The library state shared by the sidebar, the Music page table and the song editor (spec §6).
// Main owns the data; this store only holds what's on screen and refetches when it changes.
export function createLibraryStore(api: RendererApi): LibraryStore {
  let latest = 0
  const store = createStore<LibraryState>()((set, get) => ({
    filter: { kind: 'all' },
    search: '',
    sort: TITLE_SORT,
    rows: [],
    playlists: [],
    folders: [],
    selected: [],
    anchor: null,
    scrollTo: null,

    async refresh() {
      const request = ++latest
      const { search, filter, sort } = get()
      const [rows, playlists, folders] = await Promise.all([
        api.invoke('library:list', { search, filter, sort }),
        api.invoke('playlists:list'),
        api.invoke('playlists:folders')
      ])
      if (request !== latest) return // a newer refresh already started
      const present = new Set(rows.map((r) => r.songId))
      set((s) => ({
        rows,
        playlists,
        folders,
        selected: s.selected.filter((id) => present.has(id)),
        anchor: s.anchor !== null && present.has(s.anchor) ? s.anchor : null
      }))
    },

    async setFilter(filter) {
      // A playlist opens in its own order; leaving one returns to title order.
      const sort =
        filter.kind === 'playlist'
          ? PLAYLIST_SORT
          : get().sort.column === 'position'
            ? TITLE_SORT
            : get().sort
      set({ filter, sort, selected: [], anchor: null })
      await get().refresh()
    },

    async setSearch(search) {
      set({ search })
      await get().refresh()
    },

    async setSort(sort) {
      set({ sort })
      await get().refresh()
    },

    select(songId, mode) {
      const { rows, selected, anchor } = get()
      if (mode === 'toggle') {
        set({
          selected: selected.includes(songId)
            ? selected.filter((id) => id !== songId)
            : [...selected, songId],
          anchor: songId
        })
      } else if (mode === 'range' && anchor !== null) {
        const ids = rows.map((r) => r.songId)
        const [from, to] = [ids.indexOf(anchor), ids.indexOf(songId)].sort((a, b) => a - b)
        set({ selected: from < 0 ? [songId] : ids.slice(from, to + 1) })
      } else {
        set({ selected: [songId], anchor: songId })
      }
    },

    clearSelection: () => set({ selected: [], anchor: null }),

    selectAll: () => set((s) => ({ selected: s.rows.map((r) => r.songId) })),

    selectedRows() {
      const { rows, selected } = get()
      const chosen = new Set(selected)
      return rows.filter((r) => chosen.has(r.songId))
    },

    async reveal(songId) {
      if (!get().rows.some((r) => r.songId === songId)) {
        const sort = get().sort.column === 'position' ? TITLE_SORT : get().sort
        set({ filter: { kind: 'all' }, search: '', sort })
        await get().refresh()
      }
      set({ selected: [songId], anchor: songId, scrollTo: songId })
    },

    scrolled: () => set({ scrollTo: null }),

    watch: () => api.on('library:changed', () => void get().refresh())
  }))
  return store
}
