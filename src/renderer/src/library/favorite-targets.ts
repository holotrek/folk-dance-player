// The songs a star or a "⋯" menu acts on: the row itself, or, when the row is part of a selection,
// every selected song (like Apple Music).
export interface FavoriteTarget {
  fileId: number
  isFavorite: boolean
}

export const favoriteIds = (targets: FavoriteTarget[]): number[] => [
  ...new Set(targets.map((t) => t.fileId))
]
