// The Program list's selection (0.3.0 spec §3.8): UI state only, like Apple Music's playlists.
export interface Selection {
  ids: number[] // in the order they were selected
  anchor: number | null // where shift-click ranges start
}

export type SelectMode = 'single' | 'range' | 'toggle'

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null }

// `order` is the program's item IDs, top to bottom.
export function selectIn(sel: Selection, order: number[], id: number, mode: SelectMode): Selection {
  if (mode === 'toggle') {
    const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id]
    return { ids, anchor: id }
  }
  const anchorAt = sel.anchor === null ? -1 : order.indexOf(sel.anchor)
  if (mode === 'range' && anchorAt >= 0) {
    const [from, to] = [anchorAt, order.indexOf(id)].sort((a, b) => a - b)
    return { ids: order.slice(from, to + 1), anchor: sel.anchor }
  }
  return { ids: [id], anchor: id }
}

// Drops items that left the list; returns the same object when nothing changed.
export function pruneSelection(sel: Selection, order: number[]): Selection {
  const present = new Set(order)
  const ids = sel.ids.filter((id) => present.has(id))
  const anchor = sel.anchor !== null && present.has(sel.anchor) ? sel.anchor : null
  return ids.length === sel.ids.length && anchor === sel.anchor ? sel : { ids, anchor }
}

export function selectedInOrder(sel: Selection, order: number[]): number[] {
  const chosen = new Set(sel.ids)
  return order.filter((id) => chosen.has(id))
}

// The first item of the unbroken run of selected items that contains `id` (`id` itself when it is
// not selected): where "Insert STOP before" puts a STOP for that row. A consecutive selection is
// one run, so it is its first item.
export function runStart(sel: Selection, order: number[], id: number): number {
  const chosen = new Set(sel.ids)
  let at = order.indexOf(id)
  if (at < 0 || !chosen.has(id)) return id
  while (at > 0 && chosen.has(order[at - 1])) at--
  return order[at]
}
