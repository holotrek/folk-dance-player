// Dragging songs from the library table onto the sidebar (playlists, Favorites) or a program.
export const FILES_MIME = 'application/x-fdp-files'

export function setDraggedFiles(dataTransfer: DataTransfer, fileIds: number[]): void {
  dataTransfer.setData(FILES_MIME, JSON.stringify(fileIds))
  dataTransfer.effectAllowed = 'copyMove'
}

export const carriesFiles = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(FILES_MIME)

export function getDraggedFiles(dataTransfer: DataTransfer | null): number[] {
  if (!carriesFiles(dataTransfer)) return []
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(FILES_MIME))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

// Dragging program items within the program list, to reorder them.
export const ITEMS_MIME = 'application/x-fdp-program-items'

// A drag-over can see only a drag's types, not its data, so a drag that carries at least one song
// (not only STOP markers) also carries this type: Holding accepts program items only then.
export const ITEM_SONGS_MIME = 'application/x-fdp-program-items-songs'

export function setDraggedItems(
  dataTransfer: DataTransfer,
  itemIds: number[],
  hasSongs = true
): void {
  dataTransfer.setData(ITEMS_MIME, JSON.stringify(itemIds))
  if (hasSongs) dataTransfer.setData(ITEM_SONGS_MIME, '1')
  dataTransfer.effectAllowed = 'move'
}

export const carriesSongItems = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(ITEM_SONGS_MIME)

export const carriesItems = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(ITEMS_MIME)

export function getDraggedItems(dataTransfer: DataTransfer | null): number[] {
  if (!carriesItems(dataTransfer)) return []
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(ITEMS_MIME))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

// Dragging held rows (Holding) within Holding, or into the program.
export const HOLDING_MIME = 'application/x-fdp-holding-items'

export function setDraggedHolding(dataTransfer: DataTransfer, itemIds: number[]): void {
  dataTransfer.setData(HOLDING_MIME, JSON.stringify(itemIds))
  dataTransfer.effectAllowed = 'move'
}

export const carriesHolding = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(HOLDING_MIME)

export function getDraggedHolding(dataTransfer: DataTransfer | null): number[] {
  if (!carriesHolding(dataTransfer)) return []
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(HOLDING_MIME))
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

// The drag image of several rows: "N items", drawn off-screen (`className` positions it there)
// and removed on the next tick.
export function setDragCountImage(
  dataTransfer: DataTransfer,
  count: number,
  className: string
): void {
  const image = document.createElement('div')
  image.className = className
  image.textContent = `${count} items`
  document.body.appendChild(image)
  dataTransfer.setDragImage?.(image, 0, 0)
  setTimeout(() => image.remove(), 0)
}

// Dragging a column header, to move its column (0.3.0 spec §3.13). Carries the column's key.
export const COLUMN_MIME = 'application/x-fdp-column'

export function setDraggedColumn(dataTransfer: DataTransfer, key: string): void {
  dataTransfer.setData(COLUMN_MIME, key)
  dataTransfer.effectAllowed = 'move'
}

export const carriesColumn = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(COLUMN_MIME)

export function getDraggedColumn(dataTransfer: DataTransfer | null): string | null {
  return carriesColumn(dataTransfer) ? dataTransfer!.getData(COLUMN_MIME) || null : null
}
