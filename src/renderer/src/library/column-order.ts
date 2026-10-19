import { moveBefore } from './reorder'

// 0.3.0 spec §3.13: the order of the movable columns of the Music page table and the Program page's
// library list. Dance / Song, the favorite star, the "⋯" menu, a playlist's # and the review
// list's File column never move, so they aren't here.
export type ColumnList = 'music' | 'program'

// The default order of each list's movable columns, by `Column.key`.
export const MOVABLE: Record<ColumnList, string[]> = {
  music: ['country', 'choreographer', 'teacher', 'artist', 'danceType', 'difficulty', 'time'],
  program: ['country', 'choreographer', 'teacher', 'artist', 'time']
}

// A saved order against the defaults: unknown, duplicate and fixed keys are dropped, and a column
// the saved order lacks (a later release added it) goes right after the column that precedes it by
// default, or first if none does.
export function resolveOrder(saved: string[], defaults: string[]): string[] {
  const order = saved.filter((key, i) => defaults.includes(key) && saved.indexOf(key) === i)
  defaults.forEach((key, i) => {
    if (order.includes(key)) return
    const before = i > 0 ? order.indexOf(defaults[i - 1]) : -1
    order.splice(before + 1, 0, key)
  })
  return order
}

// Moves `key` before `before` (or to the end when null); an unknown key changes nothing.
export function moveColumn(order: string[], key: string, before: string | null): string[] {
  return order.includes(key) ? moveBefore(order, [key], before) : order
}

// One place left (-1) or right (1); no change at either end.
export function nudgeColumn(order: string[], key: string, by: -1 | 1): string[] {
  const i = order.indexOf(key)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return order
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
