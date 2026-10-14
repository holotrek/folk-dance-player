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
