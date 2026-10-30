// The songs a row's star and "⋯" menu act on: the row itself, or, when the row is part of a
// selection, every selected song (like Apple Music).
export interface RowTarget {
  fileId: number
  isFavorite: boolean
  danceId: number | null
  hasNotesPdf: boolean
}

export const favoriteIds = (targets: Pick<RowTarget, 'fileId'>[]): number[] => [
  ...new Set(targets.map((t) => t.fileId))
]

// The dances whose PDF "Open PDF" opens, each once, in the targets' order.
export const pdfDanceIds = (targets: RowTarget[]): number[] => [
  ...new Set(targets.flatMap((t) => (t.hasNotesPdf && t.danceId !== null ? [t.danceId] : [])))
]
