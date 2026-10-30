import { ActionIcon, Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { errorMessage } from '../ipc-error'
import { useEditSong } from '../navigation'
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
        <Menu.Item onClick={() => editSong(props.songId)}>Edit details</Menu.Item>
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
        <Menu.Item
          onClick={() => void api.invoke('library:setFavorite', [props.fileId], !props.isFavorite)}
        >
          {props.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
