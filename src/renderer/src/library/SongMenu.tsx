import { ActionIcon, Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { errorMessage } from '../ipc-error'
import { useEditSong } from '../navigation'
import { favoriteIds, type FavoriteTarget } from './favorite-targets'
import { useLibraryApi } from './LibraryProvider'

// A row's right-click opens its "⋯" menu (the button carries `data-options`).
export function openRowMenu(e: React.MouseEvent<HTMLElement>): void {
  const button = e.currentTarget.querySelector<HTMLElement>('[data-options]')
  if (!button) return
  e.preventDefault()
  button.click()
}

// The "⋯" menu of a song in the library list or Holding (spec §6.2, §6.3): Edit details opens it
// on the Music page; Open PDF when the dance has one; favorites. It shows on hover (the caller's `className`) or by right-click.
export default function SongMenu(props: {
  songId: number
  fileId: number
  danceId: number | null
  hasNotesPdf: boolean
  label: string
  isFavorite: boolean
  targets?: FavoriteTarget[] // the songs the favorites items act on; this song alone by default
  className?: string
}): React.JSX.Element {
  const api = useLibraryApi()
  const editSong = useEditSong()
  return (
    <Menu position="right-start" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="gray"
          className={props.className}
          aria-label={`Options for ${props.label}`}
          data-options
          // A click on the button isn't a click on the row (selecting it, or previewing on a double).
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {(props.targets?.length ?? 1) < 2 && (
          <Menu.Item onClick={() => editSong(props.songId)}>Edit details</Menu.Item>
        )}
        {props.hasNotesPdf && props.danceId !== null && (
          <Menu.Item
            onClick={() =>
              void api
                .invoke('library:openNotesPdf', props.danceId!)
                .catch((err) => notifications.show({ color: 'red', message: errorMessage(err) }))
            }
          >
            Open PDF
          </Menu.Item>
        )}
        <FavoriteItems
          targets={props.targets ?? [{ fileId: props.fileId, isFavorite: props.isFavorite }]}
        />
      </Menu.Dropdown>
    </Menu>
  )
}

// "Add to favorites" and/or "Remove from favorites": both for a mixed selection, each applying to
// all the songs.
export function FavoriteItems(props: { targets: FavoriteTarget[] }): React.JSX.Element {
  const api = useLibraryApi()
  const ids = favoriteIds(props.targets)
  const set = (favorite: boolean) => () => void api.invoke('library:setFavorite', ids, favorite)
  return (
    <>
      {props.targets.some((t) => !t.isFavorite) && (
        <Menu.Item onClick={set(true)}>Add to favorites</Menu.Item>
      )}
      {props.targets.some((t) => t.isFavorite) && (
        <Menu.Item onClick={set(false)}>Remove from favorites</Menu.Item>
      )}
    </>
  )
}
