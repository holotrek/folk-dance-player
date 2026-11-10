import { MOVABLE, type ColumnList } from './column-order'

// 1.0.0 spec §3.9: the widths an organizer gave the movable columns, each a percentage of the
// table's width. Dance / Song, the star, the "⋯" menu, a playlist's # and the review list's File
// stay as they are, so they aren't here.

// No column is dragged narrower than this (own header and sort arrow), in px, or wider than
// MAX_PERCENT of the table.
export const MIN_WIDTH_PX: Record<string, number> = {
  country: 60,
  choreographer: 90,
  teacher: 60,
  artist: 60,
  danceType: 60,
  difficulty: 60,
  time: 48
}
export const MAX_PERCENT = 40
export const NUDGE_PERCENT = 1

// A saved map against the list's columns: unknown and fixed keys and bad values are dropped.
export function resolveWidths(
  saved: Record<string, number>,
  list: ColumnList
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of MOVABLE[list]) {
    const w = saved[key]
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) out[key] = Math.min(w, MAX_PERCENT)
  }
  return out
}

// The grid track of a resized column. `100cqw` is the table's width (it is a size container).
export function widthTrack(key: string, percent: number): string {
  return `max(${MIN_WIDTH_PX[key] ?? 0}px, calc(100cqw * ${percent} / 100))`
}

// A width in px as a percentage of the table, kept between the column's minimum and the maximum.
export function percentFromPixels(px: number, tableWidth: number, key: string): number {
  if (!(tableWidth > 0)) return MAX_PERCENT
  const min = ((MIN_WIDTH_PX[key] ?? 0) / tableWidth) * 100
  const percent = (px / tableWidth) * 100
  return Math.round(Math.min(MAX_PERCENT, Math.max(min, percent)) * 100) / 100
}

// One keyboard step wider (1) or narrower (-1) from the current percentage.
export function nudgeWidth(current: number, key: string, tableWidth: number, by: -1 | 1): number {
  return percentFromPixels(((current + by * NUDGE_PERCENT) / 100) * tableWidth, tableWidth, key)
}
